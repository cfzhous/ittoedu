import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createScene, createImageNode, createShapeNode, createTextNode } from '@/renderer/project/createProject'
import { completeWorkspaceTransformEvent } from '@/renderer/ui/workspaceSlideAuthoring'
import { renderTextNodeCanvas } from '@/shared/textLayout'

function canvasContext(): CanvasRenderingContext2D {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Workspace transform completion', () => {
  it('preserves auto-height text dimensions for move and rotate', () => {
    const node = createTextNode({
      id: 'auto-height-text',
      text: '移动和旋转不应重新排版这段文字',
      width: 240,
      height: 80,
      style: { overflow: 'auto-height', fontSize: 42 },
    })
    const document = { ...createScene({ id: 'scene-a' }), nodes: [node] }

    expect(completeWorkspaceTransformEvent(document, [{
      nodeId: node.id,
      x: node.x + 40,
      y: node.y + 30,
    }])?.nodes[0]).toMatchObject({
      x: node.x + 40,
      y: node.y + 30,
      width: node.width,
      height: node.height,
      rotation: node.rotation,
    })
    expect(completeWorkspaceTransformEvent(document, [{
      nodeId: node.id,
      rotation: 25,
    }])?.nodes[0]).toMatchObject({
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      rotation: 25,
    })
  })

  it('reflows auto-height text only when resize changes its dimensions', () => {
    const node = createTextNode({
      id: 'auto-height-resize',
      text: '缩窄文本框后应按新宽度重新计算高度',
      width: 320,
      height: 80,
      style: { overflow: 'auto-height', fontSize: 42 },
    })
    const document = { ...createScene({ id: 'scene-a' }), nodes: [node] }
    const resizedWidth = 160
    const expected = renderTextNodeCanvas({ ...node, width: resizedWidth }, resizedWidth)
    const completed = completeWorkspaceTransformEvent(document, [{
      nodeId: node.id,
      x: node.x,
      y: node.y,
      width: resizedWidth,
      height: node.height,
    }])?.nodes[0]

    expect(completed).toMatchObject({
      width: expected.width,
      height: expected.height,
    })
    expect(completed?.height).not.toBe(node.height)
  })

  it('completes one multi-node resize gesture and one rotate gesture with stable dimensions', () => {
    const shape = createShapeNode('rectangle', {
      id: 'gesture-shape',
      x: 40,
      y: 50,
      width: 200,
      height: 120,
    })
    const image = createImageNode({
      id: 'gesture-image',
      assetId: 'asset-photo',
      x: 10,
      y: 20,
      width: 300,
      height: 200,
    })
    const document = { ...createScene({ id: 'scene-a' }), nodes: [shape, image] }

    const resized = completeWorkspaceTransformEvent(document, [
      { nodeId: shape.id, x: 44, y: 54, width: 220, height: 130 },
      { nodeId: image.id, x: 20, y: 30, width: 320, height: 210 },
    ])
    expect(resized).not.toBeNull()
    expect(resized!.nodes).toEqual([
      expect.objectContaining({
        nodeId: shape.id,
        x: 44,
        y: 54,
        width: 220,
        height: 130,
        rotation: 0,
      }),
      expect.objectContaining({
        nodeId: image.id,
        x: 20,
        y: 30,
        width: 320,
        height: 210,
        rotation: 0,
      }),
    ])

    const rotated = completeWorkspaceTransformEvent(document, [
      { nodeId: image.id, rotation: 45 },
    ])
    expect(rotated?.nodes[0]).toMatchObject({
      nodeId: image.id,
      x: 10,
      y: 20,
      width: 300,
      height: 200,
      rotation: 45,
    })

    // A gesture patch referencing a vanished node rejects the whole completion.
    expect(completeWorkspaceTransformEvent(document, [
      { nodeId: shape.id, x: 1 },
      { nodeId: 'vanished-node', x: 2 },
    ])).toBeNull()
  })
})
