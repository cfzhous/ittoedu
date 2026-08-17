import { describe, expect, it } from 'vitest'
import {
  buildFlowRuntimeToc,
  flowRuntimeTocAnchorId,
} from '@/player/surfaces/flow/flowRuntimeToc'
import type { FlowSurfaceDocument } from '@/shared/courseProjectTypes'

function flowDocument(): FlowSurfaceDocument {
  return {
    id: 'flow-toc',
    type: 'flow',
    title: '讲义',
    layout: { readingWidth: 760, wideContentWidth: 1120 },
    blocks: [
      { id: 'h1', type: 'heading', level: 1, text: '阅读任务' },
      { id: 'p1', type: 'paragraph', text: '普通段落不应出现在运行目录' },
      {
        id: 'sec-a',
        type: 'section',
        title: '材料 A',
        collapsedByDefault: false,
        blocks: [
          { id: 'h2', type: 'heading', level: 2, text: '人口与工厂' },
          { id: 'table-1', type: 'table', columns: [], rows: [] },
        ],
      },
    ],
    surfaceLayerItems: [],
  }
}

describe('Flow runtime TOC model', () => {
  it('lists only navigable heading/section anchors with stable ids', () => {
    const toc = buildFlowRuntimeToc(flowDocument())
    expect(toc.map((entry) => [entry.blockId, entry.kind, entry.anchorId])).toEqual([
      ['h1', 'heading', flowRuntimeTocAnchorId('h1')],
      ['sec-a', 'section', flowRuntimeTocAnchorId('sec-a')],
      ['h2', 'heading', flowRuntimeTocAnchorId('h2')],
    ])
    expect(toc.some((entry) => entry.blockId === 'p1')).toBe(false)
    expect(toc.some((entry) => entry.blockId === 'table-1')).toBe(false)
  })
})
