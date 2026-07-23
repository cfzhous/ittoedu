import { describe, expect, it, vi } from 'vitest'
import { PlayerControls } from '../../src/player/PlayerControls'

describe('PlayerControls', () => {
  it('支持按钮、页码和边界禁用', () => {
    const parent = document.createElement('div')
    document.body.append(parent)
    const visited: number[] = []
    const onReplay = vi.fn()
    let controls: PlayerControls

    controls = new PlayerControls(parent, 3, (targetIndex) => {
      visited.push(targetIndex)
      controls.setIndex(targetIndex)
    }, onReplay)

    expect(controls.pageIndicator).toHaveTextContent('1 / 3')
    expect(controls.previousButton).toBeDisabled()
    expect(controls.nextButton).toBeEnabled()

    controls.nextButton.click()
    expect(visited).toEqual([1])
    expect(controls.pageIndicator).toHaveTextContent('2 / 3')
    controls.replayButton.click()
    expect(onReplay).toHaveBeenCalledOnce()

    controls.nextButton.click()
    expect(visited).toEqual([1, 2])
    expect(controls.nextButton).toBeDisabled()

    controls.previousButton.click()
    expect(visited).toEqual([1, 2, 1])
    expect(controls.pageIndicator).toHaveTextContent('2 / 3')

    controls.setIndex(0)
    controls.previousButton.click()
    expect(visited).toEqual([1, 2, 1])

    controls.destroy()
    parent.remove()
  })

  it('销毁后移除按钮监听并清理控制栏', () => {
    const parent = document.createElement('div')
    document.body.append(parent)
    const onNavigate = vi.fn()
    const controls = new PlayerControls(parent, 2, onNavigate)

    controls.destroy()
    controls.nextButton.click()
    expect(onNavigate).not.toHaveBeenCalled()
    expect(parent).toBeEmptyDOMElement()
    parent.remove()
  })
})
