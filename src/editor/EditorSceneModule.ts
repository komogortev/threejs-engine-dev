import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { BaseModule } from '@base/engine-core'
import type { EngineContext } from '@base/engine-core'
import type { ThreeContext } from '@base/threejs-engine'
import { SceneBuilder } from '@/scene/SceneBuilder'
import { PrimitiveFactory, PRIMITIVE_BASE_OFFSETS } from '@/scene/PrimitiveFactory'
import type { TerrainSampler } from '@/scene/TerrainSampler'
import type {
  SceneDescriptor,
  PlacedObject,
  GltfObject,
  PrimitiveType,
  ScatterField,
} from '@/scene/SceneDescriptor'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EditorTool = 'select' | PrimitiveType | 'gltf'
export type GizmoMode  = 'translate' | 'rotate' | 'scale'

/** All objects the editor can place — primitives and GLTF models. */
export type EditorObject = PlacedObject | GltfObject

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

  // ── Ghost preview ───────────────────────────────────────────────────────────

  private _ghost: THREE.Object3D | null = null

  // ── Cleanup refs ────────────────────────────────────────────────────────────

  private _offPointerDown!:  (e: PointerEvent) => void
  private _offPointerMove!:  (e: PointerEvent) => void
  private _offKeyDown!:      (e: KeyboardEvent) => void
  private _offContextMenu!:  (e: MouseEvent) => void
  private _unregisterLoop:   (() => void) | null = null

  // ── Vue bridge callback ─────────────────────────────────────────────────────

  /** Assign in the Vue onMounted hook to receive reactive state updates. */
  onStateChanged?: (state: EditorState) => void

  // ─── Constructor ─────────────────────────────────────────────────────────────

  constructor(descriptor: SceneDescriptor) {
    super()
    this.descriptor = descriptor
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

    // Build terrain + scatter; editor manages explicit objects separately
    const buildDesc: SceneDescriptor = { ...this.descriptor, objects: scatterItems }
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

    // ── Register existing explicit objects as interactive ─────────────────────
    for (const item of placedItems) {
      await this._addTracked({ ...item } as EditorObject, ctx.scene)
    }

    // ── Camera ───────────────────────────────────────────────────────────────
    ctx.camera.position.set(0, 45, 50)
    ctx.camera.lookAt(0, 0, 0)

    // ── OrbitControls ────────────────────────────────────────────────────────
    this.orbit               = new OrbitControls(ctx.camera, ctx.renderer.domElement)
    this.orbit.enableDamping = true
    this.orbit.dampingFactor = 0.08
    this.orbit.target.set(0, 0, 0)

    // ── TransformControls ────────────────────────────────────────────────────
    this.transform = new TransformControls(ctx.camera, ctx.renderer.domElement)
    this.transform.setMode('translate')
    ctx.scene.add(this.transform as unknown as THREE.Object3D)

    this.transform.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !(e as unknown as { value: boolean }).value
    })
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

    this._unregisterLoop = ctx.registerSystem('editor-orbit', () => { this.orbit.update() })

    this._emitState()
  }

  protected async onUnmount(): Promise<void> {
    if (this._scatterRebuildTimer !== null) {
      clearTimeout(this._scatterRebuildTimer)
      this._scatterRebuildTimer = null
    }
    const canvas = this._ctx.renderer.domElement
    canvas.removeEventListener('pointerdown',  this._offPointerDown)
    canvas.removeEventListener('pointermove',  this._offPointerMove)
    canvas.removeEventListener('contextmenu',  this._offContextMenu)
    window.removeEventListener('keydown',      this._offKeyDown)
    this.orbit.dispose()
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

  // ─── Pointer handlers ─────────────────────────────────────────────────────────

  private async _handlePointerDown(e: PointerEvent): Promise<void> {
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
    switch (e.key) {
      case 'Delete':
      case 'Backspace':   this.deleteSelected();           break
      case 'Escape':      this._deselect();                break
      case 't': case 'T': this.setGizmoMode('translate'); break
      case 'r': case 'R': this.setGizmoMode('rotate');    break
      case 's': case 'S': this.setGizmoMode('scale');     break
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
        const gltf  = await this._ctx.assets.loadGLTF(gltfDesc.url)
        const model = gltf.scene.clone(true)
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
          if (this._selectedIndex === idx) this.transform.attach(model)
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

  private _selectIndex(idx: number): void {
    this._selectedScatterIndex = null
    this._selectedIndex = idx
    const node = this._placedNodes[idx]
    if (node) this.transform.attach(node)
    this._emitState()
  }

  private _deselect(): void {
    this._selectedIndex = null
    this.transform.detach()
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

  private _emitState(): void {
    this.onStateChanged?.({
      objects:              [...this._objects],
      selectedIndex:        this._selectedIndex,
      activeTool:           this._activeTool,
      gizmoMode:            this._gizmoMode,
      activeGltfUrl:        this._activeGltfUrl,
      scatterFields:        this._scatterFields.map((f) => ({ ...f })),
      selectedScatterIndex: this._selectedScatterIndex,
    })
  }
}
