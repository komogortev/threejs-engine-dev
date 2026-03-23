import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { PlayerController } from './PlayerController'

describe('PlayerController', () => {
  function setupCameraAtOriginLookingDownMinusZ(): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100)
    camera.position.set(0, 2, 0)
    camera.lookAt(0, 0, -10)
    camera.updateMatrixWorld(true)
    return camera
  }

  it('does not move when move intent is zero', () => {
    const camera = setupCameraAtOriginLookingDownMinusZ()
    const character = new THREE.Mesh()
    character.position.set(0, 0.85, 0)

    const ctrl = new PlayerController({ characterSpeed: 10 })
    ctrl.setMoveIntent(0, 0)
    ctrl.tick(1 / 60, {
      camera,
      character,
      sampler: undefined,
      playableRadius: 50,
    })

    expect(character.position.x).toBeCloseTo(0)
    expect(character.position.z).toBeCloseTo(0)
    const snap = ctrl.getSnapshot()
    expect(snap.velocity.x).toBe(0)
    expect(snap.velocity.z).toBe(0)
  })

  it('moves camera-relative forward along -Z when camera faces -Z', () => {
    const camera = setupCameraAtOriginLookingDownMinusZ()
    const character = new THREE.Mesh()
    character.position.set(0, 0.85, 0)

    const ctrl = new PlayerController({ characterSpeed: 6 })
    ctrl.setMoveIntent(0, 1)
    const delta = 0.5
    ctrl.tick(delta, {
      camera,
      character,
      sampler: undefined,
      playableRadius: 50,
    })

    expect(character.position.z).toBeLessThan(0)
    expect(character.position.x).toBeCloseTo(0, 5)
    const snap = ctrl.getSnapshot()
    expect(snap.velocity.z).toBeLessThan(0)
  })

  it('sets jumpBuffered after notifyJumpPressed and clears after buffer duration', () => {
    const camera = setupCameraAtOriginLookingDownMinusZ()
    const character = new THREE.Mesh()
    character.position.set(0, 0.85, 0)

    const ctrl = new PlayerController({ characterSpeed: 1 })
    expect(ctrl.getSnapshot().jumpBuffered).toBe(false)

    ctrl.notifyJumpPressed(0.1)
    expect(ctrl.getSnapshot().jumpBuffered).toBe(true)

    ctrl.tick(0.05, { camera, character, sampler: undefined, playableRadius: 50 })
    expect(ctrl.getSnapshot().jumpBuffered).toBe(true)

    ctrl.tick(0.06, { camera, character, sampler: undefined, playableRadius: 50 })
    expect(ctrl.getSnapshot().jumpBuffered).toBe(false)
  })

  it('clamps position to playable disc edge', () => {
    const camera = setupCameraAtOriginLookingDownMinusZ()
    const character = new THREE.Mesh()
    character.position.set(48, 0.85, 0)

    const ctrl = new PlayerController({ characterSpeed: 100, edgeMargin: 1.5 })
    ctrl.setMoveIntent(1, 0) // strafe right in camera space
    ctrl.tick(0.2, {
      camera,
      character,
      sampler: undefined,
      playableRadius: 50,
    })

    const limit = 50 - 1.5
    const dist = Math.hypot(character.position.x, character.position.z)
    expect(dist).toBeLessThanOrEqual(limit + 1e-5)
  })
})
