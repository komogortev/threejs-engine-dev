import * as THREE from 'three'
import { BaseModule } from '@base/engine-core'
import type { EngineContext } from '@base/engine-core'
import type { ThreeContext } from '@base/threejs-engine'

/**
 * Dev harness child module — validates the full ThreeModule child mounting stack.
 *
 * What it tests:
 * - Receives ThreeContext (renderer, scene, camera, entityManager, registerSystem)
 * - Creates an entity and attaches a mesh via entityManager.addMesh()
 * - Registers a per-frame system that rotates the cube
 * - setState() emits entity:state-change on the event bus
 * - onUnmount() cleans up system + entity without manual scene manipulation
 */
export class SpinningCubeModule extends BaseModule {
  readonly id = 'spinning-cube'

  private unregisterSystem: (() => void) | null = null
  private offStateChange: (() => void) | null = null

  protected async onMount(_container: HTMLElement, context: EngineContext): Promise<void> {
    const ctx = context as ThreeContext

    // ── Lighting (directly on scene — not entity-managed) ──────────────────
    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    const directional = new THREE.DirectionalLight(0xffffff, 1.2)
    directional.position.set(5, 10, 7)
    ctx.scene.add(ambient, directional)

    // ── Camera ────────────────────────────────────────────────────────────
    ctx.camera.position.set(0, 1.5, 4)
    ctx.camera.lookAt(0, 0, 0)

    // ── Entity + mesh ─────────────────────────────────────────────────────
    const geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2)
    const material = new THREE.MeshStandardMaterial({
      color: 0x6366f1,
      roughness: 0.4,
      metalness: 0.2,
    })
    const cube = new THREE.Mesh(geometry, material)

    ctx.entityManager.create('cube', { role: 'demo' })
    ctx.entityManager.addMesh('cube', cube)
    ctx.entityManager.setState('cube', 'spinning')

    // ── Listen to state changes (validates the event flow) ────────────────
    this.offStateChange = context.eventBus.on('entity:state-change', (payload) => {
      const { id, from, to } = payload as { id: string; from?: string; to: string }
      console.log(`[SpinningCubeModule] entity:state-change — ${id}: ${from ?? 'none'} → ${to}`)
    })

    // ── Per-frame system ──────────────────────────────────────────────────
    this.unregisterSystem = ctx.registerSystem('spinning-cube', (delta) => {
      cube.rotation.x += delta * 0.5
      cube.rotation.y += delta * 0.9
    })
  }

  protected async onUnmount(): Promise<void> {
    this.unregisterSystem?.()
    this.unregisterSystem = null

    this.offStateChange?.()
    this.offStateChange = null

    // Entity + mesh are destroyed by ThreeEntityManager.destroyAll() in ThreeModule.onUnmount.
    // Calling destroy here is safe (idempotent) and makes cleanup explicit.
    const ctx = this.context as ThreeContext
    ctx.entityManager.destroy('cube')
  }
}
