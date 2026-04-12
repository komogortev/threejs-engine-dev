import type { EngineContext } from '@base/engine-core'
import { SandboxSceneModule } from './SandboxSceneModule'

/** Cooldowns + charge limits for Doomfist-style prototype abilities (dbox only). */
const CD_PUNCH_S = 1.15
const CD_UPPERCUT_S = 1.0
const CD_SLAM_S = 0.85
/** Full hold duration before impulse peaks (longer hold = clearly farther travel). */
const PUNCH_CHARGE_MAX_S = 1.35
/** Tap-release: short slide. Full charge: strong forward carry (distance scales ~linearly with peak m/s / decay). */
const PUNCH_SPEED_MIN = 4
const PUNCH_SPEED_MAX = 58
const UPPERCUT_FORWARD = 3.5
/** Vertical launch (m/s); tuned 2× prior prototype height. */
const UPPERCUT_UP = 19
const SLAM_DOWN = -16

/**
 * Sandbox fixtures + experimental hero locomotion (rocket punch / uppercut / slam)
 * wired to {@link PlayerController.addPlanarCarryImpulse} and
 * {@link PlayerController.applyVerticalAbilityImpulse}.
 *
 * **Bindings (keyboard):** **E** hold → release rocket punch (charge). **Q** rising uppercut.
 * **G** seismic slam while airborne (F is reserved for frame-step in the view). Disabled while swimming.
 */
export class DboxSceneModule extends SandboxSceneModule {
  private punchEHeld = false
  private punchHoldStartMs = 0
  private lastPunchMs = -1e9
  private lastUppercutMs = -1e9
  private lastSlamMs = -1e9
  private readonly keyCleanup: Array<() => void> = []

  protected override async onMount(container: HTMLElement, context: EngineContext): Promise<void> {
    await super.onMount(container, context)

    const onKeyDown = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | undefined)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.repeat) return

      if (e.code === 'KeyE') {
        if (!this.punchEHeld) {
          this.punchEHeld = true
          this.punchHoldStartMs = performance.now()
        }
        e.preventDefault()
      } else if (e.code === 'KeyQ') {
        this.tryUppercut()
        e.preventDefault()
      } else if (e.code === 'KeyG') {
        this.trySlam()
        e.preventDefault()
      }
    }

    const onKeyUp = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | undefined)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.code === 'KeyE' && this.punchEHeld) {
        this.punchEHeld = false
        this.fireRocketPunch()
        e.preventDefault()
      }
    }

    const opts: AddEventListenerOptions = { capture: true }
    window.addEventListener('keydown', onKeyDown, opts)
    window.addEventListener('keyup', onKeyUp, opts)
    this.keyCleanup.push(
      () => window.removeEventListener('keydown', onKeyDown, opts),
      () => window.removeEventListener('keyup', onKeyUp, opts),
    )
  }

  protected override async onUnmount(): Promise<void> {
    for (const off of this.keyCleanup) off()
    this.keyCleanup.length = 0
    await super.onUnmount()
  }

  private tryUppercut(): void {
    const t = performance.now()
    if (t * 0.001 - this.lastUppercutMs < CD_UPPERCUT_S) return
    const snap = this.getPlayerController().getSnapshot()
    if (snap.waterMode !== null) return

    const f = this.getPlayerController().getFacing()
    const fx = -Math.sin(f) * UPPERCUT_FORWARD
    const fz = -Math.cos(f) * UPPERCUT_FORWARD
    this.getPlayerController().addPlanarCarryImpulse(fx, fz)
    this.getPlayerController().applyVerticalAbilityImpulse(UPPERCUT_UP, this.getCharacter())
    this.lastUppercutMs = t * 0.001
  }

  private trySlam(): void {
    const t = performance.now()
    if (t * 0.001 - this.lastSlamMs < CD_SLAM_S) return
    const snap = this.getPlayerController().getSnapshot()
    if (snap.waterMode !== null) return
    if (snap.grounded) return

    const f = this.getPlayerController().getFacing()
    const fx = -Math.sin(f) * 2.5
    const fz = -Math.cos(f) * 2.5
    this.getPlayerController().addPlanarCarryImpulse(fx, fz)
    this.getPlayerController().applyVerticalAbilityImpulse(SLAM_DOWN, this.getCharacter())
    this.lastSlamMs = t * 0.001
  }

  private fireRocketPunch(): void {
    const t = performance.now() * 0.001
    if (t - this.lastPunchMs < CD_PUNCH_S) return
    const snap = this.getPlayerController().getSnapshot()
    if (snap.waterMode !== null) return

    const heldS = Math.min(PUNCH_CHARGE_MAX_S, Math.max(0, (performance.now() - this.punchHoldStartMs) * 0.001))
    const chargeT = PUNCH_CHARGE_MAX_S <= 1e-6 ? 1 : heldS / PUNCH_CHARGE_MAX_S
    // Ease so short taps stay weak; long holds gain most of the range (distance grows strongly with charge).
    const shaped = Math.pow(chargeT, 1.45)
    const speed = PUNCH_SPEED_MIN + (PUNCH_SPEED_MAX - PUNCH_SPEED_MIN) * shaped
    const f = this.getPlayerController().getFacing()
    const fx = -Math.sin(f) * speed
    const fz = -Math.cos(f) * speed
    this.getPlayerController().addPlanarCarryImpulse(fx, fz)
    this.lastPunchMs = t
  }
}
