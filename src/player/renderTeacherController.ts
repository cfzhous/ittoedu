import * as Phaser from 'phaser'
import type {
  SceneNode,
  TeacherControllerAction,
  TeacherControllerNode,
} from '../shared/projectTypes'
import type { RuntimeEventDisposer } from '../shared/runtimeTypes'
import {
  createTeacherControllerLayout,
  formatTeacherControllerProgress,
  teacherControllerButtonDisplayLabel,
  type TeacherControllerButtonLayout,
  type TeacherControllerViewStatus,
} from '../shared/teacherControllerLayout'
import type {
  RenderedNodeHandle,
  RenderNodeContext,
} from './renderNode'
import {
  SCENE_PICKER_OPEN_EVENT,
  TEACHER_CONTROLLER_COLLAPSE_EVENT,
} from './ScenePickerOverlay'

const FONT_FAMILY = '"Microsoft YaHei", "PingFang SC", sans-serif'

interface SceneEvent {
  sceneId?: string
}

interface PresentationEvent extends SceneEvent {
  stateId?: string
}

interface AudioChangeEvent {
  muted?: boolean
}

interface ButtonControl {
  action: TeacherControllerAction
  zone: Phaser.GameObjects.Zone
  text: Phaser.GameObjects.Text
  activate(): void
}

type PreviewAwareRenderContext = RenderNodeContext & {
  mode?: 'preview' | 'capture'
}

function isPreviewContext(context: RenderNodeContext): boolean {
  return (context as PreviewAwareRenderContext).mode !== 'capture'
}

async function toggleDocumentFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) {
      if (typeof document.exitFullscreen === 'function') {
        await document.exitFullscreen()
      }
      return
    }
    const root = document.documentElement
    if (typeof root.requestFullscreen === 'function') {
      await root.requestFullscreen()
    }
  } catch (error) {
    console.error('切换全屏失败', error)
  }
}

export function invokeControllerAction(
  action: TeacherControllerAction,
  context: RenderNodeContext,
): void {
  switch (action.type) {
    case 'scene.previous':
      context.actions.previousScene()
      break
    case 'scene.next':
      context.actions.nextScene()
      break
    case 'scene.replay':
      context.actions.replayScene()
      break
    case 'course.restart':
      context.actions.restartCourse()
      break
    case 'scene.go':
      context.actions.goToScene(action.sceneId, action.targetStateId)
      break
    case 'scene.open-picker':
      context.events?.emit(SCENE_PICKER_OPEN_EVENT)
      break
    case 'audio.toggle-mute':
      context.events?.emit('audio:toggle-mute')
      break
    case 'player.fullscreen.toggle':
      void toggleDocumentFullscreen()
      break
  }
}

function applyNodeFrame(
  scene: Phaser.Scene,
  node: TeacherControllerNode,
  root: Phaser.GameObjects.Container,
  transition?: Parameters<RenderedNodeHandle['update']>[1],
): void {
  const x = node.x + node.width / 2
  const y = node.y + node.height / 2
  const duration = Math.max(0, Math.min(10_000, transition?.duration ?? 0))
  scene.tweens.killTweensOf(root)
  root.setSize(node.width, node.height)
  if (duration === 0) {
    root
      .setPosition(x, y)
      .setAngle(node.rotation)
      .setAlpha(node.opacity)
      .setVisible(node.visible)
    return
  }
  if (node.visible && !root.visible) root.setAlpha(0).setVisible(true)
  scene.tweens.add({
    targets: root,
    x,
    y,
    angle: node.rotation,
    alpha: node.visible ? node.opacity : 0,
    duration,
    ease: transition?.ease ?? 'Sine.easeInOut',
    onComplete: () => {
      if (root.active) root.setVisible(node.visible).setAlpha(node.opacity)
    },
  })
}

