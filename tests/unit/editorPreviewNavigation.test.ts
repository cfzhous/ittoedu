import { describe, expect, it } from 'vitest'
import { isAllowedEditorPreviewFrameUrl } from '../../src/main/security'

describe('editor preview frame navigation', () => {
  it('allows same-origin Blob frames for packaged and development entries', () => {
    expect(isAllowedEditorPreviewFrameUrl(
      'blob:courseware-editor://app/2a8ac954-6823-46ae-81e8-725346f50080',
      'courseware-editor://app/index.html',
    )).toBe(true)
    expect(isAllowedEditorPreviewFrameUrl(
      'blob:http://localhost:5173/2a8ac954-6823-46ae-81e8-725346f50080',
      'http://localhost:5173/',
    )).toBe(true)
  })

  it.each([
    'data:text/html,unsafe',
    'http://localhost:5173/preview.html',
    'file:///C:/preview.html',
    'blob:https://example.com/2a8ac954-6823-46ae-81e8-725346f50080',
    'blob:courseware-editor://other/2a8ac954-6823-46ae-81e8-725346f50080',
    'blob:null/2a8ac954-6823-46ae-81e8-725346f50080',
  ])('rejects non-preview navigation %s', (candidate) => {
    expect(isAllowedEditorPreviewFrameUrl(
      candidate,
      'courseware-editor://app/index.html',
    )).toBe(false)
  })

  it('does not authorize file entries as Blob preview origins', () => {
    expect(isAllowedEditorPreviewFrameUrl(
      'blob:file:///C:/editor/preview-id',
      'file:///C:/editor/index.html',
    )).toBe(false)
  })
})
