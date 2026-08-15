import type { BrowserWindow } from 'electron'

export class AppState {
  private dirty = false
  private mainWindow: BrowserWindow | null = null

  attachWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  detachWindow(window: BrowserWindow): void {
    if (this.mainWindow === window) this.mainWindow = null
  }

  isDirty(): boolean {
    return this.dirty
  }

  setDirty(dirty: boolean): void {
    this.dirty = dirty
  }
}
