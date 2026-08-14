import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CourseStudioApp from '@/renderer/course/CourseStudioApp'
import {
  addCourseSurface,
  addFlowBlock,
  addSlideScene,
  addSpatialCameraFrame,
  createCourseProject,
  saveSlidePresentationState,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import { createCourseProjectArchiveAsync } from '@/renderer/project/courseProjectArchive'
import type { CourseProjectDocument } from '@/shared/courseProjectTypes'

vi.mock('@/renderer/export/loadPlayerBundle', () => ({
  loadPlayerBundle: () => 'mock player bundle',
}))

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'desktopAPI')
})

async function installOpenProject(project: CourseProjectDocument): Promise<void> {
  const bytes = await createCourseProjectArchiveAsync({
    project,
    assetFiles: {},
    componentFiles: {},
  })
  Object.defineProperty(window, 'desktopAPI', {
    configurable: true,
    value: {
      openProject: vi.fn(async () => ({ path: 'C:\\lesson\\start-location.h5lesson', bytes })),
      onRequestSave: vi.fn(() => () => undefined),
      onRequestSaveAndClose: vi.fn(() => () => undefined),
      setDirtyState: vi.fn(async () => undefined),
      updateCurrentCourseSelection: vi.fn(async () => undefined),
    } as unknown as NonNullable<Window['desktopAPI']>,
  })
}

