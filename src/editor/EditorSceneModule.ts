import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { BaseModule } from '@base/engine-core'
import type { EngineContext } from '@base/engine-core'
import type { ThreeContext } from '@base/threejs-engine'
import { SceneBuilder } from '@/scene/SceneBuilder'
import { PrimitiveFactory, PRIMITIVE_BASE_OFFSETS } from '@/scene/PrimitiveFactory'
import type { TerrainSampler } from '@/scene/TerrainSampler'
import type { SceneDescriptor, PlacedObject, PrimitiveType, ScatterField } from '@/scene/SceneDescriptor'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EditorTool = 'select' | PrimitiveType
export type GizmoMode = 'translate' | 'rotate' | 'scale'

export interface EditorState {
  objects:       PlacedObject[]
  selectedIndex: number | null
  activeTool:    EditorTool
  gizmoMode:     GizmoMode
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTransparent(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const original = child.material as THREE.MeshStandardMaterial
      const ghost    = original.clone()
      ghost.transparent = true
      ghost.opacity     = 0.42
      ghost.depthWrite  = false
      child.material    = ghost
    }
  })
}

// ─── Module ───────────────────────────────────────────────────────────────────

/**
 * EditorSceneModule — interactive scene editor built on top of SceneBuilder.
 *
 * Responsibilities:
 *   - Builds terrain + scatter (from descriptor) via SceneBuilder
 *   - Registers PlacedObjects from the descriptor so they are immediately selectable
 *   - Provides OrbitControls for free camera and TransformControls for gizmo editing
 *   - Click-to-place for the active primitive type with terrain Y-snapping
 *   - Ghost preview under cursor when a primitive tool is active
 *   - Delete / T / R / S / Escape keyboard shortcuts
 *   - Exposes `onStateChanged` callback for Vue reactivity bridging
 *
 * The editor never touches scatter fields (ScatterField entries) — those are
 * placed by SceneBuilder and are read-only in this iteration.
 * `getObjects()` returns only the interactively tracked PlacedObjects.
 *
 * @example
 * const editor = new EditorSceneModule(scene01)
 * editor.onStateChanged = (state) => { editorState.value = state }
 * await engine.mountChild('editor', editor)
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
  private _objects:       PlacedObject[]   = []
  private _selectedIndex: number | null    = null

  // ── Object tracking ─────────────────────────────────────────────────────────

  /** Root THREE.Object3D for each PlacedObject. Index-aligned with _objects. */
  private _placedNodes:  THREE.Object3D[] = []
  /** Maps root node → descriptor (used to find selected descriptor on raycast hit). */
  private _nodeToDesc  = new Map<THREE.Object3D, PlacedObject>()
  /** Maps descriptor → root node (used for selection sync from sidebar). */
  private _descToNode  = new Map<PlacedObject, THREE.Object3D>()

  // ── Ghost preview ───────────────────────────────────────────────────────────

  private _ghost: THREE.Object3D | null = null

  // ── Cleanup refs ────────────────────────────────────────────────────────────

  private _offPointerDown!: (e: PointerEvent) => void
  private _offPointerMove!: (e: PointerEvent) => void
  private _offKeyDown!:     (e: KeyboardEvent) => void
  private _unregisterLoop:  (() => void) | null = null

  // ── Vue bridge callback ─────────────────────────────────────────────────────

  /** Called whenever editable state changes. Assign in the Vue `onMounted` hook. */
  onStateChanged?: (state: EditorState) => void

  // ─── Constructor ─────────────────────────────────────────────────────────────

  constructor(descriptor: SceneDescriptor) {
    super()
    this.descriptor = descriptor
  }

  // ─── Mount ───────────────────────────────────────────────────────────────────

  protected async onMount(_container: HTMLElement, context: EngineContext): Promise<void> {
    const ctx    = context as ThreeContext
    this._ctx    = ctx

    // ── Build terrain + scatter; exclude PlacedObjects so we track them ourselves ──
    const placedItems: PlacedObject[]  = []
    const scatterItems: ScatterField[] = []
    for (const obj of this.descriptor.objects ?? []) {
      if (obj.type === 'scatter') scatterItems.push(obj as ScatterField)
      else                        placedItems.push(obj as PlacedObject)
    }

    const buildDesc: SceneDescriptor = {
      ...this.descriptor,
      objects: scatterItems,
    }
    const result        = await SceneBuilder.build(ctx, buildDesc)
    this.terrainMesh    = result.terrainMesh
    this._sampler       = result.sampler

    // ── Register existing PlacedObjects as interactive ───────────────────────
    for (const item of placedItems) {
      this._addTracked({ ...item }, ctx.scene)  // spread to decouple from scene-01 ref
    }

    // ── Camera ───────────────────────────────────────────────────────────────
    ctx.camera.position.set(0, 45, 50)
    ctx.camera.lookAt(0, 0, 0)

    // ── OrbitControls ────────────────────────────────────────────────────────
    this.orbit              = new OrbitControls(ctx.camera, ctx.renderer.domElement)
    this.orbit.enableDamping = true
    this.orbit.dampingFactor = 0.08
    this.orbit.target.set(0, 0, 0)

    // ── TransformControls ────────────────────────────────────────────────────
    this.transform = new TransformControls(ctx.camera, ctx.renderer.domElement)
    this.transform.setMode('translate')
    ctx.scene.add(this.transform)

    // Disable orbit while dragging the gizmo
    this.transform.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !(e as CustomEvent & { value: boolean }).value
    })

    // After gizmo drag: sync descriptor fields + re-snap Y for translate/scale
    this.transform.addEventListener('mouseUp', () => {
      this._syncSelectedDescriptor()
    })

    // Enforce uniform scale during drag
    this.transform.addEventListener('objectChange', () => {
      if (this._gizmoMode === 'scale' && this._selectedIndex !== null) {
        const node = this._placedNodes[this._selectedIndex]
        if (node) {
          const s = node.scale.x
          node.scale.set(s, s, s)
        }
      }
    })

    // ── Canvas pointer / keyboard listeners ──────────────────────────────────
    const canvas = ctx.renderer.domElement

    this._offPointerDown = (e) => this._handlePointerDown(e)
    this._offPointerMove = (e) => this._handlePointerMove(e)
    this._offKeyDown     = (e) => this._handleKeyDown(e)

    canvas.addEventListener('pointerdown', this._offPointerDown)
    canvas.addEventListener('pointermove', this._offPointerMove)
    window.addEventListener('keydown',     this._offKeyDown)

    // ── Frame loop ───────────────────────────────────────────────────────────
    this._unregisterLoop = ctx.registerSystem('editor-orbit', () => {
      this.orbit.update()
    })

    this._emitState()
  }

  protected async onUnmount(): Promise<void> {
    const canvas = this._ctx.renderer.domElement
    canvas.removeEventListener('pointerdown', this._offPointerDown)
    canvas.removeEventListener('pointermove', this._offPointerMove)
    window.removeEventListener('keydown',     this._offKeyDown)
    this.orbit.dispose()
    this.transform.dispose()
    this._unregisterLoop?.()
  }

  // ─── Public API (called from EditorView) ─────────────────────────────────────

  get activeTool():    EditorTool    { return this._activeTool }
  get gizmoMode():     GizmoMode     { return this._gizmoMode }
  get selectedIndex(): number | null { return this._selectedIndex }
  get objects():       PlacedObject[] { return this._objects }

  setActiveTool(tool: EditorTool): void {
    this._activeTool = tool
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

  /** Select the object at `index` in the objects array (called from sidebar list click). */
  selectByIndex(index: number): void {
    if (index < 0 || index >= this._objects.length) return
    this._selectIndex(index)
  }

  deleteSelected(): void {
    if (this._selectedIndex !== null) this._deleteAtIndex(this._selectedIndex)
  }

  updateSelectedScale(scale: number): void {
    if (this._selectedIndex === null) return
    const desc = this._objects[this._selectedIndex]
    const node = this._placedNodes[this._selectedIndex]
    if (!desc || !node) return

    const s = Math.max(0.05, Math.round(scale * 100) / 100)
    desc.scale = s
    node.scale.setScalar(s)

    const offset    = PRIMITIVE_BASE_OFFSETS[desc.type] ?? 0
    const terrainY  = this._sampleTerrain(desc.x, desc.z)
    node.position.y = terrainY + offset * s

    this._emitState()
  }

  updateSelectedRotationY(rotY: number): void {
    if (this._selectedIndex === null) return
    const desc = this._objects[this._selectedIndex]
    const node = this._placedNodes[this._selectedIndex]
    if (!desc || !node) return

    desc.rotationY    = Math.round(rotY * 100) / 100
    node.rotation.y   = rotY

    this._emitState()
  }

  getObjects(): PlacedObject[] {
    return this._objects.map((o) => ({ ...o }))
  }

  // ─── Pointer handlers ─────────────────────────────────────────────────────────

  private _handlePointerDown(e: PointerEvent): void {
    // Ignore right-click and middle-click (used by OrbitControls)
    if (e.button !== 0) return

    const ctx = this._ctx
    this._updateMouse(e, ctx.renderer)
    this.raycaster.setFromCamera(this.mouse, ctx.camera)

    // 1. Try hitting an existing placed node (highest priority)
    if (this._placedNodes.length > 0) {
      const hits = this.raycaster.intersectObjects(this._placedNodes, true)
      if (hits.length > 0) {
        const root = this._findRoot(hits[0].object)
        if (root !== null) {
          const desc = this._nodeToDesc.get(root)
          if (desc) {
            const idx = this._objects.indexOf(desc)
            if (idx >= 0) {
              this._selectIndex(idx)
              return
            }
          }
        }
      }
    }

    // 2. Click on terrain — place if a tool is active, deselect otherwise
    const terrainHits = this.raycaster.intersectObject(this.terrainMesh)
    if (terrainHits.length > 0) {
      if (this._activeTool !== 'select') {
        const pt = terrainHits[0].point
        this._placePrimitive(this._activeTool, pt.x, pt.z)
      } else {
        this._deselect()
      }
    }
  }

  private _handlePointerMove(e: PointerEvent): void {
    // Only show ghost when a primitive tool is active and nothing is selected
    if (this._activeTool === 'select') return
    if (this._selectedIndex !== null) return

    const ctx = this._ctx
    this._updateMouse(e, ctx.renderer)
    this.raycaster.setFromCamera(this.mouse, ctx.camera)

    const hits = this.raycaster.intersectObject(this.terrainMesh)
    if (hits.length > 0 && this._ghost) {
      this._ghost.visible = true
      const pt  = hits[0].point
      const y   = this._sampleTerrain(pt.x, pt.z)
      const off = PRIMITIVE_BASE_OFFSETS[this._activeTool as PrimitiveType] ?? 0
      this._ghost.position.set(pt.x, y + off, pt.z)
    } else if (this._ghost) {
      this._ghost.visible = false
    }
  }

  private _handleKeyDown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement).tagName
    // Don't intercept keys typed into inputs / textareas
    if (tag === 'INPUT' || tag === 'TEXTAREA') return

    switch (e.key) {
      case 'Delete':
      case 'Backspace': this.deleteSelected();           break
      case 'Escape':    this._deselect();                break
      case 't': case 'T': this.setGizmoMode('translate'); break
      case 'r': case 'R': this.setGizmoMode('rotate');    break
      case 's': case 'S': this.setGizmoMode('scale');     break
    }
  }

  // ─── Placement ───────────────────────────────────────────────────────────────

  private _placePrimitive(type: PrimitiveType, x: number, z: number): void {
    const scale: number = 1
    const desc: PlacedObject = {
      type,
      x:         Math.round(x    * 100) / 100,
      z:         Math.round(z    * 100) / 100,
      scale,
      rotationY: Math.round(Math.random() * Math.PI * 2 * 100) / 100,
    }
    this._addTracked(desc, this._ctx.scene)
    this._selectIndex(this._objects.length - 1)
    this._emitState()
  }

  /** Places a primitive in the scene and registers it in all tracking structures. */
  private _addTracked(desc: PlacedObject, scene: THREE.Scene): void {
    const scale    = desc.scale ?? 1
    const node     = PrimitiveFactory.build(desc.type, scale, Math.random)
    const terrainY = this._sampleTerrain(desc.x, desc.z)
    const offset   = PRIMITIVE_BASE_OFFSETS[desc.type] ?? 0

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

  private _createGhost(type: PrimitiveType): void {
    this._ghost = PrimitiveFactory.build(type, 1, Math.random)
    makeTransparent(this._ghost)
    this._ghost.visible = false
    this._ctx.scene.add(this._ghost)
  }

  private _removeGhost(): void {
    if (this._ghost) {
      this._ctx.scene.remove(this._ghost)
      this._ghost = null
    }
  }

  // ─── Descriptor sync ─────────────────────────────────────────────────────────

  /**
   * Called after TransformControls mouseUp. Reads the current 3D state of
   * the selected object and writes it back into the PlacedObject descriptor.
   */
  private _syncSelectedDescriptor(): void {
    if (this._selectedIndex === null) return
    const desc = this._objects[this._selectedIndex]
    const node = this._placedNodes[this._selectedIndex]
    if (!desc || !node) return

    if (this._gizmoMode === 'translate') {
      desc.x = Math.round(node.position.x * 100) / 100
      desc.z = Math.round(node.position.z * 100) / 100
      // Re-snap Y so it always sits on terrain after any XZ move
      const terrainY = this._sampleTerrain(desc.x, desc.z)
      const offset   = PRIMITIVE_BASE_OFFSETS[desc.type] ?? 0
      node.position.y = terrainY + offset * (desc.scale ?? 1)

    } else if (this._gizmoMode === 'rotate') {
      desc.rotationY = Math.round(node.rotation.y * 100) / 100

    } else if (this._gizmoMode === 'scale') {
      // Enforce uniform: average the three axes (object was clamped to X during drag,
      // but take average as a safety net)
      const s = (node.scale.x + node.scale.y + node.scale.z) / 3
      const su = Math.max(0.05, Math.round(s * 100) / 100)
      node.scale.set(su, su, su)
      desc.scale = su
      // Re-snap Y with new scale
      const terrainY = this._sampleTerrain(desc.x, desc.z)
      const offset   = PRIMITIVE_BASE_OFFSETS[desc.type] ?? 0
      node.position.y = terrainY + offset * su
    }

    this._emitState()
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Sample terrain Y at world (x, z). Returns 0 before sampler is available. */
  private _sampleTerrain(x: number, z: number): number {
    return this._sampler?.sample(x, z) ?? 0
  }

  /** Traverse up the parent chain to find which root node is in our tracking map. */
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
      objects:       [...this._objects],
      selectedIndex: this._selectedIndex,
      activeTool:    this._activeTool,
      gizmoMode:     this._gizmoMode,
    })
  }
}
