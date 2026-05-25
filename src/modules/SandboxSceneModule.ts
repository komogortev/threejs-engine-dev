import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { EngineContext } from '@base/engine-core'
import type { ThreeContext } from '@base/threejs-engine'
import { assetDb } from '@base/ui'
import type { SandboxSceneSave } from '@base/ui'
import { ThirdPersonSceneModule, type ThirdPersonSceneConfig } from './GameplaySceneModule'
import type { SceneDescriptor } from '@base/scene-builder'

// ─── Module ────────────────────────────────────────────────────────────────────

export class SandboxSceneModule extends ThirdPersonSceneModule {
  private gridMeshes: THREE.Object3D[] = []
  private placedMeshes: THREE.Object3D[] = []

  constructor(options: Partial<ThirdPersonSceneConfig> & { descriptor?: SceneDescriptor } = {}) {
    super({
      ...options,
      debugJumpArc: true,
      debugClipResolution: true,
    })
  }

  protected override async onMount(container: HTMLElement, context: EngineContext): Promise<void> {
    await super.onMount(container, context)
    const ctx = context as ThreeContext
    this.addGrid(ctx.scene)
  }

  protected override async onUnmount(): Promise<void> {
    for (const m of this.placedMeshes) m.parent?.remove(m)
    this.placedMeshes = []
    for (const m of this.gridMeshes) m.parent?.remove(m)
    this.gridMeshes = []
    await super.onUnmount()
  }

  /**
   * Read localStorage['sandbox:scene'], resolve each placed object's blob
   * from IndexedDB, and add the loaded GLBs to the Three.js scene.
   *
   * Call this after mountChild('scene', sceneModule) completes.
   * Missing assets are skipped with a console warning — the rest still load.
   */
  async loadPlacedObjects(): Promise<void> {
    const raw = localStorage.getItem('sandbox:scene')
    if (!raw) {
      console.log('[Sandbox] No saved scene found — loading empty sandbox')
      return
    }

    let save: SandboxSceneSave
    try {
      save = JSON.parse(raw) as SandboxSceneSave
    } catch {
      console.warn('[Sandbox] Could not parse sandbox:scene — skipping placed objects')
      return
    }
    if (save.version !== 1) {
      console.warn(`[Sandbox] Unknown sandbox:scene version "${save.version as unknown}" — skipping`)
      return
    }

    const ctx = this.context as ThreeContext
    const loader = new GLTFLoader()
    const tempUrls: string[] = []

    for (const obj of save.placedObjects) {
      const row = await assetDb.assets.get(obj.assetId)
      if (!row) {
        console.warn(`[Sandbox] Asset ${obj.assetId} not in DB — skipping "${obj.label}"`)
        continue
      }
      const blobUrl = URL.createObjectURL(row.blob)
      tempUrls.push(blobUrl)
      try {
        const gltf = await loader.loadAsync(blobUrl)
        const root = new THREE.Group()
        root.position.set(obj.x, obj.y, obj.z)
        root.rotation.set(obj.rotationX, obj.rotationY, obj.rotationZ)
        root.scale.set(obj.scaleX, obj.scaleY, obj.scaleZ)
        root.add(gltf.scene)
        ctx.scene.add(root)
        this.placedMeshes.push(root)
      } catch (e) {
        console.warn(`[Sandbox] Failed to load GLB for "${obj.label}":`, e)
      }
    }

    // Blob URLs are no longer needed after load — GLBs hold their own GPU data.
    for (const url of tempUrls) URL.revokeObjectURL(url)
  }

  // ─── Grid ──────────────────────────────────────────────────────────────────

  private addGrid(scene: THREE.Scene): void {
    const grid = new THREE.GridHelper(100, 100, 0x334155, 0x1e293b)
    grid.position.y = 0.01
    scene.add(grid)
    this.gridMeshes.push(grid)

    // Axis cross
    const mat = new THREE.LineBasicMaterial({ vertexColors: true })
    for (const [pts, cols] of [
      [[-50, 0.03, 0, 50, 0.03, 0], [1, 0.2, 0.2, 1, 0.2, 0.2]],
      [[0, 0.03, -50, 0, 0.03, 50], [0.2, 0.4, 1, 0.2, 0.4, 1]],
    ] as [number[], number[]][]) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3))
      geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(cols), 3))
      const line = new THREE.LineSegments(geo, mat)
      scene.add(line)
      this.gridMeshes.push(line)
    }
  }
}
