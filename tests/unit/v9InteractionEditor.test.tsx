import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InteractionRule } from '@/shared/interactionTypes'
import { interactionRuleSchema } from '@/shared/interactionSchema'
import type { CourseProjectDocument, SlideSurfaceDocument } from '@/shared/courseProjectTypes'
import {
  addSlideTextLayer,
  addVideoLayer,
  createCourseProject,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import { V9InteractionEditor } from '@/renderer/course/V9InteractionEditor'

afterEach(cleanup)

function projectWithTargets(options: { video?: boolean; loop?: boolean; sound?: boolean } = {}) {
  let project = createCourseProject({ id: 'interaction-editor', now: '2026-08-14T00:00:00.000Z' })
  let surface = project.surfaces[0]
  if (surface?.type !== 'slide') throw new Error('expected Slide surface')
  const sceneId = surface.scenes[0]!.id
  project = addSlideTextLayer(project, surface.id, sceneId, '课堂标题', {
    id: 'title-layer',
    now: '2026-08-14T00:00:01.000Z',
  })
  if (options.video) {
    project = updateCourseProject(project, (draft) => {
      draft.assets.video = {
        id: 'video',
        filename: 'lesson.mp4',
        mimeType: 'video/mp4',
        kind: 'video',
        path: 'assets/video.bin',
        byteLength: 8,
        width: 1280,
        height: 720,
        duration: 20,
      }
    }, '2026-08-14T00:00:02.000Z')
    project = addVideoLayer(project, {
      surfaceId: surface.id,
      sceneId,
      assetId: 'video',
      id: 'lesson-video',
      loop: options.loop,
      now: '2026-08-14T00:00:03.000Z',
    })
  }
  if (options.sound) {
    project = updateCourseProject(project, (draft) => {
      draft.assets['sound-asset'] = {
        id: 'sound-asset', filename: 'bell.mp3', mimeType: 'audio/mpeg', kind: 'audio',
        path: 'assets/bell.mp3', byteLength: 4, duration: 1,
      }
      draft.media.audio.sounds.bell = {
        id: 'bell', name: '答对提示音', assetId: 'sound-asset', channel: 'sfx',
        defaultVolume: 0.8, defaultLoop: false,
      }
    })
  }
  surface = project.surfaces[0]
  if (surface?.type !== 'slide') throw new Error('expected Slide surface')
  return { project, surface, scene: surface.scenes[0]! }
}

function layerEntries(surface: SlideSurfaceDocument) {
  return surface.scenes[0]!.layerItems.map((item) => ({ item, source: 'scene' as const }))
}

describe('V9InteractionEditor', () => {
  it('creates a stable click rule from the selected layer using only Chinese teacher-facing copy', () => {
    const fixture = projectWithTargets()
    const onCommit = vi.fn()
    const view = render(
      <V9InteractionEditor
        {...fixture}
        layerEntries={layerEntries(fixture.surface)}
        selectedLayerItemId="title-layer"
        onCommit={onCommit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '添加：点击所选图层时' }))
    const [rules] = onCommit.mock.calls[0] as [InteractionRule[], string]
    expect(rules).toHaveLength(1)
    expect(rules[0]!.trigger).toEqual({ type: 'node.click', nodeId: 'title-layer' })
    expect(rules[0]!.actions[0]!.action).toMatchObject({
      type: 'node.exit',
      nodeId: 'title-layer',
    })
    expect(view.container.textContent).not.toMatch(/node\.click|node\.exit|scene\.next|presentation\.set|\{\s*"/u)
  })

  it('disables targets it cannot construct and explains why in Chinese', () => {
    const fixture = projectWithTargets()
    render(
      <V9InteractionEditor
        {...fixture}
        layerEntries={layerEntries(fixture.surface)}
        selectedLayerItemId={null}
        onCommit={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: '添加：点击所选图层时' })).toBeDisabled()
    expect(screen.getByText('请先在画布或图层面板中选择一个图层。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加：视频播放结束时' })).toBeDisabled()
    expect(screen.getAllByText('当前场景没有可定位的原生视频。').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '添加：声音播放结束时' })).toBeDisabled()
    expect(screen.getByText('请先在“课程声音”中导入声音。')).toBeInTheDocument()
  })

  it('uses imported course sound names as legal trigger and action candidates', () => {
    const fixture = projectWithTargets({ sound: true })
    const committed: InteractionRule[][] = []
    function Harness() {
      const [rules, setRules] = useState<InteractionRule[]>([])
      const surface: SlideSurfaceDocument = {
        ...fixture.surface,
        scenes: [{ ...fixture.scene, interactions: rules }],
      }
      return (
        <V9InteractionEditor
          project={fixture.project}
          surface={surface}
          scene={surface.scenes[0]!}
          layerEntries={layerEntries(surface)}
          selectedLayerItemId="title-layer"
          onCommit={(next) => { committed.push(next); setRules(next) }}
        />
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '添加：声音播放结束时' }))
    expect(committed.at(-1)![0]!.trigger).toEqual({ type: 'audio.ended', soundId: 'bell' })
    expect(screen.getByLabelText('触发声音')).toHaveDisplayValue('答对提示音')

    fireEvent.change(screen.getByLabelText('动作 1 类型'), { target: { value: 'audio.play' } })
    expect(committed.at(-1)![0]!.actions[0]!.action).toEqual({ type: 'audio.play', soundId: 'bell' })
    expect(screen.getByLabelText('动作目标声音')).toHaveDisplayValue('答对提示音')
  })

  it('does not offer a looping video as a natural end trigger but keeps timed video triggers available', () => {
    const fixture = projectWithTargets({ video: true, loop: true })
    render(
      <V9InteractionEditor
        {...fixture}
        layerEntries={layerEntries(fixture.surface)}
        selectedLayerItemId="lesson-video"
        onCommit={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: '添加：视频播放结束时' })).toBeDisabled()
    expect(screen.getByText('当前原生视频都设置为循环播放，不会自然产生“播放结束”。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加：视频播放到指定时间时' })).toBeEnabled()
  })

  it('edits enablement, name, action order, delay and removal through one commit callback per gesture', () => {
    const fixture = projectWithTargets({ video: true })
    const committed: InteractionRule[][] = []
    function Harness() {
      const [rules, setRules] = useState<InteractionRule[]>([])
      const surface: SlideSurfaceDocument = {
        ...fixture.surface,
        scenes: [{ ...fixture.scene, interactions: rules }],
      }
      return (
        <V9InteractionEditor
          project={fixture.project}
          surface={surface}
          scene={surface.scenes[0]!}
          layerEntries={layerEntries(surface)}
          selectedLayerItemId="title-layer"
          onCommit={(next) => { committed.push(next); setRules(next) }}
        />
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '添加：进入幻灯片场景时' }))
    expect(screen.getByRole('article', { name: /互动规则/u })).toBeInTheDocument()

    const name = screen.getByLabelText('互动名称 1')
    fireEvent.change(name, { target: { value: '标题分步出现' } })
    fireEvent.blur(name)
    expect(committed.at(-1)![0]!.name).toBe('标题分步出现')

    fireEvent.click(screen.getByRole('button', { name: '添加动作' }))
    expect(screen.getAllByRole('region', { name: /动作 \d/u })).toHaveLength(2)
    const delay = screen.getByLabelText('动作 2 延时（秒）')
    fireEvent.change(delay, { target: { value: '0.8' } })
    fireEvent.blur(delay)
    expect(committed.at(-1)![0]!.actions[1]!.delayMs).toBe(800)

    fireEvent.click(screen.getByRole('button', { name: '上移动作 2' }))
    expect(committed.at(-1)![0]!.actions[0]!.delayMs).toBe(800)
    fireEvent.click(screen.getByRole('button', { name: '删除动作 2' }))
    expect(committed.at(-1)![0]!.actions).toHaveLength(1)

    const rule = screen.getByRole('article', { name: '互动规则：标题分步出现' })
    fireEvent.click(within(rule).getByRole('checkbox'))
    expect(committed.at(-1)![0]!.enabled).toBe(false)
    fireEvent.click(within(rule).getByRole('button', { name: '删除规则' }))
    expect(committed.at(-1)).toEqual([])
  })

  it('keeps terminal navigation as the last independent step', () => {
    const fixture = projectWithTargets({ video: true })
    const committed: InteractionRule[][] = []
    function Harness() {
      const [rules, setRules] = useState<InteractionRule[]>([])
      const surface: SlideSurfaceDocument = {
        ...fixture.surface,
        scenes: [{ ...fixture.scene, interactions: rules }],
      }
      return (
        <V9InteractionEditor
          project={fixture.project}
          surface={surface}
          scene={surface.scenes[0]!}
          layerEntries={layerEntries(surface)}
          selectedLayerItemId="title-layer"
          onCommit={(next) => { committed.push(next); setRules(next) }}
        />
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '添加：进入幻灯片场景时' }))
    fireEvent.click(screen.getByRole('button', { name: '添加动作' }))
    fireEvent.change(screen.getByLabelText('动作 1 类型'), { target: { value: 'course.restart' } })
    const actions = committed.at(-1)![0]!.actions
    expect(actions.at(-1)!.action).toEqual({ type: 'course.restart' })
    expect(actions.at(-1)!.start).toBe('after-previous')
    expect(interactionRuleSchema.safeParse(committed.at(-1)![0]).success).toBe(true)
    expect(screen.getByRole('button', { name: `上移动作 ${actions.length}` })).toBeDisabled()
  })
})
