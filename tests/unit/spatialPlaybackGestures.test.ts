import { describe, expect, it, vi } from 'vitest'
import {
  attachSpatialPlaybackCameraGestures,
  spatialPlaybackGestureOccupied,
  SPATIAL_GESTURE_OWNER_ATTR,
} from '@/player/surfaces/spatial/spatialPlaybackGestures'
import type { SpatialRuntimeCamera } from '@/player/surfaces/spatial/spatialModel'

function camera(partial: Partial<SpatialRuntimeCamera> = {}): SpatialRuntimeCamera {
  return {
    x: 0,
    y: 0,
    zoom: 1,
    viewportWidth: 400,
    viewportHeight: 240,
    ...partial,
  }
}

function pointer(
  type: string,
  target: EventTarget,
  clientX: number,
  clientY: number,
): void {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX,
    clientY,
    pointerId: 1,
    pointerType: 'mouse',
    button: type === 'pointerdown' ? 0 : 0,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    isPrimary: true,
  }))
}

describe('spatialPlaybackGestureOccupied', () => {
  it('lets decorative native targets through and occupies interactive owners', () => {
    const root = document.createElement('div')
    const image = document.createElement('div')
    const video = document.createElement('video')
    const owned = document.createElement('div')
    owned.setAttribute(SPATIAL_GESTURE_OWNER_ATTR, 'component')
    const inside = document.createElement('span')
    owned.appendChild(inside)
    root.append(image, video, owned)

    expect(spatialPlaybackGestureOccupied(image, root)).toBe(false)
    expect(spatialPlaybackGestureOccupied(video, root)).toBe(true)
    expect(spatialPlaybackGestureOccupied(inside, root)).toBe(true)
    expect(spatialPlaybackGestureOccupied(inside, document.createElement('div'))).toBe(false)
  })
})

describe('attachSpatialPlaybackCameraGestures', () => {
  it('pans after a drag threshold and zooms with wheel on unoccupied surface', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 400, height: 240, right: 400, bottom: 240 }),
    })
    let current = camera()
    const setCamera = vi.fn((next: SpatialRuntimeCamera) => {
      current = next
    })
    const dispose = attachSpatialPlaybackCameraGestures({
      root,
      isActive: () => true,
      getCamera: () => current,
      setCamera,
    })

    pointer('pointerdown', root, 40, 40)
    pointer('pointermove', root, 43, 40)
    expect(setCamera).not.toHaveBeenCalled()
    pointer('pointermove', root, 60, 40)
    expect(current.x).toBe(-20)
    expect(current.y).toBe(0)

    root.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 200,
      clientY: 120,
      deltaY: -120,
    }))
    expect(current.zoom).toBeGreaterThan(1)

    dispose()
    root.remove()
  })

  it('does not pan or zoom when a gesture owner already has the pointer', () => {
    const root = document.createElement('div')
    const video = document.createElement('video')
    video.setAttribute(SPATIAL_GESTURE_OWNER_ATTR, 'media')
    root.appendChild(video)
    let current = camera()
    const setCamera = vi.fn((next: SpatialRuntimeCamera) => {
      current = next
    })
    const dispose = attachSpatialPlaybackCameraGestures({
      root,
      isActive: () => true,
      getCamera: () => current,
      setCamera,
    })

    pointer('pointerdown', video, 20, 20)
    pointer('pointermove', video, 80, 20)
    video.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
      deltaY: -80,
    }))
    expect(setCamera).not.toHaveBeenCalled()
    expect(current).toEqual(camera())
    dispose()
  })
})
