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
  listRecentProjects(): Promise<RecentProjectEntry[]>
  openRecentProject(input: { path: string }): Promise<OpenBinaryFileResult>
  saveProject(input: SaveBinaryFileInput): Promise<SaveBinaryFileResult | null>
  writeRecoveryProject(input: RecoveryProjectInput): Promise<void>
  readRecoveryProject(): Promise<RecoveryProjectResult | null>
  clearRecoveryProject(): Promise<void>
  selectImage(): Promise<SelectedImageResult | null>
  selectAudio(): Promise<SelectedMediaResult | null>
  selectVideo(): Promise<SelectedMediaResult | null>
  selectComponentPackage(): Promise<OpenBinaryFileResult | null>
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
    extension: 'pptx'
    bytes: Uint8Array
  }): Promise<{ path: string } | null>
  exportPdf(input: {
    suggestedName: string
    html: string
  }): Promise<{ path: string } | null>
  openPreview(input: { html: string }): Promise<void>
  confirmDiscardChanges(): Promise<'discard' | 'cancel'>
  setDirtyState(dirty: boolean): Promise<void>
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
  listRecentProjects: 'project:list-recent',
  openRecentProject: 'project:open-recent',
  saveProject: 'project:save',
  writeRecoveryProject: 'project:write-recovery',
  readRecoveryProject: 'project:read-recovery',
  clearRecoveryProject: 'project:clear-recovery',
  selectImage: 'asset:select-image',
  selectAudio: 'asset:select-audio',
  selectVideo: 'asset:select-video',
  selectComponent: 'component:select-package',
  exportHtml: 'export:write-html',
  exportWebPackage: 'export:write-web-package',
  exportBinary: 'export:write-binary',
  exportPdf: 'export:write-pdf',
  openPreview: 'preview:open',
  confirmDiscard: 'app:confirm-discard',
  dirtyState: 'app:dirty-state',
  requestSave: 'app:request-save',
  requestSaveAndClose: 'app:request-save-and-close',
  saveAndCloseResult: 'app:save-and-close-result',
  reportDiagnostic: 'diagnostics:report',
  exportDiagnostics: 'diagnostics:export',
} as const
