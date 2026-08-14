import { visitCourseProjectReferences } from '../../shared/courseProjectModel'
import type { CourseProjectDocument } from '../../shared/courseProjectTypes'
import type { AssetMeta, SoundDefinition } from '../../shared/projectTypes'
import type { InteractionRule } from '../../shared/interactionTypes'
import { updateCourseProject } from './courseStudioModel'

export interface CourseSoundReference {
  scope: 'course' | 'scene'
  ruleId: string
  label: string
}

export interface CourseSoundPatch {
  name?: string
  channel?: SoundDefinition['channel']
  defaultVolume?: number
  defaultLoop?: boolean
}

function normalizedSoundName(value: string): string {
  const name = value.trim()
  if (!name) throw new Error('声音名称不能为空。')
  if (name.length > 80) throw new Error('声音名称不能超过 80 个字符。')
  return name
}

function filenameLabel(filename: string): string {
  return filename.replace(/\.[^.]+$/u, '').trim() || '课程声音'
}

function ruleUsesSound(rule: InteractionRule, soundId: string): boolean {
  if (rule.trigger.type === 'audio.ended' && rule.trigger.soundId === soundId) return true
  return rule.actions.some(({ action }) => (
    (action.type === 'audio.play' && action.soundId === soundId) ||
    (
      (action.type === 'audio.pause' || action.type === 'audio.resume' ||
        action.type === 'audio.stop' || action.type === 'audio.toggle-mute') &&
      action.target.kind === 'sound' && action.target.soundId === soundId
    )
  ))
}

export function courseSoundReferences(
  project: CourseProjectDocument,
  soundId: string,
): CourseSoundReference[] {
  const references: CourseSoundReference[] = []
  project.globalInteractions.forEach((rule, index) => {
    if (!ruleUsesSound(rule, soundId)) return
    references.push({
      scope: 'course',
      ruleId: rule.id,
      label: `课程互动“${rule.name?.trim() || `规则 ${index + 1}`}”`,
    })
  })
  project.surfaces.forEach((surface) => {
    if (surface.type !== 'slide') return
    surface.scenes.forEach((scene) => {
      scene.interactions.forEach((rule, index) => {
        if (!ruleUsesSound(rule, soundId)) return
        references.push({
          scope: 'scene',
          ruleId: rule.id,
          label: `场景“${surface.title} · ${scene.name}”中的互动“${rule.name?.trim() || `规则 ${index + 1}`}”`,
        })
      })
    })
  })
  return references
}

export function addCourseSound(
  project: CourseProjectDocument,
  input: {
    soundId: string
    asset: AssetMeta
    name?: string
    channel?: SoundDefinition['channel']
  },
  now?: string,
): CourseProjectDocument {
  if (input.asset.kind !== 'audio') throw new Error('课程声音只能使用音频素材。')
  if (project.media.audio.sounds[input.soundId]) throw new Error('该课程声音已存在。')
  return updateCourseProject(project, (draft) => {
    draft.assets[input.asset.id] = structuredClone(input.asset)
    draft.media.audio.sounds[input.soundId] = {
      id: input.soundId,
      name: normalizedSoundName(input.name ?? filenameLabel(input.asset.filename)),
      assetId: input.asset.id,
      channel: input.channel ?? 'sfx',
      defaultVolume: 1,
      defaultLoop: false,
    }
  }, now)
}

export function updateCourseSound(
  project: CourseProjectDocument,
  soundId: string,
  patch: CourseSoundPatch,
  now?: string,
): CourseProjectDocument {
  return updateCourseProject(project, (draft) => {
    const sound = draft.media.audio.sounds[soundId]
    if (!sound) throw new Error('要修改的课程声音已不存在。')
    if (patch.name !== undefined) sound.name = normalizedSoundName(patch.name)
    if (patch.channel !== undefined) sound.channel = patch.channel
    if (patch.defaultVolume !== undefined) {
      if (!Number.isFinite(patch.defaultVolume)) throw new Error('声音音量必须是有效数字。')
      sound.defaultVolume = Math.max(0, Math.min(1, patch.defaultVolume))
    }
    if (patch.defaultLoop !== undefined) sound.defaultLoop = patch.defaultLoop
  }, now)
}

export function deleteCourseSound(
  project: CourseProjectDocument,
  soundId: string,
  now?: string,
): CourseProjectDocument {
  const sound = project.media.audio.sounds[soundId]
  if (!sound) throw new Error('要删除的课程声音已不存在。')
  const references = courseSoundReferences(project, soundId)
  if (references.length > 0) {
    throw new Error(
      `声音“${sound.name}”仍被 ${references.length} 条互动使用：${references.map(({ label }) => label).join('；')}。请先修改这些互动。`,
    )
  }
  return updateCourseProject(project, (draft) => {
    const assetId = draft.media.audio.sounds[soundId]!.assetId
    delete draft.media.audio.sounds[soundId]
    let assetStillReferenced = false
    visitCourseProjectReferences(draft, (reference) => {
      if (reference.kind === 'asset' && reference.id === assetId) assetStillReferenced = true
    })
    if (!assetStillReferenced) delete draft.assets[assetId]
  }, now)
}
