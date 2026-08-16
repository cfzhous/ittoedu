import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  SpatialLayerInspector,
  type SpatialLayerInspectorLayer,
} from '../../src/renderer/ui/SpatialLayerInspector'

function createLayer(
  overrides: Partial<SpatialLayerInspectorLayer> = {},
): SpatialLayerInspectorLayer {
  return {
    layerItemId: 'layer-a',
    label: '标题',
    visible: true,
    locked: false,
    x: 100,
    y: 80,
    width: 200,
    height: 60,
    rotation: 0,
    opacity: 1,
    ...overrides,
  }
}

afterEach(cleanup)

describe('SpatialLayerInspector draft commits', () => {
  it('does not call onPatch while five change events update only the local draft', () => {
    const onPatch = vi.fn()
    render(<SpatialLayerInspector layer={createLayer()} onPatch={onPatch} />)

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '新标题' } })
    fireEvent.change(screen.getByLabelText('X'), { target: { value: '-10' } })
    fireEvent.change(screen.getByLabelText('Y'), { target: { value: '-20' } })
    fireEvent.change(screen.getByLabelText('宽'), { target: { value: '250' } })
    fireEvent.change(screen.getByLabelText('高'), { target: { value: '80' } })

    expect(onPatch).not.toHaveBeenCalled()
  })

  it('commits exactly once on blur with the complete draft patch', () => {
    const onPatch = vi.fn()
    render(<SpatialLayerInspector layer={createLayer()} onPatch={onPatch} />)

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '新标题' } })
    fireEvent.change(screen.getByLabelText('X'), { target: { value: '-10' } })
    fireEvent.change(screen.getByLabelText('Y'), { target: { value: '-20' } })
    fireEvent.change(screen.getByLabelText('宽'), { target: { value: '250' } })
    fireEvent.change(screen.getByLabelText('高'), { target: { value: '80' } })

    fireEvent.blur(screen.getByLabelText('X'))

    expect(onPatch).toHaveBeenCalledTimes(1)
    expect(onPatch).toHaveBeenCalledWith({
      label: '新标题',
      x: -10,
      y: -20,
      width: 250,
      height: 80,
      rotation: 0,
      opacity: 1,
    })
  })

  it('commits exactly once on Enter even when blur follows', () => {
    const onPatch = vi.fn()
    render(<SpatialLayerInspector layer={createLayer()} onPatch={onPatch} />)

    const nameInput = screen.getByLabelText('名称')
    fireEvent.change(nameInput, { target: { value: '回车提交' } })
    fireEvent.keyDown(nameInput, { key: 'Enter' })

    expect(onPatch).toHaveBeenCalledTimes(1)
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ label: '回车提交' }))

    fireEvent.blur(nameInput)
    expect(onPatch).toHaveBeenCalledTimes(1)
  })

  it('restores the draft on Escape without calling onPatch', () => {
    const onPatch = vi.fn()
    render(<SpatialLayerInspector layer={createLayer()} onPatch={onPatch} />)

    const xInput = screen.getByLabelText('X')
    fireEvent.change(xInput, { target: { value: '999' } })
    fireEvent.keyDown(xInput, { key: 'Escape' })

    expect(xInput).toHaveValue(100)
    expect(onPatch).not.toHaveBeenCalled()
  })

  it('submits negative x/y world coordinates from number inputs without min', () => {
    const onPatch = vi.fn()
    render(<SpatialLayerInspector layer={createLayer()} onPatch={onPatch} />)

    const xInput = screen.getByLabelText('X') as HTMLInputElement
    const yInput = screen.getByLabelText('Y') as HTMLInputElement
    expect(xInput.min).toBe('')
    expect(yInput.min).toBe('')

    fireEvent.change(xInput, { target: { value: '-50' } })
    fireEvent.change(yInput, { target: { value: '-75.5' } })
    fireEvent.blur(yInput)

    expect(onPatch).toHaveBeenCalledTimes(1)
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ x: -50, y: -75.5 }))
  })

  it('clears stale draft when the selected layer changes', () => {
    const onPatch = vi.fn()
    const firstLayer = createLayer()
    const { rerender } = render(
      <SpatialLayerInspector layer={firstLayer} onPatch={onPatch} />,
    )

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '未提交的旧值' } })
    fireEvent.change(screen.getByLabelText('X'), { target: { value: '999' } })

    rerender(
      <SpatialLayerInspector
        layer={createLayer({
          layerItemId: 'layer-b',
          label: '新图层',
          x: -30,
          y: -40,
          width: 300,
          height: 90,
          rotation: 15,
          opacity: 0.5,
        })}
        onPatch={onPatch}
      />,
    )

    expect(screen.getByLabelText('名称')).toHaveValue('新图层')
    expect(screen.getByLabelText('X')).toHaveValue(-30)
    expect(screen.getByLabelText('Y')).toHaveValue(-40)

    fireEvent.blur(screen.getByLabelText('名称'))
    expect(onPatch).not.toHaveBeenCalled()
  })
})
