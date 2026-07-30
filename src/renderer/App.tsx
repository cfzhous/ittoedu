import { AlertCircle, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentPackageData } from '../shared/componentTypes'
import {
  RECOMMENDED_PROJECT_SCENES,
  RECOMMENDED_SCENE_NODES,
} from '../shared/constants'
import { toUserMessage, UserFacingError } from '../shared/errors'
import type { RecentProjectEntry, RecoveryProjectResult } from '../shared/ipcTypes'
import type { ProjectDocument } from '../shared/projectTypes'
import { collectProjectHealth, summarizeProjectHealth } from '../shared/projectHealth'
import { buildExportPayload } from './export/buildExportPayload'
import { buildStandaloneHtml } from './export/buildStandaloneHtml'
import { buildWebPackageFromProjectAsync } from './export/buildWebPackage'
import { buildPdfPrintHtml, buildPptx } from './export/buildPptx'
import {
  SINGLE_HTML_HARD_LIMIT_BYTES,
  SINGLE_HTML_WARNING_BYTES,
  utf8ByteLength,
} from './export/exportSize'
import { loadPlayerBundle } from './export/loadPlayerBundle'
import { renderProjectSceneImagesWithRuntime } from './export/renderSceneImages'
import {
  componentPackagesFromArchive,
  componentPackagesToArchiveFiles,
} from './components/componentPackageStore'
import { importComponentPackageAsync } from './components/importComponentPackage'
import {
  createImageAssetImport,
  createMediaAssetImport,
  readImageDimensions,
  readMediaMetadata,
} from './project/assetManager'
import { openProjectArchiveAsync } from './project/projectArchive'
import { RecoveryWriteCoordinator } from './project/recoveryWriteCoordinator'
import { saveProjectAsync } from './project/saveProject'
import {
  selectActiveScene,
  selectEditingNodes,
  selectSelectedNode,
  useEditorStore,
} from './store/editorStore'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { ExportSizeWarningDialog } from './ui/ExportSizeWarningDialog'
import { RightSidebar } from './ui/RightSidebar'
import { ScenePanel } from './ui/ScenePanel'
import { SceneStateStrip } from './ui/SceneStateStrip'
import { TopToolbar, type ExportFormat } from './ui/TopToolbar'
import { Workspace } from './ui/Workspace'
import { ProjectHealthPanel } from './ui/ProjectHealthPanel'

function desktopApi() {
  if (!window.desktopAPI) {
    throw new UserFacingError(
      '桌面功能不可用',
      '当前页面未运行在课件编辑器桌面环境中。',
      '请双击 PhaserCoursewareEditor.exe 启动软件。',
    )
  }
  return window.desktopAPI
}

function readableError(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) {
    console.error(error)
    return `${error.title}：${error.message}\n${error.suggestion}`
  }
  if (error instanceof Error && error.message.trim()) {
    console.error(error)
    return error.message
  }
  return toUserMessage(error, fallback)
}

function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

function isInteractiveControlTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(
    target.closest('button, [role="button"], [role="menuitem"], [role="option"]'),
  )
}

interface RecoverySnapshot {
  project: ProjectDocument
  assetFiles: Record<string, Uint8Array>
  componentPackages: Record<string, ComponentPackageData>
  projectPath: string | null
}

function createRecoveryWriteCoordinator(): RecoveryWriteCoordinator<
  RecoverySnapshot,
  Uint8Array
> {
  return new RecoveryWriteCoordinator({
    delayMs: 1800,
    async build(snapshot, signal) {
      const archive = await saveProjectAsync({
        project: snapshot.project,
        assetFiles: snapshot.assetFiles,
        componentFiles: componentPackagesToArchiveFiles(
          snapshot.componentPackages,
        ),
      }, new Date(), { signal })
      return archive.bytes
    },
    async write(bytes, snapshot) {
      if (!window.desktopAPI) throw new Error('桌面恢复服务不可用。')
      await window.desktopAPI.writeRecoveryProject({
        projectName: snapshot.project.title,
        projectPath: snapshot.projectPath ?? undefined,
        bytes,
      })
    },
    onSuccess() {
      useEditorStore.getState().setStatus('已自动保存本地恢复副本')
    },
    onError(error) {
      console.error('本地恢复副本更新失败', error)
      useEditorStore.getState().setError('自动恢复副本写入失败，请立即手动保存工程。')
    },
  })
}

