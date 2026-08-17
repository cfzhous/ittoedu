import {
  collectCourseProjectReferences,
  visitCourseProject,
  type CourseProjectPath,
  type CourseProjectReferenceKind,
} from '@/shared/courseProjectModel'
import type { CourseProjectDocument } from '@/shared/courseProjectTypes'

export type CourseProjectHealthSeverity = 'error' | 'warning'

export interface CourseProjectHealthItem {
  readonly severity: CourseProjectHealthSeverity
  readonly code: string
  readonly message: string
  readonly path: CourseProjectPath
}

export interface CourseProjectHealthInspection {
  readonly items: readonly CourseProjectHealthItem[]
  readonly error: number
  readonly warning: number
}

interface OwnedIds {
  surfaces: Set<string>
  locations: Set<string>
  scenes: Set<string>
  blocks: Set<string>
  cameras: Set<string>
  layerItems: Set<string>
  presentationStates: Set<string>
  courseStates: Set<string>
  assets: Set<string>
  sounds: Set<string>
  components: Set<string>
}

const KIND_MESSAGE: Record<CourseProjectReferenceKind, string> = {
  asset: '有素材引用已失效，请检查图片、音视频或背景。',
  component: '有互动组件引用已失效，请重新导入组件或删除该对象。',
  surface: '课程结构里有页面指向了不存在的内容。',
  scene: '有演示页引用已失效，请检查跳转或目录。',
  block: '有讲义段落引用已失效，请检查课程结构。',
  'camera-frame': '有画布镜头引用已失效，请检查课程结构。',
  'layer-item': '有对象引用已失效，请检查互动或图层。',
  location: '课程结构里有位置指向了不存在的内容。',
  'course-state': '有课程状态引用已失效。',
  'presentation-state': '有页面状态引用已失效。',
  sound: '有声音引用已失效，请检查声音库或互动。',
}

function collectOwnedIds(project: CourseProjectDocument): OwnedIds {
  const owned: OwnedIds = {
    surfaces: new Set(project.surfaces.map((surface) => surface.id)),
    locations: new Set(project.locations.map((location) => location.id)),
    scenes: new Set(),
    blocks: new Set(),
    cameras: new Set(),
    layerItems: new Set(),
    presentationStates: new Set(),
    courseStates: new Set(project.courseState.map((state) => state.key)),
    assets: new Set(Object.keys(project.assets)),
    sounds: new Set(Object.keys(project.media.audio.sounds)),
    components: new Set(Object.keys(project.componentPackages)),
  }
  visitCourseProject(project, {
    layerItem(item) {
      owned.layerItems.add(item.layerItemId)
    },
    scene(scene) {
      owned.scenes.add(scene.id)
      scene.presentation?.states.forEach((state) => owned.presentationStates.add(state.id))
    },
    block(block) {
      owned.blocks.add(block.id)
    },
    surface(surface) {
      if (surface.type === 'spatial-2d') {
        surface.camera.frames.forEach((frame) => owned.cameras.add(frame.id))
      }
    },
  })
  return owned
}

function ownedSet(owned: OwnedIds, kind: CourseProjectReferenceKind): Set<string> | null {
  switch (kind) {
    case 'asset':
      return owned.assets
    case 'component':
      return owned.components
    case 'surface':
      return owned.surfaces
    case 'scene':
      return owned.scenes
    case 'block':
      return owned.blocks
    case 'camera-frame':
      return owned.cameras
    case 'layer-item':
      return owned.layerItems
    case 'location':
      return owned.locations
    case 'course-state':
      return owned.courseStates
    case 'presentation-state':
      return owned.presentationStates
    case 'sound':
      return owned.sounds
    default:
      return null
  }
}

function componentExists(
  owned: OwnedIds,
  packageId: string,
  version: string | undefined,
  project: CourseProjectDocument,
): boolean {
  const meta = project.componentPackages[packageId]
  if (!meta) return owned.components.has(packageId)
  return version === undefined || meta.version === version
}

/**
 * Reports missing surfaces/locations and dangling resource, interaction,
 * package, sound and owner addresses. It does not hide or delete problems.
 */
export function inspectCourseProjectHealth(
  project: CourseProjectDocument,
): CourseProjectHealthInspection {
  const items: CourseProjectHealthItem[] = []
  const seen = new Set<string>()
  const add = (item: CourseProjectHealthItem) => {
    const key = JSON.stringify([item.code, item.path, item.message])
    if (seen.has(key)) return
    seen.add(key)
    items.push(item)
  }

  if (project.surfaces.length === 0) {
    add({
      severity: 'error',
      code: 'missing-surface',
      message: '课程里没有可用页面，请先新增演示、讲义或无限画布。',
      path: ['surfaces'],
    })
  }
  if (project.locations.length === 0) {
    add({
      severity: 'error',
      code: 'missing-location',
      message: '课程结构是空的，请先新增一页内容。',
      path: ['locations'],
    })
  }

  const owned = collectOwnedIds(project)
  for (const [assetId, meta] of Object.entries(project.assets)) {
    if (meta.id !== assetId) {
      add({
        severity: 'error',
        code: 'dangling-asset',
        message: KIND_MESSAGE.asset,
        path: ['assets', assetId],
      })
    }
  }
  for (const [soundId, sound] of Object.entries(project.media.audio.sounds)) {
    if (sound.id !== soundId || !owned.assets.has(sound.assetId)) {
      add({
        severity: 'error',
        code: 'dangling-sound',
        message: KIND_MESSAGE.sound,
        path: ['media', 'audio', 'sounds', soundId],
      })
    }
  }

  for (const reference of collectCourseProjectReferences(project)) {
    if (reference.kind === 'component') {
      if (!componentExists(owned, reference.id, reference.version, project)) {
        add({
          severity: 'error',
          code: 'dangling-component',
          message: KIND_MESSAGE.component,
          path: reference.path,
        })
      }
      continue
    }
    const set = ownedSet(owned, reference.kind)
    if (!set || set.has(reference.id)) continue
    add({
      severity: 'error',
      code: `dangling-${reference.kind}`,
      message: KIND_MESSAGE[reference.kind],
      path: reference.path,
    })
  }

  return {
    items,
    error: items.filter((item) => item.severity === 'error').length,
    warning: items.filter((item) => item.severity === 'warning').length,
  }
}
