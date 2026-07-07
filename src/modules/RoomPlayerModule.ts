import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { EngineContext } from '@base/engine-core'
import type { ThreeContext } from '@base/threejs-engine'
import { MusicLayer } from '@base/audio'
import type { LoadedRoomPackage, SceneRow } from '@base/ui'
import { GameplaySceneModule } from './GameplaySceneModule'
import { EnvironmentScreen } from '@/screens/EnvironmentScreen'

/**
 * RoomPlayerModule — FPV walkthrough of a room package.
 *
 * Mount sequence (RoomPlayerView):
 *   await engine.mount(container, context)
 *   await engine.mountChild('input', inputModule)
 *   await engine.mountChild('scene', roomModule)
 *   await roomModule.loadRoom(pkg)
 *
 * The module extends GameplaySceneModule without a descriptor so the built-in
 * FPV + PlayerController stack is reused.  The default disc + torus ring from
 * buildDefaultScene are hidden after mount; placed GLBs cover the floor.
 */
export class RoomPlayerModule extends GameplaySceneModule {
  private placedMeshes: THREE.Object3D[] = []
  private audioCtx: AudioContext | null = null
  private musicLayer: MusicLayer | null = null
  private envScreen: EnvironmentScreen | null = null

  constructor() {
    super({
      groundRadius: 60,
      groundColor: 0x111111,
      fogColor: 0x111111,
      cameraMode: 'first-person',
      firstPersonEyeOffsetY: 1.675,
    })
  }

  protected override async onMount(container: HTMLElement, context: EngineContext): Promise<void> {
    await super.onMount(container, context)
    const ctx = context as ThreeContext
    // Hide the procedural disc + glowing torus ring added by buildDefaultScene.
    for (const child of ctx.scene.children) {
      if (child instanceof THREE.Mesh) {
        const geo = (child as THREE.Mesh).geometry
        if (geo instanceof THREE.CylinderGeometry || geo instanceof THREE.TorusGeometry) {
          child.visible = false
        }
      }
    }

    this.envScreen = new EnvironmentScreen()
    // Parent to the camera so the screen tracks rotation and stays in view.
    ctx.camera.add(this.envScreen.mesh)
  }

  /**
   * Clear all placed meshes and audio without tearing down the engine.
   * Call this before loadRoom() when switching environments in-place.
   */
  async unloadRoom(): Promise<void> {
    this.musicLayer?.stop(0.5)
    this.musicLayer?.dispose()
    this.musicLayer = null
    this.audioCtx?.close().catch(() => {})
    this.audioCtx = null
    for (const root of this.placedMeshes) {
      root.traverse(child => {
        const mesh = child as THREE.Mesh
        if (mesh.isMesh) {
          mesh.geometry?.dispose()
          const mat = mesh.material
          if (Array.isArray(mat)) mat.forEach(m => m.dispose())
          else (mat as THREE.Material)?.dispose()
        }
      })
      root.parent?.remove(root)
    }
    this.placedMeshes = []
  }

  // ── Environment menu ──────────────────────────────────────────────────────

  showEnvironmentMenu(scenes: SceneRow[]): void {
    this.envScreen?.show(scenes)
  }

  hideEnvironmentMenu(): void {
    this.envScreen?.hide()
  }

  get isEnvironmentMenuVisible(): boolean {
    return this.envScreen?.isVisible ?? false
  }

  navigateEnvironmentMenu(dir: 1 | -1): void {
    this.envScreen?.navigate(dir)
  }

  getSelectedSceneId(): string | null {
    return this.envScreen?.getSelectedId() ?? null
  }

  // ─────────────────────────────────────────────────────────────────────────

  protected override async onUnmount(): Promise<void> {
    await this.unloadRoom()
    if (this.envScreen) {
      this.envScreen.mesh.parent?.remove(this.envScreen.mesh)
      this.envScreen.dispose()
      this.envScreen = null
    }
    await super.onUnmount()
  }

  /**
   * Load room assets from the package into the live scene.
   * Must be called after mountChild('scene', this) resolves.
   */
  async loadRoom(pkg: LoadedRoomPackage): Promise<void> {
    const ctx = this.context as ThreeContext
    const loader = new GLTFLoader()

    // ── Placed objects (furniture / props) ───────────────────────────────────
    for (const obj of pkg.scene.placedObjects) {
      const blobUrl = pkg.assetBlobUrls.get(obj.assetId)
      if (!blobUrl) {
        console.warn(`[RoomPlayer] Asset ${obj.assetId} missing — skipping "${obj.label}"`)
        continue
      }
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
        console.warn(`[RoomPlayer] GLB load failed for "${obj.label}":`, e)
      }
    }

    // ── NPCs (static — no animation in V1) ───────────────────────────────────
    for (const npc of pkg.scene.npcs) {
      if (!npc.assetId) continue
      const blobUrl = pkg.assetBlobUrls.get(npc.assetId)
      if (!blobUrl) {
        console.warn(`[RoomPlayer] NPC asset ${npc.assetId} missing — skipping "${npc.entityId}"`)
        continue
      }
      try {
        const gltf = await loader.loadAsync(blobUrl)

        // Apply authored pose overrides before any AnimationMixer is created
        if (npc.poseOverride && npc.poseOverride.length > 0) {
          const skinnedMeshes: THREE.SkinnedMesh[] = []
          gltf.scene.traverse(obj => { if (obj instanceof THREE.SkinnedMesh) skinnedMeshes.push(obj) })
          const sm = skinnedMeshes[0]
          if (sm) {
            for (const o of npc.poseOverride) {
              sm.skeleton.getBoneByName(o.bone)?.quaternion.fromArray(o.q)
            }
          }
        }

        const root = new THREE.Group()
        root.position.set(npc.x, npc.y ?? 0, npc.z)
        // EditorNpcEntry.rotationY is authored in degrees
        root.rotation.y = (npc.rotationY ?? 0) * Math.PI / 180
        if (npc.scale !== undefined) root.scale.setScalar(npc.scale)
        root.add(gltf.scene)
        ctx.scene.add(root)
        this.placedMeshes.push(root)
      } catch (e) {
        console.warn(`[RoomPlayer] NPC load failed for "${npc.entityId}":`, e)
      }
    }

    // ── Spawn point ───────────────────────────────────────────────────────────
    if (pkg.scene.spawnPoint) {
      const char = this.getCharacter()
      char.position.set(pkg.scene.spawnPoint.x, char.position.y, pkg.scene.spawnPoint.z)
    }

    // ── Ambient audio ─────────────────────────────────────────────────────────
    if (pkg.scene.ambientAudioAssetId) {
      const audioUrl = pkg.assetBlobUrls.get(pkg.scene.ambientAudioAssetId)
      if (audioUrl) {
        try {
          this.audioCtx = new AudioContext()
          const masterGain = this.audioCtx.createGain()
          masterGain.gain.value = pkg.scene.ambientAudioVolume ?? 1.0
          masterGain.connect(this.audioCtx.destination)
          const res = await fetch(audioUrl)
          const rawBuf = await res.arrayBuffer()
          const audioBuffer = await this.audioCtx.decodeAudioData(rawBuf)
          this.musicLayer = new MusicLayer(this.audioCtx, masterGain)
          this.musicLayer.play(audioBuffer, 1.5)
        } catch (e) {
          console.warn('[RoomPlayer] Ambient audio failed:', e)
        }
      }
    }
  }
}