export function renderTeacherController(
  scene: Phaser.Scene,
  initialNode: TeacherControllerNode,
  depth: number,
  context: RenderNodeContext,
): RenderedNodeHandle {
  let node = initialNode
  let destroyed = false
  let currentSceneId: string | null = null
  let currentStateLabel: string | null = null
  let hostVisible = true
  let motionVisible = true
  let collapsed = initialNode.collapsible && initialNode.defaultCollapsed
  const controllerVisible = (): boolean => {
    if (!node.visible || !hostVisible || !motionVisible) return false
    if (context.mode === 'capture') return node.includeInStaticExports
    const canvasControlsEnabled = context.canvasControlsEnabled ??
      context.payload.project.playback.controls === 'canvas'
    return canvasControlsEnabled
  }
  const status: TeacherControllerViewStatus = {
    muted: context.payload.project.media.audio.defaultMuted,
    fullscreen: Boolean(document.fullscreenElement),
  }
  const scenes = context.payload.project.scenes.map(({ id, name }) => ({ id, name }))
  const eventDisposers: RuntimeEventDisposer[] = []
  const buttonControls: ButtonControl[] = []

  const root = scene.add
    .container(node.x + node.width / 2, node.y + node.height / 2)
    .setName(`node:${node.id}`)
    .setDepth(depth)
    .setAngle(node.rotation)
    .setAlpha(node.opacity)
    .setVisible(controllerVisible())
  root.setSize(node.width, node.height)
  context.parentRoot?.add(root)

  const content = scene.add.container(-node.width / 2, -node.height / 2)
  const graphics = scene.add.graphics()
  const titleText = scene.add.text(0, 0, '', {
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
  })
  const progressText = scene.add.text(0, 0, '', {
    fontFamily: FONT_FAMILY,
  })
  const collapseZone = scene.add.zone(0, 0, 1, 1).setOrigin(0.5)
  const collapseText = scene.add.text(0, 0, '', {
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    align: 'center',
  }).setOrigin(0.5)
  const toggleCollapsed = (): void => {
    if (
      destroyed ||
      !node.collapsible ||
      !node.visible ||
      !isPreviewContext(context)
    ) return
    collapsed = !collapsed
    redraw()
    context.events?.emit(TEACHER_CONTROLLER_COLLAPSE_EVENT, {
      nodeId: node.id,
      collapsed,
    })
  }
  collapseZone
    .setInteractive({ useHandCursor: true })
    .on('pointerup', toggleCollapsed)
  content.add([graphics, titleText, progressText, collapseZone, collapseText])
  root.add(content)

  const stateName = (stateId: string | null): string | null => {
    if (!stateId) return null
    return context.presentation?.states().find((state) => state.id === stateId)
      ?.name ?? stateId
  }

  const removeLastButton = (): void => {
    const control = buttonControls.pop()
    if (!control) return
    control.zone.off('pointerup', control.activate)
    control.zone.destroy()
    control.text.destroy()
  }

  const syncButtonControls = (
    layouts: TeacherControllerButtonLayout[],
    fontSize: number,
    color: string,
  ): void => {
    while (buttonControls.length < layouts.length) {
      let control: ButtonControl
      const zone = scene.add.zone(0, 0, 1, 1).setOrigin(0.5)
      const text = scene.add.text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        align: 'center',
      }).setOrigin(0.5)
      control = {
        action: { type: 'scene.next' },
        zone,
        text,
        activate: () => {
          if (
            destroyed ||
            !node.visible ||
            !isPreviewContext(context)
          ) {
            return
          }
          invokeControllerAction(control.action, context)
        },
      }
      zone
        .setInteractive({ useHandCursor: true })
        .on('pointerup', control.activate)
      buttonControls.push(control)
      content.add([zone, text])
    }
    while (buttonControls.length > layouts.length) removeLastButton()

    layouts.forEach((button, index) => {
      const control = buttonControls[index]!
      control.action = button.action
      control.zone
        .setPosition(button.x + button.width / 2, button.y + button.height / 2)
        .setSize(button.width, button.height)
        .setVisible(controllerVisible() && !collapsed)
      if (control.zone.input) {
        control.zone.input.enabled = controllerVisible() && !collapsed && isPreviewContext(context)
        const hitArea = control.zone.input.hitArea
        if (hitArea instanceof Phaser.Geom.Rectangle) {
          hitArea.setSize(button.width, button.height)
        }
      }
      control.text
        .setText(teacherControllerButtonDisplayLabel(button, status))
        .setColor(color)
        .setFontSize(fontSize)
        .setPosition(
          button.x + button.width / 2,
          button.y + button.height / 2,
        )
        .setWordWrapWidth(Math.max(8, button.width - 8), false)
        .setVisible(controllerVisible() && !collapsed)
    })
  }

  const drawButton = (
    button: TeacherControllerButtonLayout,
    palette: ReturnType<typeof createTeacherControllerLayout>['palette'],
  ): void => {
    const radius = Math.min(10, button.height / 3, button.width / 3)
    graphics.fillStyle(palette.button, 0.94)
    graphics.fillRoundedRect(
      button.x,
      button.y,
      button.width,
      button.height,
      radius,
    )
    graphics.lineStyle(1, palette.accent, 0.38)
    graphics.strokeRoundedRect(
      button.x + 0.5,
      button.y + 0.5,
      Math.max(1, button.width - 1),
      Math.max(1, button.height - 1),
      Math.max(0, radius - 0.5),
    )
  }

  const redraw = (): void => {
    if (destroyed) return
    const layout = createTeacherControllerLayout(node, node.width, node.height)
    const { palette } = layout
    content.setPosition(-node.width / 2, -node.height / 2)

    graphics.clear()
    if (!collapsed) {
      graphics.fillStyle(palette.background, palette.backgroundAlpha)
      graphics.fillRoundedRect(0, 0, layout.width, layout.height, layout.cornerRadius)
      graphics.lineStyle(1.5, palette.accent, 0.72)
      graphics.strokeRoundedRect(
        0.75,
        0.75,
        Math.max(1, layout.width - 1.5),
        Math.max(1, layout.height - 1.5),
        Math.max(0, layout.cornerRadius - 0.75),
      )
      graphics.fillStyle(palette.accent, 0.92)
      graphics.fillRoundedRect(
        layout.padding,
        layout.padding,
        3,
        Math.max(4, layout.height - layout.padding * 2),
        1.5,
      )
      for (const button of layout.buttons) drawButton(button, palette)
    }

    if (layout.collapse) {
      const collapse = layout.collapse
      graphics.fillStyle(palette.background, Math.max(0.88, palette.backgroundAlpha))
      graphics.fillRoundedRect(
        collapse.x,
        collapse.y,
        collapse.width,
        collapse.height,
        Math.min(collapse.width, collapse.height) / 2,
      )
      graphics.lineStyle(1.5, palette.accent, 0.82)
      graphics.strokeRoundedRect(
        collapse.x + 0.75,
        collapse.y + 0.75,
        Math.max(1, collapse.width - 1.5),
        Math.max(1, collapse.height - 1.5),
        Math.max(0, Math.min(collapse.width, collapse.height) / 2 - 0.75),
      )
      collapseZone
        .setPosition(
          collapse.x + collapse.width / 2,
          collapse.y + collapse.height / 2,
        )
        .setSize(collapse.width, collapse.height)
        .setVisible(controllerVisible())
      if (collapseZone.input) {
        collapseZone.input.enabled = controllerVisible() && isPreviewContext(context)
        const hitArea = collapseZone.input.hitArea
        if (hitArea instanceof Phaser.Geom.Rectangle) {
          hitArea.setSize(collapse.width, collapse.height)
        }
      }
      collapseText
        .setText(collapsed ? '展' : '收')
        .setColor(palette.textCss)
        .setFontSize(Math.max(9, Math.min(13, collapse.height * 0.4)))
        .setPosition(
          collapse.x + collapse.width / 2,
          collapse.y + collapse.height / 2,
        )
        .setVisible(controllerVisible())
    } else {
      collapseZone.setVisible(false)
      if (collapseZone.input) collapseZone.input.enabled = false
      collapseText.setVisible(false)
    }

    titleText
      .setVisible(!collapsed)
      .setText(node.title)
      .setColor(palette.textCss)
      .setFontSize(layout.titleFontSize)
      .setPosition(layout.title.x + 12, layout.title.y + layout.title.height / 2)
      .setOrigin(0, 0.5)
      .setWordWrapWidth(Math.max(8, layout.title.width - 12), false)

    if (layout.progress && !collapsed) {
      progressText
        .setVisible(true)
        .setText(formatTeacherControllerProgress(
          scenes,
          currentSceneId,
          currentStateLabel,
        ))
        .setColor(palette.accentCss)
        .setAlpha(0.84)
        .setFontSize(layout.progressFontSize)
        .setPosition(
          layout.progress.x + 12,
          layout.progress.y + layout.progress.height / 2,
        )
        .setOrigin(0, 0.5)
        .setWordWrapWidth(Math.max(8, layout.progress.width - 12), false)
    } else {
      progressText.setVisible(false)
    }

    syncButtonControls(layout.buttons, layout.buttonFontSize, palette.textCss)
  }

  const onFullscreenChange = (): void => {
    status.fullscreen = Boolean(document.fullscreenElement)
    redraw()
  }
  document.addEventListener('fullscreenchange', onFullscreenChange)

  if (context.events) {
    eventDisposers.push(
      context.events.on<SceneEvent>('scene:enter', (event) => {
        currentSceneId = event?.sceneId ?? null
        currentStateLabel = stateName(context.presentation?.current() ?? null)
        redraw()
      }),
      context.events.on<PresentationEvent>('presentation:change', (event) => {
        if (event?.sceneId) currentSceneId = event.sceneId
        currentStateLabel = stateName(event?.stateId ?? null)
        redraw()
      }),
      context.events.on<AudioChangeEvent>('audio:change', (event) => {
        if (typeof event?.muted === 'boolean') status.muted = event.muted
        redraw()
      }),
    )
  }

  redraw()

  return {
    id: initialNode.id,
    type: initialNode.type,
    root,
    setHostVisible(visible): void {
      if (destroyed) return
      hostVisible = visible
      redraw()
      root.setVisible(controllerVisible())
    },
    setMotionVisible(visible): void {
      if (destroyed) return
      motionVisible = visible
      redraw()
      root.setVisible(controllerVisible())
    },
    update(nextNode: SceneNode, transition): void {
      if (
        destroyed ||
        nextNode.type !== 'teacher-controller' ||
        nextNode.id !== initialNode.id
      ) {
        return
      }
      node = nextNode
      if (!node.collapsible) collapsed = false
      redraw()
      applyNodeFrame(
        scene,
        controllerVisible() ? node : { ...node, visible: false },
        root,
        transition,
      )
    },
    destroy(): void {
      if (destroyed) return
      destroyed = true
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      eventDisposers.splice(0).forEach((dispose) => dispose())
      collapseZone.off('pointerup', toggleCollapsed)
      while (buttonControls.length > 0) removeLastButton()
      scene.tweens.killTweensOf(root)
      if (root.active) root.destroy(true)
    },
  }
}
