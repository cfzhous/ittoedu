export interface MediaBatchImportPlan {
  destination: 'canvas' | 'library'
  overflowToLibrary: boolean
}

export type MediaBatchLibraryFallback = 'batch-size' | 'scene-capacity'

export interface MediaBatchCommitResult {
  destination: 'canvas' | 'library'
  completedCount: number
  placedNodeIds: string[]
  libraryFallback?: MediaBatchLibraryFallback
}

/** Keeps oversized element imports useful without producing an unreadable canvas. */
export function planMediaBatchImport(
  mode: 'add' | 'library',
  placementCount: number,
  maximumCanvasItems: number,
): MediaBatchImportPlan {
  const overflowToLibrary =
    mode === 'add' && placementCount > maximumCanvasItems
  return {
    destination: mode === 'add' && !overflowToLibrary ? 'canvas' : 'library',
    overflowToLibrary,
  }
}

/**
 * Commits the route selected above and degrades atomically rejected canvas
 * placement to a library-only import. Store placement methods return either
 * the complete node-id set or an empty array when capacity is insufficient.
 */
export function commitMediaBatchImport<T>(input: {
  plan: MediaBatchImportPlan
  placements: T[]
  additions: T[]
  placeOnCanvas(items: T[]): string[]
  importIntoLibrary(items: T[]): void
}): MediaBatchCommitResult {
  if (input.plan.destination === 'library') {
    input.importIntoLibrary(input.additions)
    return {
      destination: 'library',
      completedCount: input.additions.length,
      placedNodeIds: [],
      ...(input.plan.overflowToLibrary
        ? { libraryFallback: 'batch-size' as const }
        : {}),
    }
  }

  const placedNodeIds = input.placeOnCanvas(input.placements)
  if (placedNodeIds.length === input.placements.length) {
    return {
      destination: 'canvas',
      completedCount: placedNodeIds.length,
      placedNodeIds,
    }
  }

  input.importIntoLibrary(input.additions)
  return {
    destination: 'library',
    completedCount: input.additions.length,
    placedNodeIds,
    libraryFallback: 'scene-capacity',
  }
}
