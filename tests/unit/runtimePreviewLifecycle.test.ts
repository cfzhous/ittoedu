import { describe, expect, it, vi } from 'vitest'
import {
  releaseRuntimePreviewResources,
  stopRuntimePreviewFrame,
  type ActiveRuntimePreviewResources,
} from '@/renderer/preview/runtimePreviewLifecycle'

interface FakeResource {
  revoke(): void
}

function createResources(token = 'current') {
  const documentRevoke = vi.fn()
  const payloadRevoke = vi.fn()
  const resources: ActiveRuntimePreviewResources<FakeResource, FakeResource> = {
    token,
    document: { revoke: documentRevoke },
    payload: { revoke: payloadRevoke },
  }
  return { resources, documentRevoke, payloadRevoke }
}

describe('runtime preview resource lifecycle', () => {
  it('synchronously navigates the failed iframe into its pagehide teardown', () => {
    const frame = { src: 'blob:current-preview' }

    stopRuntimePreviewFrame(frame)

    expect(frame.src).toBe('about:blank')
  })

  it('atomically releases the matching active preview resources', () => {
    const { resources, documentRevoke, payloadRevoke } = createResources()

    expect(releaseRuntimePreviewResources(resources, 'current')).toBeNull()
    expect(documentRevoke).toHaveBeenCalledOnce()
    expect(payloadRevoke).toHaveBeenCalledOnce()
  })

  it('does not release resources owned by a newer preview token', () => {
    const { resources, documentRevoke, payloadRevoke } = createResources('newer')

    expect(releaseRuntimePreviewResources(resources, 'stale')).toBe(resources)
    expect(documentRevoke).not.toHaveBeenCalled()
    expect(payloadRevoke).not.toHaveBeenCalled()
  })

  it('still releases the payload when document cleanup fails', () => {
    const { resources, documentRevoke, payloadRevoke } = createResources()
    documentRevoke.mockImplementation(() => {
      throw new Error('document cleanup failed')
    })

    expect(releaseRuntimePreviewResources(resources, 'current')).toBeNull()
    expect(payloadRevoke).toHaveBeenCalledOnce()
  })
})
