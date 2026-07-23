import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlayerKeyboardNavigation } from '../../src/player/PlayerKeyboardNavigation'

const mounted: HTMLElement[] = []

function mount<T extends HTMLElement>(element: T): T {
  document.body.append(element)
  mounted.push(element)
  return element
}

afterEach(() => {
  mounted.splice(0).forEach((element) => element.remove())
})

describe('PlayerKeyboardNavigation', () => {
  it('使用左右方向键导航并遵守页面边界', () => {
    const onNavigate = vi.fn()
    const navigation = new PlayerKeyboardNavigation(3, onNavigate)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    expect(onNavigate).not.toHaveBeenCalled()

    const firstRight = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      cancelable: true,
    })
    window.dispatchEvent(firstRight)
    expect(firstRight.defaultPrevented).toBe(true)
    expect(onNavigate).toHaveBeenLastCalledWith(1)

    navigation.setIndex(2)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(onNavigate).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    expect(onNavigate).toHaveBeenLastCalledWith(1)

    navigation.destroy()
  })

  it.each([
    ['input', document.createElement('input')],
    ['textarea', document.createElement('textarea')],
    ['select', document.createElement('select')],
  ])('焦点位于 %s 时不拦截方向键', (_label, target) => {
    const onNavigate = vi.fn()
    const navigation = new PlayerKeyboardNavigation(2, onNavigate)
    mount(target)

    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
    }))
    expect(onNavigate).not.toHaveBeenCalled()

    navigation.destroy()
  })

  it('焦点位于 contenteditable 自身或后代时不拦截方向键', () => {
    const onNavigate = vi.fn()
    const navigation = new PlayerKeyboardNavigation(2, onNavigate)
    const editor = mount(document.createElement('div'))
    const child = document.createElement('span')
    editor.setAttribute('contenteditable', 'true')
    editor.append(child)

    for (const target of [editor, child]) {
      target.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
      }))
    }
    expect(onNavigate).not.toHaveBeenCalled()

    navigation.destroy()
  })

  it('忽略已阻止、带组合键或无关按键的事件', () => {
    const onNavigate = vi.fn()
    const navigation = new PlayerKeyboardNavigation(2, onNavigate)
    const prevented = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      cancelable: true,
    })
    prevented.preventDefault()

    window.dispatchEvent(prevented)
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      ctrlKey: true,
    }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(onNavigate).not.toHaveBeenCalled()

    navigation.destroy()
  })

  it('销毁后移除键盘监听且重复销毁安全', () => {
    const onNavigate = vi.fn()
    const navigation = new PlayerKeyboardNavigation(2, onNavigate)

    navigation.destroy()
    navigation.destroy()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))

    expect(onNavigate).not.toHaveBeenCalled()
  })
})
