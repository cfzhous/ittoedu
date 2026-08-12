import type { Patch } from 'immer'
import type { ComponentPackageData } from '../../shared/componentTypes'
import type { ProjectDocument } from '../../shared/projectTypes'
import { MAX_HISTORY_STEPS } from '../../shared/constants'

export interface ComponentPackageHistoryChange {
  packageId: string
  before?: ComponentPackageData
  after?: ComponentPackageData
}

export interface AssetFileHistoryChange {
  assetId: string
  before?: Uint8Array
  after?: Uint8Array
}

export interface HistoryResourceChanges {
  componentPackageChanges?: ComponentPackageHistoryChange[]
  assetFileChanges?: AssetFileHistoryChange[]
}

export interface HistoryEntry {
  patches: Patch[]
  inversePatches: Patch[]
  /** Keeps executable packages in lockstep with project metadata on undo/redo. */
  componentPackageChanges?: ComponentPackageHistoryChange[]
  /** Keeps imported binary resources in lockstep with project asset metadata. */
  assetFileChanges?: AssetFileHistoryChange[]
}

export interface HistoryState {
  past: HistoryEntry[]
  future: HistoryEntry[]
}

export const emptyHistory = (): HistoryState => ({ past: [], future: [] })

export function cloneProject(project: ProjectDocument): ProjectDocument {
  return structuredClone(project)
}

export function pushHistory(
  history: HistoryState,
  patches: Patch[],
  inversePatches: Patch[],
  resourceChanges: HistoryResourceChanges = {},
): HistoryState {
  const componentPackageChanges = resourceChanges.componentPackageChanges
    ?.map((change) => ({ ...change }))
  const assetFileChanges = resourceChanges.assetFileChanges?.map((change) => ({
    assetId: change.assetId,
    ...(change.before === undefined ? {} : { before: change.before.slice() }),
    ...(change.after === undefined ? {} : { after: change.after.slice() }),
  }))
  if (
    patches.length === 0 &&
    !componentPackageChanges?.length &&
    !assetFileChanges?.length
  ) {
    return history
  }
  return {
    past: [
      ...history.past,
      {
        patches,
        inversePatches,
        ...(componentPackageChanges?.length
          ? { componentPackageChanges }
          : {}),
        ...(assetFileChanges?.length ? { assetFileChanges } : {}),
      },
    ].slice(-MAX_HISTORY_STEPS),
    future: [],
  }
}
