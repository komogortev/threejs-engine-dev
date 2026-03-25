import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { BaseModule } from '@base/engine-core'
import type { EngineContext } from '@base/engine-core'
import type { ThreeContext } from '@base/threejs-engine'
import type { InputActionEvent, InputAxisEvent } from '@base/input'
import {
  GameplayCameraController,
  THIRD_PERSON_CAMERA_PRESET_ORDER,
} from '@base/camera-three'
import {
  CharacterAnimationRig,
  DEFAULT_SKINNED_CROUCH_TERRAIN_Y_DELTA,
  PlayerController,
  PLAYER_CAPSULE_HALF_HEIGHT,
  sampleTerrainFootprintY,
} from '@base/player-three'
import { EnvironmentRuntime, type EnvironmentState } from '@/scene/EnvironmentRuntime'
import { SceneBuilder } from '@/scene/SceneBuilder'
import { PrimitiveFactory, PRIMITIVE_BASE_OFFSETS } from '@/scene/PrimitiveFactory'
import type { TerrainSampler } from '@/scene/TerrainSampler'
import type {
  SceneDescriptor,
  PlacedObject,
  GltfObject,
  PrimitiveType,
  ScatterField,
  AtmosphereDescriptor,
} from '@/scene/SceneDescriptor'
import { convertUnlitToPbrRough } from '@/scene/gltfMaterialUtils'
import {
  EDITOR_ORBIT_BOOKMARKS,
  EDITOR_ORBIT_LOCOMOTION_IDS,
} from '@/editor/editorOrbitPresets'
import { resolvePublicUrl } from '@/utils/resolvePublicUrl'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EditorTool = 'select' | PrimitiveType | 'gltf'
export type GizmoMode  = 'translate' | 'rotate' | 'scale'

/** All objects the editor can place — primitives and GLTF models. */
export type EditorObject = PlacedObject | GltfObject

export type { EnvironmentState }

export interface EditorState {
  objects:              EditorObject[]
  selectedIndex:        number | null
  activeTool:           EditorTool
  gizmoMode:            GizmoMode
  activeGltfUrl:        string
  /** Live copies of seeded scatter zones (editable in the sidebar). */
  scatterFields:        ScatterField[]
  /** Which scatter zone is selected for property editing (null = none). */
  selectedScatterIndex: number | null
  /** Fog, time-of-day, cloud params (see EnvironmentRuntime). */
  environment:          EnvironmentState
  /** Index into {@link EDITOR_ORBIT_BOOKMARKS}. */
  orbitBookmarkIndex:   number
  orbitBookmarkLabel:   string
  /** Walk the terrain with gameplay camera (orbit + gizmo disabled). */
  playSimulation:       boolean
  /** e.g. `3p · close-follow` or `1p` — empty when not playing. */
  playCameraHud:        string
}

// ─── Colours for scatter zone rings ──────────────────────────────────────────

const SCATTER_RING_COLORS: Record<PrimitiveType, number> = {
  rock:    0x9ca3af,  // cool grey
  tree:    0x4ade80,  // green
  crystal: 0x818cf8,  // indigo
  pillar:  0xfbbf24,  // amber
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTransparent(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const ghost       = (child.material as THREE.MeshStandardMaterial).clone()
      ghost.transparent = true
      ghost.opacity     = 0.42
      ghost.depthWrite  = false
      child.material    = ghost
    }
  })
}

/**
 * A terrain-hugging circle line (samples terrain Y at each vertex).
 * Positioned in world space — do NOT add to a translated group.
 */
function makeTerrainCircle(
  radius: number,
  cx: number,
  cz: number,
  sampler: TerrainSampler,
  color: number,
  opacity: number,
  segments = 72,
): THREE.Line {
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const x = cx + Math.cos(a) * radius
    const z = cz + Math.sin(a) * radius
    points.push(new THREE.Vector3(x, sampler.sample(x, z) + 0.25, z))
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points)
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  return new THREE.Line(geo, mat)
}

/** Small crosshair at the scatter zone centre. */
function makeCenterCross(
  cx: number,
  cz: number,
  sampler: TerrainSampler,
  color: number,
): THREE.LineSegments {
  const y  = sampler.sample(cx, cz) + 0.3
  const s  = 2.5
  const pts = [
    new THREE.Vector3(cx - s, y, cz), new THREE.Vector3(cx + s, y, cz),
    new THREE.Vector3(cx, y, cz - s), new THREE.Vector3(cx, y, cz + s),
  ]
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
  return new THREE.LineSegments(geo, mat)
}

/** GLTF ghost placeholder — simple semitransparent box when model shape is unknown. */
function makeGltfGhost(): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color:       0x6366f1,
    transparent: true,
    opacity:     0.35,
    depthWrite:  false,
  })
  return new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 1.2), mat)
}

// ─── Module ───────────────────────────────────────────────────────────────────

/**
 * EditorSceneModule — interactive scene editor.
 *
 * - Builds terrain + scatter (from descriptor) via SceneBuilder
 * - Draws translucent scatter zone rings on the terrain for visual authoring
 * - Registers PlacedObjects and GltfObjects from the descriptor as selectable/moveable
 * - OrbitControls (free camera) + TransformControls (gizmo on selected object)
 * - Right-click terrain = re-anchor orbit pivot
 * - Click-to-place primitives and GLTF models with terrain Y-snapping
 * - Ghost preview under cursor for the active tool
 * - T / R / S / Delete / Escape keyboard shortcuts
 * - `onStateChanged` callback bridges module state into Vue reactivity
 * - **Session avatar** (lazy): one skinned/capsule rig shared by **Author** / **Bird-eye** orbit
 *   ({@link EDITOR_ORBIT_LOCOMOTION_IDS}) with `PlayerController` **`movementBasis: 'camera'`**;
 *   each frame the **orbit pivot + camera translate** with the avatar so view matches gameplay, while
 *   **OrbitControls** still own rotation / zoom / pan from pointer input.
 * - **Walk scene** (`movementBasis: 'facing'` + {@link GameplayCameraController}).
 * - **Overview** / **Corner**: avatar hidden; WASD off. **Esc** / toolbar ends walk.
 */
export class EditorSceneModule extends BaseModule {
  readonly id = 'editor-scene'

  // ── Descriptor ──────────────────────────────────────────────────────────────

  private readonly descriptor: SceneDescriptor

