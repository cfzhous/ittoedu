import { describe, expect, it } from 'vitest'
import {
  calculateVideoFrameLayout,
  resolveVideoPosterTime,
} from '@/renderer/phaser/adapters/videoPosterLayout'

describe('video poster layout', () => {
  it('contain 在目标框中居中显示完整画面', () => {
    const layout = calculateVideoFrameLayout(1920, 1080, 100, 100, 'contain')
    expect(layout.sourceWidth).toBe(1920)
    expect(layout.destinationX).toBe(0)
    expect(layout.destinationY).toBeCloseTo(21.875)
    expect(layout.destinationWidth).toBe(100)
    expect(layout.destinationHeight).toBeCloseTo(56.25)
  })

  it('cover 居中裁切源画面以铺满目标框', () => {
    const layout = calculateVideoFrameLayout(1920, 1080, 100, 100, 'cover')
    expect(layout.sourceX).toBe(420)
    expect(layout.sourceY).toBe(0)
    expect(layout.sourceWidth).toBe(1080)
    expect(layout.sourceHeight).toBe(1080)
    expect(layout.destinationWidth).toBe(100)
    expect(layout.destinationHeight).toBe(100)
  })

  it('stretch 直接映射完整源画面，并修正无效尺寸', () => {
    expect(calculateVideoFrameLayout(0, -2, 320, 180, 'stretch')).toEqual({
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 1,
      sourceHeight: 1,
      destinationX: 0,
      destinationY: 0,
      destinationWidth: 320,
      destinationHeight: 180,
    })
  })

  it('海报时间不会为负或恰好落在视频末尾', () => {
    expect(resolveVideoPosterTime(-2, 10)).toBe(0)
    expect(resolveVideoPosterTime(12, 10)).toBeCloseTo(9.999)
    expect(resolveVideoPosterTime(3, Number.NaN)).toBe(3)
  })
})
