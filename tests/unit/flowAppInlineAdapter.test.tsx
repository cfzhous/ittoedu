// @vitest-environment jsdom

// I1 窄集成 smoke（FLOW C1/C2 INTEGRATION_REQUEST 的正式 App adapter 覆盖断言）：
// FlowWorkspace 一次就地文本回调，经真实 App adapter（Workspace.tsx 透传 +
// App.tsx v9FlowAuthoring 接线）恰好映射为一次 Store 命令 -> 一次 history/revision。
// 同时验证右栏 FlowPropertiesTab 在就地编辑可达时开启 inlineTextEditing，
// 但复杂属性入口（标题级别）仍保留。
// 这是 I1 允许的唯一一份跨 lane smoke 单测文件；不新增功能、不重写 lane 实现。

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addCourseSurface,
  createCourseProject,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import { useEditorStore } from '@/renderer/store/editorStore'

vi.mock('@/renderer/phaser/createEditorGame', () => ({
  createEditorGame: vi.fn(),
}))

vi.mock('@/renderer/export/loadPlayerBundle', () => ({
  loadPlayerBundle: () => '',
}))

// App imports renderProjectSceneImagesWithRuntime, whose module graph reaches
// PlayerApp -> phaser; phaser fails at module init inside jsdom, so the player
// app shell is stubbed (this test never invokes it).
vi.mock('@/player/PlayerApp', () => ({
  PlayerApp: class {},
}))

import App from '@/renderer/App'

const NOW = '2026-08-16T00:00:00.000Z'
const FLOW_SURFACE_ID = 'flow-surface-smoke'

function loadFlowOnlyCourse(): void {
  const base = createCourseProject({ title: '就地编辑接线', now: NOW })
  let project = addCourseSurface(base, 'flow', {
    id: FLOW_SURFACE_ID,
    title: '讲义',
    now: NOW,
  })
  const location = project.locations.find(
    (candidate) => candidate.kind === 'flow-block' && candidate.surfaceId === FLOW_SURFACE_ID,
  )
  if (!location || location.kind !== 'flow-block') throw new Error('expected flow location')
  project = updateCourseProject(project, (draft) => {
    const flow = draft.surfaces.find((candidate) => candidate.id === FLOW_SURFACE_ID)
    if (!flow || flow.type !== 'flow') throw new Error('expected flow surface')
    flow.blocks = [
      { id: 'block-h1', type: 'heading', level: 1, text: '第一章 开始' },
      { id: 'block-paragraph', type: 'paragraph', text: '正文段落' },
    ]
    const flowLocation = draft.locations.find(
      (candidate) => candidate.id === location.id,
    )
    if (!flowLocation || flowLocation.kind !== 'flow-block') {
      throw new Error('expected flow location')
    }
    flowLocation.blockId = 'block-h1'
    flowLocation.label = '讲义'
    draft.startLocationId = flowLocation.id
  }, NOW)
  useEditorStore.getState().loadCourseProject(
    { project, assetFiles: {}, componentFiles: {} },
    null,
  )
}

afterEach(() => {
  cleanup()
})

describe('I1 Flow App adapter single-commit contract', () => {
  beforeEach(() => {
    loadFlowOnlyCourse()
  })

  it('maps one in-place text commit to exactly one Store command / history / revision', () => {
    render(<App />)

    const heading = document.querySelector('[data-flow-block-id="block-h1"]')
    expect(heading).not.toBeNull()

    const before = useEditorStore.getState().courseSession
    if (before === null) throw new Error('expected a loaded V9 course session')
    const pastBefore = before.history.past.length
    const revisionBefore = before.history.present.revision

    fireEvent.doubleClick(heading!)
    const editor = document.querySelector('[data-flow-inline-editor]')
    expect(editor).not.toBeNull()
    fireEvent.change(editor!, { target: { value: '第一章 已完成' } })
    fireEvent.blur(editor!)

    const after = useEditorStore.getState().courseSession
    if (after === null) throw new Error('expected a loaded V9 course session')
    // Exactly one Store commit: one new past entry whose project is exactly the
    // pre-edit project, zero future, and exactly one revision increment.
    expect(after.history.past.length).toBe(pastBefore + 1)
    expect(after.history.past.at(-1)).toBe(before.history.present)
    expect(after.history.future.length).toBe(0)
    expect(after.history.present.revision).toBe(revisionBefore + 1)

    const flow = after.history.present.surfaces.find(
      (surface) => surface.id === FLOW_SURFACE_ID,
    )
    if (!flow || flow.type !== 'flow') throw new Error('expected flow surface')
    const block = flow.blocks.find((candidate) => candidate.id === 'block-h1')
    expect(block).toBeDefined()
    expect(block?.type === 'heading' ? block.text : null).toBe('第一章 已完成')
    // The in-place editor is gone after commit.
    expect(document.querySelector('[data-flow-inline-editor]')).toBeNull()
  })

  it('enables FlowPropertiesTab inlineTextEditing while Flow in-place editing is reachable and keeps complex entries', () => {
    render(<App />)
    act(() => {
      useEditorStore.getState().setActiveTab('properties')
    })

    // Body text becomes a light in-place hint...
    expect(screen.getByTestId('flow-inline-text-editing-hint')).toBeInTheDocument()
    // ...while the heading level entry stays available.
    expect(screen.getByTestId('flow-editor-heading')).toBeInTheDocument()
    expect(screen.getByLabelText('标题级别')).toBeInTheDocument()
    expect(screen.queryByLabelText('标题文本')).not.toBeInTheDocument()
  })
})
