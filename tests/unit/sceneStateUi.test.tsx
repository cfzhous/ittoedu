import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { selectActiveScene, useEditorStore } from '@/renderer/store/editorStore'
import { PropertiesTab } from '@/renderer/ui/PropertiesTab'
import { AutomationTab } from '@/renderer/ui/AutomationTab'
import { ScenePanel } from '@/renderer/ui/ScenePanel'
import { SceneStateStrip } from '@/renderer/ui/SceneStateStrip'
import type { VideoNode } from '@/shared/projectTypes'

function videoNode(id: string, name: string): VideoNode {
  return {
    id,
    name,
    type: 'video',
    x: 120,
    y: 100,
    width: 640,
    height: 360,
    rotation: 0,
    opacity: 1,
    visible: true,
    playbackInitialVisibility: 'inherit',
    locked: false,
    assetId: 'asset_video',
    fit: 'contain',
    autoplay: false,
    loop: false,
    muted: false,
    volume: 1,
    playbackRate: 1,
    showControls: true,
    clickToToggle: true,
    startTime: 0,
    endTime: null,
    poster: { mode: 'video-frame', time: 0 },
    backgroundAudioMode: 'none',
  }
}

beforeEach(() => {
  useEditorStore.getState().createNewProject()
  useEditorStore.setState({ editorMode: 'professional' })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('scene presentation state UI', () => {
  it('keeps scene automation in a dedicated tab and adds through the store', () => {
    render(<AutomationTab />)

    expect(screen.getByRole('heading', { name: '场景规则' })).toBeInTheDocument()
    expect(screen.getByLabelText('规则由触发、条件和动作组成')).toHaveTextContent(
      '何时发生',
    )
    fireEvent.click(screen.getByRole('button', { name: '添加规则' }))

    const scene = selectActiveScene(useEditorStore.getState())
    expect(scene.interactions).toHaveLength(1)
    expect(scene.interactions[0]).toMatchObject({
      trigger: { type: 'scene.enter' },
      conditions: [],
      actions: [{
        id: expect.stringMatching(/^action_/),
        start: 'after-previous',
        delayMs: 0,
        action: { type: 'presentation.set', stateId: 'state_initial' },
      }],
    })
  })

  it('keeps state cards as accessible buttons and describes every state role', () => {
    const store = useEditorStore.getState()
    store.updatePresentationState('state_initial', {
      backgroundColor: '#123456',
    })

    render(<SceneStateStrip />)

    const list = screen.getByRole('list', { name: '当前场景状态列表' })
    const base = within(list).getByRole('button', {
      name: '基础场景，所有命名状态的继承源',
    })
    const initial = within(list).getByRole('button', {
      name: '初始，命名状态，运行初始状态，场景缩略图状态，1 项覆盖',
    })

    expect(base).toHaveAttribute('aria-pressed', 'true')
    expect(initial).toHaveAttribute('aria-pressed', 'false')
    expect(within(initial).getByTitle('运行初始状态')).toHaveTextContent('初始')
    expect(within(initial).getByTitle('场景缩略图状态')).toHaveTextContent(
      '缩略图',
    )

    fireEvent.click(initial)
    expect(useEditorStore.getState().activePresentationStateId).toBe(
      'state_initial',
    )
    expect(initial).toHaveAttribute('aria-pressed', 'true')
  })

  it('explains named-state override behavior for a multi-selection', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    store.addRectangleNode()
    const [text, shape] = selectActiveScene(useEditorStore.getState()).nodes
    store.setActivePresentationState('state_initial')
    store.updateNode(text!.id, { x: text!.x + 20 })
    store.selectNodes([text!.id, shape!.id])

    render(<PropertiesTab onReplaceImage={() => undefined} />)

    expect(screen.getByText('状态：初始 · 多选')).toBeInTheDocument()
    expect(screen.getByText(
      '1/2 个所选元素已有覆盖；批量修改只写入当前状态。',
    )).toBeInTheDocument()
  })

  it('edits playback initial visibility without changing stable canvas visibility', () => {
    const store = useEditorStore.getState()
    store.addRectangleNode()
    const nodeId = selectActiveScene(useEditorStore.getState()).nodes[0]!.id
    store.selectNode(nodeId)

    render(<PropertiesTab onReplaceImage={() => undefined} />)

    expect(screen.getByText('互动播放初始状态')).toBeInTheDocument()
    const playbackVisibility = screen.getByLabelText('播放开始时')
    expect(playbackVisibility).toHaveValue('inherit')
    fireEvent.change(playbackVisibility, { target: { value: 'hidden' } })

    const updated = selectActiveScene(useEditorStore.getState()).nodes[0]!
    expect(updated.playbackInitialVisibility).toBe('hidden')
    expect(updated.visible).toBe(true)
  })

  it('keeps video diagnostics scoped to the selected scene when legacy ids repeat', () => {
    const store = useEditorStore.getState()
    store.addScene()
    const [firstScene, secondScene] = useEditorStore.getState().project.scenes
    const sharedVideoId = 'legacy_shared_video'

    useEditorStore.setState((state) => ({
      ...state,
      project: {
        ...state.project,
        scenes: state.project.scenes.map((scene) => {
          if (scene.id === firstScene!.id) {
            return {
              ...scene,
              nodes: [videoNode(sharedVideoId, '第一场景视频')],
              interactions: [{
                id: 'legacy_click',
                name: '旧视频点击规则',
                enabled: true,
                trigger: { type: 'node.click', nodeId: sharedVideoId },
                conditions: [],
                actions: [{
                  id: 'legacy_click_step',
                  start: 'after-previous',
                  delayMs: 0,
                  action: { type: 'scene.next' },
                }],
              }],
            }
          }
          if (scene.id === secondScene!.id) {
            return {
              ...scene,
              nodes: [videoNode(sharedVideoId, '第二场景视频')],
              interactions: [],
            }
          }
          return scene
        }),
      },
      activeSceneId: secondScene!.id,
      activePresentationStateId: null,
      editingScope: 'scene',
      selectedNodeId: sharedVideoId,
      selectedNodeIds: [sharedVideoId],
    }))

    render(<PropertiesTab onReplaceImage={() => undefined} />)
    expect(screen.queryByText(/会覆盖该视频/)).not.toBeInTheDocument()

    act(() => {
      useEditorStore.getState().setActiveScene(firstScene!.id)
      useEditorStore.getState().selectNode(sharedVideoId)
    })
    expect(screen.getByText(/会覆盖该视频/)).toBeInTheDocument()
  })

  it('labels which authored state is used by each scene thumbnail', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      null as never,
    )
    const scene = selectActiveScene(useEditorStore.getState())

    render(<ScenePanel />)

    expect(screen.getByRole('button', {
      name: `打开场景“${scene.name}”；缩略图使用状态“初始”`,
    })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('缩略图 · 初始')).toBeInTheDocument()
  })
})
