import type { RuntimePreviewBlobResources } from './runtimePreviewDocument'
import type { RuntimePreviewPayloadResources } from './runtimePreviewPayload'

interface RevocablePreviewResource {
  revoke(): void
}

interface RuntimePreviewFrame {
  src: string
}

export interface ActiveRuntimePreviewResources<
  TDocument extends RevocablePreviewResource = RuntimePreviewBlobResources,
  TPayload extends RevocablePreviewResource = RuntimePreviewPayloadResources,
> {
  token: string
  document: TDocument
  payload: TPayload
}

/**
 * Releases only the preview session that still owns the active iframe. The
 * returned value is intended to be assigned back to the owner ref, making a
 * matching release a single take-and-dispose operation.
 */
export function releaseRuntimePreviewResources<
  TDocument extends RevocablePreviewResource,
  TPayload extends RevocablePreviewResource,
>(
  current: ActiveRuntimePreviewResources<TDocument, TPayload> | null,
  expectedToken: string,
): ActiveRuntimePreviewResources<TDocument, TPayload> | null {
  if (!current || current.token !== expectedToken) return current

  // Cleanup must never prevent the retry UI from being committed. Both
  // resources are best-effort and their concrete revoke methods are
  // idempotent.
  try {
    current.document.revoke()
  } catch {
    // Ignore browser URL cleanup failures and continue releasing the payload.
  }
  try {
    current.payload.revoke()
  } catch {
    // Ignore browser URL cleanup failures; the owner is still retired.
  }
  return null
}

/**
 * Navigating the sandbox away synchronously starts its pagehide teardown. The
 * bootstrap uses that event to revoke iframe-owned asset URLs and the Player
 * uses it to destroy runtimes, component mounts and GPU resources. React can
 * then remove the blanked iframe in the same state commit.
 */
export function stopRuntimePreviewFrame(
  frame: RuntimePreviewFrame | null,
): void {
  if (!frame) return
  try {
    frame.src = 'about:blank'
  } catch {
    // State teardown still removes an iframe whose navigation was rejected.
  }
}
