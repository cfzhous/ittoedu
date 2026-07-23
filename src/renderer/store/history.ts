import type { Patch } from 'immer'
import type { ComponentPackageData } from '../../shared/componentTypes'
import type { ProjectDocument } from '../../shared/projectTypes'
import { MAX_HISTORY_STEPS } from '../../shared/constants'

export interface ComponentPackageHistoryChange {
  packageId: string
  before?: ComponentPackageData
  after?: ComponentPackageData
}

export interface HistoryEntry {
  patches: Patch[]
  inversePatches: Patch[]
  /** Keeps the executable package in lockstep with project metadata on undo/redo. */
  componentPackageChange?: ComponentPackageHistoryChange
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
  componentPackageChange?: ComponentPackageHistoryChange,
): HistoryState {
  if (patches.length === 0 && !componentPackageChange) return history
  return {
    past: [
      ...history.past,
      { patches, inversePatches, componentPackageChange },
    ].slice(-MAX_HISTORY_STEPS),
    future: [],
  }
}
