/** Saved orbit views for the scene editor (camera position + OrbitControls target). */

export interface EditorOrbitBookmark {
  id: string
  /** Short label for toolbar / HUD */
  label: string
  camera: [number, number, number]
  target: [number, number, number]
}

export const EDITOR_ORBIT_BOOKMARKS: EditorOrbitBookmark[] = [
  {
    id:      'overview',
    label:   'Overview',
    camera:  [0, 45, 50],
    target:  [0, 0, 0],
  },
  {
    id:      'author',
    label:   'Author',
    camera:  [0, 14, 24],
    target:  [0, 3.5, 0],
  },
  {
    id:      'bird',
    label:   'Bird-eye',
    camera:  [0, 72, 0.15],
    target:  [0, 0, 0],
  },
  {
    id:      'corner',
    label:   'Corner',
    camera:  [38, 22, 38],
    target:  [0, 2, 0],
  },
]
