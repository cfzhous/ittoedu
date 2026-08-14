import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import type { CourseProjectDocument } from '@/shared/courseProjectTypes'
import { addCourseSurface, createCourseProject } from '@/renderer/course/courseStudioModel'
import { V9CourseLogicEditor } from '@/renderer/course/V9CourseLogicEditor'
import { V9GlobalInteractionEditor } from '@/renderer/course/V9InteractionEditor'
import {
  INTERACTION_ACTION_TYPES,
  INTERACTION_TRIGGER_TYPES,
  type InteractionActionPayload,
  type InteractionTrigger,
} from '@/shared/interactionTypes'

afterEach(cleanup)

function Harness({
  initial,
  surfaceId,
  revisions,
}: {
  initial: CourseProjectDocument
  surfaceId?: string
  revisions: number[]
}) {
  const [project, setProject] = useState(initial)
  const surface = project.surfaces.find((candidate) => candidate.id === surfaceId) ?? project.surfaces[0]!
  const scene = surface.type === 'slide' ? surface.scenes[0] : undefined
  const layers = [
    ...project.globalLayerItems.map((entry) => ({ item: entry.item, source: 'global' as const })),
    ...surface.surfaceLayerItems.map((entry) => ({ item: entry.item, source: 'surface' as const })),
    ...(surface.type === 'slide'
      ? (scene?.layerItems ?? []).map((item) => ({ item, source: 'scene' as const }))
      : surface.type === 'spatial-2d'
        ? surface.world.layerItems.map((item) => ({ item, source: 'world' as const }))
        : []),
  ]
  return (
    <V9CourseLogicEditor
      project={project}
      activeSurface={surface}
      activeScene={scene}
      layerEntries={layers}
      selectedLayerItemId={null}
      onCommit={(operation) => setProject((current) => {
        const next = operation(current)
        revisions.push(next.revision)
        return next
      })}
    />
  )
}

