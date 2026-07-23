import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneThumbnail } from '../../src/renderer/ui/SceneThumbnail'
import { useEditorStore } from '../../src/renderer/store/editorStore'
import {
  createExternalComponentNode,
  createScene,
} from '../../src/renderer/project/createProject'

beforeEach(() => {
  useEditorStore.getState().createNewProject()
  vi.stubGlobal('IntersectionObserver', undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('scene thumbnail playback visibility semantics', () => {
  it('draws a playback-hidden node directly at its authored stable frame', async () => {
    const translate = vi.fn()
    const alphaValues: number[] = []
    let alpha = 1
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate,
      rotate: vi.fn(),
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
    }
    Object.defineProperty(context, 'globalAlpha', {
      configurable: true,
      get: () => alpha,
      set: (value: number) => {
        alpha = value
        alphaValues.push(value)
      },
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    )

    const scene = createScene({ id: 'thumbnail-animation' })
    const node = createExternalComponentNode({
      id: 'animated-thumbnail-node',
      x: 280,
      y: 160,
      width: 400,
      height: 200,
      opacity: 0.64,
      component: { packageId: 'com.example.card', version: '1.0.0' },
      playbackInitialVisibility: 'hidden',
    })
    scene.nodes = [node]

    render(<SceneThumbnail scene={scene} />)
    await waitFor(() => expect(translate).toHaveBeenCalled())

    const thumbnailScale = 160 / 1280
    expect(translate).toHaveBeenCalledWith(
      (node.x + node.width / 2) * thumbnailScale,
      (node.y + node.height / 2) * thumbnailScale,
    )
    expect(translate).not.toHaveBeenCalledWith(
      (node.x + node.width / 2 - 48) * thumbnailScale,
      (node.y + node.height / 2) * thumbnailScale,
    )
    expect(alphaValues).toContain(node.opacity)
    expect(alphaValues).not.toContain(0)
  })
})
