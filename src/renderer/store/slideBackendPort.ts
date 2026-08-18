import type {
  SlideAuthoringBackend,
  SlideCommandResult,
} from '../course/slideAuthoringBackend'

/**
 * Minimal Slide backend port for R2-SEAM.
 *
 * Read snapshot: `backend.getSnapshot()` after `selectSlideCandidateBackend`.
 * Execute command: call methods on `SlideAuthoringBackend` (or `executeSlideCandidateCommand`).
 * Hold candidate: `injectV9SlideCandidateBackend` (test/dev only; not App/URL/menu).
 * Discard candidate: `clearV9SlideCandidateBackend`.
 * Save candidate: read `backend.getSession().history.present`; do not write V8 `project` / `saveProject`.
 */
export type V8SlideBackend = { readonly kind: 'v8' }
export type SlideBackend = V8SlideBackend | SlideAuthoringBackend
export type SlideBackendKind = SlideBackend['kind']

export const V8_SLIDE_BACKEND: V8SlideBackend = Object.freeze({ kind: 'v8' })

export const SLIDE_BACKEND_DUAL_WRITE_REFUSED =
  '当前会话已持有 V9 Slide candidate，不能同时写入 V8 工程。'

export const SLIDE_BACKEND_NOT_CANDIDATE = 'not-v9-slide-candidate'

export function isV9SlideCandidateBackend(
  backend: SlideBackend | null | undefined,
): backend is SlideAuthoringBackend {
  return backend?.kind === 'slide-authoring'
}

export function getSlideBackendKind(
  backend: SlideBackend | null | undefined,
): SlideBackendKind {
  return isV9SlideCandidateBackend(backend) ? 'slide-authoring' : 'v8'
}

export function executeSlideCandidateCommand(
  backend: SlideBackend | null | undefined,
  run: (candidate: SlideAuthoringBackend) => SlideCommandResult,
): SlideCommandResult {
  if (!isV9SlideCandidateBackend(backend)) {
    return {
      ok: false,
      reason: SLIDE_BACKEND_NOT_CANDIDATE,
      historyEntry: false,
    }
  }
  return run(backend)
}