describe('Course Studio V9 editor shell integration', () => {
  it('starts in the teacher-facing shell and exposes professional facts only on demand', () => {
    const view = render(<CourseStudioApp />)

    expect(screen.getByTestId('course-studio-v9')).toBeInTheDocument()
    expect(screen.getByTestId('v9-editor-shell')).toHaveAttribute('data-editor-mode', 'simple')
    expect(view.container.querySelectorAll('[data-toolbar-group]')).toHaveLength(4)
    expect(screen.getByRole('button', { name: '撤销（Ctrl+Z）' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重做（Ctrl+Y）' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '编辑当前帧' })).toHaveClass('is-active')
    expect(screen.queryByRole('tab', { name: '开发' })).not.toBeInTheDocument()
    expect(screen.queryByText(/旧版 V8|迁移 V8/u)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '专业' }))
    expect(screen.getByTestId('v9-editor-shell')).toHaveAttribute('data-editor-mode', 'professional')
    expect(screen.getByRole('tab', { name: '开发' })).toBeInTheDocument()
  })

  it('keeps supported creation actions in the element tab instead of the canvas toolbar', () => {
    render(<CourseStudioApp />)

    expect(screen.getByRole('button', { name: '添加文字' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加公式' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加图片' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加视频' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导入互动组件' })).toBeInTheDocument()
  })

  it('删除后可从元素面板恢复全课程教师控制器', async () => {
    const view = render(<CourseStudioApp />)
    expect(screen.getByRole('button', { name: '教师控制器已添加' })).toBeDisabled()
    fireEvent.click(screen.getByRole('tab', { name: '图层' }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: '删除“教师控制器”' }))
    await waitFor(() => expect(view.container.querySelector('.slide-native-teacher-controller')).toBeNull())

    fireEvent.click(screen.getByRole('tab', { name: '元素' }))
    fireEvent.click(screen.getByRole('button', { name: '添加教师控制器' }))
    await waitFor(() => expect(view.container.querySelector('.slide-native-teacher-controller')).not.toBeNull())
    fireEvent.click(screen.getByRole('tab', { name: '元素' }))
    expect(screen.getByRole('button', { name: '教师控制器已添加' })).toBeDisabled()
    confirm.mockRestore()
  })

  it('uses the native V9 interaction editor and records one undoable project revision', () => {
    const view = render(<CourseStudioApp />)
    fireEvent.click(screen.getByRole('tab', { name: '互动' }))

    expect(screen.getByRole('region', { name: '互动编排' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '课程声音' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导入声音' })).toBeInTheDocument()
    expect(screen.getByText('触发与动作')).toBeInTheDocument()
    expect(view.container.textContent).not.toContain('当前没有独立的触发器编排面板')
    fireEvent.click(screen.getByRole('button', { name: '添加：进入幻灯片场景时' }))

    expect(screen.getByRole('article', { name: '互动规则：进入幻灯片场景时' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '撤销（Ctrl+Z）' })).toBeEnabled()
    expect(view.container.textContent).not.toMatch(/scene\.enter|node\.enter|presentation\.set/u)
  })

  it('keeps structured course logic authoring available from Flow and Spatial surfaces', () => {
    const view = render(<CourseStudioApp />)

    fireEvent.click(screen.getByRole('button', { name: '+ 讲义' }))
    fireEvent.click(screen.getByRole('tab', { name: '互动' }))
    expect(screen.getByRole('region', { name: '课程变量' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '翻页条件' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '课程级互动' })).toBeInTheDocument()
    expect(view.container.textContent).not.toContain('请切换到对应幻灯片后编排')

    fireEvent.click(screen.getByRole('button', { name: '+ 空间' }))
    fireEvent.click(screen.getByRole('tab', { name: '互动' }))
    expect(screen.getByRole('region', { name: '课程级互动' })).toBeInTheDocument()
    expect(screen.getByText('语义缩放')).toBeInTheDocument()
  })

  it('records a course-logic edit as one undoable project history entry', async () => {
    render(<CourseStudioApp />)
    fireEvent.click(screen.getByRole('tab', { name: '互动' }))
    fireEvent.click(screen.getByRole('button', { name: '添加变量' }))

    await waitFor(() => expect(screen.getByRole('article', { name: '课程变量：课程变量1' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '撤销（Ctrl+Z）' }))
    await waitFor(() => expect(screen.queryByRole('article', { name: '课程变量：课程变量1' })).not.toBeInTheDocument())
  })

  it('撤销和重做其他修改时保留仍然有效的画布图层选择', async () => {
    const view = render(<CourseStudioApp />)
    fireEvent.click(screen.getByRole('button', { name: '添加文字' }))
    await waitFor(() => expect(
      view.container.querySelector('[data-course-transform-action="rotate"]'),
    ).not.toBeNull())

    fireEvent.click(screen.getByRole('tab', { name: '互动' }))
    fireEvent.click(screen.getByRole('button', { name: '添加：进入幻灯片场景时' }))
    fireEvent.click(screen.getByRole('button', { name: '撤销（Ctrl+Z）' }))
    await waitFor(() => expect(
      view.container.querySelector('[data-course-transform-action="rotate"]'),
    ).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: '重做（Ctrl+Y）' }))
    await waitFor(() => expect(
      view.container.querySelector('[data-course-transform-action="rotate"]'),
    ).not.toBeNull())
  })

  it('shows real scene thumbnails and routes layer clipboard shortcuts through V9 history', async () => {
    const view = render(<CourseStudioApp />)
    expect(screen.getByRole('img', { name: '场景 1缩略图' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '添加文字' }))
    await waitFor(() => expect(view.container.querySelectorAll('.slide-native-text')).toHaveLength(1))

    fireEvent.keyDown(window, { key: 'd', ctrlKey: true })
    await waitFor(() => expect(view.container.querySelectorAll('.slide-native-text')).toHaveLength(2))
    expect(screen.getByText(/已复制 1 个图层/u)).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })
    await waitFor(() => expect(view.container.querySelectorAll('.slide-native-text')).toHaveLength(3))

    fireEvent.keyDown(window, { key: 'x', ctrlKey: true })
    await waitFor(() => expect(view.container.querySelectorAll('.slide-native-text')).toHaveLength(2))
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })
    await waitFor(() => expect(view.container.querySelectorAll('.slide-native-text')).toHaveLength(3))

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.keyDown(window, { key: 'Delete' })
    await waitFor(() => expect(view.container.querySelectorAll('.slide-native-text')).toHaveLength(2))
    confirm.mockRestore()

    fireEvent.click(screen.getByRole('button', { name: /新建场景/u }))
    expect(screen.getAllByTestId('course-scene-thumbnail')).toHaveLength(2)
  })

  it('exposes real space-canvas relation and teaching-path authoring through V9 history', async () => {
    render(<CourseStudioApp />)
    fireEvent.click(screen.getByRole('button', { name: '+ 空间' }))

    expect(screen.getByRole('region', { name: '教学路径与镜头' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '定位' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '保存当前镜头' }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: '定位' })).toHaveLength(2))
    expect(screen.getByRole('button', { name: '撤销（Ctrl+Z）' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: '撤销（Ctrl+Z）' }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: '定位' })).toHaveLength(1))

    fireEvent.click(screen.getByRole('tab', { name: '属性' }))
    expect(screen.getByRole('region', { name: '关系与连线' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '连接当前两个节点' })).toBeDisabled()
    expect(screen.queryByText(/Spatial|relations/iu)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: '元素' }))
    fireEvent.click(screen.getByRole('button', { name: '添加文字' }))
    fireEvent.click(screen.getByRole('tab', { name: '元素' }))
    fireEvent.click(screen.getByRole('button', { name: '添加文字' }))
    fireEvent.click(screen.getByRole('tab', { name: '图层' }))
    const nodes = screen.getAllByRole('button', { name: '选择图层“双击编辑文字”' })
    expect(nodes).toHaveLength(2)
    fireEvent.click(nodes[0]!)
    await waitFor(() => expect(nodes[0]).toHaveAttribute('aria-pressed', 'true'))
    fireEvent.click(screen.getByRole('tab', { name: '图层' }))
    const refreshedNodes = screen.getAllByRole('button', { name: '选择图层“双击编辑文字”' })
    const otherNode = refreshedNodes.find((node) => node.getAttribute('aria-pressed') === 'false')
    if (!otherNode) throw new Error('missing unselected node')
    fireEvent.click(otherNode, { shiftKey: true })

    await waitFor(() => expect(screen.getByText('已选：双击编辑文字 → 双击编辑文字')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('新关系文字'), { target: { value: '因果' } })
    fireEvent.click(screen.getByRole('button', { name: '连接当前两个节点' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '选择连线' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: '选择文字' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '撤销（Ctrl+Z）' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '选择连线' })).not.toBeInTheDocument())
  })

  it('打开工程时以起始位置恢复幻灯片场景与命名复核画面', async () => {
    let project = createCourseProject({ id: 'open-slide', title: '起始画面课件' })
    const surface = project.surfaces[0]!
    project = addSlideScene(project, surface.id, { id: 'scene-review', name: '复核场景' })
    project = saveSlidePresentationState(project, surface.id, 'scene-review', {
      id: 'state-review',
      name: '互动后复核',
      layerItemOverrides: {},
    })
    project = updateCourseProject(project, (draft) => {
      draft.locations.push({
        id: 'location-review-state',
        label: '复核场景·互动后复核',
        kind: 'slide-scene',
        surfaceId: surface.id,
        sceneId: 'scene-review',
        stateId: 'state-review',
      })
      draft.startLocationId = 'location-review-state'
    })
    await installOpenProject(project)
    render(<CourseStudioApp />)

    fireEvent.click(screen.getByRole('button', { name: '打开课件' }))
    const root = await screen.findByTestId('course-studio-v9')
    await waitFor(() => {
      expect(root).toHaveAttribute('data-active-surface-id', surface.id)
      expect(root).toHaveAttribute('data-active-scene-id', 'scene-review')
      expect(root).toHaveAttribute('data-current-location-id', 'location-review-state')
    })
    fireEvent.click(screen.getByRole('tab', { name: '互动' }))
    expect(screen.getByRole('button', { name: '互动后复核' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(
      document.querySelector('.slide-surface'),
    ).toHaveAttribute('data-state-id', 'state-review'))
  })

  it('打开工程时以起始位置恢复精确的讲义内容块', async () => {
    let project = createCourseProject({ id: 'open-flow', title: '讲义起始位置' })
    project = addCourseSurface(project, 'flow', { id: 'flow-main', title: '教学讲义' })
    project = addFlowBlock(project, 'flow-main', {
      id: 'flow-start-block',
      type: 'paragraph',
      text: '从这一段开始',
    })
    project = updateCourseProject(project, (draft) => {
      draft.startLocationId = 'flow-start-block'
    })
    await installOpenProject(project)
    const view = render(<CourseStudioApp />)

    fireEvent.click(screen.getByRole('button', { name: '打开课件' }))
    const root = await screen.findByTestId('course-studio-v9')
    await waitFor(() => {
      expect(root).toHaveAttribute('data-active-surface-id', 'flow-main')
      expect(root).toHaveAttribute('data-current-location-id', 'flow-start-block')
      expect(view.container.querySelector('[data-flow-block-id="flow-start-block"]')).toHaveClass('is-selected')
    })
  })

  it('打开工程时以起始位置恢复空间镜头', async () => {
    let project = createCourseProject({ id: 'open-space', title: '空间起始位置' })
    project = addCourseSurface(project, 'spatial-2d', { id: 'space-main', title: '知识地图' })
    project = addSpatialCameraFrame(project, 'space-main', { x: 420, y: 240, zoom: 2 }, {
      id: 'camera-focus',
      name: '重点镜头',
    })
    project = updateCourseProject(project, (draft) => {
      draft.startLocationId = 'camera-focus'
    })
    await installOpenProject(project)
    const view = render(<CourseStudioApp />)

    fireEvent.click(screen.getByRole('button', { name: '打开课件' }))
    const root = await screen.findByTestId('course-studio-v9')
    await waitFor(() => {
      expect(root).toHaveAttribute('data-active-surface-id', 'space-main')
      expect(root).toHaveAttribute('data-current-location-id', 'camera-focus')
      expect(screen.getByLabelText('第 2 个镜头名称').closest('li')).toHaveClass('is-current')
      expect(view.container.querySelector('.course-center__tools')).toHaveTextContent('200%')
    })
  })

  it('撤销、重做与删除当前讲义块后会回收到同一讲义的合法位置', async () => {
    const view = render(<CourseStudioApp />)
    fireEvent.click(screen.getByRole('button', { name: '+ 讲义' }))
    const root = screen.getByTestId('course-studio-v9')
    const surfaceId = root.getAttribute('data-active-surface-id')
    fireEvent.click(screen.getByRole('button', { name: '添加正文' }))

    let selected = await waitFor(() => {
      const node = view.container.querySelector<HTMLElement>('.course-flow-card.is-selected')
      expect(node).not.toBeNull()
      return node!
    })
    const addedBlockId = selected.dataset.flowBlockId!
    expect(root).toHaveAttribute('data-current-location-id', addedBlockId)

    fireEvent.click(screen.getByRole('button', { name: '撤销（Ctrl+Z）' }))
    await waitFor(() => {
      expect(view.container.querySelector(`[data-flow-block-id="${addedBlockId}"]`)).toBeNull()
      selected = view.container.querySelector<HTMLElement>('.course-flow-card.is-selected')!
      expect(selected).not.toBeNull()
      expect(root).toHaveAttribute('data-active-surface-id', surfaceId)
      expect(root).toHaveAttribute('data-current-location-id', selected.dataset.flowBlockId)
    })

    fireEvent.click(screen.getByRole('button', { name: '重做（Ctrl+Y）' }))
    const restored = await waitFor(() => {
      const node = view.container.querySelector<HTMLElement>(`[data-flow-block-id="${addedBlockId}"]`)
      expect(node).not.toBeNull()
      return node!
    })
    fireEvent.pointerDown(restored)
    await waitFor(() => expect(root).toHaveAttribute('data-current-location-id', addedBlockId))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => {
      expect(view.container.querySelector(`[data-flow-block-id="${addedBlockId}"]`)).toBeNull()
      const fallback = view.container.querySelector<HTMLElement>('.course-flow-card.is-selected')
      expect(fallback).not.toBeNull()
      expect(root).toHaveAttribute('data-active-surface-id', surfaceId)
      expect(root).toHaveAttribute('data-current-location-id', fallback!.dataset.flowBlockId)
    })
    confirm.mockRestore()
  })

  it('删除当前空间镜头后会在同一空间中选中剩余合法镜头', async () => {
    render(<CourseStudioApp />)
    fireEvent.click(screen.getByRole('button', { name: '+ 空间' }))
    fireEvent.click(screen.getByRole('button', { name: '保存当前镜头' }))
    const root = screen.getByTestId('course-studio-v9')
    const surfaceId = root.getAttribute('data-active-surface-id')
    const deletedLocationId = root.getAttribute('data-current-location-id')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    fireEvent.click(screen.getByRole('button', { name: '删除镜头“总览”' }))
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: '定位' })).toHaveLength(1)
      expect(root).toHaveAttribute('data-active-surface-id', surfaceId)
      expect(root.getAttribute('data-current-location-id')).not.toBe(deletedLocationId)
      expect(screen.getByLabelText('第 1 个镜头名称').closest('li')).toHaveClass('is-current')
    })
    confirm.mockRestore()
  })

  it('试运行时禁用课程与幻灯片结构写操作', async () => {
    render(<CourseStudioApp />)
    fireEvent.click(screen.getByRole('button', { name: '+ 新建场景' }))
    expect(screen.getAllByTestId('course-scene-thumbnail')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '试运行' }))

    expect(screen.getByLabelText('课程标题')).toBeDisabled()
    expect(screen.getByRole('button', { name: '+ 幻灯片' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '+ 讲义' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '+ 空间' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '+ 新建场景' })).toBeDisabled()
    screen.getAllByRole('button', { name: /复制场景/u }).forEach((button) => expect(button).toBeDisabled())
    screen.getAllByRole('button', { name: /上移场景|下移场景|删除场景/u }).forEach((button) => expect(button).toBeDisabled())
    expect(screen.getByRole('button', { name: '撤销（Ctrl+Z）' })).toBeDisabled()

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(screen.getAllByTestId('course-scene-thumbnail')).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }))
    expect(screen.getByRole('menuitem', { name: '应用 AI 修改' })).toBeDisabled()
  })
})
