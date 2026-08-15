import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createImageNode } from '@/renderer/project/createProject'
import {
  SceneThumbnail,
  type SceneThumbnailRenderModel,
} from '@/renderer/ui/SceneThumbnail'

function canvasContext() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'middle',
    globalAlpha: 1,
  }
}

const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
const originalDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode')

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalCreateObjectUrl) {
    Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl)
  } else {
    Reflect.deleteProperty(URL, 'createObjectURL')
  }
  if (originalRevokeObjectUrl) {
    Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl)
  } else {
    Reflect.deleteProperty(URL, 'revokeObjectURL')
  }
  if (originalDecode) {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', originalDecode)
  } else {
    Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
  }
})

describe('SceneThumbnail render isolation', () => {
  it('draws a component static fallback in its authored frame without loading package art', async () => {
    const visibleContext = canvasContext()
    const bufferContext = canvasContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      return (this.classList.contains('scene-thumbnail')
        ? visibleContext
        : bufferContext) as unknown as CanvasRenderingContext2D
    })
    const decode = vi.fn(() => Promise.resolve())
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: decode,
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:component-fallback'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })

    const model: SceneThumbnailRenderModel = {
      backgroundColor: '#ffffff',
      entries: [{
        kind: 'course-component',
        frame: {
          x: 200,
          y: 100,
          width: 400,
          height: 200,
          rotation: 12,
          opacity: 0.7,
        },
        label: '组件',
        packageId: 'component-package',
        staticFallbackAssetId: 'component-fallback',
      }],
      assets: {
        'component-fallback': {
          id: 'component-fallback',
          filename: 'fallback.png',
          mimeType: 'image/png',
          kind: 'image',
          path: 'assets/fallback.png',
          byteLength: 1,
          width: 800,
          height: 400,
        },
      },
      assetFiles: { 'component-fallback': new Uint8Array([0]) },
      components: {
        'component-package': {
          name: '包缩略图',
          thumbnailUrl: 'data:image/png;base64,package-art',
        },
      },
    }

    render(<SceneThumbnail model={model} />)
    await waitFor(() => expect(visibleContext.drawImage).toHaveBeenCalled())

    const scale = 160 / 1280
    expect(bufferContext.translate).toHaveBeenCalledWith(
      (200 + 400 / 2) * scale,
      (100 + 200 / 2) * scale,
    )
    expect(bufferContext.rotate).toHaveBeenCalledWith((12 * Math.PI) / 180)
    expect(bufferContext.drawImage).toHaveBeenCalled()
    expect(decode).toHaveBeenCalledOnce()
  })

  it('never commits or holds a transform stack after cleanup wins an image decode race', async () => {
    const visibleContext = canvasContext()
    const bufferContext = canvasContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      return (this.classList.contains('scene-thumbnail')
        ? visibleContext
        : bufferContext) as unknown as CanvasRenderingContext2D
    })

    let resolveDecode: (() => void) | undefined
    const decode = vi.fn(() => new Promise<void>((resolve) => {
      resolveDecode = resolve
    }))
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: decode,
    })
    const revokeObjectUrl = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:thumbnail-race'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    })

    const node = createImageNode({
      id: 'thumbnail-image',
      assetId: 'asset-image',
      x: 120,
      y: 90,
      width: 640,
      height: 360,
    })
    const model: SceneThumbnailRenderModel = {
      backgroundColor: '#ffffff',
      entries: [{ kind: 'node', scope: 'scene', node }],
      assets: {
        'asset-image': {
          id: 'asset-image',
          filename: 'image.png',
          mimeType: 'image/png',
          kind: 'image',
          path: 'assets/image.png',
          byteLength: 1,
          width: 640,
          height: 360,
        },
      },
      assetFiles: { 'asset-image': new Uint8Array([0]) },
      components: {},
    }

    const rendered = render(<SceneThumbnail model={model} />)
    await waitFor(() => expect(decode).toHaveBeenCalledOnce())

    // No transform state is opened while an asynchronous decode is pending.
    expect(bufferContext.save).not.toHaveBeenCalled()
    expect(bufferContext.restore).not.toHaveBeenCalled()
    rendered.unmount()

    await act(async () => {
      resolveDecode?.()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(bufferContext.save).not.toHaveBeenCalled()
    expect(bufferContext.restore).not.toHaveBeenCalled()
    expect(visibleContext.clearRect).not.toHaveBeenCalled()
    expect(visibleContext.drawImage).not.toHaveBeenCalled()
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:thumbnail-race')
  })
})
