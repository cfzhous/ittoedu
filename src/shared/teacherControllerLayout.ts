import type {
  TeacherControllerButton,
  TeacherControllerNode,
} from './projectTypes'

export interface TeacherControllerRect {
  x: number
  y: number
  width: number
  height: number
}

export interface TeacherControllerButtonLayout extends TeacherControllerRect {
  id: string
  action: TeacherControllerButton['action']
  label: string
}

export interface TeacherControllerPalette {
  background: number
  backgroundCss: string
  backgroundAlpha: number
  accent: number
  accentCss: string
  textCss: string
  button: number
}

export interface TeacherControllerLayout {
  width: number
  height: number
  padding: number
  cornerRadius: number
  title: TeacherControllerRect
  progress: TeacherControllerRect | null
  collapse: TeacherControllerRect | null
  buttons: TeacherControllerButtonLayout[]
  titleFontSize: number
  progressFontSize: number
  buttonFontSize: number
  palette: TeacherControllerPalette
}

export interface TeacherControllerSceneInfo {
  id: string
  name: string
}

export interface TeacherControllerViewStatus {
  muted: boolean
  fullscreen: boolean
}

type TeacherControllerLayoutSource = Pick<
  TeacherControllerNode,
  'compact' | 'showSceneProgress' | 'collapsible' | 'buttons' | 'style'
>

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function normalizeHexColor(value: string, fallback: string): string {
  return /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : fallback
}

function colorNumber(value: string): number {
  return Number.parseInt(value.slice(1), 16)
}

function blendColor(background: string, foreground: string, amount: number): number {
  const base = colorNumber(background)
  const overlay = colorNumber(foreground)
  const channel = (shift: number) => Math.round(
    ((base >> shift) & 0xff) * (1 - amount) +
      ((overlay >> shift) & 0xff) * amount,
  )
  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

/**
 * Produces the shared geometry and palette for editor and Player renderers.
 * The result contains only serializable values and has no Phaser dependency.
 */
export function createTeacherControllerLayout(
  source: TeacherControllerLayoutSource,
  width: number,
  height: number,
): TeacherControllerLayout {
  const safeWidth = Math.max(16, width)
  const safeHeight = Math.max(16, height)
  const padding = clamp(safeHeight * 0.14, 5, 12)
  const visibleButtons = source.buttons.filter((button) => button.visible)
  const buttonCount = visibleButtons.length
  const collapseSize = source.collapsible
    ? clamp(safeHeight - padding * 2, 18, 30)
    : 0
  const collapseGap = source.collapsible ? clamp(safeWidth * 0.006, 3, 7) : 0
  const collapseReserve = collapseSize + collapseGap
  const availableWidth = Math.max(0, safeWidth - padding * 2 - collapseReserve)
  const preferredGap = clamp(safeWidth * 0.008, 4, 9)
  const gap = buttonCount > 1
    ? Math.min(preferredGap, availableWidth / (buttonCount + 2))
    : preferredGap
  const preferredTitleWidth = source.compact
    ? clamp(safeWidth * 0.18, 72, 132)
    : clamp(safeWidth * 0.28, 128, 238)
  const reservedTitleWidth = Math.min(
    preferredTitleWidth,
    buttonCount > 0 ? availableWidth * 0.42 : availableWidth,
  )
  const interButtonGaps = Math.max(0, buttonCount - 1) * gap
  const buttonAreaLimit = Math.max(
    0,
    availableWidth - reservedTitleWidth - (buttonCount > 0 ? gap : 0),
  )
  const preferredButtonWidth = source.compact ? 92 : 86
  const buttonWidth = buttonCount > 0
    ? Math.max(
        0,
        Math.min(
          preferredButtonWidth,
          Math.max(0, buttonAreaLimit - interButtonGaps) / buttonCount,
        ),
      )
    : 0
  const buttonAreaWidth = buttonCount > 0
    ? buttonWidth * buttonCount + interButtonGaps
    : 0
  const buttonStartX = safeWidth - padding - collapseReserve - buttonAreaWidth
  const titleWidth = Math.max(
    0,
    buttonStartX - padding - (buttonCount > 0 ? gap : 0),
  )
  const buttonHeight = Math.max(16, safeHeight - padding * 2)
  const hasProgress = source.showSceneProgress && !source.compact
  const titleHeight = hasProgress ? safeHeight * 0.46 : safeHeight - padding * 2
  const progressHeight = hasProgress
    ? Math.max(10, safeHeight - padding * 2 - titleHeight)
    : 0

  const backgroundCss = normalizeHexColor(
    source.style.backgroundColor,
    '#0b1720',
  )
  const accentCss = normalizeHexColor(source.style.accentColor, '#d9bf73')
  const textCss = normalizeHexColor(source.style.textColor, '#f3eee0')

  return {
    width: safeWidth,
    height: safeHeight,
    padding,
    cornerRadius: clamp(
      source.style.cornerRadius,
      0,
      Math.min(safeWidth, safeHeight) / 2,
    ),
    title: {
      x: padding,
      y: padding,
      width: titleWidth,
      height: titleHeight,
    },
    progress: hasProgress
      ? {
          x: padding,
          y: padding + titleHeight,
          width: titleWidth,
          height: progressHeight,
        }
      : null,
    collapse: source.collapsible
      ? {
          x: safeWidth - padding - collapseSize,
          y: (safeHeight - collapseSize) / 2,
          width: collapseSize,
          height: collapseSize,
        }
      : null,
    buttons: visibleButtons.map((button, index) => ({
      id: button.id,
      action: button.action,
      label: button.label,
      x: buttonStartX + index * (buttonWidth + gap),
      y: padding,
      width: buttonWidth,
      height: buttonHeight,
    })),
    titleFontSize: clamp(
      safeHeight * (hasProgress ? 0.25 : 0.29),
      11,
      18,
    ),
    progressFontSize: clamp(safeHeight * 0.17, 9, 12),
    buttonFontSize: clamp(
      safeHeight * (source.compact ? 0.22 : 0.235),
      9,
      14,
    ),
    palette: {
      background: colorNumber(backgroundCss),
      backgroundCss,
      backgroundAlpha: clamp(source.style.backgroundOpacity, 0, 1),
      accent: colorNumber(accentCss),
      accentCss,
      textCss,
      button: blendColor(backgroundCss, accentCss, 0.16),
    },
  }
}

export function formatTeacherControllerProgress(
  scenes: readonly TeacherControllerSceneInfo[],
  sceneId: string | null,
  stateLabel: string | null,
): string {
  const sceneIndex = sceneId
    ? scenes.findIndex((scene) => scene.id === sceneId)
    : -1
  if (sceneIndex < 0) {
    return `场景 — / ${scenes.length} · 等待开始`
  }
  const scene = scenes[sceneIndex]!
  return `${sceneIndex + 1} / ${scenes.length} · ${scene.name}${
    stateLabel ? ` · ${stateLabel}` : ''
  }`
}

export function teacherControllerButtonDisplayLabel(
  button: Pick<TeacherControllerButton, 'action' | 'label'>,
  status: TeacherControllerViewStatus,
): string {
  if (button.action.type === 'audio.toggle-mute') {
    return `${button.label} · ${status.muted ? '关' : '开'}`
  }
  if (button.action.type === 'player.fullscreen.toggle' && status.fullscreen) {
    return '退出全屏'
  }
  return button.label
}
