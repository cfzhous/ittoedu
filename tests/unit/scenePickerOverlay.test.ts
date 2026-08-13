import '@testing-library/jest-dom/vitest'
import { fireEvent } from '@testing-library/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScenePickerOverlay } from '../../src/player/ScenePickerOverlay'

const scenes = [
  { id: 'scene_intro', name: '课程导入' },
  { id: 'scene_practice', name: '课堂练习' },
  { id: 'scene_summary', name: '总结提升' },
]

function createStage(): HTMLElement {
  const stage = document.createElement('section')
  stage.style.position = 'relative'
  document.body.append(stage)
  return stage
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('ScenePickerOverlay', () => {
  it('lists scenes in order, highlights the current scene and supports keyboard selection', async () => {
    const stage = createStage()
    const restoreTarget = document.createElement('button')
    restoreTarget.textContent = '画布控制器'
    document.body.prepend(restoreTarget)
    restoreTarget.focus()
    const onSelect = vi.fn()
    const picker = new ScenePickerOverlay({ stage, scenes, onSelect })

    picker.open('scene_practice')
    await Promise.resolve()

    const dialog = stage.querySelector('[role="dialog"][data-scene-picker]')
    const buttons = [...stage.querySelectorAll<HTMLButtonElement>(
      '.lesson-scene-picker__item',
    )]
    expect(dialog).toHaveAccessibleName('场景目录')
    expect(buttons.map((button) => button.dataset.sceneId)).toEqual([
      'scene_intro',
      'scene_practice',
      'scene_summary',
    ])
    expect(buttons[1]).toHaveAttribute('aria-current', 'page')
    expect(document.activeElement).toBe(buttons[1])

    fireEvent.keyDown(buttons[1]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(buttons[2])
    fireEvent.keyDown(buttons[2]!, { key: 'Home' })
    expect(document.activeElement).toBe(buttons[0])
    fireEvent.keyDown(buttons[0]!, { key: 'End' })
    expect(document.activeElement).toBe(buttons[2])

    fireEvent.click(buttons[2]!)
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith('scene_summary', false)
    expect(picker.isOpen).toBe(false)
    expect(stage.querySelector('.lesson-scene-picker-layer')).not.toBeVisible()
    await Promise.resolve()
    expect(document.activeElement).toBe(restoreTarget)

    picker.destroy()
  })

  it('closes on outside click, Escape and destroy without selecting a scene', async () => {
    const stage = createStage()
    const onSelect = vi.fn()
    const onClose = vi.fn()
    const picker = new ScenePickerOverlay({ stage, scenes, onSelect, onClose })
    const layer = stage.querySelector<HTMLDivElement>(
      '.lesson-scene-picker-layer',
    )!

    picker.open('scene_intro')
    await Promise.resolve()
    fireEvent.click(layer)
    expect(picker.isOpen).toBe(false)

    picker.open('scene_intro')
    await Promise.resolve()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(picker.isOpen).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onSelect).not.toHaveBeenCalled()

    picker.open('scene_intro')
    picker.destroy()
    expect(stage.querySelector('.lesson-scene-picker-layer')).toBeNull()
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('binds guard bypass to one open session and clears it on close', async () => {
    const stage = createStage()
    const onSelect = vi.fn()
    const picker = new ScenePickerOverlay({ stage, scenes, onSelect })

    picker.open('scene_intro', { bypassNavigationGuards: true })
    picker.close()
    picker.open('scene_intro')
    await Promise.resolve()
    fireEvent.click(stage.querySelector<HTMLButtonElement>(
      '[data-scene-id="scene_summary"]',
    )!)
    expect(onSelect).toHaveBeenLastCalledWith('scene_summary', false)

    picker.open('scene_intro', { bypassNavigationGuards: true })
    await Promise.resolve()
    fireEvent.click(stage.querySelector<HTMLButtonElement>(
      '[data-scene-id="scene_practice"]',
    )!)
    expect(onSelect).toHaveBeenLastCalledWith('scene_practice', true)
    picker.destroy()
  })
})
