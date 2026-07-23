import type * as Phaser from 'phaser'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => ({
  Scenes: { Events: { POST_UPDATE: 'postupdate' } },
}))

import { createPhaserDomComponentMount } from '../../src/shared/phaserDomComponentHost'

type Listener = () => void

class FakeEvents {
  private readonly listeners = new Map<string, Set<Listener>>()

  on(eventName: string, listener: Listener): void {
    const bucket = this.listeners.get(eventName) ?? new Set<Listener>()
    bucket.add(listener)
    this.listeners.set(eventName, bucket)
  }

  off(eventName: string, listener: Listener): void {
    this.listeners.get(eventName)?.delete(listener)
  }

  emit(eventName: string): void {
    this.listeners.get(eventName)?.forEach((listener) => listener())
  }

  listenerCount(eventName: string): number {
    return this.listeners.get(eventName)?.size ?? 0
  }
}

function harness() {
  const domContainer = document.createElement('div')
  document.body.append(domContainer)
  const events = new FakeEvents()
  const gameObject = {
    active: true,
    pointerEvents: 'none',
    setOrigin: vi.fn(),
    setName: vi.fn(),
    setPosition: vi.fn(),
    setRotation: vi.fn(),
    setScale: vi.fn(),
    setAlpha: vi.fn(),
    setVisible: vi.fn(),
    setDepth: vi.fn(),
    updateSize: vi.fn(),
    destroy: vi.fn(),
    node: null as HTMLElement | null,
  }
  for (const method of [
    gameObject.setOrigin,
    gameObject.setName,
    gameObject.setPosition,
    gameObject.setRotation,
    gameObject.setScale,
    gameObject.setAlpha,
    gameObject.setVisible,
    gameObject.setDepth,
  ]) {
    method.mockReturnValue(gameObject)
  }
  gameObject.destroy.mockImplementation(() => {
    gameObject.active = false
    gameObject.node?.remove()
  })
  const scene = {
    sys: { game: { domContainer } },
    events,
    add: {
      dom: vi.fn((_x: number, _y: number, node: HTMLElement) => {
        gameObject.node = node
        domContainer.append(node)
        return gameObject
      }),
    },
  } as unknown as Phaser.Scene
  const frameRoot = {
    active: true,
    visible: true,
    alpha: 0.8,
    depth: 7,
    parentContainer: null,
    getWorldTransformMatrix: () => ({
      decomposeMatrix: () => ({
        translateX: 120,
        translateY: 90,
        rotation: 0.25,
        scaleX: 1.5,
        scaleY: 0.75,
      }),
    }),
  } as unknown as Phaser.GameObjects.Container
  return { domContainer, events, frameRoot, gameObject, scene }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('Phaser DOM component mount lifecycle', () => {
  it('销毁时移除 POST_UPDATE 监听、DOMElement 和宿主节点', () => {
    const { domContainer, events, frameRoot, gameObject, scene } = harness()
    const mount = createPhaserDomComponentMount(scene, frameRoot, {
      interactive: true,
      instanceId: 'component-one',
      width: 320,
      height: 180,
    })

    expect(domContainer.contains(mount.host)).toBe(true)
    expect(mount.host.shadowRoot?.contains(mount.root)).toBe(true)
    expect(events.listenerCount('postupdate')).toBe(1)
    expect(gameObject.setPosition).toHaveBeenCalledWith(120, 90)
    expect(gameObject.setDepth).toHaveBeenCalledWith(7)

    events.emit('postupdate')
    expect(gameObject.setPosition).toHaveBeenCalledTimes(2)
    mount.destroy()

    expect(events.listenerCount('postupdate')).toBe(0)
    expect(gameObject.destroy).toHaveBeenCalledOnce()
    expect(gameObject.active).toBe(false)
    expect(domContainer.contains(mount.host)).toBe(false)

    mount.destroy()
    expect(gameObject.destroy).toHaveBeenCalledOnce()
  })
})
