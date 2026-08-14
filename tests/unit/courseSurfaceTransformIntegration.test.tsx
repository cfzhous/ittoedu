import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fitFlowLogicalOverlayScale,
  FlowCourseCanvas,
  SlideCourseCanvas,
  SpatialCourseCanvas,
} from '@/renderer/course/CourseSurfaceCanvas'
import type {
  FlowSurfaceDocument,
  NativeLayerItem,
  RuntimeLayerItem,
  SlideSurfaceDocument,
  SpatialSurfaceDocument,
} from '@/shared/courseProjectTypes'

afterEach(cleanup)

type NativeTextLayerItem = NativeLayerItem & {
  content: Extract<NativeLayerItem['content'], { nativeType: 'text' }>
}

function textItem(id = 'text-one', locked = false): NativeTextLayerItem {
  return {
    layerItemId: id,
    label: '可编辑文字',
    kind: 'native',
    frame: { mode: 'absolute', x: 10, y: 20, width: 100, height: 50 },
    order: 10,
    visible: true,
    locked,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    content: {
      nativeType: 'text',
      data: {
        text: '初始文字',
        runs: [],
        style: {
          fontFamily: 'sans-serif',
          fontSize: 24,
          color: '#172033',
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          emphasis: false,
          highlightColor: null,
          align: 'left',
          verticalAlign: 'top',
          writingMode: 'horizontal',
          lineSpacing: 1.3,
          letterSpacing: 0,
          padding: 4,
          overflow: 'fixed',
          backgroundColor: '#ffffff',
          backgroundOpacity: 0,
          cornerRadius: 0,
        },
      },
    },
  }
}

function runtimeItem(): RuntimeLayerItem {
  return {
    layerItemId: 'runtime-one',
    label: '互动运行时',
    kind: 'runtime',
    frame: { mode: 'absolute', x: 30, y: 40, width: 260, height: 140 },
    order: 20,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    runtime: {
      protocol: 'surface-v1',
      runtimeApiVersion: 3,
      enabled: true,
      renderMode: 'dom',
      source: 'CoursewareSurfaceRuntime.define({runtimeApiVersion:3,create(){return {destroy(){}}}})',
      content: { values: {} },
      assets: {},
    },
  }
}

function imageItem(): NativeLayerItem {
  const base = textItem('image-one')
  return {
    ...base,
    label: '可替换图片',
    content: {
      nativeType: 'image',
      data: {
        assetId: 'image-asset',
        preserveAspectRatio: true,
        fit: 'contain',
        crop: { left: 0, top: 0, right: 0, bottom: 0 },
        cropX: 0.5,
        cropY: 0.5,
        flipX: false,
        flipY: false,
        cornerRadius: 0,
        feather: { amount: 0, mode: 'rectangle' },
        safeAreas: [],
      },
    },
  }
}

function slideSurface(item: NativeLayerItem | RuntimeLayerItem): SlideSurfaceDocument {
  return slideSurfaceWithItems([item])
}

function slideSurfaceWithItems(items: Array<NativeLayerItem | RuntimeLayerItem>): SlideSurfaceDocument {
  return {
    id: 'slide-transform',
    type: 'slide',
    title: '幻灯片',
    canvas: { width: 1280, height: 720 },
    surfaceLayerItems: [],
    scenes: [{
      id: 'scene-one',
      name: '场景一',
      backgroundColor: '#ffffff',
      layerItems: items,
      interactions: [],
    }],
  }
}

function spatialSurface(item: NativeLayerItem | RuntimeLayerItem): SpatialSurfaceDocument {
  return {
    id: 'spatial-transform',
    type: 'spatial-2d',
    title: '空间画布',
    surfaceLayerItems: [],
    world: { bounds: { mode: 'infinite' }, layerItems: [item] },
    camera: { home: { x: 0, y: 0, zoom: 2 }, frames: [] },
    relations: [],
    semanticZoom: [],
  }
}

