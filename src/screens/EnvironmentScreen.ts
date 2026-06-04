import * as THREE from 'three'
import type { SceneRow } from '@base/ui'

/**
 * In-world projection screen for environment selection.
 *
 * A self-lit PlaneGeometry with a CanvasTexture displaying the list of saved
 * scenes from the editor database.  Placed in the Three.js scene — no Vue
 * overlay.  Positioned in front of the camera when shown.
 *
 * Usage:
 *   screen.show(scenes, camera)   // open and position
 *   screen.navigate(1 | -1)       // move selection down / up
 *   screen.getSelectedId()        // get the chosen SceneRow id
 *   screen.hide()                 // close
 *   screen.dispose()              // cleanup on module teardown
 */
export class EnvironmentScreen {
  readonly mesh: THREE.Mesh
  private _canvas: HTMLCanvasElement
  private _ctx: CanvasRenderingContext2D
  private _texture: THREE.CanvasTexture
  private _scenes: SceneRow[] = []
  private _selectedIdx = 0

  constructor() {
    this._canvas = document.createElement('canvas')
    this._canvas.width = 512
    this._canvas.height = 256
    this._ctx = this._canvas.getContext('2d')!
    this._texture = new THREE.CanvasTexture(this._canvas)

    const geo = new THREE.PlaneGeometry(3, 1.5)
    const mat = new THREE.MeshBasicMaterial({
      map: this._texture,
      side: THREE.DoubleSide,
      transparent: true,
      depthTest: false,
    })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.visible = false
    this.mesh.renderOrder = 999
    this.mesh.name = 'env-screen'
  }

  /** Open the menu, position it in front of the camera, and display scenes. */
  show(scenes: SceneRow[], camera: THREE.PerspectiveCamera): void {
    this._scenes = scenes
    this._selectedIdx = 0
    this._reposition(camera)
    this._draw()
    this.mesh.visible = true
  }

  hide(): void {
    this.mesh.visible = false
  }

  get isVisible(): boolean {
    return this.mesh.visible
  }

  /** dir: +1 = down, -1 = up */
  navigate(dir: 1 | -1): void {
    if (this._scenes.length === 0) return
    this._selectedIdx = (this._selectedIdx + dir + this._scenes.length) % this._scenes.length
    this._draw()
  }

  getSelectedId(): string | null {
    return this._scenes[this._selectedIdx]?.id ?? null
  }

  dispose(): void {
    this._texture.dispose()
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.MeshBasicMaterial).dispose()
  }

  private _reposition(camera: THREE.PerspectiveCamera): void {
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    // Place 3 m in front of the camera, at a comfortable eye height
    this.mesh.position.copy(camera.position).addScaledVector(dir, 3)
    this.mesh.position.y = Math.max(this.mesh.position.y, 1.2)
    this.mesh.lookAt(camera.position)
  }

  private _draw(): void {
    const c = this._ctx
    const W = this._canvas.width
    const H = this._canvas.height

    c.clearRect(0, 0, W, H)

    // Background panel
    c.fillStyle = 'rgba(8, 10, 20, 0.96)'
    c.fillRect(4, 4, W - 8, H - 8)
    c.strokeStyle = 'rgba(90, 176, 245, 0.4)'
    c.lineWidth = 1.5
    c.strokeRect(4, 4, W - 8, H - 8)

    // Title
    c.fillStyle = 'rgba(255, 255, 255, 0.5)'
    c.font = 'bold 14px sans-serif'
    c.textAlign = 'center'
    c.fillText('SELECT ENVIRONMENT', W / 2, 28)

    // Divider
    c.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(20, 38)
    c.lineTo(W - 20, 38)
    c.stroke()

    if (this._scenes.length === 0) {
      c.fillStyle = 'rgba(255, 255, 255, 0.3)'
      c.font = '13px sans-serif'
      c.textAlign = 'center'
      c.fillText('No saved scenes — open the Editor first', W / 2, H / 2 + 4)
    } else {
      const itemH = 34
      const startY = 46
      const maxVisible = 5
      const scroll = Math.max(0, this._selectedIdx - maxVisible + 1)

      for (let i = scroll; i < Math.min(this._scenes.length, scroll + maxVisible); i++) {
        const y = startY + (i - scroll) * itemH
        const isSel = i === this._selectedIdx

        if (isSel) {
          c.fillStyle = 'rgba(90, 176, 245, 0.22)'
          c.fillRect(8, y, W - 16, itemH - 2)
          // Left accent bar
          c.fillStyle = 'rgba(90, 176, 245, 0.9)'
          c.fillRect(8, y, 3, itemH - 2)
        }

        c.fillStyle = isSel ? '#e8f4ff' : 'rgba(255, 255, 255, 0.55)'
        c.font = isSel ? 'bold 13px sans-serif' : '13px sans-serif'
        c.textAlign = 'left'
        c.fillText(this._scenes[i].name, 20, y + itemH / 2 + 5)

        // Date hint on the right for selected row
        if (isSel && this._scenes[i].savedAt) {
          const date = new Date(this._scenes[i].savedAt).toLocaleDateString()
          c.fillStyle = 'rgba(255,255,255,0.3)'
          c.font = '11px sans-serif'
          c.textAlign = 'right'
          c.fillText(date, W - 16, y + itemH / 2 + 5)
        }
      }

      // Scroll indicators
      if (scroll > 0) {
        c.fillStyle = 'rgba(255,255,255,0.3)'
        c.font = '11px sans-serif'
        c.textAlign = 'center'
        c.fillText('▲', W / 2, startY - 2)
      }
      if (scroll + maxVisible < this._scenes.length) {
        c.fillStyle = 'rgba(255,255,255,0.3)'
        c.font = '11px sans-serif'
        c.textAlign = 'center'
        c.fillText('▼', W / 2, startY + maxVisible * itemH + 4)
      }
    }

    // Footer hint
    c.fillStyle = 'rgba(255, 255, 255, 0.2)'
    c.font = '10px sans-serif'
    c.textAlign = 'center'
    c.fillText('↑ ↓ navigate   Enter confirm   E / Esc close', W / 2, H - 8)

    this._texture.needsUpdate = true
  }
}
