import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlayerApp } from '../../src/player/PlayerApp'
import {
  capturePlayerStage,
  sizeHiddenPlayerStage,
  waitForPlayerCaptureReady,
} from '../../src/renderer/export/playerCapture'

function fakePlayer(
  waitForCaptureReady?: () => Promise<void>,
): PlayerApp {
  return {
    game: {
      scene: {
        getScene: () => ({
          load: { isLoading: () => false },
        }),
      },
    },
    waitForCaptureReady,
  } as unknown as PlayerApp
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('playerCapture', () => {
  it('调整隐藏播放器尺寸时保留由 PlayerApp 承载的场景背景色', () => {
    const root = document.createElement('div')
    const shell = document.createElement('main')
    shell.className = 'lesson-shell'
    const stage = document.createElement('section')
    stage.className = 'lesson-stage'
    stage.style.backgroundColor = 'rgb(255, 0, 0)'
    const canvasHost = document.createElement('div')
    canvasHost.className = 'lesson-canvas-host'
    stage.append(canvasHost)
    shell.append(stage)
    root.append(shell)

    sizeHiddenPlayerStage(root, 1280, 720)

    expect(stage.style.backgroundColor).toBe('rgb(255, 0, 0)')
    expect(stage.style.width).toBe('1280px')
    expect(stage.style.height).toBe('720px')
  })

  it('等待 PlayerApp capture promises，再等待两个稳定帧', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0))
    const waitForCaptureReady = vi.fn().mockResolvedValue(undefined)
    const player = fakePlayer(waitForCaptureReady)

    const pending = waitForPlayerCaptureReady(player, 1_000)
    await vi.runAllTimersAsync()
    await expect(pending).resolves.toBeUndefined()
    expect(waitForCaptureReady).toHaveBeenCalledWith()
  })

  it('运行时登记的捕获任务失败时向导出链路传播错误', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(performance.now()))
      return 1
    })
    const player = fakePlayer(() => Promise.reject(new Error('字体加载失败')))
    await expect(waitForPlayerCaptureReady(player, 1_000)).rejects.toThrow(
      '字体加载失败',
    )
  })

  it('按固定广域层级合成 DOM underlay、Phaser、组件 DOM 和 overlay', async () => {
    const operations: string[] = []
    const captureContext = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      globalAlpha: 1,
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      direction: 'ltr',
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      clip: vi.fn(),
      fillRect: vi.fn(function (this: { fillStyle: string }) {
        operations.push(this.fillStyle)
      }),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(() => operations.push('phaser')),
      createLinearGradient: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(captureContext)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,Q09NUE9TRUQ=')
    const imageSource = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      'src',
    )
    if (!imageSource?.set) throw new Error('jsdom 缺少 HTMLImageElement.src')
    vi.spyOn(HTMLImageElement.prototype, 'src', 'set')
      .mockImplementation(function (this: HTMLImageElement, value: string) {
        imageSource.set!.call(this, value)
        queueMicrotask(() => this.onload?.(new Event('load')))
      })

    const root = document.createElement('div')
    const stage = document.createElement('section')
    stage.className = 'lesson-stage'
    const canvasHost = document.createElement('div')
    canvasHost.className = 'lesson-canvas-host'
    canvasHost.style.zIndex = '2'
    const componentPlane = document.createElement('div')
    componentPlane.className = 'lesson-component-mount'
    componentPlane.style.backgroundColor = 'rgb(0, 0, 255)'
    canvasHost.append(componentPlane)

    const runtimeLayer = (
      className: string,
      zIndex: number,
      color: string,
    ): HTMLDivElement => {
      const layer = document.createElement('div')
      layer.className = `lesson-runtime-layer ${className}`
      layer.style.zIndex = String(zIndex)
      const visual = document.createElement('div')
      visual.className = 'lesson-runtime-mount'
      visual.style.backgroundColor = color
      layer.append(visual)
      return layer
    }
    const globalUnderlay = runtimeLayer(
      'lesson-runtime-layer--global-underlay',
      0,
      'rgb(255, 0, 0)',
    )
    const sceneUnderlay = runtimeLayer(
      'lesson-runtime-layer--scene-underlay',
      1,
      'rgb(255, 165, 0)',
    )
    const sceneOverlay = runtimeLayer(
      'lesson-runtime-layer--scene-overlay',
      3,
      'rgb(0, 128, 0)',
    )
    const globalOverlay = runtimeLayer(
      'lesson-runtime-layer--global-overlay',
      4,
      'rgb(128, 0, 128)',
    )
    stage.append(
      canvasHost,
      globalUnderlay,
      sceneUnderlay,
      sceneOverlay,
      globalOverlay,
    )
    root.append(stage)
    document.body.append(root)

    expect([...stage.querySelectorAll<HTMLElement>(
      ':scope > .lesson-runtime-layer',
    )].map((layer) => getComputedStyle(layer).zIndex)).toEqual([
      '0', '1', '3', '4',
    ])

    const visibleRect = new DOMRect(0, 0, 100, 100)
    const rectSpies = new Map<Element, ReturnType<typeof vi.fn>>()
    for (const element of stage.querySelectorAll<HTMLElement>('*')) {
      const spy = vi.spyOn(element, 'getBoundingClientRect')
        .mockReturnValue(visibleRect)
      rectSpies.set(element, spy)
    }
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(visibleRect)
    expect([
      globalUnderlay,
      sceneUnderlay,
      sceneOverlay,
      globalOverlay,
    ].map((layer) => {
      const style = getComputedStyle(layer.firstElementChild!)
      return [style.display, style.visibility, style.contentVisibility]
    })).toEqual([
      ['block', 'visible', 'visible'],
      ['block', 'visible', 'visible'],
      ['block', 'visible', 'visible'],
      ['block', 'visible', 'visible'],
    ])

    const snapshotCanvas = document.createElement('canvas')
    const player = {
      game: {
        canvas: snapshotCanvas,
        renderer: {
          snapshot(callback: (snapshot: HTMLImageElement) => void) {
            const image = new Image()
            image.src = 'data:image/png;base64,UEhBU0VS'
            callback(image)
          },
        },
      },
    } as unknown as PlayerApp

    await expect(capturePlayerStage(player, root, 100, 100)).resolves.toBe(
      'data:image/png;base64,Q09NUE9TRUQ=',
    )
    expect([
      globalUnderlay,
      sceneUnderlay,
      sceneOverlay,
      globalOverlay,
    ].map((layer) => rectSpies.get(layer)?.mock.calls.length)).toEqual([
      1, 1, 1, 1,
    ])
    expect([
      globalUnderlay,
      sceneUnderlay,
      sceneOverlay,
      globalOverlay,
    ].map((layer) => rectSpies.get(layer.firstElementChild!)?.mock.calls.length))
      .toEqual([1, 1, 1, 1])
    expect(operations).toEqual([
      'rgb(255, 0, 0)',
      'rgb(255, 165, 0)',
      'phaser',
      'rgb(0, 0, 255)',
      'rgb(0, 128, 0)',
      'rgb(128, 0, 128)',
    ])
  })

  it('DOM/WebGL 合成优先使用各实例 prepareCapture 后立即保存的画布帧', async () => {
    const outputContext = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      globalAlpha: 1,
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      direction: 'ltr',
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      clip: vi.fn(),
      fillRect: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      createLinearGradient: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(outputContext)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,UFJFUEFSRUQ=')
    const imageSource = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      'src',
    )
    if (!imageSource?.set) throw new Error('jsdom 缺少 HTMLImageElement.src')
    vi.spyOn(HTMLImageElement.prototype, 'src', 'set')
      .mockImplementation(function (this: HTMLImageElement, value: string) {
        imageSource.set!.call(this, value)
        queueMicrotask(() => this.onload?.(new Event('load')))
      })

    const root = document.createElement('div')
    const stage = document.createElement('section')
    stage.className = 'lesson-stage'
    const canvasHost = document.createElement('div')
    canvasHost.className = 'lesson-canvas-host'
    canvasHost.style.zIndex = '2'
    const componentMount = document.createElement('div')
    componentMount.className = 'lesson-component-mount'
    const liveWebglCanvas = document.createElement('canvas')
    liveWebglCanvas.width = 64
    liveWebglCanvas.height = 64
    componentMount.append(liveWebglCanvas)
    canvasHost.append(componentMount)
    stage.append(canvasHost)
    root.append(stage)
    document.body.append(root)

    const visibleRect = new DOMRect(0, 0, 64, 64)
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(visibleRect)
    vi.spyOn(canvasHost, 'getBoundingClientRect').mockReturnValue(visibleRect)
    vi.spyOn(componentMount, 'getBoundingClientRect').mockReturnValue(visibleRect)
    vi.spyOn(liveWebglCanvas, 'getBoundingClientRect').mockReturnValue(visibleRect)

    const preparedFrame = document.createElement('canvas')
    preparedFrame.width = 64
    preparedFrame.height = 64
    const getPreparedCanvasSnapshot = vi.fn((source: HTMLCanvasElement) =>
      source === liveWebglCanvas ? preparedFrame : undefined)
    const player = {
      game: {
        canvas: document.createElement('canvas'),
        renderer: {
          snapshot(callback: (snapshot: HTMLImageElement) => void) {
            const image = new Image()
            image.src = 'data:image/png;base64,UEhBU0VS'
            callback(image)
          },
        },
      },
      getPreparedCanvasSnapshot,
    } as unknown as PlayerApp

    await expect(capturePlayerStage(player, root, 64, 64)).resolves.toBe(
      'data:image/png;base64,UFJFUEFSRUQ=',
    )
    expect(getPreparedCanvasSnapshot).toHaveBeenCalledWith(liveWebglCanvas)
    expect(outputContext.drawImage).toHaveBeenCalledWith(
      preparedFrame,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    )
    const drawnSources = vi.mocked(outputContext.drawImage).mock.calls
      .map(([source]) => source)
    expect(drawnSources.some((source) => source === preparedFrame)).toBe(true)
    expect(drawnSources.some((source) => source === liveWebglCanvas)).toBe(false)
  })
})
