import type {
  SlideAuthoringBackend,
  SlideCommandResult,
} from '../course/slideAuthoringBackend'

/**
 * Slide authoring backend port.
 *
 * Store holds exactly one V9 Course Project document and one Slide authoring backend.
 */
export type SlideBackend = SlideAuthoringBackend
export type SlideBackendKind = SlideBackend['kind']

export function isSlideAuthoringBackend(
  backend: SlideBackend | null | undefined,
): backend is SlideAuthoringBackend {
  return backend?.kind === 'slide-authoring'
}

export const isV9SlideCandidateBackend = isSlideAuthoringBackend
export const isSlideCandidateBackend = isSlideAuthoringBackend

export function getSlideBackendKind(
  backend: SlideBackend | null | undefined,
): SlideBackendKind {
  return 'slide-authoring'
}

export function executeSlideAuthoringCommand(
  backend: SlideBackend | null | undefined,
  run: (authoring: SlideAuthoringBackend) => SlideCommandResult,
): SlideCommandResult {
  if (!isSlideAuthoringBackend(backend)) {
    return {
      ok: false,
      reason: 'not-slide-authoring-backend',
      historyEntry: false,
    }
  }
  return run(backend)
}

export const executeSlideCandidateCommand = executeSlideAuthoringCommand
export const SLIDE_BACKEND_NOT_CANDIDATE = 'not-slide-authoring-backend'