  // ── Three.js refs ───────────────────────────────────────────────────────────

  private _ctx!: ThreeContext
  private _sampler!: TerrainSampler
  private terrainMesh!: THREE.Mesh
  private orbit!: OrbitControls
  private transform!: TransformControls
  private raycaster = new THREE.Raycaster()
  private mouse     = new THREE.Vector2()
  /** Pre-tick avatar position for orbit-follow; delta applied to camera + orbit.target. */
  private readonly _orbitFollowPrev = new THREE.Vector3()
  private readonly _orbitFollowDelta = new THREE.Vector3()

  // ── Editor state ────────────────────────────────────────────────────────────

  private _activeTool:    EditorTool = 'select'
  private _gizmoMode:     GizmoMode  = 'translate'
  private _activeGltfUrl = ''
  private _objects:       EditorObject[]   = []
  private _selectedIndex: number | null    = null

  // ── Object tracking ─────────────────────────────────────────────────────────

  private _placedNodes: THREE.Object3D[]          = []
  private _nodeToDesc  = new Map<THREE.Object3D, EditorObject>()
  private _descToNode  = new Map<EditorObject,   THREE.Object3D>()

  // ── Scatter (seeded spawners) ───────────────────────────────────────────────

  private _scatterFields: ScatterField[] = []
  private _scatterRoot!: THREE.Group
  private _terrainRadius = 50
  private _seaLevel      = 0
  private _selectedScatterIndex: number | null = null
  private _scatterRebuildTimer: ReturnType<typeof setTimeout> | null = null

  // ── Scatter ring visuals ─────────────────────────────────────────────────────

  private _scatterRings: THREE.Object3D[] = []

  private _env!: EnvironmentRuntime

  // ── Ghost preview ───────────────────────────────────────────────────────────

  private _ghost: THREE.Object3D | null = null

  private _orbitBookmarkIndex = 0

  // ── Play simulation (capsule + PlayerController + GameplayCameraController) ─

  private _playSimulation = false
  private _player: PlayerController | null = null
  /** Session avatar (loaded once); used in walk mode and in author/bird orbit locomotion. */
  private _avatarRoot: THREE.Object3D | null = null
  private _gameplayCam: GameplayCameraController | null = null
  private _locoSprintOr = false
  private _locoCrouchOr = false
  private _locoJogOr = false
  private _playPresetIndex = 0
  private _playEnterCancelled = false
  private _animRig: CharacterAnimationRig | null = null

  /** Walk spawn XZ — updated when exiting walk so the next session resumes from last pose. */
  private _walkSpawnX!: number
  private _walkSpawnZ!: number
  /** Flat ring on terrain showing next walk spawn in edit mode. */
  private _spawnMarker: THREE.Mesh | null = null

  // ── Cleanup refs ────────────────────────────────────────────────────────────

  private _offPointerDown!:  (e: PointerEvent) => void
  private _offPointerMove!:  (e: PointerEvent) => void
  private _offKeyDown!:      (e: KeyboardEvent) => void
  private _offContextMenu!:  (e: MouseEvent) => void
  private _unregisterLoop:   (() => void) | null = null
  private _offInputAxis:     (() => void) | null = null
  private _offInputAction:   (() => void) | null = null

  // ── Vue bridge callback ─────────────────────────────────────────────────────

  /** Assign in the Vue onMounted hook to receive reactive state updates. */
  onStateChanged?: (state: EditorState) => void

  // ─── Constructor ─────────────────────────────────────────────────────────────

  constructor(descriptor: SceneDescriptor) {
    super()
    this.descriptor = descriptor
    const sp = descriptor.character?.startPosition ?? [0, 0]
    this._walkSpawnX = sp[0] ?? 0
    this._walkSpawnZ = sp[1] ?? 0
  }

  // ─── Mount ───────────────────────────────────────────────────────────────────

