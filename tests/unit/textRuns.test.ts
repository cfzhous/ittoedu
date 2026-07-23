import { describe, expect, it } from 'vitest'
import type { TextRun } from '@/shared/projectTypes'
import { remapTextRuns } from '@/shared/textRuns'

describe('remapTextRuns', () => {
  it('moves formatting with an unchanged suffix after deleting text before it', () => {
    const runs: TextRun[] = [
      { start: 1, end: 4, style: { color: '#ef4444', bold: true } },
    ]

    expect(remapTextRuns('ABCDE', 'BCDE', runs)).toEqual([
      { start: 0, end: 3, style: { color: '#ef4444', bold: true } },
    ])
  })

  it('inherits an unambiguous surrounding style for inserted Unicode text', () => {
    const runs: TextRun[] = [
      { start: 0, end: 2, style: { underline: true, highlightColor: '#fff3a3' } },
    ]

    expect(remapTextRuns('重点', '重⭐点', runs)).toEqual([
      { start: 0, end: 3, style: { underline: true, highlightColor: '#fff3a3' } },
    ])
  })

  it('preserves explicit false and null overrides', () => {
    const runs: TextRun[] = [
      {
        start: 1,
        end: 3,
        style: {
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          highlightColor: null,
        },
      },
    ]

    expect(remapTextRuns('ABCD', 'XABCD', runs)).toEqual([
      {
        start: 2,
        end: 4,
        style: {
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          highlightColor: null,
        },
      },
    ])
  })
})
