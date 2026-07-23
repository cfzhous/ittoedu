import type { ProjectDocument } from '@/shared/projectTypes'
import {
  createProjectArchive,
  createProjectArchiveAsync,
  type ProjectArchiveData,
} from './projectArchive'

export interface SavedProjectArchive {
  project: ProjectDocument
  bytes: Uint8Array
}

export function saveProject(
  data: ProjectArchiveData,
  now: string | Date = new Date(),
): SavedProjectArchive {
  const updatedAt = typeof now === 'string' ? now : now.toISOString()
  const project: ProjectDocument = {
    ...structuredClone(data.project),
    updatedAt,
  }
  return {
    project,
    bytes: createProjectArchive({
      project,
      assetFiles: data.assetFiles,
      componentFiles: data.componentFiles,
    }),
  }
}

export async function saveProjectAsync(
  data: ProjectArchiveData,
  now: string | Date = new Date(),
  options: { signal?: AbortSignal } = {},
): Promise<SavedProjectArchive> {
  const updatedAt = typeof now === 'string' ? now : now.toISOString()
  const project: ProjectDocument = {
    ...structuredClone(data.project),
    updatedAt,
  }
  return {
    project,
    bytes: await createProjectArchiveAsync({
      project,
      assetFiles: data.assetFiles,
      componentFiles: data.componentFiles,
    }, options),
  }
}

export { createProjectArchive, createProjectArchive as serializeProjectArchive }