  protected async onMount(_container: HTMLElement, context: EngineContext): Promise<void> {
    const ctx = context as ThreeContext
    this._ctx = ctx

    // ── Separate PlacedObjects/GltfObjects from ScatterFields ─────────────────
    const placedItems: EditorObject[]  = []
    const scatterItems: ScatterField[] = []
    for (const obj of this.descriptor.objects ?? []) {
      if (obj.type === 'scatter') scatterItems.push(obj as ScatterField)
      else                        placedItems.push(obj as EditorObject)
    }

    // Build terrain + scatter; no static player (walk mode spawns a temporary avatar).
    const buildDesc: SceneDescriptor = {
      ...this.descriptor,
      objects: scatterItems,
      skipPlayerCharacter: true,
    }
    const result      = await SceneBuilder.build(ctx, buildDesc)
    this.terrainMesh  = result.terrainMesh
    this._sampler     = result.sampler
    this._scatterRoot = result.scatterRoot

    const terrain = this.descriptor.terrain ?? {}
    this._terrainRadius = terrain.radius   ?? 50
    this._seaLevel      = terrain.seaLevel ?? 0

    // Editable copies of scatter descriptors (rings + meshes follow these)
    this._scatterFields = scatterItems.map((f) => ({ ...f }))

    // ── Scatter zone rings ────────────────────────────────────────────────────
    this._buildScatterRings(this._scatterFields)

    // ── Atmosphere (fog always; sky/time/clouds when descriptor.dynamicSky) ───
    this._env = EnvironmentRuntime.attachEditor(ctx, this.descriptor.atmosphere ?? {})

    // ── Register existing explicit objects as interactive ─────────────────────
    for (const item of placedItems) {
      await this._addTracked({ ...item } as EditorObject, ctx.scene)
    }

    // ── OrbitControls ────────────────────────────────────────────────────────
    this.orbit               = new OrbitControls(ctx.camera, ctx.renderer.domElement)
    this.orbit.enableDamping = true
    this.orbit.dampingFactor = 0.08
    this._applyOrbitBookmark(0, false)

    // ── TransformControls ────────────────────────────────────────────────────
    // r170+: TransformControls extends Controls, not Object3D — add getHelper() to the scene.
    this.transform = new TransformControls(ctx.camera, ctx.renderer.domElement)
    this.transform.setMode('translate')
    ctx.scene.add(this.transform.getHelper())

    this.transform.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !(e as unknown as { value: boolean }).value
    })
    // No selection → keep TransformControls disabled so it does not call setPointerCapture /
    // add pointermove on every click (that fights OrbitControls, especially in Author/Bird-eye).
    this._syncTransformEnabled()
    this.transform.addEventListener('mouseUp', () => { this._syncSelectedDescriptor() })
    this.transform.addEventListener('objectChange', () => {
      if (this._gizmoMode === 'scale' && this._selectedIndex !== null) {
        const node = this._placedNodes[this._selectedIndex]
        if (node) { const s = node.scale.x; node.scale.set(s, s, s) }
      }
    })

    // ── Canvas listeners ─────────────────────────────────────────────────────
    const canvas = ctx.renderer.domElement

    this._offPointerDown = (e) => { void this._handlePointerDown(e) }
    this._offPointerMove = (e) => this._handlePointerMove(e)
    this._offKeyDown     = (e) => this._handleKeyDown(e)
    this._offContextMenu = (e) => e.preventDefault()

    canvas.addEventListener('pointerdown',  this._offPointerDown)
    canvas.addEventListener('pointermove',  this._offPointerMove)
    canvas.addEventListener('contextmenu',  this._offContextMenu)
    window.addEventListener('keydown',      this._offKeyDown)

    this._createSpawnMarker()

    this._offInputAxis = context.eventBus.on('input:axis', (raw) => {
      if (!this._locomotionInputActive()) return
      const e = raw as InputAxisEvent
      if (e.axis === 'move') {
        this._player?.setMoveIntent(e.value.x, e.value.y)
      }
      if (e.axis === 'locomotion') {
        this._locoSprintOr ||= e.value.x > 0.5
        this._locoCrouchOr ||= e.value.y > 0.5
        this._locoJogOr ||= (e.value.z ?? 0) > 0.5
      }
    })

    this._offInputAction = context.eventBus.on('input:action', (raw) => {
      if (!this._locomotionInputActive()) return
      const e = raw as InputActionEvent
      if (e.action === 'jump' && e.type === 'pressed') {
        this._player?.notifyJumpPressed()
      }
    })

    this._unregisterLoop = ctx.registerSystem('editor-frame', (delta) => {
      this._env.update(delta)
      if (this._playSimulation) {
        this._playTick(delta)
      } else {
        this.orbit.update()
        this._editOrbitLocomotionTick(delta)
      }
    })

    this._emitState()
  }

  protected async onUnmount(): Promise<void> {
    if (this._scatterRebuildTimer !== null) {
      clearTimeout(this._scatterRebuildTimer)
      this._scatterRebuildTimer = null
    }
    this._env?.dispose()
    const canvas = this._ctx.renderer.domElement
    canvas.removeEventListener('pointerdown',  this._offPointerDown)
    canvas.removeEventListener('pointermove',  this._offPointerMove)
    canvas.removeEventListener('contextmenu',  this._offContextMenu)
    window.removeEventListener('keydown',      this._offKeyDown)
    this._offInputAxis?.()
    this._offInputAction?.()
    this._offInputAxis = null
    this._offInputAction = null
    this._disposeSessionAvatar()
    if (this._spawnMarker) {
      this._ctx.scene.remove(this._spawnMarker)
      this._spawnMarker.geometry.dispose()
      const m = this._spawnMarker.material
      if (!Array.isArray(m)) (m as THREE.Material).dispose()
      this._spawnMarker = null
    }
    this.orbit.dispose()
    this._ctx.scene.remove(this.transform.getHelper())
    this.transform.dispose()
    this._unregisterLoop?.()
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  get activeTool():    EditorTool    { return this._activeTool }
  get gizmoMode():     GizmoMode     { return this._gizmoMode }
  get selectedIndex(): number | null { return this._selectedIndex }
  get objects():       EditorObject[] { return this._objects }
  get activeGltfUrl(): string        { return this._activeGltfUrl }

  setActiveTool(tool: EditorTool): void {
    if (this._playSimulation) return
    this._activeTool = tool
    this._selectedScatterIndex = null
    this._deselect()
    this._removeGhost()
    if (tool !== 'select') this._createGhost(tool)
    this._emitState()
  }

  setGizmoMode(mode: GizmoMode): void {
    this._gizmoMode = mode
    this.transform.setMode(mode)
    this._emitState()
  }

  setActiveGltfUrl(url: string): void {
    this._activeGltfUrl = url
    // Rebuild ghost if gltf tool is active (box placeholder — we don't pre-load)
    if (this._activeTool === 'gltf') {
      this._removeGhost()
      this._createGhost('gltf')
    }
    this._emitState()
  }

  selectByIndex(index: number): void {
    if (index < 0 || index >= this._objects.length) return
    this._selectIndex(index)
  }

  // ─── Seeded scatter (spawner) controls ───────────────────────────────────────

  /** Shallow copies of current scatter field descriptors (for export / display). */
  getScatterFields(): ScatterField[] {
    return this._scatterFields.map((f) => ({ ...f }))
  }

  /**
   * Select a scatter zone for editing in the sidebar. Clears placed-object selection.
   * Pass `null` to clear.
   */
  selectScatterIndex(index: number | null): void {
    if (index !== null && (index < 0 || index >= this._scatterFields.length)) return
    this._selectedScatterIndex = index
    this._deselect()
    this._emitState()
  }

  /**
   * Patch one scatter field and rebuild procedural instances + ring overlays.
   * Values are clamped to keep the layout stable (radii, scales, count).
   */
  updateScatterField(index: number, patch: Partial<ScatterField>): void {
    if (index < 0 || index >= this._scatterFields.length) return
    const cur = this._scatterFields[index]
    if (!cur) return

    const next: ScatterField = { ...cur, ...patch, type: 'scatter' }

    if (patch.count !== undefined) {
      next.count = Math.max(0, Math.floor(Number(patch.count)))
    }
    if (patch.seed !== undefined) {
      next.seed = Math.floor(Number(patch.seed)) >>> 0
    }
    if (patch.outerRadius !== undefined) {
      next.outerRadius = Math.max(0.5, patch.outerRadius)
    }
    if (patch.innerRadius !== undefined) {
      next.innerRadius = Math.max(0, patch.innerRadius)
    }

    const outer = next.outerRadius
    let inner   = next.innerRadius ?? 0
    if (inner >= outer) {
      inner = Math.max(0, outer - 0.5)
      next.innerRadius = inner
    }

    let smin = next.scaleMin ?? 0.75
    let smax = next.scaleMax ?? 1.25
    smin = Math.max(0.05, smin)
    smax = Math.max(smin, smax)
    next.scaleMin = smin
    next.scaleMax = smax

    this._scatterFields[index] = next
    this._scheduleScatterRebuild()
    this._emitState()
  }

  /** Assign a new random seed to scatter zone `index` (32-bit unsigned). */
  randomizeScatterSeed(index: number): void {
    const s = (Math.random() * 0xffffffff) >>> 0
    this.updateScatterField(index, { seed: s })
  }

  /** Append a new scatter zone with conservative defaults. */
  addScatterField(): void {
    this._scatterFields.push({
      type:        'scatter',
      primitive:   'rock',
      count:       12,
      centerX:     0,
      centerZ:     0,
      innerRadius: 0,
      outerRadius: 12,
      scaleMin:    0.75,
      scaleMax:    1.25,
      seed:        (Math.random() * 0xffffffff) >>> 0,
    })
    this._selectedScatterIndex = this._scatterFields.length - 1
    this._deselect()
    this._scheduleScatterRebuild()
    this._emitState()
  }

  /** Remove scatter zone `index`. */
  removeScatterField(index: number): void {
    if (index < 0 || index >= this._scatterFields.length) return
    this._scatterFields.splice(index, 1)
    if (this._selectedScatterIndex === index) this._selectedScatterIndex = null
    else if (this._selectedScatterIndex !== null && this._selectedScatterIndex > index) {
      this._selectedScatterIndex--
    }
    this._scheduleScatterRebuild()
    this._emitState()
  }

  deleteSelected(): void {
    if (this._selectedIndex !== null) this._deleteAtIndex(this._selectedIndex)
  }

  /** Jump to a saved orbit (toolbar). */
  setOrbitBookmarkIndex(index: number): void {
    if (this._playSimulation || !this.orbit) return
    if (index < 0 || index >= EDITOR_ORBIT_BOOKMARKS.length) return
    this._applyOrbitBookmark(index, true)
  }

  /** Step saved views (keyboard `[` / `]`). */
  cycleOrbitBookmark(delta: number): void {
    if (this._playSimulation || !this.orbit) return
    this._applyOrbitBookmark(this._orbitBookmarkIndex + delta, true)
  }

  /**
   * Enter or exit walk-the-scene mode: character at `descriptor.character.startPosition`
   * (`modelUrl` or capsule), `@base/input`, `PlayerController`, optional `CharacterAnimationRig`, `@base/camera-three`.
   */
  setPlaySimulation(on: boolean): void {
    if (on === this._playSimulation) return
    if (on) void this._enterPlaySim()
    else this._exitPlaySim()
  }

  /** While playing: cycle third-person preset (`[` / `]`). */
  cyclePlayCameraPreset(delta: number): void {
    if (!this._playSimulation || !this._gameplayCam) return
    if (this._gameplayCam.getMode() !== 'third-person') return
    const order = THIRD_PERSON_CAMERA_PRESET_ORDER
    const cur = this._gameplayCam.getCameraPreset()
    let i = order.indexOf(cur)
    if (i < 0) i = 0
    i = (i + delta + order.length) % order.length
    const next = order[i]!
    this._gameplayCam.setCameraPreset(next)
    this._playPresetIndex = i
    this._emitState()
  }

  /** While playing: toggle first- vs third-person (**B**). */
  togglePlayCameraMode(): void {
    if (!this._playSimulation || !this._gameplayCam || !this._avatarRoot || !this._player) return
    const next =
      this._gameplayCam.getMode() === 'third-person' ? 'first-person' : 'third-person'
    this._gameplayCam.setMode(next)
    this._gameplayCam.snapToCharacter(
      this._ctx.camera,
      this._avatarRoot,
      this._player.getFacing(),
      this._player.getCrouchGroundBlend(),
    )
    this._emitState()
  }

  updateSelectedScale(scale: number): void {
    if (this._selectedIndex === null) return
    const desc = this._objects[this._selectedIndex]
    const node = this._placedNodes[this._selectedIndex]
    if (!desc || !node) return

    const s    = Math.max(0.05, Math.round(scale * 100) / 100)
    desc.scale = s
    node.scale.setScalar(s)

    const offset    = this._baseOffset(desc)
    const terrainY  = this._sampleTerrain(desc.x, desc.z)
    node.position.y = terrainY + offset * s

    this._emitState()
  }

  updateSelectedRotationY(rotY: number): void {
    if (this._selectedIndex === null) return
    const desc = this._objects[this._selectedIndex]
    const node = this._placedNodes[this._selectedIndex]
    if (!desc || !node) return

    desc.rotationY  = Math.round(rotY * 100) / 100
    node.rotation.y = rotY

    this._emitState()
  }

  getObjects(): EditorObject[] {
    return this._objects.map((o) => ({ ...o }))
  }

  /** Atmosphere block merged for “Copy full scene” (includes live fog / time / clouds). */
  getAtmosphereForExport(): AtmosphereDescriptor {
    return this._env.toAtmospherePatch(this.descriptor.atmosphere ?? {})
  }

  setEnvironmentPhase(phase: number): void {
    this._env.setPhase(phase)
    this._emitState()
  }

  setEnvironmentPhaseSpeed(speed: number): void {
    this._env.setPhaseSpeed(speed)
    this._emitState()
  }

  setEnvironmentFogDensity(d: number): void {
    this._env.setFogDensity(d)
    this._emitState()
  }

  setEnvironmentFogColor(hex: number): void {
    this._env.setFogColor(hex)
    this._emitState()
  }

  setCloudOpacity(o: number): void {
    this._env.setCloudOpacity(o)
    this._emitState()
  }

  setCloudScrollSpeed(s: number): void {
    this._env.setCloudScrollSpeed(s)
    this._emitState()
  }

  setCloudWind(x: number, z: number): void {
    this._env.setCloudWind(x, z)
    this._emitState()
  }

  setCloudVisibilityWindow(fromP: number, toP: number): void {
    this._env.setCloudVisibilityWindow(fromP, toP)
    this._emitState()
  }

  setCloudDensityCurve(night: number, noon: number): void {
    this._env.setCloudDensityCurve(night, noon)
    this._emitState()
  }

  // ─── Pointer handlers ─────────────────────────────────────────────────────────

  private async _handlePointerDown(e: PointerEvent): Promise<void> {
    if (this._playSimulation) return

    // Right-click: re-anchor orbit pivot to terrain point
    if (e.button === 2) {
      this._updateMouse(e, this._ctx.renderer)
      this.raycaster.setFromCamera(this.mouse, this._ctx.camera)
      const hits = this.raycaster.intersectObject(this.terrainMesh)
      if (hits.length > 0) {
        const pt = hits[0].point
        this.orbit.target.set(pt.x, pt.y, pt.z)
      }
      return
    }

    if (e.button !== 0) return  // middle-click = orbit pan, ignore

    this._updateMouse(e, this._ctx.renderer)
    this.raycaster.setFromCamera(this.mouse, this._ctx.camera)

    // 1. Try hitting an existing tracked node
    if (this._placedNodes.length > 0) {
      const hits = this.raycaster.intersectObjects(this._placedNodes, true)
      if (hits.length > 0) {
        const root = this._findRoot(hits[0].object)
        if (root !== null) {
          const desc = this._nodeToDesc.get(root)
          if (desc) {
            const idx = this._objects.indexOf(desc)
            if (idx >= 0) { this._selectIndex(idx); return }
          }
        }
      }
    }

    // 2. Place on terrain or deselect
    const terrainHits = this.raycaster.intersectObject(this.terrainMesh)
    if (terrainHits.length > 0) {
      if (this._activeTool !== 'select') {
        const pt = terrainHits[0].point
        await this._placeObject(this._activeTool, pt.x, pt.z)
      } else {
        this._deselect()
      }
    }
  }

  private _handlePointerMove(e: PointerEvent): void {
    if (this._playSimulation) return
    if (this._activeTool === 'select') return
    if (this._selectedIndex !== null) return

    this._updateMouse(e, this._ctx.renderer)
    this.raycaster.setFromCamera(this.mouse, this._ctx.camera)

    const hits = this.raycaster.intersectObject(this.terrainMesh)
    if (hits.length > 0 && this._ghost) {
      this._ghost.visible = true
      const pt  = hits[0].point
      const y   = this._sampleTerrain(pt.x, pt.z)
      // GLTF ghost has no base offset; primitives use their offset
      const off = this._activeTool === 'gltf'
        ? 0
        : (PRIMITIVE_BASE_OFFSETS[this._activeTool as PrimitiveType] ?? 0)
      this._ghost.position.set(pt.x, y + off, pt.z)
    } else if (this._ghost) {
      this._ghost.visible = false
    }
  }

  private _handleKeyDown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return

    if (this._playSimulation) {
      if (e.code === 'Escape') {
        e.preventDefault()
        this.setPlaySimulation(false)
        return
      }
      if (e.code === 'BracketLeft') {
        e.preventDefault()
        this.cyclePlayCameraPreset(-1)
        return
      }
      if (e.code === 'BracketRight') {
        e.preventDefault()
        this.cyclePlayCameraPreset(1)
        return
      }
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        this.togglePlayCameraMode()
        return
      }
      return
    }

    if (e.code === 'KeyP') {
      e.preventDefault()
      this.setPlaySimulation(true)
      return
    }
    if (e.code === 'BracketLeft') {
      e.preventDefault()
      this.cycleOrbitBookmark(-1)
      return
    }
    if (e.code === 'BracketRight') {
      e.preventDefault()
      this.cycleOrbitBookmark(1)
      return
    }
    switch (e.key) {
      case 'Delete':
      case 'Backspace':   this.deleteSelected();           break
      case 'Escape':      this._deselect();                break
      case 't': case 'T': this.setGizmoMode('translate'); break
      case 'r': case 'R': this.setGizmoMode('rotate');    break
      case 's': case 'S': this.setGizmoMode('scale');     break
    }
  }

  private _applyOrbitBookmark(index: number, emit: boolean): void {
    if (!this.orbit) return
    const n = EDITOR_ORBIT_BOOKMARKS.length
    this._orbitBookmarkIndex = ((index % n) + n) % n
    const b = EDITOR_ORBIT_BOOKMARKS[this._orbitBookmarkIndex]
    if (!b) return
    this._ctx.camera.position.set(b.camera[0], b.camera[1], b.camera[2])
    this.orbit.target.set(b.target[0], b.target[1], b.target[2])
    this.orbit.update()
    void this._syncOrbitLocomotionForBookmark()
    if (emit) this._emitState()
  }

  /** Author + Bird-eye: WASD moves avatar with `movementBasis: 'camera'` while mouse orbits. */
  private _orbitLocomotionActive(): boolean {
    if (this._playSimulation) return false
    const id = EDITOR_ORBIT_BOOKMARKS[this._orbitBookmarkIndex]?.id
    return id !== undefined && EDITOR_ORBIT_LOCOMOTION_IDS.has(id)
  }

  private _locomotionInputActive(): boolean {
    return this._playSimulation || this._orbitLocomotionActive()
  }

  private async _syncOrbitLocomotionForBookmark(): Promise<void> {
    if (this._playSimulation) return
    if (this._orbitLocomotionActive()) {
      await this._ensureSessionAvatar()
      if (this._avatarRoot) this._avatarRoot.visible = true
      this._player?.setMovementBasis('camera')
      this._panOrbitRigToSessionAvatar()
    } else {
      if (this._avatarRoot) this._avatarRoot.visible = false
      this._player?.setMoveIntent(0, 0)
      this._player?.setMovementBasis('facing')
    }
  }

  // ─── Placement ───────────────────────────────────────────────────────────────

  private async _placeObject(tool: EditorTool, x: number, z: number): Promise<void> {
    if (tool === 'select') return

    const px = Math.round(x * 100) / 100
    const pz = Math.round(z * 100) / 100
    const rotationY = Math.round(Math.random() * Math.PI * 2 * 100) / 100

    let desc: EditorObject

    if (tool === 'gltf') {
      if (!this._activeGltfUrl) return
      desc = { type: 'gltf', url: this._activeGltfUrl, x: px, z: pz, scale: 1, rotationY } as GltfObject
    } else {
      desc = { type: tool as PrimitiveType, x: px, z: pz, scale: 1, rotationY } as PlacedObject
    }

    await this._addTracked(desc, this._ctx.scene)
    this._selectIndex(this._objects.length - 1)
    this._emitState()
  }

  /**
   * Places an object in the scene and registers it in all tracking structures.
   * For GLTF: loads the model asynchronously; shows a placeholder box immediately,
   * then swaps it for the loaded model on completion.
   */
  private async _addTracked(desc: EditorObject, scene: THREE.Scene): Promise<void> {
    const scale    = desc.scale ?? 1
    const terrainY = this._sampleTerrain(desc.x, desc.z)
    const offset   = this._baseOffset(desc)

    let node: THREE.Object3D

    if (desc.type === 'gltf') {
      // Immediate placeholder so the object appears in the list right away
      const placeholder = makeGltfGhost()
      placeholder.position.set(desc.x, terrainY + offset * scale, desc.z)
      placeholder.rotation.y  = desc.rotationY ?? 0
      placeholder.scale.setScalar(scale)
      scene.add(placeholder)
      node = placeholder

      this._objects.push(desc)
      this._placedNodes.push(node)
      this._nodeToDesc.set(node, desc)
      this._descToNode.set(desc, node)

      // Async swap: load the real model and replace the placeholder
      const gltfDesc = desc as GltfObject
      try {
        const gltf  = await this._ctx.assets.loadGLTF(resolvePublicUrl(gltfDesc.url))
        const model = gltf.scene.clone(true)
        convertUnlitToPbrRough(model)
        model.position.copy(placeholder.position)
        model.rotation.copy(placeholder.rotation)
        model.scale.copy(placeholder.scale)
        scene.add(model)
        scene.remove(placeholder)

        // Swap tracking references to the real model node
        const idx = this._placedNodes.indexOf(placeholder)
        if (idx >= 0) {
          this._placedNodes[idx] = model
          this._nodeToDesc.delete(placeholder)
          this._nodeToDesc.set(model, desc)
          this._descToNode.set(desc, model)
          // If this object is currently selected, re-attach the gizmo
          if (this._selectedIndex === idx) {
            this.transform.attach(model)
            this._syncTransformEnabled()
          }
        }
      } catch {
        console.warn(`[EditorSceneModule] GLTF load failed: ${gltfDesc.url}`)
        // Placeholder stays as a visible error indicator — make it red wireframe
        ;(placeholder.material as THREE.MeshStandardMaterial).color.setHex(0xff2222)
        ;(placeholder.material as THREE.MeshStandardMaterial).wireframe = true
        ;(placeholder.material as THREE.MeshStandardMaterial).opacity = 1
      }
      return
    }

    // Primitive
    node = PrimitiveFactory.build(desc.type as PrimitiveType, scale, Math.random)
    node.position.set(desc.x, terrainY + offset * scale, desc.z)
    node.rotation.y = desc.rotationY ?? 0
    scene.add(node)

    this._objects.push(desc)
    this._placedNodes.push(node)
    this._nodeToDesc.set(node, desc)
    this._descToNode.set(desc, node)
  }

  // ─── Selection ───────────────────────────────────────────────────────────────

  /** Gizmo off when nothing selected — avoids TransformControls stealing pointer from OrbitControls. */
  private _syncTransformEnabled(): void {
    if (this._playSimulation) return
    this.transform.enabled = this._selectedIndex !== null
  }

  private _selectIndex(idx: number): void {
    this._selectedScatterIndex = null
    this._selectedIndex = idx
    const node = this._placedNodes[idx]
    if (node) this.transform.attach(node)
    this._syncTransformEnabled()
    this._emitState()
  }

  private _deselect(): void {
    this._selectedIndex = null
    this.transform.detach()
    this._syncTransformEnabled()
    this._emitState()
  }

  // ─── Deletion ────────────────────────────────────────────────────────────────

  private _deleteAtIndex(idx: number): void {
    const desc = this._objects[idx]
    const node = this._placedNodes[idx]
    if (!desc || !node) return

    this.transform.detach()
    this._ctx.scene.remove(node)
    this._nodeToDesc.delete(node)
    this._descToNode.delete(desc)
    this._objects.splice(idx, 1)
    this._placedNodes.splice(idx, 1)
    this._selectedIndex = null
    this._syncTransformEnabled()
    this._emitState()
  }

  // ─── Ghost preview ────────────────────────────────────────────────────────────

  private _createGhost(tool: EditorTool): void {
    if (tool === 'select') return

    this._ghost = tool === 'gltf'
      ? makeGltfGhost()
      : PrimitiveFactory.build(tool as PrimitiveType, 1, Math.random)

    if (tool !== 'gltf') makeTransparent(this._ghost)
    this._ghost.visible = false
    this._ctx.scene.add(this._ghost)
  }

  private _removeGhost(): void {
    if (this._ghost) {
      this._ctx.scene.remove(this._ghost)
      this._ghost = null
    }
  }

  // ─── Scatter zone rings ───────────────────────────────────────────────────────

  /**
   * Draws outer + inner terrain-hugging circle lines for every scatter field.
   * Colour-coded by primitive type so overlapping zones are distinguishable.
   */
  private _clearScatterRings(): void {
    for (const r of this._scatterRings) {
      this._ctx.scene.remove(r)
      if (r instanceof THREE.Line || r instanceof THREE.LineSegments) {
        r.geometry.dispose()
        const m = r.material
        if (m && typeof (m as THREE.Material).dispose === 'function') {
          ;(m as THREE.Material).dispose()
        }
      }
    }
    this._scatterRings = []
  }

  /** Debounced rebuild of scatter meshes + ring helpers after descriptor edits. */
  private _scheduleScatterRebuild(): void {
    if (this._scatterRebuildTimer !== null) clearTimeout(this._scatterRebuildTimer)
    this._scatterRebuildTimer = setTimeout(() => {
      this._scatterRebuildTimer = null
      SceneBuilder.rebuildScatter(
        this._scatterRoot,
        this._scatterFields,
        this._sampler,
        this._terrainRadius,
        this._seaLevel,
      )
      this._clearScatterRings()
      this._buildScatterRings(this._scatterFields)
    }, 120)
  }

  private _buildScatterRings(scatterFields: ScatterField[]): void {
    for (const field of scatterFields) {
      const cx    = field.centerX    ?? 0
      const cz    = field.centerZ    ?? 0
      const color = SCATTER_RING_COLORS[field.primitive] ?? 0xffffff

      // Outer ring (solid-ish)
      const outerRing = makeTerrainCircle(field.outerRadius, cx, cz, this._sampler, color, 0.70)
      this._ctx.scene.add(outerRing)
      this._scatterRings.push(outerRing)

      // Inner ring (more faint) — skip if inner radius is 0
      if (field.innerRadius && field.innerRadius > 0) {
        const innerRing = makeTerrainCircle(field.innerRadius, cx, cz, this._sampler, color, 0.35)
        this._ctx.scene.add(innerRing)
        this._scatterRings.push(innerRing)
      }

      // Centre crosshair
      const cross = makeCenterCross(cx, cz, this._sampler, color)
      this._ctx.scene.add(cross)
      this._scatterRings.push(cross)
    }
  }

  // ─── Descriptor sync ─────────────────────────────────────────────────────────

  private _syncSelectedDescriptor(): void {
    if (this._selectedIndex === null) return
    const desc = this._objects[this._selectedIndex]
    const node = this._placedNodes[this._selectedIndex]
    if (!desc || !node) return

    const offset = this._baseOffset(desc)

    if (this._gizmoMode === 'translate') {
      desc.x = Math.round(node.position.x * 100) / 100
      desc.z = Math.round(node.position.z * 100) / 100
      const terrainY  = this._sampleTerrain(desc.x, desc.z)
      node.position.y = terrainY + offset * (desc.scale ?? 1)

    } else if (this._gizmoMode === 'rotate') {
      desc.rotationY = Math.round(node.rotation.y * 100) / 100

    } else if (this._gizmoMode === 'scale') {
      const s  = (node.scale.x + node.scale.y + node.scale.z) / 3
      const su = Math.max(0.05, Math.round(s * 100) / 100)
      node.scale.set(su, su, su)
      desc.scale = su
      const terrainY  = this._sampleTerrain(desc.x, desc.z)
      node.position.y = terrainY + offset * su
    }

    this._emitState()
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Y offset from terrain surface to object pivot for terrain-snap calculations. */
  private _baseOffset(desc: EditorObject): number {
    if (desc.type === 'gltf') return 0
    return PRIMITIVE_BASE_OFFSETS[desc.type as PrimitiveType] ?? 0
  }

  private _sampleTerrain(x: number, z: number): number {
    return this._sampler?.sample(x, z) ?? 0
  }

  private _findRoot(child: THREE.Object3D): THREE.Object3D | null {
    let node: THREE.Object3D | null = child
    while (node !== null) {
      if (this._nodeToDesc.has(node)) return node
      node = node.parent
    }
    return null
  }

  private _updateMouse(e: PointerEvent, renderer: THREE.WebGLRenderer): void {
    const rect = renderer.domElement.getBoundingClientRect()
    this.mouse.set(
      ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      ((e.clientY - rect.top)  / rect.height) * -2 + 1,
    )
  }

  /** Green ring on terrain: next walk spawn while editing (hidden during walk). */
  private _createSpawnMarker(): void {
    const geo = new THREE.RingGeometry(0.4, 0.65, 48)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({
      color:       0x34d399,
      transparent: true,
      opacity:     0.48,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = 'editor-walk-spawn-marker'
    mesh.frustumCulled = false
    this._spawnMarker = mesh
    this._refreshSpawnMarkerPosition()
    this._ctx.scene.add(mesh)
  }

  private _refreshSpawnMarkerPosition(): void {
    if (!this._spawnMarker) return
    const y = this._sampler.sample(this._walkSpawnX, this._walkSpawnZ) + 0.08
    this._spawnMarker.position.set(this._walkSpawnX, y, this._walkSpawnZ)
  }

  private _emitState(): void {
    const bm = EDITOR_ORBIT_BOOKMARKS[this._orbitBookmarkIndex]
    let playCameraHud = ''
    if (this._playSimulation && this._gameplayCam) {
      const m = this._gameplayCam.getMode()
      playCameraHud =
        m === 'first-person' ? '1p' : `3p · ${this._gameplayCam.getCameraPreset()}`
    }
    this.onStateChanged?.({
      objects:              [...this._objects],
      selectedIndex:        this._selectedIndex,
      activeTool:           this._activeTool,
      gizmoMode:            this._gizmoMode,
      activeGltfUrl:        this._activeGltfUrl,
      scatterFields:        this._scatterFields.map((f) => ({ ...f })),
      selectedScatterIndex: this._selectedScatterIndex,
      environment:          this._env.getState(),
      orbitBookmarkIndex:   this._orbitBookmarkIndex,
      orbitBookmarkLabel:   bm?.label ?? '—',
      playSimulation:       this._playSimulation,
      playCameraHud,
    })
  }

  // ─── Play simulation internals ───────────────────────────────────────────────

  private async _enterPlaySim(): Promise<void> {
    this._playEnterCancelled = false
    if (this._spawnMarker) this._spawnMarker.visible = false
    this._deselect()
    this._removeGhost()
    await this._ensureSessionAvatar()
    if (this._playEnterCancelled) {
      this._clearWalkModeOnly()
      return
    }
    if (!this._player || !this._avatarRoot) return

    this._player.setMovementBasis('facing')

    const preset = THIRD_PERSON_CAMERA_PRESET_ORDER[this._playPresetIndex] ?? 'close-follow'
    const ch = this.descriptor.character ?? {}
    this._gameplayCam = new GameplayCameraController({
      cameraLerp: 8,
      cameraPreset: preset,
      mode: 'third-person',
      firstPerson:
        ch.modelUrl?.trim()
          ? { eyeOffsetY: 0.75, crouchEyeDrop: 0.28 }
          : undefined,
    })

    this.orbit.enabled = false
    this.transform.detach()
    this.transform.enabled = false

    this._playSimulation = true
    this._gameplayCam.snapToCharacter(
      this._ctx.camera,
      this._avatarRoot,
      this._player.getFacing(),
      this._player.getCrouchGroundBlend(),
    )
    this._emitState()
  }

  private _exitPlaySim(): void {
    if (this._avatarRoot) {
      this._walkSpawnX = this._avatarRoot.position.x
      this._walkSpawnZ = this._avatarRoot.position.z
    }
    this._playEnterCancelled = true
    this._clearWalkModeOnly()
    this._playSimulation = false
    this._syncTransformEnabled()
    if (this.orbit) this.orbit.enabled = true
    this._refreshSpawnMarkerPosition()
    if (this._spawnMarker) this._spawnMarker.visible = true
    this._applyOrbitBookmark(this._orbitBookmarkIndex, true)
    this._emitState()
  }

  /** Loads skinned or capsule avatar once; shared by orbit locomotion and walk mode. */
  private async _ensureSessionAvatar(): Promise<void> {
    if (this._avatarRoot && this._player) return

    const ch = this.descriptor.character ?? {}
    const x = this._walkSpawnX
    const z = this._walkSpawnZ
    const footprint = ch.terrainFootprintRadius ?? (ch.modelUrl?.trim() ? 0.22 : 0)
    const groundY = sampleTerrainFootprintY(this._sampler, x, z, footprint)

    let root: THREE.Object3D
    let terrainYOffset: number

    if (ch.modelUrl?.trim()) {
      const built = await SceneBuilder.buildCharacter(this._ctx, ch)
      if (this._playEnterCancelled) {
        EditorSceneModule._disposePlayCharacterResources(built.object)
        return
      }
      root = built.object
      root.name = 'editor-session-character'
      terrainYOffset = built.terrainYOffset
    } else {
      const mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.35, 1.0, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.5, metalness: 0.15 }),
      )
      mesh.name = 'editor-session-capsule'
      root = mesh
      terrainYOffset = PLAYER_CAPSULE_HALF_HEIGHT
    }

    root.position.set(x, groundY + terrainYOffset, z)
    this._ctx.scene.add(root)
    if (this._playEnterCancelled) {
      EditorSceneModule._disposePlayCharacterResources(root)
      this._ctx.scene.remove(root)
      return
    }
    this._avatarRoot = root

    this._player = new PlayerController({
      characterSpeed: 7,
      facingLerp: 12,
      terrainYOffset,
      movementBasis: this._orbitLocomotionActive() ? 'camera' : 'facing',
    })
    this._player.setTerrainFootprintRadius(footprint)
    const crouchDelta = ch.modelUrl?.trim() ? DEFAULT_SKINNED_CROUCH_TERRAIN_Y_DELTA : 0
    this._player.setCrouchTerrainYOffsetDelta(crouchDelta)
    this._player.resetFacing(ch.rotationY ?? 0)

    if (this._playEnterCancelled) {
      this._disposeSessionAvatar()
      return
    }

    this._animRig?.dispose()
    this._animRig = new CharacterAnimationRig(root)
  }

  /** Leave walk camera + gameplay rig; keep session avatar in scene. */
  private _clearWalkModeOnly(): void {
    this._gameplayCam = null
  }

  private _disposeSessionAvatar(): void {
    this._clearWalkModeOnly()
    this._animRig?.dispose()
    this._animRig = null
    if (this._avatarRoot) {
      EditorSceneModule._disposePlayCharacterResources(this._avatarRoot)
      this._ctx.scene.remove(this._avatarRoot)
      this._avatarRoot = null
    }
    this._player = null
  }

  private static _disposePlayCharacterResources(root: THREE.Object3D): void {
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry?.dispose()
        const m = o.material
        if (Array.isArray(m)) {
          for (const mm of m) mm.dispose()
        } else {
          m?.dispose()
        }
      }
    })
  }

  private _playTick(delta: number): void {
    if (!this._player || !this._avatarRoot || !this._gameplayCam) return

    const sprintHeld = this._locoSprintOr
    const crouchHeld = this._locoCrouchOr
    const jogHeld = this._locoJogOr
    this._locoSprintOr = false
    this._locoCrouchOr = false
    this._locoJogOr = false

    this._player.tick(delta, {
      camera: this._ctx.camera,
      character: this._avatarRoot,
      sampler: this._sampler,
      playableRadius: this._terrainRadius,
      sprintHeld,
      crouchHeld,
    })

    const snap = this._player.getSnapshot()
    this._animRig?.update(delta, this._avatarRoot, snap.velocity, {
      crouch: snap.crouching,
      sprint: snap.sprinting,
      grounded: snap.grounded,
      jog: jogHeld,
    })

    this._gameplayCam.update(
      this._ctx.camera,
      delta,
      this._avatarRoot,
      this._player.getFacing(),
      this._player.getCrouchGroundBlend(),
    )
  }

  /**
   * Move orbit pivot + camera by the same delta so OrbitControls spherical offset is unchanged
   * (mouse still drives rotation/zoom; WASD only slides the rig with the character).
   */
  private _panOrbitRigByAvatarDelta(): void {
    if (!this._avatarRoot) return
    this._orbitFollowDelta.subVectors(this._avatarRoot.position, this._orbitFollowPrev)
    if (this._orbitFollowDelta.lengthSq() < 1e-16) return
    this.orbit.target.add(this._orbitFollowDelta)
    this._ctx.camera.position.add(this._orbitFollowDelta)
  }

  /** Snap orbit target to the session avatar while preserving camera–target offset (bookmark → follow). */
  private _panOrbitRigToSessionAvatar(): void {
    if (!this._avatarRoot) return
    this._orbitFollowDelta.set(
      this._avatarRoot.position.x - this.orbit.target.x,
      this._avatarRoot.position.y - this.orbit.target.y,
      this._avatarRoot.position.z - this.orbit.target.z,
    )
    if (this._orbitFollowDelta.lengthSq() < 1e-16) return
    this.orbit.target.add(this._orbitFollowDelta)
    this._ctx.camera.position.add(this._orbitFollowDelta)
    this.orbit.update()
  }

  private _editOrbitLocomotionTick(delta: number): void {
    if (!this._orbitLocomotionActive()) return
    if (!this._player || !this._avatarRoot) return

    const sprintHeld = this._locoSprintOr
    const crouchHeld = this._locoCrouchOr
    const jogHeld = this._locoJogOr
    this._locoSprintOr = false
    this._locoCrouchOr = false
    this._locoJogOr = false

    this._orbitFollowPrev.copy(this._avatarRoot.position)
    this._player.tick(delta, {
      camera: this._ctx.camera,
      character: this._avatarRoot,
      sampler: this._sampler,
      playableRadius: this._terrainRadius,
      sprintHeld,
      crouchHeld,
    })
    this._panOrbitRigByAvatarDelta()

    const snap = this._player.getSnapshot()
    this._animRig?.update(delta, this._avatarRoot, snap.velocity, {
      crouch: snap.crouching,
      sprint: snap.sprinting,
      grounded: snap.grounded,
      jog: jogHeld,
    })

    this._walkSpawnX = this._avatarRoot.position.x
    this._walkSpawnZ = this._avatarRoot.position.z
    this._refreshSpawnMarkerPosition()
  }
}
