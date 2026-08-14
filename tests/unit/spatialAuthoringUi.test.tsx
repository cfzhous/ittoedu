import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SpatialRelationsEditor,
  SpatialTeachingPathPanel,
} from '@/renderer/course/SpatialAuthoringPanels'
import {
  addCourseSurface,
  addSpatialCameraFrame,
  addSpatialRelation,
  addSpatialTextLayer,
  createCourseProject,
} from '@/renderer/course/courseStudioModel'
import type { SpatialSurfaceDocument } from '@/shared/courseProjectTypes'

afterEach(cleanup)

function spatialFixture({ relation = false } = {}) {
  let project = createCourseProject({ id: 'spatial-ui-test', now: '2026-08-14T00:00:00.000Z' })
  project = addCourseSurface(project, 'spatial-2d', { id: 'map-main', now: '2026-08-14T00:00:01.000Z' })
  project = addSpatialTextLayer(project, 'map-main', '原因', { id: 'node-a', x: 0, y: 0 })
  project = addSpatialTextLayer(project, 'map-main', '结果', { id: 'node-b', x: 400, y: 0 })
  project = addSpatialTextLayer(project, 'map-main', '证据', { id: 'node-c', x: 200, y: 240 })
  if (relation) {
    project = addSpatialRelation(project, 'map-main', {
      id: 'relation-a-b',
      sourceLayerItemId: 'node-a',
      targetLayerItemId: 'node-b',
      lineLayerItemId: 'line-a-b',
      labelLayerItemId: 'label-a-b',
      name: '导致',
    })
  }
  const surface = project.surfaces.find((candidate): candidate is SpatialSurfaceDocument => (
    candidate.id === 'map-main' && candidate.type === 'spatial-2d'
  ))
  if (!surface) throw new Error('missing space canvas')
  return { project, surface }
}

describe('space canvas teacher authoring panels', () => {
  it('connects exactly two selected canvas nodes with Chinese teacher-facing copy', () => {
    const { surface } = spatialFixture()
    const onCreate = vi.fn()
    const view = render(
      <SpatialRelationsEditor
        surface={surface}
        selectedLayerItemIds={['node-a', 'node-b']}
        disabled={false}
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onSelectVisual={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('已选：原因 → 结果')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('新关系文字'), { target: { value: '支持' } })
    fireEvent.click(screen.getByRole('button', { name: '连接当前两个节点' }))
    expect(onCreate).toHaveBeenCalledWith({
      sourceLayerItemId: 'node-a',
      targetLayerItemId: 'node-b',
      name: '支持',
    })
    expect(view.container.textContent).not.toContain('node-a')
    expect(view.container.textContent).not.toMatch(/Spatial|relations/iu)
  })

  it('edits endpoints and relation text, then selects ordinary line or text layers', () => {
    const { surface } = spatialFixture({ relation: true })
    const onUpdate = vi.fn()
    const onSelectVisual = vi.fn()
    const onDelete = vi.fn()
    render(
      <SpatialRelationsEditor
        surface={surface}
        selectedLayerItemIds={['line-a-b']}
        disabled={false}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
        onSelectVisual={onSelectVisual}
        onDelete={onDelete}
      />,
    )

    const card = screen.getByRole('article', { name: '连线 1' })
    expect(card.className).toContain('is-active')
    const name = screen.getByLabelText('连线 1 的关系文字')
    fireEvent.change(name, { target: { value: '证明' } })
    fireEvent.blur(name)
    expect(onUpdate).toHaveBeenCalledWith('relation-a-b', { name: '证明' })

    fireEvent.change(screen.getByLabelText('连线 1 的起点'), { target: { value: 'node-c' } })
    expect(onUpdate).toHaveBeenCalledWith('relation-a-b', { sourceLayerItemId: 'node-c' })
    fireEvent.click(screen.getByRole('button', { name: '选择连线' }))
    fireEvent.click(screen.getByRole('button', { name: '选择文字' }))
    expect(onSelectVisual).toHaveBeenNthCalledWith(1, 'line-a-b')
    expect(onSelectVisual).toHaveBeenNthCalledWith(2, 'label-a-b')
    fireEvent.click(screen.getByRole('button', { name: '删除关系' }))
    expect(onDelete).toHaveBeenCalledWith('relation-a-b')
  })

  it('manages the ordered teaching path without exposing implementation fields', () => {
    let { project, surface } = spatialFixture()
    project = addSpatialCameraFrame(project, surface.id, { x: 100, y: 80, zoom: 1.5 }, {
      id: 'detail-frame', name: '细节',
    })
    project = addSpatialCameraFrame(project, surface.id, { x: 420, y: 240, zoom: 2 }, {
      id: 'evidence-frame', name: '证据',
    })
    surface = project.surfaces.find((candidate): candidate is SpatialSurfaceDocument => (
      candidate.id === 'map-main' && candidate.type === 'spatial-2d'
    ))!
    const handlers = {
      onSetHome: vi.fn(),
      onGoHome: vi.fn(),
      onSaveFrame: vi.fn(),
      onRenameFrame: vi.fn(),
      onMoveFrame: vi.fn(),
      onDeleteFrame: vi.fn(),
      onLocateFrame: vi.fn(),
    }
    const view = render(
      <SpatialTeachingPathPanel
        surface={surface}
        camera={surface.camera.frames[1]!}
        disabled={false}
        {...handlers}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '回到首页' }))
    fireEvent.click(screen.getByRole('button', { name: '将当前画面设为首页' }))
    expect(handlers.onGoHome).toHaveBeenCalledOnce()
    expect(handlers.onSetHome).toHaveBeenCalledOnce()

    fireEvent.change(screen.getByLabelText('新镜头名称'), { target: { value: '课堂结论' } })
    fireEvent.click(screen.getByRole('button', { name: '保存当前镜头' }))
    expect(handlers.onSaveFrame).toHaveBeenCalledWith('课堂结论')

    const firstName = screen.getByLabelText('第 1 个镜头名称')
    fireEvent.change(firstName, { target: { value: '课程总览' } })
    fireEvent.blur(firstName)
    expect(handlers.onRenameFrame).toHaveBeenCalledWith(surface.camera.frames[0]!.id, '课程总览')

    const secondRow = screen.getByLabelText('第 2 个镜头名称').closest('li')
    if (!secondRow) throw new Error('missing second frame')
    fireEvent.click(within(secondRow).getByRole('button', { name: '定位' }))
    fireEvent.click(within(secondRow).getByRole('button', { name: '下移镜头“细节”' }))
    fireEvent.click(within(secondRow).getByRole('button', { name: '删除镜头“细节”' }))
    expect(handlers.onLocateFrame).toHaveBeenCalledWith(surface.camera.frames[1])
    expect(handlers.onMoveFrame).toHaveBeenCalledWith(surface.camera.frames[1]!.id, 2)
    expect(handlers.onDeleteFrame).toHaveBeenCalledWith(surface.camera.frames[1]!.id)
    expect(view.container.textContent).not.toMatch(/Spatial|cameraFrameId|relations/iu)
  })
})
