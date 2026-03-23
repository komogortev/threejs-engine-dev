import * as THREE from 'three'
import type { TerrainSampler } from '@/scene/TerrainSampler'

/** Pivot-centre-to-ground distance for the default CapsuleGeometry(0.35, 1.0). Keep in sync with SceneBuilder. */
export const PLAYER_CAPSULE_HALF_HEIGHT = 0.85

/**
 * Serializable snapshot for HUD, editor tooling, replays, or debug overlays.
 * Not updated by reference — call `getSnapshot()` each time you need fresh data.
 */
export interface PlayerControllerState {
  position: { x: number; y: number; z: number }
  /** Y-axis rotation in radians (character forward). */
  facing: number
  /** World-space velocity this frame (m/s), before terrain snap. Y reserved for jump / gravity later. */
  velocity: { x: number; y: number; z: number }
  /** Whether the controller considers the character supported by ground this frame. */
  grounded: boolean
  /** Last raw move axis from input (typically -1..1). */
  moveIntent: { x: number; y: number }
  /**
   * True when a jump press is still inside the coyote / buffer window (future).
   * Always false until jump is implemented.
   */
  jumpBuffered: boolean
}

export interface PlayerControllerConfig {
  characterSpeed: number
  facingLerp: number
  /** Distance inside playable radius before edge clamp (matches previous 1.5 m margin). */
  edgeMargin: number
  /**
   * Initial world Y offset from sampled terrain to character **root** when grounded.
   * Capsule (centre pivot): use {@link PLAYER_CAPSULE_HALF_HEIGHT}. GLTF (feet pivot): usually 0 — override via {@link setTerrainYOffset} after `SceneBuilder` if needed.
   */
  terrainYOffset: number
}

const DEFAULT_CFG: PlayerControllerConfig = {
  characterSpeed: 7,
  facingLerp: 12,
  edgeMargin: 1.5,
  terrainYOffset: PLAYER_CAPSULE_HALF_HEIGHT,
}

export interface PlayerControllerTickContext {
  camera: THREE.PerspectiveCamera
  character: THREE.Object3D
  sampler: TerrainSampler | undefined
  /** Outer limit of playable disc (world XZ). */
  playableRadius: number
}

function lerpAngle(current: number, target: number, t: number): number {
  let diff = target - current
  while (diff > Math.PI) diff -= 2 * Math.PI
  while (diff < -Math.PI) diff += 2 * Math.PI
  return current + diff * Math.min(1, t)
}

/**
 * Owns locomotion state for a single controllable character: intent, facing, horizontal velocity, grounded.
 * Camera-relative walk on XZ; optional terrain height snap via `TerrainSampler`.
 *
 * Camera rig and environment live outside this class (e.g. `ThirdPersonSceneModule`).
 */
export class PlayerController {
  private readonly cfg: PlayerControllerConfig

  /** Ground contact offset in world Y; updated when swapping capsule ↔ GLTF. */
  private terrainYOffset: number

  private facing = 0
  private readonly moveIntent = { x: 0, y: 0 }
  private readonly velocity = new THREE.Vector3()
  private grounded = true
  private jumpBufferTime = 0

  private readonly _camDir = new THREE.Vector3()
  private readonly _camRight = new THREE.Vector3()
  private readonly _moveDir = new THREE.Vector3()

  constructor(cfg: Partial<PlayerControllerConfig> = {}) {
    this.cfg = { ...DEFAULT_CFG, ...cfg }
    this.terrainYOffset = this.cfg.terrainYOffset
  }

  /** Call after `SceneBuilder` when character pivot height differs (e.g. GLTF feet vs capsule centre). */
  setTerrainYOffset(worldOffset: number): void {
    this.terrainYOffset = worldOffset
  }

  setMoveIntent(x: number, y: number): void {
    this.moveIntent.x = x
    this.moveIntent.y = y
  }

  /** Call on `input:action` jump / buffered jump when jump is implemented. */
  notifyJumpPressed(_bufferSeconds = 0.12): void {
    this.jumpBufferTime = _bufferSeconds
  }

  getSnapshot(): PlayerControllerState {
    return {
      position: {
        x: this.lastCharacterPos.x,
        y: this.lastCharacterPos.y,
        z: this.lastCharacterPos.z,
      },
      facing: this.facing,
      velocity: { x: this.velocity.x, y: this.velocity.y, z: this.velocity.z },
      grounded: this.grounded,
      moveIntent: { x: this.moveIntent.x, y: this.moveIntent.y },
      jumpBuffered: this.jumpBufferTime > 0,
    }
  }

  /** Last known mesh position after the most recent `tick` (for snapshot before character ref exists). */
  private lastCharacterPos = new THREE.Vector3()

  tick(delta: number, ctx: PlayerControllerTickContext): void {
    const { camera, character, sampler, playableRadius } = ctx
    const { characterSpeed, facingLerp, edgeMargin } = this.cfg

    if (this.jumpBufferTime > 0) {
      this.jumpBufferTime = Math.max(0, this.jumpBufferTime - delta)
    }

    const { x, y } = this.moveIntent
    const inputActive = Math.abs(x) > 0.01 || Math.abs(y) > 0.01

    if (inputActive) {
      camera.getWorldDirection(this._camDir)
      this._camDir.y = 0
      this._camDir.normalize()

      this._camRight.crossVectors(this._camDir, THREE.Object3D.DEFAULT_UP).normalize()

      this._moveDir
        .copy(this._camDir)
        .multiplyScalar(y)
        .addScaledVector(this._camRight, x)
        .normalize()

      character.position.x += this._moveDir.x * characterSpeed * delta
      character.position.z += this._moveDir.z * characterSpeed * delta

      const limit = playableRadius - edgeMargin
      const distSq = character.position.x ** 2 + character.position.z ** 2
      if (distSq > limit * limit) {
        const d = Math.sqrt(distSq)
        character.position.x *= limit / d
        character.position.z *= limit / d
      }

      const targetFacing = Math.atan2(-this._moveDir.x, -this._moveDir.z)
      this.facing = lerpAngle(this.facing, targetFacing, facingLerp * delta)
      character.rotation.y = this.facing

      this.velocity.set(
        this._moveDir.x * characterSpeed,
        0,
        this._moveDir.z * characterSpeed,
      )
    } else {
      this.velocity.set(0, 0, 0)
    }

    if (sampler) {
      const groundY = sampler.sample(character.position.x, character.position.z)
      character.position.y = groundY + this.terrainYOffset
      this.grounded = true
    } else {
      this.grounded = true
    }

    this.lastCharacterPos.copy(character.position)
  }

  /** Facing used by camera rig (radians, Y). */
  getFacing(): number {
    return this.facing
  }

  /** Reset facing and intent (e.g. when swapping character mesh). */
  resetFacing(facingRadians = 0): void {
    this.facing = facingRadians
    this.moveIntent.x = 0
    this.moveIntent.y = 0
    this.velocity.set(0, 0, 0)
  }
}
