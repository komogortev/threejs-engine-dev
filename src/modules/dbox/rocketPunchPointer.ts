/**
 * Right-button charge/release on the game canvas — not representable as a single
 * keyboard {@link ButtonAction}; kept as a tiny harness-local pointer binding.
 */
export class RocketPunchPointer {
  private readonly cleanup: Array<() => void> = []

  constructor(
    private readonly gameContainer: HTMLElement,
    /** When false (e.g. in water), RMB is ignored and no mouseup listener is registered. */
    private readonly canBeginCharge: () => boolean,
    private readonly onChargeStart: () => void,
    /** Raw hold duration in seconds (caller clamps to max charge). */
    private readonly onChargeEnd: (heldSeconds: number) => void,
    /** Window blur / focus loss — cancel in-flight RMB charge without firing. */
    private readonly onChargeAbort?: () => void,
  ) {}

  mount(): void {
    const opts: AddEventListenerOptions = { capture: true }
    let onPunchMouseUp: ((e: MouseEvent) => void) | null = null
    let punchHoldStartMs = 0
    let punchRMBHeld = false

    const detachPunchMouseUp = (): void => {
      if (onPunchMouseUp) {
        window.removeEventListener('mouseup', onPunchMouseUp, opts)
        onPunchMouseUp = null
      }
    }

    const onPunchMouseDown = (e: MouseEvent): void => {
      if (e.button !== 2) return
      const t = e.target as Node | null
      if (t == null || !(this.gameContainer === t || this.gameContainer.contains(t))) return
      if (!this.canBeginCharge()) return

      e.preventDefault()
      detachPunchMouseUp()
      punchRMBHeld = true
      punchHoldStartMs = performance.now()
      this.onChargeStart()

      onPunchMouseUp = (up: MouseEvent): void => {
        if (up.button !== 2 || !punchRMBHeld) return
        punchRMBHeld = false
        detachPunchMouseUp()
        const heldS = Math.max(0, (performance.now() - punchHoldStartMs) * 0.001)
        this.onChargeEnd(heldS)
      }
      window.addEventListener('mouseup', onPunchMouseUp, opts)
    }

    const onContextMenu = (e: MouseEvent): void => {
      const t = e.target as Node | null
      if (t == null || !(this.gameContainer === t || this.gameContainer.contains(t))) return
      e.preventDefault()
    }

    this.gameContainer.addEventListener('mousedown', onPunchMouseDown, opts)
    this.gameContainer.addEventListener('contextmenu', onContextMenu, opts)

    const onWindowBlur = (): void => {
      punchRMBHeld = false
      detachPunchMouseUp()
      this.onChargeAbort?.()
    }
    window.addEventListener('blur', onWindowBlur)

    this.cleanup.push(
      () => this.gameContainer.removeEventListener('mousedown', onPunchMouseDown, opts),
      () => this.gameContainer.removeEventListener('contextmenu', onContextMenu, opts),
      () => window.removeEventListener('blur', onWindowBlur),
      () => detachPunchMouseUp(),
    )
  }

  unmount(): void {
    for (const off of this.cleanup) off()
    this.cleanup.length = 0
  }
}
