import type * as THREE from 'three'
import type { PlayerController } from '@base/player-three'

/**
 * Minimal surface the dbox lab needs from {@link SandboxSceneModule} / {@link DboxSceneModule}
 * without inheriting gameplay internals.
 */
export interface GameplayLabHost {
  getPlayerController(): PlayerController
  getCharacter(): THREE.Object3D
  sampleTerrainSurfaceY(x: number, z: number): number
  /** Matches {@link GameplaySceneConfig.carryImpulseDecayPerSecond} with harness default fallback. */
  getCarryImpulseDecayPerSecond(): number
  /** Playable XZ disc radius (m) — mouse slam ray targets outside this are invalid. */
  getPlayableRadius(): number
}
