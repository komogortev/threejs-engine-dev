import type { EngineContext } from '@base/engine-core'
import type { ThreeContext } from '@base/threejs-engine'
import type { SceneDescriptor } from '@base/scene-builder'
import { CALIBRATION_POOL_BOUNDS } from '@/calibration/calibrationLayout'
import { SandboxSceneModule } from './SandboxSceneModule'
import { DboxLab, type DboxLabOptions } from './dbox/DboxLab'
import type { GameplayLabHost } from './dbox/GameplayLabHost'
import type { ThirdPersonSceneConfig } from './GameplaySceneModule'

export type DboxSceneModuleOptions = Partial<ThirdPersonSceneConfig> &
  DboxLabOptions & {
    descriptor?: SceneDescriptor
  }

/**
 * Sandbox calibration world + composed {@link DboxLab} (abilities, slam preview, NPC blobs).
 * Ability keys are delivered via `input:action` (`ability_primary` / `ability_secondary`); see {@link DboxView}.
 */
export class DboxSceneModule extends SandboxSceneModule implements GameplayLabHost {
  private readonly lab: DboxLab

  constructor(options: DboxSceneModuleOptions = {}) {
    const { uppercutNpcMoveIntentForwardBias, ...rest } = options
    super({
      ...rest,
      characterSpeed: rest.characterSpeed ?? 5.5,
      carryImpulseDecayPerSecond: rest.carryImpulseDecayPerSecond ?? 8,
    })
    this.lab = new DboxLab(this, { uppercutNpcMoveIntentForwardBias })
  }

  getCarryImpulseDecayPerSecond(): number {
    return this.cfg.carryImpulseDecayPerSecond ?? 8
  }

  protected override async onMount(container: HTMLElement, context: EngineContext): Promise<void> {
    await super.onMount(container, context)
    const ctx = context as ThreeContext
    this.lab.mount(container, context.eventBus, ctx)
  }

  protected override async onUnmount(): Promise<void> {
    this.lab.unmount()
    await super.onUnmount()
  }

  protected override onBeforeGameplayTick(_simDelta: number, _ctx: ThreeContext): void {
    this.lab.beforeGameplayTick()
  }

  protected override onAfterGameplayTick(simDelta: number, ctx: ThreeContext): void {
    this.lab.afterGameplayTick(simDelta, ctx)
  }

  protected override handleJumpPressedEarly(): boolean {
    return this.lab.handleJumpPressedEarly()
  }
}

/** Pool bounds — alias of {@link CALIBRATION_POOL_BOUNDS} for legacy imports. */
export const DBOX_POOL_BOUNDS = CALIBRATION_POOL_BOUNDS
