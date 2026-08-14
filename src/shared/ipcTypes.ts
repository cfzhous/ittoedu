import type {
  ComponentCatalogPackageFile,
  ComponentCatalogSnapshot,
} from './componentCatalog'
import type {
  CurrentCourseSelectionUpdate,
} from './authoringAddress'

export interface OpenBinaryFileResult {
  path: string
  name: string
  bytes: Uint8Array
}

export interface SaveBinaryFileInput {
  path?: string
  suggestedName: string
  bytes: Uint8Array
}

export interface SaveBinaryFileResult {
  path: string
}

export interface SelectedImageResult extends OpenBinaryFileResult {
  mimeType: string
}

export interface SelectedMediaResult extends OpenBinaryFileResult {
  mimeType: string
}

export interface BatchFileDigest {
  /** SHA-256 of the exact selected bytes, encoded as lowercase hexadecimal. */
  sha256: string
}

export type SelectedBinaryBatchFile = OpenBinaryFileResult & BatchFileDigest
export type SelectedImageBatchFile = SelectedImageResult & BatchFileDigest
export type SelectedMediaBatchFile = SelectedMediaResult & BatchFileDigest

export interface BatchFileRejection {
  path: string
  name: string
  code: string
  title: string
  message: string
  suggestion: string
}

/**
 * A cancelled system dialog returns `null`. Once the user confirms a selection,
 * every path is represented exactly once in either `accepted` or `rejected`.
 */
export interface SelectedFileBatch<T extends OpenBinaryFileResult> {
  selectedCount: number
  acceptedByteLength: number
  accepted: T[]
  rejected: BatchFileRejection[]
}

export interface RecentProjectEntry {
  path: string
  name: string
  lastOpenedAt: number
}

export interface RecoveryProjectInput {
  projectName: string
  projectPath?: string
  bytes: Uint8Array
}

export interface RecoveryProjectResult extends RecoveryProjectInput {
  savedAt: number
}

export interface DesktopAPI {
  openProject(): Promise<OpenBinaryFileResult | null>
  selectCourseAuthoringPatch(): Promise<OpenBinaryFileResult | null>
  listRecentProjects(): Promise<RecentProjectEntry[]>
  openRecentProject(input: { path: string }): Promise<OpenBinaryFileResult>
  saveProject(input: SaveBinaryFileInput): Promise<SaveBinaryFileResult | null>
  writeRecoveryProject(input: RecoveryProjectInput): Promise<void>
  readRecoveryProject(): Promise<RecoveryProjectResult | null>
  clearRecoveryProject(): Promise<void>
  selectImage(): Promise<SelectedImageResult | null>
  selectImages(): Promise<SelectedFileBatch<SelectedImageBatchFile> | null>
  selectAudio(): Promise<SelectedMediaResult | null>
  selectAudios(): Promise<SelectedFileBatch<SelectedMediaBatchFile> | null>
  selectVideo(): Promise<SelectedMediaResult | null>
  selectVideos(): Promise<SelectedFileBatch<SelectedMediaBatchFile> | null>
  selectComponentPackage(): Promise<OpenBinaryFileResult | null>
  selectComponentPackages(): Promise<SelectedFileBatch<SelectedBinaryBatchFile> | null>
  loadComponentCatalog(): Promise<ComponentCatalogSnapshot>
  selectComponentCatalogSource(): Promise<ComponentCatalogSnapshot | null>
  setComponentCatalogSourceTrust(input: {
    sourceId: string
    trust: 'trusted' | 'prompt'
  }): Promise<ComponentCatalogSnapshot>
  readComponentCatalogPackage(input: {
    sourceId: string
    packageId: string
    version: string
  }): Promise<ComponentCatalogPackageFile>
  exportHtml(input: {
    suggestedName: string
    html: string
  }): Promise<{ path: string } | null>
  exportWebPackage(input: {
    suggestedName: string
    bytes: Uint8Array
  }): Promise<{ path: string } | null>
  exportBinary(input: {
    suggestedName: string
    extension: 'pptx' | 'docx' | 'json'
    bytes: Uint8Array
  }): Promise<{ path: string } | null>
  exportPdf(input: {
    suggestedName: string
    html: string
  }): Promise<{ path: string } | null>
  openPreview(input: { html: string }): Promise<void>
  confirmDiscardChanges(): Promise<'discard' | 'cancel'>
  setDirtyState(dirty: boolean): Promise<void>
  updateCurrentCourseSelection(input: CurrentCourseSelectionUpdate): Promise<void>
  onRequestSave(handler: () => void): () => void
  onRequestSaveAndClose(handler: () => Promise<boolean>): () => void
  reportDiagnostic(input: {
    source: 'renderer' | 'preview' | 'component'
    message: string
    stack?: string
  }): Promise<void>
  exportDiagnostics(): Promise<{ path: string } | null>
}

export const IPC_CHANNELS = {
  openProject: 'project:open',
  selectCourseAuthoringPatch: 'project:select-authoring-patch',
  listRecentProjects: 'project:list-recent',
  openRecentProject: 'project:open-recent',
  saveProject: 'project:save',
  writeRecoveryProject: 'project:write-recovery',
  readRecoveryProject: 'project:read-recovery',
  clearRecoveryProject: 'project:clear-recovery',
  selectImage: 'asset:select-image',
  selectImages: 'asset:select-images',
  selectAudio: 'asset:select-audio',
  selectAudios: 'asset:select-audios',
  selectVideo: 'asset:select-video',
  selectVideos: 'asset:select-videos',
  selectComponent: 'component:select-package',
  selectComponents: 'component:select-packages',
  loadComponentCatalog: 'component-catalog:load',
  selectComponentCatalogSource: 'component-catalog:select-source',
  setComponentCatalogSourceTrust: 'component-catalog:set-source-trust',
  readComponentCatalogPackage: 'component-catalog:read-package',
  exportHtml: 'export:write-html',
  exportWebPackage: 'export:write-web-package',
  exportBinary: 'export:write-binary',
  exportPdf: 'export:write-pdf',
  openPreview: 'preview:open',
  confirmDiscard: 'app:confirm-discard',
  dirtyState: 'app:dirty-state',
  updateCurrentCourseSelection: 'app:update-current-course-selection',
  requestSave: 'app:request-save',
  requestSaveAndClose: 'app:request-save-and-close',
  saveAndCloseResult: 'app:save-and-close-result',
  reportDiagnostic: 'diagnostics:report',
  exportDiagnostics: 'diagnostics:export',
} as const
