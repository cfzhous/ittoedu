export interface AuthoringCanvasReadiness {
  canvasMode: 'edit' | 'run'
  playerReady: boolean
  snapshotPending: boolean
  hasPreviewFeedback: boolean
  generationCurrent: boolean
}

/**
 * Runtime/component authoring is safe only after the current preview
 * generation has completed its full snapshot handshake. Keeping this as one
 * predicate prevents render, hit testing and event entry points from drifting
 * into subtly different definitions of "ready".
 */
export function isAuthoringCanvasInteractive({
  canvasMode,
  playerReady,
  snapshotPending,
  hasPreviewFeedback,
  generationCurrent,
}: Readonly<AuthoringCanvasReadiness>): boolean {
  return canvasMode === 'edit' &&
    playerReady &&
    !snapshotPending &&
    !hasPreviewFeedback &&
    generationCurrent
}