describe('Course surface transform integration', () => {
  it('previews and commits a Slide transform in the 1280x720 logical coordinate system', async () => {
    const item = textItem()
    const surface = slideSurface(item)
    const onPreview = vi.fn()
    const onCommit = vi.fn()
    const view = render(
      <SlideCourseCanvas
        surface={surface}
        sceneId="scene-one"
        mode="inspect"
        selectedLayerItemId={item.layerItemId}
        selectedLayerItems={[{ item, source: 'scene' }]}
        resolveAsset={() => undefined}
        onLayerHit={() => undefined}
        onLayerTransformPreview={onPreview}
        onLayerTransformCommit={onCommit}
        onError={() => undefined}
      />,
    )
    await waitFor(() => expect(view.container.querySelector('.slide-layer-item')).not.toBeNull())
    const overlay = screen.getByTestId('course-transform-overlay')
    fireEvent.pointerDown(screen.getByLabelText('拖动选择'), {
      button: 0, pointerId: 1, clientX: 0, clientY: 0,
    })
    fireEvent.pointerMove(overlay, {
      pointerId: 1, clientX: 80, clientY: 40, altKey: true,
    })
    await waitFor(() => {
      expect(view.container.querySelector<HTMLElement>('.slide-layer-item')?.style.left).toBe('110px')
    })
    fireEvent.pointerUp(overlay, {
      pointerId: 1, clientX: 80, clientY: 40, altKey: true,
    })
    expect(onPreview).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit.mock.calls[0][0]).toMatchObject({
      kind: 'move',
      delta: { x: 100, y: 50 },
      items: [{ layerItemId: item.layerItemId, frame: { x: 110, y: 70 } }],
      snappingDisabled: true,
    })
  })

  it('zooms Slide between 50% and 200%, restores fit, and pans without changing Project', () => {
    const item = textItem()
    const onCommit = vi.fn()
    render(
      <SlideCourseCanvas
        surface={slideSurface(item)}
        sceneId="scene-one"
        mode="inspect"
        selectedLayerItemId={item.layerItemId}
        selectedLayerItems={[{ item, source: 'scene' }]}
        resolveAsset={() => undefined}
        onLayerHit={() => undefined}
        onLayerTransformCommit={onCommit}
        onError={() => undefined}
      />,
    )
    const viewport = screen.getByTestId('course-slide-scroll-viewport')
    const scale = screen.getByLabelText('画布缩放比例')
    expect(scale).toHaveTextContent('80%')
    fireEvent.click(screen.getByRole('button', { name: '放大画布' }))
    expect(scale).toHaveTextContent('90%')
    for (let index = 0; index < 20; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: '放大画布' }))
    }
    expect(scale).toHaveTextContent('200%')
    expect(screen.getByRole('button', { name: '放大画布' })).toBeDisabled()
    for (let index = 0; index < 20; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: '缩小画布' }))
    }
    expect(scale).toHaveTextContent('50%')
    expect(screen.getByRole('button', { name: '缩小画布' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '适合窗口' }))
    expect(scale).toHaveTextContent('80%')

    viewport.scrollLeft = 100
    viewport.scrollTop = 80
    fireEvent.pointerDown(viewport, {
      button: 1, pointerId: 41, clientX: 100, clientY: 100,
    })
    fireEvent.pointerMove(viewport, { pointerId: 41, clientX: 130, clientY: 120 })
    fireEvent.pointerUp(viewport, { pointerId: 41, clientX: 130, clientY: 120 })
    expect(viewport.scrollLeft).toBe(70)
    expect(viewport.scrollTop).toBe(60)

    viewport.focus()
    fireEvent.keyDown(window, { key: ' ', code: 'Space' })
    fireEvent.pointerDown(viewport, {
      button: 0, pointerId: 42, clientX: 100, clientY: 100,
    })
    fireEvent.pointerMove(viewport, { pointerId: 42, clientX: 80, clientY: 90 })
    fireEvent.pointerUp(viewport, { pointerId: 42, clientX: 80, clientY: 90 })
    fireEvent.keyUp(window, { key: ' ', code: 'Space' })
    expect(viewport.scrollLeft).toBe(90)
    expect(viewport.scrollTop).toBe(70)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('snaps Slide movement to the canvas center, shows guides, and commits once', () => {
    const item = textItem()
    item.frame = { mode: 'absolute', x: 580, y: 96, width: 100, height: 50 }
    const onCommit = vi.fn()
    render(
      <SlideCourseCanvas
        surface={slideSurface(item)}
        sceneId="scene-one"
        mode="inspect"
        selectedLayerItemId={item.layerItemId}
        selectedLayerItems={[{ item, source: 'scene' }]}
        resolveAsset={() => undefined}
        onLayerHit={() => undefined}
        onLayerTransformCommit={onCommit}
        onError={() => undefined}
      />,
    )
    const overlay = screen.getByTestId('course-transform-overlay')
    fireEvent.pointerDown(screen.getByLabelText('拖动选择'), {
      button: 0, pointerId: 51, clientX: 0, clientY: 0,
    })
    fireEvent.pointerMove(overlay, { pointerId: 51, clientX: 5.6, clientY: 0 })
    expect(document.querySelector('[data-course-snap-guide="x:canvas-center"]')).toBeInTheDocument()
    fireEvent.pointerUp(overlay, { pointerId: 51, clientX: 5.6, clientY: 0 })
    expect(onCommit).toHaveBeenCalledOnce()
    expect(onCommit.mock.calls[0][0]).toMatchObject({
      kind: 'move',
      snappingDisabled: false,
      items: [{ layerItemId: item.layerItemId, frame: { x: 590, y: 96 } }],
    })
    expect(onCommit.mock.calls[0][0].delta.x).toBeCloseTo(7)
    expect(onCommit.mock.calls[0][0].delta.y).toBe(0)
    expect(document.querySelector('[data-course-snap-guide]')).not.toBeInTheDocument()
  })

  it('temporarily disables Slide snapping while Alt is held', () => {
    const item = textItem()
    item.frame = { mode: 'absolute', x: 580, y: 96, width: 100, height: 50 }
    const onCommit = vi.fn()
    render(
      <SlideCourseCanvas
        surface={slideSurface(item)}
        sceneId="scene-one"
        mode="inspect"
        selectedLayerItemId={item.layerItemId}
        selectedLayerItems={[{ item, source: 'scene' }]}
        resolveAsset={() => undefined}
        onLayerHit={() => undefined}
        onLayerTransformCommit={onCommit}
        onError={() => undefined}
      />,
    )
    const overlay = screen.getByTestId('course-transform-overlay')
    fireEvent.pointerDown(screen.getByLabelText('拖动选择'), {
      button: 0, pointerId: 52, clientX: 0, clientY: 0,
    })
    fireEvent.pointerMove(overlay, {
      pointerId: 52, clientX: 5.6, clientY: 0, altKey: true,
    })
    expect(document.querySelector('[data-course-snap-guide]')).not.toBeInTheDocument()
    fireEvent.pointerUp(overlay, {
      pointerId: 52, clientX: 5.6, clientY: 0, altKey: true,
    })
    expect(onCommit).toHaveBeenCalledOnce()
    expect(onCommit.mock.calls[0][0].snappingDisabled).toBe(true)
    expect(onCommit.mock.calls[0][0].items[0].frame.x).toBeCloseTo(587)
  })

  it('marquee-selects visible locked Slide layers, clears on blank click, and shows the box', async () => {
    const locked = textItem('locked-visible', true)
    const hidden = textItem('hidden-layer')
    hidden.frame = { mode: 'absolute', x: 40, y: 30, width: 80, height: 40 }
    hidden.visible = false
    const outside = textItem('outside-layer')
    outside.frame = { mode: 'absolute', x: 400, y: 300, width: 100, height: 50 }
    const onSelectionChange = vi.fn()
    const view = render(
      <SlideCourseCanvas
        surface={slideSurfaceWithItems([locked, hidden, outside])}
        sceneId="scene-one"
        mode="inspect"
        selectedLayerItemId={null}
        selectedLayerItems={[]}
        resolveAsset={() => undefined}
        onLayerHit={() => undefined}
        onLayerSelectionChange={onSelectionChange}
        onError={() => undefined}
      />,
    )
    await waitFor(() => expect(view.container.querySelector('.slide-surface')).not.toBeNull())
    const surface = view.container.querySelector<HTMLElement>('.slide-surface')!
    const viewport = screen.getByTestId('course-slide-scroll-viewport')
    fireEvent.pointerDown(surface, {
      button: 0, pointerId: 61, clientX: 0, clientY: 0,
    })
    fireEvent.pointerMove(viewport, { pointerId: 61, clientX: 120, clientY: 80 })
    const marquee = document.querySelector<HTMLElement>('[data-course-canvas-marquee="slide"]')
    expect(marquee).toBeInTheDocument()
    expect(marquee?.style.width).toBe('150px')
    expect(marquee?.style.height).toBe('100px')
    fireEvent.pointerUp(viewport, { pointerId: 61, clientX: 120, clientY: 80 })
    expect(onSelectionChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        source: 'scene',
        item: expect.objectContaining({ layerItemId: locked.layerItemId, locked: true }),
      }),
    ], locked.layerItemId)
    expect(document.querySelector('[data-course-canvas-marquee]')).not.toBeInTheDocument()

    fireEvent.pointerDown(surface, {
      button: 0, pointerId: 62, clientX: 300, clientY: 100,
    })
    fireEvent.pointerUp(viewport, { pointerId: 62, clientX: 300, clientY: 100 })
    expect(onSelectionChange).toHaveBeenLastCalledWith([], undefined)
  })

  it('adds and removes Slide layers with Shift click without consuming the host hit', async () => {
    const first = textItem('shift-first')
    const second = textItem('shift-second')
    second.frame = { mode: 'absolute', x: 220, y: 120, width: 100, height: 50 }
    const onSelectionChange = vi.fn()
    const onLayerHit = vi.fn()
    const view = render(
      <SlideCourseCanvas
        surface={slideSurfaceWithItems([first, second])}
        sceneId="scene-one"
        mode="inspect"
        selectedLayerItemId={first.layerItemId}
        selectedLayerItems={[{ item: first, source: 'scene' }]}
        resolveAsset={() => undefined}
        onLayerHit={onLayerHit}
        onLayerSelectionChange={onSelectionChange}
        onLayerTransformCommit={() => undefined}
        onError={() => undefined}
      />,
    )
    await waitFor(() => expect(view.container.querySelectorAll('.slide-layer-item')).toHaveLength(2))
    const secondLayer = [...view.container.querySelectorAll<HTMLElement>('.slide-layer-item')]
      .find((element) => element.dataset.layerItemId === second.layerItemId)!
    fireEvent.pointerDown(secondLayer, {
      button: 0, pointerId: 63, clientX: 230, clientY: 130, shiftKey: true,
    })
    expect(onSelectionChange).toHaveBeenCalledWith([
      expect.objectContaining({ item: expect.objectContaining({ layerItemId: first.layerItemId }) }),
      expect.objectContaining({ item: expect.objectContaining({ layerItemId: second.layerItemId }) }),
    ], second.layerItemId)
    expect(onLayerHit).toHaveBeenCalledWith(expect.objectContaining({
      layerItemId: second.layerItemId,
    }))

    onSelectionChange.mockClear()
    const slide = view.container.querySelector<HTMLElement>('.slide-surface')!
    const viewport = screen.getByTestId('course-slide-scroll-viewport')
    fireEvent.pointerDown(slide, {
      button: 0, pointerId: 64, clientX: 0, clientY: 0, shiftKey: true,
    })
    fireEvent.pointerMove(viewport, {
      pointerId: 64, clientX: 280, clientY: 180, shiftKey: true,
    })
    fireEvent.pointerUp(viewport, {
      pointerId: 64, clientX: 280, clientY: 180, shiftKey: true,
    })
    // The initial first item is removed; the second hit is added.
    expect(onSelectionChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ item: expect.objectContaining({ layerItemId: second.layerItemId }) }),
    ], second.layerItemId)

    view.rerender(
      <SlideCourseCanvas
        surface={slideSurfaceWithItems([first, second])}
        sceneId="scene-one"
        mode="inspect"
        selectedLayerItemId={second.layerItemId}
        selectedLayerItems={[
          { item: first, source: 'scene' },
          { item: second, source: 'scene' },
        ]}
        resolveAsset={() => undefined}
        onLayerHit={onLayerHit}
        onLayerSelectionChange={onSelectionChange}
        onLayerTransformCommit={() => undefined}
        onError={() => undefined}
      />,
    )
    onSelectionChange.mockClear()
    fireEvent.pointerDown(screen.getByLabelText('拖动选择'), {
      button: 0, pointerId: 65, clientX: 16, clientY: 24, shiftKey: true,
    })
    expect(onSelectionChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ item: expect.objectContaining({ layerItemId: second.layerItemId }) }),
    ], second.layerItemId)
  })

  it('marquee-selects only Flow floating layers and leaves semantic blocks alone', () => {
    const floating = textItem('flow-marquee-layer', true)
    floating.frame = { mode: 'absolute', x: 20, y: 30, width: 100, height: 60 }
    const onSelectionChange = vi.fn()
    const onBlockSelect = vi.fn()
    const surface: FlowSurfaceDocument = {
      id: 'flow-marquee',
      type: 'flow',
      title: '流式框选',
      surfaceLayerItems: [{ item: floating, visibility: { mode: 'all', locationIds: [] } }],
      layout: { readingWidth: 760, wideContentWidth: 1000 },
      blocks: [{ id: 'paragraph-one', type: 'paragraph', text: '语义正文' }],
    }
    const view = render(
      <FlowCourseCanvas
        surface={surface}
        mode="inspect"
        selectedBlockId={null}
        selectedLayerItemId={null}
        selectedLayerItems={[]}
        search=""
        resolveAsset={() => undefined}
        onSelect={onBlockSelect}
        onEdit={() => undefined}
        onLayerSelectionChange={onSelectionChange}
      />,
    )
    const stage = view.container.querySelector<HTMLElement>('.course-flow-stage')!
    fireEvent.pointerDown(stage, {
      button: 0, pointerId: 71, clientX: 0, clientY: 0,
    })
    fireEvent.pointerMove(stage, { pointerId: 71, clientX: 150, clientY: 120 })
    expect(document.querySelector('[data-course-canvas-marquee="flow"]')).toBeInTheDocument()
    fireEvent.pointerUp(stage, { pointerId: 71, clientX: 150, clientY: 120 })
    expect(onSelectionChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        source: 'surface',
        item: expect.objectContaining({ layerItemId: floating.layerItemId, locked: true }),
      }),
    ], floating.layerItemId)

    onSelectionChange.mockClear()
    const semantic = view.container.querySelector<HTMLElement>('[data-flow-block-id="paragraph-one"]')!
    fireEvent.pointerDown(semantic, {
      button: 0, pointerId: 72, clientX: 0, clientY: 0,
    })
    fireEvent.pointerUp(semantic, { pointerId: 72, clientX: 150, clientY: 120 })
    expect(onBlockSelect).toHaveBeenCalledWith('paragraph-one')
    expect(onSelectionChange).not.toHaveBeenCalled()
  })

  it('converts a Spatial marquee through camera zoom without panning the Project view', () => {
    const worldItem = textItem('spatial-marquee-layer', true)
    const spatial = spatialSurface(worldItem)
    const onSelectionChange = vi.fn()
    const onCameraChange = vi.fn()
    const view = render(
      <SpatialCourseCanvas
        surface={spatial}
        mode="inspect"
        camera={spatial.camera.home}
        selectedLayerItemId={null}
        selectedLayerItems={[]}
        resolveAsset={() => undefined}
        onCameraChange={onCameraChange}
        onSelect={() => undefined}
        onMove={() => undefined}
        onLayerSelectionChange={onSelectionChange}
      />,
    )
    const stage = view.container.querySelector<HTMLElement>('.course-spatial-stage')!
    const viewport = screen.getByTestId('course-spatial-canvas')
    fireEvent.pointerDown(stage, {
      button: 0, pointerId: 81, clientX: 510, clientY: 350,
    })
    fireEvent.pointerMove(viewport, { pointerId: 81, clientX: 730, clientY: 470 })
    const marquee = document.querySelector<HTMLElement>('[data-course-canvas-marquee="spatial"]')
    expect(marquee).toBeInTheDocument()
    expect(marquee?.style.left).toBe('-25px')
    expect(marquee?.style.top).toBe('-15px')
    expect(marquee?.style.width).toBe('110px')
    expect(marquee?.style.height).toBe('60px')
    fireEvent.pointerUp(viewport, { pointerId: 81, clientX: 730, clientY: 470 })
    expect(onSelectionChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        source: 'world',
        item: expect.objectContaining({ layerItemId: worldItem.layerItemId, locked: true }),
      }),
    ], worldItem.layerItemId)
    expect(onCameraChange).not.toHaveBeenCalled()
  })

  it('pans the Spatial camera in edit mode with middle drag or Space plus left drag', () => {
    const worldItem = textItem('spatial-pan-layer')
    const spatial = spatialSurface(worldItem)
    const onCameraChange = vi.fn()
    render(
      <SpatialCourseCanvas
        surface={spatial}
        mode="inspect"
        camera={spatial.camera.home}
        selectedLayerItemId={null}
        selectedLayerItems={[]}
        resolveAsset={() => undefined}
        onCameraChange={onCameraChange}
        onSelect={() => undefined}
        onMove={() => undefined}
        onLayerSelectionChange={() => undefined}
      />,
    )
    const viewport = screen.getByTestId('course-spatial-canvas')
    const stage = document.querySelector<HTMLElement>('.course-spatial-stage')!
    expect(stage).toHaveAttribute('data-logical-viewport', '1120x760')
    expect(stage.style.width).toBe('1120px')
    expect(stage.style.height).toBe('760px')

    fireEvent.pointerDown(viewport, {
      button: 1, pointerId: 91, clientX: 200, clientY: 180,
    })
    fireEvent.pointerMove(viewport, { pointerId: 91, clientX: 240, clientY: 200 })
    fireEvent.pointerUp(viewport, { pointerId: 91, clientX: 240, clientY: 200 })
    expect(onCameraChange).toHaveBeenLastCalledWith({ x: -20, y: -10, zoom: 2 })

    onCameraChange.mockClear()
    fireEvent.pointerDown(viewport, {
      button: 0, pointerId: 90, clientX: 20, clientY: 20,
    })
    fireEvent.pointerUp(viewport, { pointerId: 90, clientX: 20, clientY: 20 })
    expect(viewport).toHaveFocus()
    fireEvent.keyDown(viewport, { code: 'Space', key: ' ' })
    fireEvent.pointerDown(viewport, {
      button: 0, pointerId: 92, clientX: 300, clientY: 260,
    })
    fireEvent.pointerMove(viewport, { pointerId: 92, clientX: 320, clientY: 300 })
    fireEvent.pointerUp(viewport, { pointerId: 92, clientX: 320, clientY: 300 })
    fireEvent.keyUp(viewport, { code: 'Space', key: ' ' })
    expect(onCameraChange).toHaveBeenLastCalledWith({ x: -10, y: -20, zoom: 2 })
  })

  it('leaves Space available for a focused interactive control inside Spatial', () => {
    const spatial = spatialSurface(textItem('spatial-control-layer'))
    const onCameraChange = vi.fn()
    render(
      <SpatialCourseCanvas
        surface={spatial}
        mode="inspect"
        camera={spatial.camera.home}
        selectedLayerItemId={null}
        selectedLayerItems={[]}
        resolveAsset={() => undefined}
        onCameraChange={onCameraChange}
        onSelect={() => undefined}
        onMove={() => undefined}
        onLayerSelectionChange={() => undefined}
      />,
    )
    const viewport = screen.getByTestId('course-spatial-canvas')
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = '可交互按钮'
    viewport.appendChild(button)
    button.focus()

    const keyDown = new KeyboardEvent('keydown', {
      key: ' ', code: 'Space', bubbles: true, cancelable: true,
    })
    button.dispatchEvent(keyDown)
    expect(keyDown.defaultPrevented).toBe(false)
    fireEvent.pointerDown(button, { button: 0, pointerId: 93, clientX: 50, clientY: 50 })
    fireEvent.pointerMove(viewport, { pointerId: 93, clientX: 90, clientY: 90 })
    fireEvent.pointerUp(viewport, { pointerId: 93, clientX: 90, clientY: 90 })
    expect(onCameraChange).not.toHaveBeenCalled()
  })

  it('keeps a selected Runtime interior hit-testable while retaining edge movement controls', () => {
    const item = runtimeItem()
    render(
      <SlideCourseCanvas
        surface={slideSurface(item)}
        sceneId="scene-one"
        mode="inspect"
        selectedLayerItemId={item.layerItemId}
        selectedLayerItems={[{ item, source: 'scene' }]}
        resolveAsset={() => undefined}
        onLayerHit={() => undefined}
        onLayerTransformCommit={() => undefined}
        onError={() => undefined}
      />,
    )
    const selection = document.querySelector<HTMLElement>('[data-course-transform-selection]')
    expect(selection?.style.pointerEvents).toBe('none')
    expect(document.querySelector<HTMLElement>('.course-slide-transform-layer')?.style.pointerEvents).toBe('none')
    expect(document.querySelectorAll('[data-course-transform-move-edge]')).toHaveLength(4)
  })

  it('edits Slide Native text in place and commits Enter without reading rendered DOM', () => {
    const item = textItem()
    const onNativeTextCommit = vi.fn()
    render(
      <SlideCourseCanvas
        surface={slideSurface(item)}
        sceneId="scene-one"
        mode="inspect"
        selectedLayerItemId={item.layerItemId}
        selectedLayerItems={[{ item, source: 'scene' }]}
        resolveAsset={() => undefined}
        onLayerHit={() => undefined}
        onLayerTransformCommit={() => undefined}
        onNativeTextCommit={onNativeTextCommit}
        onError={() => undefined}
      />,
    )
    fireEvent.doubleClick(screen.getByLabelText('拖动选择'))
    const editor = screen.getByRole('textbox', { name: '编辑可编辑文字' })
    expect(editor).toHaveValue('初始文字')
    fireEvent.change(editor, { target: { value: '画布中的新文字' } })
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(onNativeTextCommit).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'scene', item: expect.objectContaining({ layerItemId: item.layerItemId }) }),
      '画布中的新文字',
    )
    expect(screen.queryByTestId('canvas-plain-text-editor')).not.toBeInTheDocument()
  })

  it('cancels Native text editing on Escape and never opens it for a locked item', () => {
    const item = textItem()
    const onNativeTextCommit = vi.fn()
    const view = render(
      <SlideCourseCanvas
        surface={slideSurface(item)}
        sceneId="scene-one"
        mode="inspect"
        selectedLayerItemId={item.layerItemId}
        selectedLayerItems={[{ item, source: 'scene' }]}
        resolveAsset={() => undefined}
        onLayerHit={() => undefined}
        onLayerTransformCommit={() => undefined}
        onNativeTextCommit={onNativeTextCommit}
        onError={() => undefined}
      />,
    )
    fireEvent.doubleClick(screen.getByLabelText('拖动选择'))
    fireEvent.keyDown(screen.getByRole('textbox', { name: '编辑可编辑文字' }), { key: 'Escape' })
    expect(onNativeTextCommit).not.toHaveBeenCalled()

    const locked = textItem('locked-text', true)
    view.rerender(
      <SlideCourseCanvas
        surface={slideSurface(locked)}
        sceneId="scene-one"
        mode="inspect"
        selectedLayerItemId={locked.layerItemId}
        selectedLayerItems={[{ item: locked, source: 'scene' }]}
        resolveAsset={() => undefined}
        onLayerHit={() => undefined}
        onLayerTransformCommit={() => undefined}
        onNativeTextCommit={onNativeTextCommit}
        onError={() => undefined}
      />,
    )
    fireEvent.doubleClick(screen.getByLabelText('已锁定选择'))
    expect(screen.queryByTestId('canvas-plain-text-editor')).not.toBeInTheDocument()
  })

  it('keeps image double-click routed to the stable asset field instead of text editing', () => {
    const item = imageItem()
    const onLayerHit = vi.fn()
    const onNativeTextCommit = vi.fn()
    render(
      <SlideCourseCanvas
        surface={slideSurface(item)}
        sceneId="scene-one"
        mode="inspect"
        selectedLayerItemId={item.layerItemId}
        selectedLayerItems={[{ item, source: 'scene' }]}
        resolveAsset={() => undefined}
        onLayerHit={onLayerHit}
        onLayerTransformCommit={() => undefined}
        onNativeTextCommit={onNativeTextCommit}
        onError={() => undefined}
      />,
    )
    fireEvent.doubleClick(screen.getByLabelText('拖动选择'))
    expect(onLayerHit).toHaveBeenCalledWith(expect.objectContaining({
      layerItemId: item.layerItemId,
      field: 'content.data.assetId',
      targetKind: 'asset',
    }))
    expect(screen.queryByTestId('canvas-plain-text-editor')).not.toBeInTheDocument()
    expect(onNativeTextCommit).not.toHaveBeenCalled()
  })

  it('mirrors the Spatial camera and converts client motion into world motion', () => {
    const item = textItem('world-text')
    const surface = spatialSurface(item)
    const onCommit = vi.fn()
    render(
      <SpatialCourseCanvas
        surface={surface}
        mode="inspect"
        camera={surface.camera.home}
        selectedLayerItemId={item.layerItemId}
        selectedLayerItems={[{ item, source: 'world' }]}
        resolveAsset={() => undefined}
        onCameraChange={() => undefined}
        onSelect={() => undefined}
        onMove={() => undefined}
        onLayerTransformCommit={onCommit}
      />,
    )
    const cameraLayer = document.querySelector<HTMLElement>('.course-spatial-transform-layer > div')
    expect(cameraLayer?.style.transform).toContain('scale(2)')
    const overlay = screen.getByTestId('course-transform-overlay')
    fireEvent.pointerDown(screen.getByLabelText('拖动选择'), {
      button: 0, pointerId: 2, clientX: 100, clientY: 100,
    })
    fireEvent.pointerMove(overlay, { pointerId: 2, clientX: 120, clientY: 110 })
    fireEvent.pointerUp(overlay, { pointerId: 2, clientX: 120, clientY: 110 })
    expect(onCommit).toHaveBeenCalledOnce()
    expect(onCommit.mock.calls[0][0]).toMatchObject({
      delta: { x: 10, y: 5 },
      items: [{ layerItemId: item.layerItemId, frame: { x: 20, y: 25 } }],
    })
  })

  it('mounts the same transform contract over Flow floating layers', () => {
    const item = textItem('flow-floating')
    const surface: FlowSurfaceDocument = {
      id: 'flow-transform',
      type: 'flow',
      title: '流式讲义',
      surfaceLayerItems: [{ item, visibility: { mode: 'all', locationIds: [] } }],
      layout: { readingWidth: 760, wideContentWidth: 1000 },
      blocks: [],
    }
    render(
      <FlowCourseCanvas
        surface={surface}
        mode="inspect"
        selectedBlockId={null}
        selectedLayerItemId={item.layerItemId}
        selectedLayerItems={[{ item, source: 'surface' }]}
        search=""
        resolveAsset={() => undefined}
        onSelect={() => undefined}
        onEdit={() => undefined}
        onLayerTransformCommit={() => undefined}
      />,
    )
    expect(screen.getByTestId('course-transform-overlay')).toHaveAttribute('data-selection-count', '1')
    expect(document.querySelector('.course-flow-transform-layer')).not.toBeNull()
  })

  it('fits the unified Flow layer plane to narrow editor widths without changing logical coordinates', () => {
    expect(fitFlowLogicalOverlayScale(1280)).toBe(1)
    expect(fitFlowLogicalOverlayScale(1920)).toBe(1)
    expect(fitFlowLogicalOverlayScale(640)).toBe(0.5)
    expect(fitFlowLogicalOverlayScale(0)).toBe(1)
    expect(fitFlowLogicalOverlayScale(Number.NaN)).toBe(1)
  })

  it('uses Ctrl+Enter for multiline Flow floating text and places Spatial text editing in world space', () => {
    const flowItem = textItem('flow-text-edit')
    flowItem.content.data.style.overflow = 'auto-height'
    const flow: FlowSurfaceDocument = {
      id: 'flow-text-edit',
      type: 'flow',
      title: '流式文字',
      surfaceLayerItems: [{ item: flowItem, visibility: { mode: 'all', locationIds: [] } }],
      layout: { readingWidth: 760, wideContentWidth: 1000 },
      blocks: [],
    }
    const onFlowCommit = vi.fn()
    const flowView = render(
      <FlowCourseCanvas
        surface={flow}
        mode="inspect"
        selectedBlockId={null}
        selectedLayerItemId={flowItem.layerItemId}
        selectedLayerItems={[{ item: flowItem, source: 'surface' }]}
        search=""
        resolveAsset={() => undefined}
        onSelect={() => undefined}
        onEdit={() => undefined}
        onLayerTransformCommit={() => undefined}
        onNativeTextCommit={onFlowCommit}
      />,
    )
    fireEvent.doubleClick(screen.getByLabelText('拖动选择'))
    const flowEditor = screen.getByRole('textbox', { name: '编辑可编辑文字' })
    fireEvent.change(flowEditor, { target: { value: '两行\n文字' } })
    fireEvent.keyDown(flowEditor, { key: 'Enter', ctrlKey: true })
    expect(onFlowCommit).toHaveBeenCalledWith(expect.objectContaining({ source: 'surface' }), '两行\n文字')
    flowView.unmount()

    const spatialItem = textItem('spatial-text-edit')
    const spatial = spatialSurface(spatialItem)
    const onSpatialCommit = vi.fn()
    render(
      <SpatialCourseCanvas
        surface={spatial}
        mode="inspect"
        camera={spatial.camera.home}
        selectedLayerItemId={spatialItem.layerItemId}
        selectedLayerItems={[{ item: spatialItem, source: 'world' }]}
        resolveAsset={() => undefined}
        onCameraChange={() => undefined}
        onSelect={() => undefined}
        onMove={() => undefined}
        onLayerTransformCommit={() => undefined}
        onNativeTextCommit={onSpatialCommit}
      />,
    )
    fireEvent.doubleClick(screen.getByLabelText('拖动选择'))
    const spatialEditor = screen.getByRole('textbox', { name: '编辑可编辑文字' })
    const worldLayer = spatialEditor.closest('.course-spatial-transform-layer > div')
    expect(worldLayer).not.toBeNull()
    fireEvent.change(spatialEditor, { target: { value: '空间中的文字' } })
    fireEvent.keyDown(spatialEditor, { key: 'Enter' })
    expect(onSpatialCommit).toHaveBeenCalledWith(expect.objectContaining({ source: 'world' }), '空间中的文字')
  })
})
