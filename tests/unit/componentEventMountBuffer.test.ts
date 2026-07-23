import { describe, expect, it } from 'vitest'
import { ComponentEventMountBuffer } from '../../src/player/ComponentEventMountBuffer'
import type { ComponentEventDetail } from '../../src/player/renderNode'

function event(
  scope: 'scene' | 'global',
  eventName: string,
  instanceId = `${scope}-component`,
): ComponentEventDetail {
  return {
    scope,
    ...(scope === 'scene' ? { sceneId: 'scene-a' } : {}),
    componentId: 'test-component',
    instanceId,
    eventName,
  }
}

describe('ComponentEventMountBuffer', () => {
  it.each(['scene', 'global'] as const)(
    'replays %s mount events in order before delivering later events',
    (scope) => {
      const delivered: string[] = []
      const buffer = new ComponentEventMountBuffer((detail) => {
        delivered.push(detail.eventName)
      })

      buffer.emit(event(scope, 'created'))
      buffer.emit(event(scope, 'mode-set'))
      expect(delivered).toEqual([])

      buffer.complete(true)
      buffer.emit(event(scope, 'clicked'))

      expect(delivered).toEqual(['created', 'mode-set', 'clicked'])
    },
  )

  it('keeps already-buffered order when replay synchronously produces another event', () => {
    const delivered: string[] = []
    let buffer: ComponentEventMountBuffer
    buffer = new ComponentEventMountBuffer((detail) => {
      delivered.push(detail.eventName)
      if (detail.eventName === 'first') {
        buffer.emit(event('scene', 'follow-up'))
      }
    })
    buffer.emit(event('scene', 'first'))
    buffer.emit(event('scene', 'second'))

    buffer.complete(true)

    expect(delivered).toEqual(['first', 'second', 'follow-up'])
  })

  it('drops capture/no-interaction mount events without disabling later live delivery', () => {
    const delivered: string[] = []
    const buffer = new ComponentEventMountBuffer((detail) => {
      delivered.push(detail.eventName)
    })
    buffer.emit(event('scene', 'mount-only'))

    buffer.complete(false)
    buffer.emit(event('scene', 'after-mount'))

    expect(delivered).toEqual(['after-mount'])
  })

  it('does not leak a disposed scene mount into the next scene mount', () => {
    const delivered: string[] = []
    const oldScene = new ComponentEventMountBuffer((detail) => {
      delivered.push(`old:${detail.eventName}`)
    })
    oldScene.emit(event('scene', 'queued-in-a'))
    oldScene.dispose()

    const nextScene = new ComponentEventMountBuffer((detail) => {
      delivered.push(`new:${detail.eventName}`)
    })
    oldScene.emit(event('scene', 'late-from-a'))
    oldScene.complete(true)
    nextScene.emit(event('scene', 'queued-in-b', 'scene-b-component'))
    nextScene.complete(true)

    expect(delivered).toEqual(['new:queued-in-b'])
  })
})
