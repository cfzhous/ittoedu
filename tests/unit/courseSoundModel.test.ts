import { describe, expect, it } from 'vitest'
import { createCourseProject, updateCourseProject } from '@/renderer/course/courseStudioModel'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import {
  addCourseSound,
  courseSoundReferences,
  deleteCourseSound,
  updateCourseSound,
} from '@/renderer/course/courseSoundModel'

const AUDIO_ASSET = {
  id: 'asset-class-bell',
  filename: 'class-bell.mp3',
  mimeType: 'audio/mpeg',
  kind: 'audio' as const,
  path: 'assets/asset-class-bell.mp3',
  byteLength: 4,
  duration: 1.25,
}

describe('course sound authoring model', () => {
  it('adds and updates a V9 course sound without a second history/schema shape', () => {
    const project = createCourseProject({ id: 'sound-model' })
    const added = addCourseSound(project, {
      soundId: 'class-bell',
      asset: AUDIO_ASSET,
    })
    expect(added.media.audio.sounds['class-bell']).toMatchObject({
      id: 'class-bell',
      name: 'class-bell',
      channel: 'sfx',
      defaultVolume: 1,
      defaultLoop: false,
    })
    expect(added.assets[AUDIO_ASSET.id]).toEqual(AUDIO_ASSET)

    const updated = updateCourseSound(added, 'class-bell', {
      name: '上课铃声',
      channel: 'ui',
      defaultVolume: 0.45,
      defaultLoop: true,
    })
    expect(updated.media.audio.sounds['class-bell']).toMatchObject({
      name: '上课铃声',
      channel: 'ui',
      defaultVolume: 0.45,
      defaultLoop: true,
    })
    expect(courseProjectDocumentSchema.parse(updated).media.audio.sounds['class-bell']).toBeDefined()
  })

  it('blocks deletion with teacher-readable rule locations when a sound is in use', () => {
    let project = addCourseSound(createCourseProject({ id: 'sound-references' }), {
      soundId: 'class-bell',
      asset: AUDIO_ASSET,
      name: '上课铃声',
    })
    project = updateCourseProject(project, (draft) => {
      const slide = draft.surfaces.find((surface) => surface.type === 'slide')!
      if (slide.type !== 'slide') throw new Error('expected Slide')
      slide.scenes[0]!.interactions = [{
        id: 'play-bell', name: '播放上课铃', enabled: true,
        trigger: { type: 'scene.enter' }, conditions: [],
        actions: [{
          id: 'play-bell-action', start: 'after-previous', delayMs: 0,
          action: { type: 'audio.play', soundId: 'class-bell' },
        }],
      }]
      draft.globalInteractions = [{
        id: 'bell-ended', name: '铃声结束', enabled: true,
        trigger: { type: 'audio.ended', soundId: 'class-bell' }, conditions: [],
        actions: [{
          id: 'restart', start: 'after-previous', delayMs: 0,
          action: { type: 'course.restart' },
        }],
      }]
    })

    expect(courseSoundReferences(project, 'class-bell').map(({ label }) => label)).toEqual([
      '课程互动“铃声结束”',
      expect.stringMatching(/场景.*播放上课铃/u),
    ])
    expect(() => deleteCourseSound(project, 'class-bell')).toThrow(/仍被 2 条互动使用.*请先修改/u)
  })

  it('deletes an unreferenced sound and its now-orphaned asset', () => {
    const project = addCourseSound(createCourseProject({ id: 'sound-delete' }), {
      soundId: 'class-bell',
      asset: AUDIO_ASSET,
    })
    const deleted = deleteCourseSound(project, 'class-bell')
    expect(deleted.media.audio.sounds['class-bell']).toBeUndefined()
    expect(deleted.assets[AUDIO_ASSET.id]).toBeUndefined()
  })

  it('keeps shared asset metadata when another course sound still uses the file', () => {
    let project = addCourseSound(createCourseProject({ id: 'sound-shared-asset' }), {
      soundId: 'class-bell',
      asset: AUDIO_ASSET,
    })
    project = addCourseSound(project, {
      soundId: 'class-bell-copy',
      asset: AUDIO_ASSET,
      name: '备用铃声',
    })
    const deleted = deleteCourseSound(project, 'class-bell')
    expect(deleted.media.audio.sounds['class-bell']).toBeUndefined()
    expect(deleted.media.audio.sounds['class-bell-copy']).toBeDefined()
    expect(deleted.assets[AUDIO_ASSET.id]).toEqual(AUDIO_ASSET)
  })
})
