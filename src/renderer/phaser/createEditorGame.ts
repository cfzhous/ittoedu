import * as Phaser from 'phaser'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../shared/constants'
import { EditorPhaserBridge } from './EditorPhaserBridge'
import { EditorScene } from './EditorScene'

export interface EditorGameHandle {
  game: Phaser.Game
  bridge: EditorPhaserBridge
  destroy(): void
}

export function createEditorGame(parent: HTMLElement): EditorGameHandle {
  const bridge = new EditorPhaserBridge()
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    parent,
    backgroundColor: '#ffffff',
    transparent: false,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    },
    scene: [new EditorScene(bridge)],
    dom: {
      createContainer: true,
      // Component DOM descendants stay inert in edit mode; Phaser zones keep
      // ownership of selection, dragging and resizing.
      pointerEvents: 'none',
    },
    input: {
      activePointers: 2,
    },
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: false,
    },
    banner: false,
  })

  return {
    game,
    bridge,
    destroy() {
      bridge.dispose()
      game.destroy(true)
    },
  }
}