describe('V9 course logic editor', () => {
  it('authors variables and navigation requirements through Chinese structured controls', async () => {
    const revisions: number[] = []
    render(<Harness
      initial={createCourseProject({ id: 'logic-editor', now: '2026-08-14T00:00:00.000Z' })}
      revisions={revisions}
    />)

    fireEvent.click(screen.getByRole('button', { name: '添加变量' }))
    await waitFor(() => expect(screen.getByRole('article', { name: '课程变量：课程变量1' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '添加翻页条件' }))
    await waitFor(() => expect(screen.getByRole('article', { name: '翻页条件 1' })).toBeInTheDocument())

    expect(screen.getByLabelText('满足方式 1')).toHaveTextContent('以下每一项都满足')
    expect(screen.getByLabelText('未满足时提示 1')).toHaveValue('请先完成前面的学习任务。')
    expect(revisions).toHaveLength(2)
    expect(revisions[1]).toBe(revisions[0]! + 1)
    expect(document.body.textContent).not.toMatch(/navigationGuards|courseState|globalInteractions/u)
  })

  it('creates a course-wide rule and edits its scene condition in one history entry per action', async () => {
    const revisions: number[] = []
    render(<Harness
      initial={createCourseProject({ id: 'logic-global', now: '2026-08-14T00:00:00.000Z' })}
      revisions={revisions}
    />)

    fireEvent.click(screen.getByRole('button', { name: '添加课程互动：进入幻灯片场景时' }))
    await waitFor(() => expect(screen.getByRole('article', { name: '互动规则：进入幻灯片场景时' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '限定幻灯片场景' }))
    await waitFor(() => expect(screen.getByRole('group', { name: '适用的幻灯片场景' })).toBeInTheDocument())

    expect(revisions).toHaveLength(2)
    expect(revisions[1]).toBe(revisions[0]! + 1)
  })

  it.each([
    ['flow', 'flow-surface'],
    ['spatial-2d', 'spatial-surface'],
  ] as const)('exposes course-wide authoring from the %s entry', (type, id) => {
    const base = createCourseProject({ id: `logic-${type}`, now: '2026-08-14T00:00:00.000Z' })
    const project = addCourseSurface(base, type, { id })
    render(<Harness initial={project} surfaceId={id} revisions={[]} />)

    expect(screen.getByRole('region', { name: '课程级互动' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加课程互动：进入幻灯片场景时' })).toBeEnabled()
    expect(screen.getByRole('region', { name: '课程变量' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '翻页条件' })).toBeInTheDocument()
  })

  it('renders every trigger and action the current interaction player executes as a Chinese structured choice', () => {
    const project = createCourseProject({ id: 'logic-protocol-coverage', now: '2026-08-14T00:00:00.000Z' })
    const surface = project.surfaces[0]
    if (surface?.type !== 'slide') throw new Error('expected Slide surface')
    const scene = surface.scenes[0]!
    const layer = project.globalLayerItems[0]!.item
    const stateId = scene.presentation!.initialStateId
    project.media.audio.sounds.sound1 = {
      id: 'sound1',
      name: '提示音',
      assetId: 'asset-sound1',
      channel: 'sfx',
      defaultVolume: 1,
      defaultLoop: false,
    }
    const trigger = (type: typeof INTERACTION_TRIGGER_TYPES[number]): InteractionTrigger => {
      switch (type) {
        case 'scene.enter': return { type }
        case 'presentation.enter': return { type, stateId }
        case 'node.click': return { type, nodeId: layer.layerItemId }
        case 'component.event': return { type, nodeId: layer.layerItemId, eventName: '完成' }
        case 'runtime.event': return { type, scope: 'global', eventName: '完成' }
        case 'audio.ended': return { type, soundId: 'sound1' }
        case 'video.started': return { type, nodeId: layer.layerItemId }
        case 'video.paused': return { type, nodeId: layer.layerItemId }
        case 'video.ended': return { type, nodeId: layer.layerItemId }
        case 'video.time': return { type, nodeId: layer.layerItemId, seconds: 3 }
        case 'node.activated': return { type, nodeId: layer.layerItemId }
        case 'animation.completed': return { type, actionId: 'action-0' }
        case 'presenter.command': return { type, command: 'next' }
      }
    }
    const action = (type: typeof INTERACTION_ACTION_TYPES[number]): InteractionActionPayload => {
      switch (type) {
        case 'presentation.set': return { type, stateId }
        case 'scene.go': return { type, sceneId: scene.id }
        case 'scene.next': return { type }
        case 'scene.previous': return { type }
        case 'scene.replay': return { type }
        case 'course.restart': return { type }
        case 'audio.play': return { type, soundId: 'sound1' }
        case 'audio.pause': return { type, target: { kind: 'sound', soundId: 'sound1' } }
        case 'audio.resume': return { type, target: { kind: 'sound', soundId: 'sound1' } }
        case 'audio.stop': return { type, target: { kind: 'sound', soundId: 'sound1' } }
        case 'audio.toggle-mute': return { type, target: { kind: 'sound', soundId: 'sound1' } }
        case 'video.play': return { type, nodeId: layer.layerItemId }
        case 'video.pause': return { type, nodeId: layer.layerItemId }
        case 'video.restart': return { type, nodeId: layer.layerItemId }
        case 'video.stop': return { type, nodeId: layer.layerItemId }
        case 'video.toggle': return { type, nodeId: layer.layerItemId }
        case 'video.seek': return { type, nodeId: layer.layerItemId, seconds: 3 }
        case 'node.enter': return { type, nodeId: layer.layerItemId, effect: 'fade', durationMs: 200, easing: 'ease-out' }
        case 'node.exit': return { type, nodeId: layer.layerItemId, effect: 'fade', durationMs: 200, easing: 'ease-in' }
      }
    }
    project.globalInteractions = INTERACTION_ACTION_TYPES.map((actionType, index) => ({
      id: `rule-${index}`,
      name: `课程互动 ${index + 1}`,
      enabled: true,
      trigger: trigger(INTERACTION_TRIGGER_TYPES[index % INTERACTION_TRIGGER_TYPES.length]!),
      conditions: index === 0 ? [{ type: 'scene.in' as const, sceneIds: [scene.id] }] : [],
      actions: [{
        id: `action-${index}`,
        start: 'after-previous' as const,
        delayMs: 0,
        action: action(actionType),
      }],
    }))

    render(
      <V9GlobalInteractionEditor
        project={project}
        activeSurface={surface}
        activeScene={scene}
        layerEntries={project.globalLayerItems.map((entry) => ({ item: entry.item, source: 'global' }))}
        selectedLayerItemId={layer.layerItemId}
        onCommit={() => undefined}
      />,
    )

    expect(screen.getAllByLabelText('触发时机')).toHaveLength(INTERACTION_ACTION_TYPES.length)
    expect(screen.getAllByLabelText('触发时机').every((element) => (element as HTMLSelectElement).value !== '__professional__')).toBe(true)
    expect(screen.getAllByLabelText('动作 1 类型')).toHaveLength(INTERACTION_ACTION_TYPES.length)
    expect(screen.getAllByLabelText('动作 1 类型').every((element) => (element as HTMLSelectElement).value !== '__professional__')).toBe(true)
  })
})
