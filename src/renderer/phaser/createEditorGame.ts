import * as Phaser from 'phaser'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../shared/constants'
import { EditorPhaserBridge } from './EditorPhaserBridge'
import { EditorScene } from './EditorScene'

export interface EditorGameHandle {
  game: Phaser.Game
  bridge: EditorPhaserBridge
  destroy(): void
}

export interface CreateEditorGameOptions {
  /** The unified 1280x720 stage owns fitting, so Phaser must not measure it. */
  fixedLogicalSize?: boolean
}

export function createEditorGame(
  parent: HTMLElement,
  options: CreateEditorGameOptions = {},
): EditorGameHandle {
  const bridge = new EditorPhaserBridge()
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    parent,
    backgroundColor: 'rgba(0,0,0,0)',
    transparent: true,
    scale: {
      mode: options.fixedLogicalSize ? Phaser.Scale.NONE : Phaser.Scale.FIT,
      autoCenter: options.fixedLogicalSize
        ? Phaser.Scale.NO_CENTER
        : Phaser.Scale.CENTER_BOTH,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    },
    scene: [new EditorScene(bridge)],
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
