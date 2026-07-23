import { describe, expect, it } from 'vitest'
import {
  isCurrentRuntimePreviewBootstrapMessage,
  isCurrentRuntimePreviewPlayerMessage,
} from '@/renderer/preview/runtimePreviewProtocol'

describe('runtime preview bridge session binding', () => {
  it('accepts only Player events carrying the current preview token', () => {
    expect(isCurrentRuntimePreviewPlayerMessage(
      { type: 'courseware-player:scene-change', token: 'current' },
      'current',
    )).toBe(true)

    expect(isCurrentRuntimePreviewPlayerMessage(
      { type: 'courseware-player:scene-change', token: 'stale' },
      'current',
    )).toBe(false)
    expect(isCurrentRuntimePreviewPlayerMessage(
      { type: 'courseware-player:scene-change' },
      'current',
    )).toBe(false)
    expect(isCurrentRuntimePreviewPlayerMessage(
      { type: 'courseware-player:scene-change', token: 'current' },
      null,
    )).toBe(false)
  })

  it('binds bootstrap ready and error messages to both type and token', () => {
    expect(isCurrentRuntimePreviewBootstrapMessage(
      { type: 'courseware-preview-bootstrap:ready', token: 'current' },
      'current',
      'courseware-preview-bootstrap:ready',
    )).toBe(true)
    expect(isCurrentRuntimePreviewBootstrapMessage(
      { type: 'courseware-preview-bootstrap:error', token: 'current' },
      'current',
      'courseware-preview-bootstrap:ready',
    )).toBe(false)
    expect(isCurrentRuntimePreviewBootstrapMessage(
      { type: 'courseware-preview-bootstrap:ready', token: 'stale' },
      'current',
      'courseware-preview-bootstrap:ready',
    )).toBe(false)
  })
})
