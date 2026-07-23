import { afterEach, describe, expect, it, vi } from 'vitest'
import { PreparedCanvasSnapshots } from '../../src/player/PreparedCanvasSnapshots'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('PreparedCanvasSnapshots', () => {
  it('递归穿过 open Shadow DOM/slot 并立即保存独立 Canvas 帧', () => {
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D)
    const host = document.createElement('div')
    const shadow = host.attachShadow({ mode: 'open' })
    const slot = document.createElement('slot')
    shadow.append(slot)
    const source = document.createElement('canvas')
    source.width = 640
    source.height = 360
    host.append(source)
    const unslottedHost = document.createElement('div')
    unslottedHost.attachShadow({ mode: 'open' }).append(
      document.createElement('span'),
    )
    const unslottedCanvas = document.createElement('canvas')
    unslottedCanvas.width = 320
    unslottedCanvas.height = 180
    unslottedHost.append(unslottedCanvas)
    document.body.append(host)
    document.body.append(unslottedHost)

    const snapshots = new PreparedCanvasSnapshots()
    snapshots.captureRoots([host, unslottedHost])

    const copy = snapshots.get(source)
    expect(copy).toBeInstanceOf(HTMLCanvasElement)
    expect(copy).not.toBe(source)
    expect(copy).toMatchObject({ width: 640, height: 360 })
    expect(drawImage).toHaveBeenCalledWith(source, 0, 0)
    expect(snapshots.get(unslottedCanvas)).toBeUndefined()

    snapshots.reset()
    expect(snapshots.get(source)).toBeUndefined()
  })
})
