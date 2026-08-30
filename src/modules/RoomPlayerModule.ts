import * as THREE from 'three'
import type { EngineContext } from '@base/engine-core'
import type { ThreeContext } from '@base/threejs-engine'
import { MusicLayer } from '@base/audio'
import { createEditorGltfLoader } from '@base/ui'
import type { EditorNpcEntry, LoadedRoomPackage, SceneRow } from '@base/ui'
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
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
  private npcMixers: THREE.AnimationMixer[] = []
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

    // Opt-in introspection handle (?roomdebug) — headless previews suspend rAF,
    // so mixer/scene state must be drivable from the console. Same pattern as
    // the editor's ?editordebug handle.
    if (new URLSearchParams(window.location.search).has('roomdebug')) {
      ;(window as unknown as Record<string, unknown>).__roomPlayer = { module: this, ctx }
    }
  }

  /**
   * Clear all placed meshes and audio without tearing down the engine.
   * Call this before loadRoom() when switching environments in-place.
   */
  async unloadRoom(): Promise<void> {
    for (const mixer of this.npcMixers) mixer.stopAllAction()
    this.npcMixers = []
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
    delete (window as unknown as Record<string, unknown>).__roomPlayer
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
    // Factory loader (Draco + Meshopt) — plain GLTFLoader rejects the platform's
    // own compressed assets (decimated characters, optimized props).
    const loader = createEditorGltfLoader()

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

    // ── NPCs (S5-c: looping clip from bound animation pack, static pose fallback) ─
    for (const npc of pkg.scene.npcs) {
      if (!npc.assetId) continue
      const blobUrl = pkg.assetBlobUrls.get(npc.assetId)
      if (!blobUrl) {
        console.warn(`[RoomPlayer] NPC asset ${npc.assetId} missing — skipping "${npc.entityId}"`)
        continue
      }
      try {
        const gltf = await loader.loadAsync(blobUrl)

        // Recorded packs take the embedded/as-is clip path — same-skeleton clips
        // need no retarget, and the Mixamo sanitize/retarget pass would mangle them.
        const action = await this._startNpcClip(npc, pkg, loader, gltf.scene)

        // Precedence (OD-5): a playing clip wins over poseOverride — the mixer
        // rewrites bone quaternions every frame. Static pose is the fallback.
        if (!action && npc.poseOverride && npc.poseOverride.length > 0) {
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

  /**
   * Start the NPC's bound animation clip, if any. Returns the playing action,
   * or null when no pack is bound / the pack fails to load — callers fall back
   * to the static poseOverride.
   *
   * Clips are consumed embedded/as-is (no Mixamo retarget): packs recorded in
   * the editor target the same skeleton, so their `${bone}.quaternion` tracks
   * bind directly against the character's bone nodes.
   *
   * Caveats accepted for S5-c: (1) packs are self-contained (mesh+skeleton ride
   * along per OD-1) — the duplicate scene payload is parsed then dropped to GC,
   * a transient cost per NPC; (2) a started action ≠ bound tracks — PropertyBinding
   * resolves lazily on first mixer.update(), so a pack whose track names don't
   * match this character plays nothing (console warnings) instead of falling
   * back to poseOverride.
   */
  private async _startNpcClip(
    npc: EditorNpcEntry,
    pkg: LoadedRoomPackage,
    loader: GLTFLoader,
    characterScene: THREE.Object3D,
  ): Promise<THREE.AnimationAction | null> {
    if (!npc.animationPackAssetId) return null
    const packUrl = pkg.assetBlobUrls.get(npc.animationPackAssetId)
    if (!packUrl) {
      console.warn(`[RoomPlayer] Anim pack ${npc.animationPackAssetId} missing for "${npc.entityId}" — static pose fallback`)
      return null
    }
    try {
      const packGltf = await loader.loadAsync(packUrl)
      const clips = packGltf.animations
      if (clips.length === 0) {
        console.warn(`[RoomPlayer] Anim pack for "${npc.entityId}" has no clips — static pose fallback`)
        return null
      }
      let clip = npc.defaultClip ? THREE.AnimationClip.findByName(clips, npc.defaultClip) : null
      if (npc.defaultClip && !clip) {
        console.warn(`[RoomPlayer] Clip "${npc.defaultClip}" not in pack for "${npc.entityId}" — using "${clips[0].name}"`)
      }
      clip = clip ?? clips[0]
      const mixer = new THREE.AnimationMixer(characterScene)
      const action = mixer.clipAction(clip)
      action.play() // default LoopRepeat — looping idle/gesture
      this.npcMixers.push(mixer)
      return action
    } catch (e) {
      console.warn(`[RoomPlayer] Anim pack load failed for "${npc.entityId}":`, e)
      return null
    }
  }

  protected override onAfterGameplayTick(simDelta: number, _ctx: ThreeContext): void {
    for (const mixer of this.npcMixers) mixer.update(simDelta)
  }
}
