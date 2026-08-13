import type {
  GlobalLayerItem,
  GlobalLayerVisibility,
  ProjectDocument,
  TeacherControllerAction,
} from './projectTypes'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './constants'
import { rotatedRectangleAabb } from './geometry'

const NAVIGATION_ACTIONS = new Set([
  'scene.previous',
  'scene.next',
  'scene.replay',
  'scene.open-picker',
  'scene.go',
  'course.restart',
])

export function isTeacherControllerNavigationAction(
  action: TeacherControllerAction,
): boolean {
  return NAVIGATION_ACTIONS.has(action.type)
}

function intersectsCanvas(item: GlobalLayerItem): boolean {
  const bounds = rotatedRectangleAabb(item.node)
  return bounds.right > 0 &&
    bounds.bottom > 0 &&
    bounds.left < CANVAS_WIDTH &&
    bounds.top < CANVAS_HEIGHT
}

function visibilityIncludesAnyScene(
  visibility: GlobalLayerVisibility,
  sceneIds: readonly string[],
): boolean {
  if (visibility.mode === 'all') return sceneIds.length > 0
  const configured = new Set(visibility.sceneIds)
  return visibility.mode === 'include'
    ? sceneIds.some((sceneId) => configured.has(sceneId))
    : sceneIds.some((sceneId) => !configured.has(sceneId))
}

/**
 * A delivery-visible controller is a global controller that can actually be
 * rendered in at least one authored scene when playback starts.
 */
export function isDeliveryVisibleTeacherController(
  item: GlobalLayerItem,
  sceneIds: readonly string[],
): boolean {
  if (item.node.type !== 'teacher-controller') return false
  const hasVisibleNavigationAction = item.node.buttons.some((button) =>
    button.visible && isTeacherControllerNavigationAction(button.action),
  )
  return item.layer === 'overlay' &&
    item.node.visible &&
    item.node.opacity > 0 &&
    item.node.playbackInitialVisibility !== 'hidden' &&
    intersectsCanvas(item) &&
    hasVisibleNavigationAction &&
    visibilityIncludesAnyScene(item.visibility, sceneIds)
}

/** Repairs one existing controller only after the user explicitly requests it. */
export function restoreTeacherControllerForDelivery(
  item: GlobalLayerItem,
): boolean {
  if (item.node.type !== 'teacher-controller') return false
  item.layer = 'overlay'
  item.visibility = { mode: 'all', sceneIds: [] }
  item.node.visible = true
  item.node.playbackInitialVisibility = 'inherit'
  if (item.node.opacity <= 0) item.node.opacity = 1
  if (!intersectsCanvas(item)) {
    item.node.x = (CANVAS_WIDTH - item.node.width) / 2
    item.node.y = (CANVAS_HEIGHT - item.node.height) / 2
  }

  const existingNavigation = item.node.buttons.find((button) =>
    isTeacherControllerNavigationAction(button.action),
  )
  if (existingNavigation) {
    existingNavigation.visible = true
  } else if (item.node.buttons[0]) {
    item.node.buttons[0].action = { type: 'scene.next' }
    item.node.buttons[0].label = '下一场景'
    item.node.buttons[0].visible = true
  } else {
    item.node.buttons.push({
      id: `${item.node.id}_navigation`,
      action: { type: 'scene.next' },
      label: '下一场景',
      visible: true,
    })
  }
  return true
}

export function hasDeliveryVisibleTeacherController(
  project: Pick<ProjectDocument, 'globalLayer' | 'scenes'>,
): boolean {
  const sceneIds = project.scenes.map((scene) => scene.id)
  return project.globalLayer.some((item) =>
    isDeliveryVisibleTeacherController(item, sceneIds),
  )
}

/** Keeps editor mutations on the same invariant enforced at the schema edge. */
export function synchronizeTeacherControllerControls(
  project: Pick<ProjectDocument, 'globalLayer' | 'scenes' | 'playback'>,
): void {
  project.playback.controls = hasDeliveryVisibleTeacherController(project)
    ? 'canvas'
    : 'none'
}