export default function App() {
  const [busy, setBusy] = useState(false)
  const [componentPackageRequest, setComponentPackageRequest] = useState<
    { mode: 'import' } | { mode: 'replace'; packageId: string } | null
  >(null)
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>([])
  const [recoveryProject, setRecoveryProject] = useState<RecoveryProjectResult | null>(null)
  const [recoveryDecisionComplete, setRecoveryDecisionComplete] = useState(false)
  const [largeHtmlByteLength, setLargeHtmlByteLength] = useState<number | null>(null)
  const [projectHealthOpen, setProjectHealthOpen] = useState(false)
  const saveInFlightRef = useRef(false)
  const pendingLargeHtmlRef = useRef<string | null>(null)
  const recoveryRevisionRef = useRef(0)
  const recoveryCoordinatorRef = useRef<RecoveryWriteCoordinator<
    RecoverySnapshot,
    Uint8Array
  > | null>(null)
  if (recoveryCoordinatorRef.current === null && window.desktopAPI) {
    recoveryCoordinatorRef.current = createRecoveryWriteCoordinator()
  }

  const dirty = useEditorStore((state) => state.dirty)
  const project = useEditorStore((state) => state.project)
  const projectPath = useEditorStore((state) => state.projectPath)
  const assetFiles = useEditorStore((state) => state.assetFiles)
  const componentPackages = useEditorStore(
    (state) => state.componentPackages,
  )
  const selectedNode = useEditorStore(selectSelectedNode)
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds)
  const editingScope = useEditorStore((state) => state.editingScope)
  const editorMode = useEditorStore((state) => state.editorMode)
  const activeTab = useEditorStore((state) => state.activeTab)
  const editingNodes = useEditorStore(selectEditingNodes)
  const activeScene = useEditorStore(selectActiveScene)
  const errorMessage = useEditorStore((state) => state.errorMessage)
  const statusMessage = useEditorStore((state) => state.statusMessage)
  const projectHealthDiagnostics = useMemo(
    () => collectProjectHealth(project),
    [project],
  )
  const projectHealthSummary = useMemo(
    () => summarizeProjectHealth(projectHealthDiagnostics),
    [projectHealthDiagnostics],
  )

  const setError = useEditorStore((state) => state.setError)
  const createNewProject = useEditorStore((state) => state.createNewProject)
  const loadProject = useEditorStore((state) => state.loadProject)
  const markSaved = useEditorStore((state) => state.markSaved)
  const importPackageIntoStore = useEditorStore(
    (state) => state.importComponentPackage,
  )
  const replacePackageInStore = useEditorStore(
    (state) => state.replaceComponentPackage,
  )
  const addImageNode = useEditorStore((state) => state.addImageNode)
  const replaceImageAsset = useEditorStore(
    (state) => state.replaceImageAsset,
  )
  const addVideoNode = useEditorStore((state) => state.addVideoNode)
  const importAsset = useEditorStore((state) => state.importAsset)
  const importSound = useEditorStore((state) => state.importSound)

  const run = useCallback(
    async (operation: () => Promise<void>, fallback: string) => {
      if (busy) return
      setBusy(true)
      setError(null)
      try {
        await operation()
      } catch (error) {
        setError(readableError(error, fallback))
      } finally {
        setBusy(false)
      }
    },
    [busy, setError],
  )

  const refreshRecentProjects = useCallback(async () => {
    if (!window.desktopAPI) return
    setRecentProjects(await window.desktopAPI.listRecentProjects())
  }, [])

  const confirmDiscardIfNeeded = useCallback(async () => {
    if (!useEditorStore.getState().dirty) return true
    return (await desktopApi().confirmDiscardChanges()) === 'discard'
  }, [])

  const handleNew = useCallback(() => {
    void run(async () => {
      if (!(await confirmDiscardIfNeeded())) return
      await desktopApi().clearRecoveryProject().catch((error) => {
        console.error('清理恢复数据失败', error)
      })
      createNewProject()
    }, '新建课件失败，请重试。')
  }, [confirmDiscardIfNeeded, createNewProject, run])

  const handleOpen = useCallback(() => {
    void run(async () => {
      if (!(await confirmDiscardIfNeeded())) return
      const file = await desktopApi().openProject()
      if (!file) return
      const archive = await openProjectArchiveAsync(file.bytes)
      const packages = componentPackagesFromArchive(
        archive.project,
        archive.componentFiles,
      )
      loadProject(archive.project, file.path, archive.assetFiles, packages)
      await desktopApi().clearRecoveryProject().catch((error) => {
        console.error('清理恢复数据失败', error)
      })
      await refreshRecentProjects()
    }, '打开工程失败。请检查文件是否损坏后重试。')
  }, [confirmDiscardIfNeeded, loadProject, refreshRecentProjects, run])

  const handleOpenRecent = useCallback((path: string) => {
    void run(async () => {
      if (!(await confirmDiscardIfNeeded())) return
      const file = await desktopApi().openRecentProject({ path })
      const archive = await openProjectArchiveAsync(file.bytes)
      const packages = componentPackagesFromArchive(
        archive.project,
        archive.componentFiles,
      )
      loadProject(archive.project, file.path, archive.assetFiles, packages)
      await desktopApi().clearRecoveryProject().catch((error) => {
        console.error('清理恢复数据失败', error)
      })
      await refreshRecentProjects()
    }, '最近工程打开失败。文件可能已被移动，请使用“打开工程”重新选择。')
  }, [confirmDiscardIfNeeded, loadProject, refreshRecentProjects, run])

  const handleSave = useCallback(
    async (saveAs = false) => {
      if (saveInFlightRef.current) return false
      saveInFlightRef.current = true
      let savedCurrentRevision = false
      try {
        await run(async () => {
          const state = useEditorStore.getState()
          const savedProjectRevision = state.project
          const savedAssetRevision = state.assetFiles
          const savedComponentRevision = state.componentPackages
          const saved = await saveProjectAsync({
            project: state.project,
            assetFiles: state.assetFiles,
            componentFiles: componentPackagesToArchiveFiles(
              state.componentPackages,
            ),
          })
          const result = await desktopApi().saveProject({
            path: saveAs ? undefined : (state.projectPath ?? undefined),
            suggestedName: `${state.project.title}.h5lesson`,
            bytes: saved.bytes,
          })
          if (result) {
            const current = useEditorStore.getState()
            const revisionStillCurrent =
              current.project === savedProjectRevision &&
              current.assetFiles === savedAssetRevision &&
              current.componentPackages === savedComponentRevision
            if (revisionStillCurrent) {
              markSaved(result.path, saved.project)
              savedCurrentRevision = true
              await desktopApi().clearRecoveryProject().catch((error) => {
                console.error('清理恢复数据失败', error)
              })
            } else {
              useEditorStore.setState({
                projectPath: result.path,
                dirty: true,
                statusMessage: '已保存启动保存时的版本；之后的修改尚未保存',
              })
            }
            await refreshRecentProjects()
          }
        }, '保存失败。请检查磁盘空间或另存为其他位置。')
      } finally {
        saveInFlightRef.current = false
      }
      return savedCurrentRevision
    },
    [markSaved, refreshRecentProjects, run],
  )

  const selectAndImportImage = useCallback(
    async (
      mode: 'add' | 'replace',
      position?: { x?: number; y?: number },
    ) => {
      await run(async () => {
        const file = await desktopApi().selectImage()
        if (!file) return
        const dimensions = await readImageDimensions(file.bytes, file.mimeType)
        const imported = createImageAssetImport(file, { dimensions })
        if (mode === 'replace') {
          const node = selectSelectedNode(useEditorStore.getState())
          if (!node || node.type !== 'image') {
            throw new UserFacingError(
              '无法替换图片',
              '当前没有选中图片节点。',
              '请先选择画布中的图片，再点击“替换图片”。',
            )
          }
          replaceImageAsset(node.id, imported.meta, imported.bytes)
        } else {
          addImageNode(
            imported.meta,
            imported.bytes,
            position?.x,
            position?.y,
          )
        }
      }, '图片读取失败。请重新选择受支持的图片。')
    },
    [addImageNode, replaceImageAsset, run],
  )

  const selectAndImportAudio = useCallback(async () => {
    await run(async () => {
      const file = await desktopApi().selectAudio()
      if (!file) return
      const metadata = await readMediaMetadata(file.bytes, file.mimeType, 'audio')
      const imported = createMediaAssetImport(file, 'audio', metadata)
      importSound(imported.meta, imported.bytes)
    }, '声音读取失败。请重新选择受支持的声音文件。')
  }, [importSound, run])

  const selectAndImportVideo = useCallback(async (
    mode: 'add' | 'library',
    position?: { x?: number; y?: number },
  ) => {
    await run(async () => {
      const file = await desktopApi().selectVideo()
      if (!file) return
      const metadata = await readMediaMetadata(file.bytes, file.mimeType, 'video')
      const imported = createMediaAssetImport(file, 'video', metadata)
      if (mode === 'add') {
        addVideoNode(imported.meta, imported.bytes, position?.x, position?.y)
      } else {
        importAsset(imported.meta, imported.bytes)
      }
    }, '视频读取失败。请重新选择 MP4 或 WebM 文件。')
  }, [addVideoNode, importAsset, run])

  const handleImportComponent = useCallback(() => {
    setComponentPackageRequest({ mode: 'import' })
  }, [])

  const handleReplaceComponent = useCallback((packageId: string) => {
    setComponentPackageRequest({ mode: 'replace', packageId })
  }, [])

  const performComponentImport = useCallback(() => {
    const request = componentPackageRequest
    setComponentPackageRequest(null)
    if (!request) return
    void run(async () => {
      const file = await desktopApi().selectComponentPackage()
      if (!file) return
      const imported = await importComponentPackageAsync(file.bytes)
      if (request.mode === 'replace') {
        replacePackageInStore(request.packageId, imported)
      } else {
        importPackageIntoStore(imported)
      }
    }, '组件导入失败。请检查组件包内容是否完整。')
  }, [componentPackageRequest, importPackageIntoStore, replacePackageInStore, run])

  const buildHtml = useCallback(() => {
    const state = useEditorStore.getState()
    const payload = buildExportPayload({
      project: state.project,
      assetFiles: state.assetFiles,
      components: state.componentPackages,
    })
    return buildStandaloneHtml(payload, loadPlayerBundle())
  }, [])

  const handlePreview = useCallback(() => {
    void run(async () => {
      await desktopApi().openPreview({ html: buildHtml() })
    }, '预览窗口创建失败。请关闭其他预览窗口后重试。')
  }, [buildHtml, run])

  const writeSingleHtml = useCallback(async (html: string) => {
    const state = useEditorStore.getState()
    const result = await desktopApi().exportHtml({
      suggestedName: `${state.project.title}.html`,
      html,
    })
    if (result) state.setStatus(`单 HTML 已导出到 ${result.path}`)
  }, [])

  const handleExportHtml = useCallback(() => {
    void run(async () => {
      const html = buildHtml()
      const byteLength = utf8ByteLength(html)
      if (byteLength > SINGLE_HTML_WARNING_BYTES) {
        pendingLargeHtmlRef.current = html
        setLargeHtmlByteLength(byteLength)
        return
      }
      await writeSingleHtml(html)
    }, '导出失败。请检查磁盘空间并重试。')
  }, [buildHtml, run, writeSingleHtml])

  const handleExportWebPackage = useCallback(() => {
    void run(async () => {
      const state = useEditorStore.getState()
      state.setStatus('正在生成网页包…')
      const bytes = await buildWebPackageFromProjectAsync({
        project: state.project,
        assetFiles: state.assetFiles,
        components: state.componentPackages,
      }, loadPlayerBundle())
      const result = await desktopApi().exportWebPackage({
        suggestedName: `${state.project.title}-网页包.zip`,
        bytes,
      })
      if (result) state.setStatus(`网页包已导出到 ${result.path}`)
    }, '网页包导出失败。请检查磁盘空间并重试。')
  }, [run])

  const handleExportPptx = useCallback(() => {
    void run(async () => {
      const state = useEditorStore.getState()
      state.setStatus('正在生成可编辑 PPTX 对象…')
      const payload = buildExportPayload({
        project: state.project,
        assetFiles: state.assetFiles,
        components: state.componentPackages,
      })
      const bytes = await buildPptx(payload, state.assetFiles)
      const result = await desktopApi().exportBinary({
        suggestedName: `${state.project.title}.pptx`,
        extension: 'pptx',
        bytes,
      })
      if (result) {
        state.setStatus(
          `PPTX 已导出到 ${result.path}（文字、图形、图片和组件均为独立对象）`,
        )
      }
    }, 'PPTX 导出失败。请减少大图片数量后重试。')
  }, [run])

  const handleExportPdf = useCallback(() => {
    void run(async () => {
      const state = useEditorStore.getState()
      state.setStatus('正在渲染 PDF 页面…')
      const payload = buildExportPayload({
        project: state.project,
        assetFiles: state.assetFiles,
        components: state.componentPackages,
      })
      const images = await renderProjectSceneImagesWithRuntime(payload, state.assetFiles)
      const result = await desktopApi().exportPdf({
        suggestedName: `${state.project.title}.pdf`,
        html: buildPdfPrintHtml(state.project.title, images),
      })
      if (result) state.setStatus(`PDF 已导出到 ${result.path}（互动组件已静态化）`)
    }, 'PDF 导出失败。请减少大图片数量后重试。')
  }, [run])

  const handleExport = useCallback((format: ExportFormat) => {
    const diagnostics = collectProjectHealth(useEditorStore.getState().project)
    const summary = summarizeProjectHealth(diagnostics)
    if (!summary.canExport) {
      setProjectHealthOpen(true)
      setError(`工程检查发现 ${summary.error} 个错误。请先定位并修复，再导出成品。`)
      return
    }
    if (format === 'single-html') handleExportHtml()
    else if (format === 'web-package') handleExportWebPackage()
    else if (format === 'pptx') handleExportPptx()
    else handleExportPdf()
  }, [handleExportHtml, handleExportPdf, handleExportPptx, handleExportWebPackage, setError])

  const handleExportDiagnostics = useCallback(() => {
    void run(async () => {
      const result = await desktopApi().exportDiagnostics()
      if (result) useEditorStore.getState().setStatus(`诊断报告已导出到 ${result.path}`)
    }, '诊断报告导出失败。请换一个可写目录后重试。')
  }, [run])

  const clearLargeHtmlWarning = useCallback(() => {
    pendingLargeHtmlRef.current = null
    setLargeHtmlByteLength(null)
  }, [])

  useEffect(() => {
    document.title = `${project.title}${dirty ? ' *' : ''} - Phaser 课件编辑器`
    if (window.desktopAPI) {
      void window.desktopAPI.setDirtyState(dirty).catch((error) => {
        console.error('同步未保存状态失败', error)
      })
    }
  }, [dirty, project.title])

  useEffect(() => {
    if (!window.desktopAPI) {
      setRecoveryDecisionComplete(true)
      return
    }
    let cancelled = false
    void Promise.all([
      window.desktopAPI.listRecentProjects(),
      window.desktopAPI.readRecoveryProject(),
    ]).then(([recent, recovery]) => {
      if (cancelled) return
      setRecentProjects(recent)
      if (recovery) setRecoveryProject(recovery)
      else setRecoveryDecisionComplete(true)
    }).catch((error) => {
      if (cancelled) return
      console.error('读取本地恢复状态失败', error)
      setRecoveryDecisionComplete(true)
      setError('无法读取本地恢复状态；请在编辑后及时手动保存。')
    })
    return () => { cancelled = true }
  }, [setError])

  useEffect(() => {
    const coordinator = recoveryCoordinatorRef.current
    if (!coordinator) return
    if (!recoveryDecisionComplete || !dirty) {
      coordinator.cancel()
      return
    }
    const state = useEditorStore.getState()
    recoveryRevisionRef.current += 1
    coordinator.schedule(recoveryRevisionRef.current, {
      project: state.project,
      assetFiles: state.assetFiles,
      componentPackages: state.componentPackages,
      projectPath: state.projectPath,
    })
  }, [assetFiles, componentPackages, dirty, project, projectPath, recoveryDecisionComplete])

  useEffect(() => () => {
    recoveryCoordinatorRef.current?.dispose()
  }, [])

  useEffect(() => {
    if (!window.desktopAPI) return
    return window.desktopAPI.onRequestSave(() => {
      void handleSave(false)
    })
  }, [handleSave])

  useEffect(() => {
    if (!window.desktopAPI) return
    return window.desktopAPI.onRequestSaveAndClose(() => handleSave(false))
  }, [handleSave])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || isEditingTarget(event.target)) return
      const key = event.key.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && key === 's') {
        event.preventDefault()
        void handleSave(event.shiftKey)
      } else if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) useEditorStore.getState().redo()
        else useEditorStore.getState().undo()
      } else if ((event.ctrlKey || event.metaKey) && key === 'y') {
        event.preventDefault()
        useEditorStore.getState().redo()
      } else if ((event.ctrlKey || event.metaKey) && key === 'n') {
        event.preventDefault()
        handleNew()
      } else if ((event.ctrlKey || event.metaKey) && key === 'o') {
        event.preventDefault()
        handleOpen()
      } else if ((event.ctrlKey || event.metaKey) && key === 'a') {
        event.preventDefault()
        const state = useEditorStore.getState()
        state.selectNodes(selectEditingNodes(state).map((node) => node.id))
      } else if ((event.ctrlKey || event.metaKey) && key === 'c') {
        event.preventDefault()
        useEditorStore.getState().copySelectedNodes()
      } else if ((event.ctrlKey || event.metaKey) && key === 'v') {
        event.preventDefault()
        useEditorStore.getState().pasteNodes()
      } else if ((event.ctrlKey || event.metaKey) && key === 'd') {
        event.preventDefault()
        useEditorStore.getState().duplicateSelectedNodes()
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        const state = useEditorStore.getState()
        if (state.selectedNodeIds.length > 0 && !state.editingTextNodeId) {
          event.preventDefault()
          state.deleteSelectedNodes()
        }
      } else if (event.key.startsWith('Arrow')) {
        // Direction keys belong to the focused control first. In particular,
        // dnd-kit's keyboard layer reordering also uses ArrowUp / ArrowDown.
        if (isInteractiveControlTarget(event.target)) return
        const distance = event.shiftKey ? 10 : 1
        const movement = {
          ArrowLeft: [-distance, 0],
          ArrowRight: [distance, 0],
          ArrowUp: [0, -distance],
          ArrowDown: [0, distance],
        }[event.key]
        if (movement && useEditorStore.getState().selectedNodeIds.length > 0) {
          event.preventDefault()
          useEditorStore.getState().nudgeSelection(movement[0], movement[1])
        }
      } else if (event.key === 'Escape') {
        useEditorStore.getState().selectNodes([])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleNew, handleOpen, handleSave])

  return (
    <div className="app-shell">
      <TopToolbar
        busy={busy}
        onNew={handleNew}
        onOpen={handleOpen}
        recentProjects={recentProjects}
        onOpenRecent={handleOpenRecent}
        onSave={(saveAs) => void handleSave(saveAs)}
        onImportComponent={handleImportComponent}
        healthSummary={projectHealthSummary}
        onOpenHealth={() => setProjectHealthOpen(true)}
        onPreview={handlePreview}
        onExport={handleExport}
      />
      <div
        className={`app-main${
          editorMode === 'professional' && activeTab === 'developer'
            ? ' app-main--developer'
            : ''
        }`}
      >
        <ScenePanel />
        <div className="editor-center">
          <Workspace
            onAddImage={(x, y) =>
              void selectAndImportImage('add', { x, y })
            }
            onAddVideo={(x, y) =>
              void selectAndImportVideo('add', { x, y })
            }
          />
          <SceneStateStrip />
        </div>
        <RightSidebar
          onAddImage={(x, y) =>
            void selectAndImportImage('add', { x, y })
          }
          onReplaceImage={() => void selectAndImportImage('replace')}
          onAddVideo={(x, y) => void selectAndImportVideo('add', { x, y })}
          onImportAudio={() => void selectAndImportAudio()}
          onImportVideo={() => void selectAndImportVideo('library')}
          onReplaceComponent={handleReplaceComponent}
        />
      </div>
      <footer className="status-bar" aria-live="polite">
        <span className="status-dot" />
        <span>{busy ? '正在处理…' : (statusMessage ?? '就绪')}</span>
        <span className="status-bar__spacer" />
        <span>{editingScope === 'global' ? '全局层' : activeScene.name}</span>
        <span>·</span>
        <span>{editingScope === 'global' ? `${editingNodes.length} 个全局元素` : `${activeScene.nodes.length} 个节点`}</span>
        {(project.scenes.length > RECOMMENDED_PROJECT_SCENES ||
          activeScene.nodes.length > RECOMMENDED_SCENE_NODES) && (
          <>
            <span>·</span>
            <span className="status-bar__warning" title="大型课件建议使用网页包导出，以减少启动和内存压力">
              大型课件 · 建议网页包
            </span>
          </>
        )}
        <span>·</span>
        <span>{selectedNodeIds.length > 1 ? `已选 ${selectedNodeIds.length} 个图层` : selectedNode ? `已选：${selectedNode.name}` : editingScope === 'global' ? '未选择全局元素' : '未选择节点'}</span>
        <span>·</span>
        <span>{projectPath ? '工程已命名' : '尚未保存'}</span>
      </footer>

      {errorMessage && (
        <div className="toast" role="alert">
          <AlertCircle size={19} />
          <div className="toast__content">{errorMessage}</div>
          <button
            type="button"
            className="icon-button"
            title="关闭错误提示"
            aria-label="关闭错误提示"
            onClick={() => setError(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(componentPackageRequest)}
        title={componentPackageRequest?.mode === 'replace'
          ? '替换可执行组件包'
          : '导入可执行组件'}
        message={componentPackageRequest?.mode === 'replace'
          ? '请选择同一组件 ID 的可信新包。替换后，场景与全局层中的全部实例会切换到新版本并保留当前属性；此操作可以撤销。'
          : '组件包含可执行代码。请仅导入来自可信来源的组件包。组件在无 Node.js 权限的渲染环境中运行，但不提供完整代码沙箱。'}
        confirmLabel={componentPackageRequest?.mode === 'replace'
          ? '选择新包替换'
          : '选择组件包'}
        onCancel={() => setComponentPackageRequest(null)}
        onConfirm={performComponentImport}
      />
      <ProjectHealthPanel
        open={projectHealthOpen}
        onClose={() => setProjectHealthOpen(false)}
        onExportDiagnostics={handleExportDiagnostics}
      />
      <ExportSizeWarningDialog
        open={largeHtmlByteLength !== null}
        byteLength={largeHtmlByteLength ?? 0}
        hardLimitBytes={SINGLE_HTML_HARD_LIMIT_BYTES}
        onCancel={clearLargeHtmlWarning}
        onExportWebPackage={() => {
          clearLargeHtmlWarning()
          handleExportWebPackage()
        }}
        onContinueSingleHtml={() => {
          const html = pendingLargeHtmlRef.current
          clearLargeHtmlWarning()
          if (!html) return
          void run(
            () => writeSingleHtml(html),
            '单 HTML 导出失败。请改用网页包或检查磁盘空间。',
          )
        }}
      />
      <ConfirmDialog
        open={Boolean(recoveryProject)}
        title="发现未完成的本地恢复副本"
        message={recoveryProject ? `课件：${recoveryProject.projectName}\n保存时间：${new Date(recoveryProject.savedAt).toLocaleString('zh-CN')}\n\n恢复后请重新保存工程；如果这些修改已经不需要，可以丢弃副本。` : ''}
        confirmLabel="恢复课件"
        cancelLabel="丢弃副本"
        onCancel={() => {
          void desktopApi().clearRecoveryProject().catch((error) => {
            setError(readableError(error, '恢复副本清理失败。'))
          }).finally(() => {
            setRecoveryProject(null)
            setRecoveryDecisionComplete(true)
          })
        }}
        onConfirm={() => {
          if (!recoveryProject) return
          void run(async () => {
            const archive = await openProjectArchiveAsync(recoveryProject.bytes)
            const packages = componentPackagesFromArchive(archive.project, archive.componentFiles)
            loadProject(archive.project, null, archive.assetFiles, packages)
            useEditorStore.setState({
              dirty: true,
              statusMessage: '已恢复未保存的课件，请尽快另存为工程文件',
            })
            await desktopApi().clearRecoveryProject()
            setRecoveryProject(null)
            setRecoveryDecisionComplete(true)
          }, '恢复课件失败。恢复副本可能已经损坏。')
        }}
      />
    </div>
  )
}
