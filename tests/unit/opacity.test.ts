import { describe, expect, it } from 'vitest'
import {
  opacityToTransparencyPercent,
  transparencyPercentToOpacity,
} from '@/shared/opacity'

describe('editor transparency semantics', () => {
  it('maps 0% transparency to opaque and 100% to invisible', () => {
    expect(transparencyPercentToOpacity(0)).toBe(1)
    expect(transparencyPercentToOpacity(35)).toBe(0.65)
    expect(transparencyPercentToOpacity(100)).toBe(0)
  })

  it('maps stored opacity back to a bounded display percentage', () => {
    expect(opacityToTransparencyPercent(1)).toBe(0)
    expect(opacityToTransparencyPercent(0.65)).toBe(35)
    expect(opacityToTransparencyPercent(0)).toBe(100)
    expect(opacityToTransparencyPercent(2)).toBe(0)
    expect(opacityToTransparencyPercent(-1)).toBe(100)
  })
})
