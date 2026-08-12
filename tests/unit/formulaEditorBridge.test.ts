import { describe, expect, it, vi } from 'vitest'
import { EditorPhaserBridge } from '@/renderer/phaser/EditorPhaserBridge'

describe('FormulaNode canvas authoring bridge', () => {
  it('delivers formula double-click separately and supports disposal by unsubscribe', () => {
    const bridge = new EditorPhaserBridge()
    const formula = vi.fn()
    const text = vi.fn()
    const unsubscribe = bridge.onFormulaDoubleClick(formula)
    bridge.onTextDoubleClick(text)

    bridge.emitFormulaDoubleClick('formula-1')
    expect(formula).toHaveBeenCalledWith('formula-1')
    expect(text).not.toHaveBeenCalled()

    unsubscribe()
    bridge.emitFormulaDoubleClick('formula-2')
    expect(formula).toHaveBeenCalledTimes(1)
  })
})
