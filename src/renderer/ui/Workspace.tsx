import {
  Hand,
  LoaderCircle,
  Maximize2,
  Minus,
  MousePointer2,
  Play,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ComponentPackageData } from '../../shared/componentTypes'
import type {
  RuntimeAssetMap,
  SceneDocument,
  TextNode,
} from '../../shared/projectTypes'
import { createEditorGame, type EditorGameHandle } from '../phaser/createEditorGame'
import {
  selectActiveScene,
  selectEditingNodes,
  selectSelectedNode,
  useEditorStore,
} from '../store/editorStore'
import { TextEditOverlay } from './TextEditOverlay'
import { renderTextNodeCanvas } from '../../shared/textLayout'
import {
  ensureScenePresentation,
  findPresentationState,
  materializeScene,
} from '../../shared/presentation'
import { buildStandaloneHtml } from '../export/buildStandaloneHtml'
import { loadPlayerBundle } from '../export/loadPlayerBundle'
import { jsonToBase64 } from '../export/base64'
import {
  createRuntimePreviewBlobResources,
  type RuntimePreviewBlobResources,
} from '../preview/runtimePreviewDocument'
import {
  createRuntimePreviewPayloadResources,
  type RuntimePreviewPayloadResources,
} from '../preview/runtimePreviewPayload'
import {
  isCurrentRuntimePreviewBootstrapMessage,
  isCurrentRuntimePreviewPlayerMessage,
} from '../preview/runtimePreviewProtocol'
import { hasEnabledRuntime } from './sceneThumbnailComposition'

interface WorkspaceProps {
  onAddImage(x?: number, y?: number): void
  onAddVideo(x?: number, y?: number): void
}

function blobForBytes(bytes: Uint8Array, mimeType: string): Blob {
  const copy = Uint8Array.from(bytes)
  return new Blob([copy.buffer], { type: mimeType })
}

function nodesEqual(
  previous: SceneDocument['nodes'][number],
  next: SceneDocument['nodes'][number],
) {
  return JSON.stringify(previous) === JSON.stringify(next)
}

const RUNTIME_PREVIEW_STARTUP_TIMEOUT_MS = 12_000

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

type RuntimePreviewFeedback = {
  kind: 'loading' | 'error'
  title: string
  message: string
} | null

export function Workspace({ onAddImage, onAddVideo }: WorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement>(null)
  const gameHostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<EditorGameHandle | null>(null)
  const runtimeFrameRef = useRef<HTMLIFrameElement>(null)
  const previousSceneRef = useRef<SceneDocument | null>(null)
  const previousResourcesRef = useRef<{
    assets: RuntimeAssetMap
    components: Record<string, ComponentPackageData>
  } | null>(null)
  const previewInitRef = useRef<{
    token: string
    encodedPayload: string
    playerBundle: string
    initialSceneId: string
    initialStateId: string
  } | null>(null)
  const previewStartupTimerRef = useRef<number | null>(null)
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [runtimeAssets, setRuntimeAssets] = useState<RuntimeAssetMap>({})
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFeedback, setPreviewFeedback] = useState<RuntimePreviewFeedback>(null)
  const [previewRetryRevision, setPreviewRetryRevision] = useState(0)
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const spacePressedRef = useRef(false)
  const panRef = useRef<{
    pointerId: number
    clientX: number
    clientY: number
    originX: number
    originY: number
  } | null>(null)

  const scene = useEditorStore(selectActiveScene)
  const editingScope = useEditorStore((state) => state.editingScope)
  const canvasMode = useEditorStore((state) => state.canvasMode)
  const activePresentationStateId = useEditorStore(
    (state) => state.activePresentationStateId,
  )
  const editingNodes = useEditorStore(selectEditingNodes)
  const globalLayer = useEditorStore(
    (state) => state.project.globalLayer,
  )
  const selectedNode = useEditorStore(selectSelectedNode)
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds)
  const editingTextNodeId = useEditorStore(
    (state) => state.editingTextNodeId,
  )
  const projectAssets = useEditorStore((state) => state.project.assets)
  const project = useEditorStore((state) => state.project)
  const assetFiles = useEditorStore((state) => state.assetFiles)
  const componentPackages = useEditorStore(
    (state) => state.componentPackages,
  )
  const setCanvasMode = useEditorStore((state) => state.setCanvasMode)
  const showRuntimeEditHint = canvasMode === 'edit' && hasEnabledRuntime(
    scene,
    project.globalRuntime,
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isEditableKeyboardTarget(event.target)) {
        spacePressedRef.current = true
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') spacePressedRef.current = false
    }
    const onBlur = () => {
      spacePressedRef.current = false
      panRef.current = null
      setPanning(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const setZoom = useCallback((zoom: number) => {
    setView((current) => ({
      ...current,
      zoom: Math.max(0.5, Math.min(2, Math.round(zoom * 20) / 20)),
    }))
  }, [])

  const resetView = useCallback(() => {
    setView({ zoom: 1, x: 0, y: 0 })
  }, [])

  const clearRuntimePreviewStartupTimer = useCallback(() => {
    if (previewStartupTimerRef.current === null) return
    window.clearTimeout(previewStartupTimerRef.current)
    previewStartupTimerRef.current = null
  }, [])

  const failRuntimePreview = useCallback((token: string, message: string) => {
    if (previewInitRef.current?.token !== token) return
    clearRuntimePreviewStartupTimer()
    setPreviewFeedback({
      kind: 'error',
      title: '当前位置试运行启动失败',
      message,
    })
  }, [clearRuntimePreviewStartupTimer])

  const retryRuntimePreview = useCallback(() => {
    setPreviewFeedback({
      kind: 'loading',
      title: '正在准备当前位置试运行',
      message: '正在重新创建隔离播放器…',
    })
    setPreviewRetryRevision((revision) => revision + 1)
  }, [])

  const syncRuntimePreview = useCallback(() => {
    const target = runtimeFrameRef.current?.contentWindow
    if (!target) return
    target.postMessage({
      type: 'courseware-editor:set-scene',
      sceneId: scene.id,
    }, '*')
    if (activePresentationStateId !== null) {
      target.postMessage({
        type: 'courseware-editor:set-presentation-state',
        sceneId: scene.id,
        stateId: activePresentationStateId,
      }, '*')
    }
  }, [activePresentationStateId, scene.id])

  useEffect(() => {
    clearRuntimePreviewStartupTimer()
    if (canvasMode !== 'run') {
      previewInitRef.current = null
      setPreviewUrl(null)
      setPreviewFeedback(null)
      return
    }

    let blobResources: RuntimePreviewBlobResources | null = null
    let payloadResources: RuntimePreviewPayloadResources | null = null
    try {
      const editorState = useEditorStore.getState()
      const initialScene = selectActiveScene(editorState)
      const initialStateId = editorState.activePresentationStateId ??
        ensureScenePresentation(initialScene).initialStateId
      payloadResources = createRuntimePreviewPayloadResources({
        project,
        assetFiles,
        components: componentPackages,
      })
      const payload = payloadResources.payload
      const playerBundle = loadPlayerBundle()
      const token = crypto.randomUUID()
      previewInitRef.current = {
        token,
        encodedPayload: jsonToBase64(payload),
        playerBundle,
        initialSceneId: initialScene.id,
        initialStateId,
      }
      blobResources = createRuntimePreviewBlobResources(
        buildStandaloneHtml(payload, playerBundle),
        token,
      )
      setPreviewUrl(blobResources.documentUrl)
      setPreviewFeedback({
        kind: 'loading',
        title: '正在准备当前位置试运行',
        message: '正在载入隔离预览页面…',
      })
      previewStartupTimerRef.current = window.setTimeout(() => {
        failRuntimePreview(
          token,
          '播放器在 12 秒内没有完成启动。请重试；若仍失败，请检查当前工程的运行时或组件。',
        )
      }, RUNTIME_PREVIEW_STARTUP_TIMEOUT_MS)
    } catch (error) {
      blobResources?.revoke()
      blobResources = null
      payloadResources?.revoke()
      payloadResources = null
      previewInitRef.current = null
      const message = error instanceof Error ? error.message : String(error)
      setPreviewUrl(null)
      setPreviewFeedback({
        kind: 'error',
        title: '当前位置试运行创建失败',
        message,
      })
    }

    return () => {
      clearRuntimePreviewStartupTimer()
      blobResources?.revoke()
      payloadResources?.revoke()
    }
  }, [
    assetFiles,
    canvasMode,
    clearRuntimePreviewStartupTimer,
    componentPackages,
    failRuntimePreview,
    previewRetryRevision,
    project,
  ])

  useEffect(() => {
    if (canvasMode === 'run') syncRuntimePreview()
  }, [canvasMode, syncRuntimePreview])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== runtimeFrameRef.current?.contentWindow) return
      const message = event.data as {
        type?: unknown
        token?: unknown
        message?: unknown
        detail?: {
          sceneId?: unknown
          stateId?: unknown
          presentationStateId?: unknown
        }
      } | null
      if (!message || typeof message.type !== 'string') return
      if (
        isCurrentRuntimePreviewBootstrapMessage(
          message,
          previewInitRef.current?.token,
          'courseware-preview-bootstrap:ready',
        )
      ) {
        const init = previewInitRef.current
        if (!init) return
        setPreviewFeedback({
          kind: 'loading',
          title: '正在启动当前位置试运行',
          message: '隔离页面已连接，正在启动播放器…',
        })
        runtimeFrameRef.current?.contentWindow?.postMessage({
          type: 'courseware-preview-bootstrap:init',
          ...init,
        }, '*')
        return
      }
      if (
        isCurrentRuntimePreviewBootstrapMessage(
          message,
          previewInitRef.current?.token,
          'courseware-preview-bootstrap:error',
        )
      ) {
        const token = previewInitRef.current?.token
        if (!token) return
        failRuntimePreview(
          token,
          typeof message.message === 'string' && message.message.trim()
            ? message.message
            : '播放器脚本执行失败。',
        )
        return
      }
      if (
        message.type.startsWith('courseware-player:') &&
        !isCurrentRuntimePreviewPlayerMessage(
          message,
          previewInitRef.current?.token,
        )
      ) {
        return
      }
      if (message.type === 'courseware-player:ready') {
        clearRuntimePreviewStartupTimer()
        setPreviewFeedback(null)
        return
      }
      if (
        message.type === 'courseware-player:scene-change' &&
        typeof message.detail?.sceneId === 'string'
      ) {
        const nextScene = useEditorStore.getState().project.scenes.find(
          (item) => item.id === message.detail?.sceneId,
        )
        if (!nextScene) return
        const reportedStateId = typeof message.detail?.presentationStateId === 'string' &&
          findPresentationState(nextScene, message.detail.presentationStateId)
          ? message.detail.presentationStateId
          : ensureScenePresentation(nextScene).initialStateId
        useEditorStore.setState((state) => ({
          ...state,
          activeSceneId: nextScene.id,
          activePresentationStateId: reportedStateId,
          editingScope: 'scene',
          selectedNodeId: null,
          selectedNodeIds: [],
          editingTextNodeId: null,
          textEditSession: null,
          statusMessage: `当前位置试运行：${nextScene.name}`,
        }))
      } else if (
        message.type === 'courseware-player:presentation-change' &&
        typeof message.detail?.stateId === 'string'
      ) {
        const stateId = message.detail.stateId
        const current = selectActiveScene(useEditorStore.getState())
        if (
          typeof message.detail.sceneId === 'string' &&
          message.detail.sceneId !== current.id
        ) {
          return
        }
        if (!findPresentationState(current, stateId)) return
        useEditorStore.setState({
          activePresentationStateId: stateId,
          statusMessage: `试运行状态：${findPresentationState(current, stateId)?.name ?? stateId}`,
        })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [
    clearRuntimePreviewStartupTimer,
    failRuntimePreview,
    syncRuntimePreview,
  ])

  const document = useMemo<SceneDocument>(() => {
    if (editingScope === 'scene') {
      return materializeScene(scene, activePresentationStateId)
    }
    const layerOrder = { underlay: 0, overlay: 1 } as const
    return {
      id: '__editor_global_layer__',
      name: '全局层',
      backgroundColor: scene.backgroundColor,
      backgroundAssetId: scene.backgroundAssetId,
      interactions: [],
      nodes: [...globalLayer]
        .sort((left, right) => layerOrder[left.layer] - layerOrder[right.layer])
        .map((item) => item.node),
    }
  }, [activePresentationStateId, editingScope, globalLayer, scene])

  const editingNode = useMemo(
    () =>
      editingTextNodeId
        ? (document.nodes.find(
            (node) => node.id === editingTextNodeId && node.type === 'text',
          ) as TextNode | undefined)
        : undefined,
    [document.nodes, editingTextNodeId],
  )

  useEffect(() => {
    const next: RuntimeAssetMap = {}
    const urls: string[] = []
    for (const [assetId, meta] of Object.entries(projectAssets)) {
      const bytes = assetFiles[assetId]
      if (!bytes) continue
      const url = URL.createObjectURL(blobForBytes(bytes, meta.mimeType))
      urls.push(url)
      next[assetId] = { meta, bytes, url }
    }
    setRuntimeAssets(next)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [assetFiles, projectAssets])

  useLayoutEffect(() => {
    const host = gameHostRef.current
    if (!host) return
    const handle = createEditorGame(host)
    gameRef.current = handle
    const findCanvas = () => {
      const element = host.querySelector('canvas')
      if (element) setCanvas(element)
    }
    findCanvas()
    const observer = new MutationObserver(findCanvas)
    observer.observe(host, { childList: true })

    const unsubscribers = [
      handle.bridge.onNodeSelected(({ nodeIds, additive }) => {
        const store = useEditorStore.getState()
        if (!additive) {
          store.selectNodes(nodeIds)
          return
        }
        const merged = new Set(store.selectedNodeIds)
        for (const nodeId of nodeIds) {
          if (merged.has(nodeId)) merged.delete(nodeId)
          else merged.add(nodeId)
        }
        store.selectNodes([...merged])
      }),
      handle.bridge.onNodeMoveEnd(({ nodeId, x, y }) =>
        useEditorStore.getState().updateNode(nodeId, { x, y }),
      ),
      handle.bridge.onNodesMoveEnd(({ nodes }) =>
        useEditorStore.getState().updateNodes(
          nodes.map(({ nodeId, x, y }) => ({ nodeId, patch: { x, y } })),
        ),
      ),
      handle.bridge.onNodeResizeEnd(({ nodeId, x, y, width, height }) =>
        useEditorStore.getState().updateNode(nodeId, { x, y, width, height }),
      ),
      handle.bridge.onNodeRotateEnd(({ nodeId, rotation }) =>
        useEditorStore.getState().updateNode(nodeId, { rotation }),
      ),
      handle.bridge.onNodesTransformEnd(({ nodes }) =>
        useEditorStore.getState().updateNodes(
          nodes.map(({ nodeId, ...patch }) => ({ nodeId, patch })),
        ),
      ),
      handle.bridge.onTextDoubleClick((nodeId) => {
        useEditorStore.getState().selectNode(nodeId)
        useEditorStore.getState().beginTextEdit(nodeId, 'canvas')
      }),
    ]

    return () => {
      observer.disconnect()
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      handle.destroy()
      gameRef.current = null
      setCanvas(null)
    }
  }, [])

  useEffect(() => {
    const handle = gameRef.current
    if (!handle) return
    const previous = previousSceneRef.current
    const previousResources = previousResourcesRef.current
    const resourcesChanged =
      previousResources?.assets !== runtimeAssets ||
      previousResources?.components !== componentPackages

    if (
      !previous ||
      previous.id !== document.id ||
      previous.backgroundAssetId !== document.backgroundAssetId ||
      resourcesChanged
    ) {
      handle.bridge.loadScene(document, runtimeAssets, componentPackages)
    } else {
      if (previous.backgroundColor !== document.backgroundColor) {
        handle.bridge.setBackground(document.backgroundColor)
      }
      const previousById = new Map(previous.nodes.map((node) => [node.id, node]))
      const nextById = new Map(document.nodes.map((node) => [node.id, node]))
      previous.nodes.forEach((node) => {
        if (!nextById.has(node.id)) handle.bridge.removeNode(node.id)
      })
      document.nodes.forEach((node) => {
        const before = previousById.get(node.id)
        if (!before) handle.bridge.addNode(node)
        else if (!nodesEqual(before, node)) handle.bridge.applyNode(node)
      })
      const previousIds = previous.nodes.map((node) => node.id).join('|')
      const nextIds = document.nodes.map((node) => node.id).join('|')
      if (previousIds !== nextIds) {
        handle.bridge.reorderNodes(document.nodes.map((node) => node.id))
      }
    }
    previousSceneRef.current = structuredClone(document)
    previousResourcesRef.current = {
      assets: runtimeAssets,
      components: componentPackages,
    }
  }, [componentPackages, document, runtimeAssets])

  useEffect(() => {
    gameRef.current?.bridge.selectNodes(selectedNodeIds)
  }, [selectedNodeIds])

  useEffect(() => {
    gameRef.current?.bridge.setTextEditing(editingTextNodeId)
    if (!editingTextNodeId && selectedNode?.type === 'text') {
      gameRef.current?.bridge.applyNode(selectedNode)
    }
  }, [editingTextNodeId, selectedNode])

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault()
    if (canvasMode !== 'edit') return
    const value = event.dataTransfer.getData(
      'application/x-courseware-element',
    )
    if (!value || !canvas) return
    const rect = canvas.getBoundingClientRect()
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      return
    }
    const x = (event.clientX - rect.left) * (1280 / rect.width)
    const y = (event.clientY - rect.top) * (720 / rect.height)
    const store = useEditorStore.getState()
    if (value === 'text') store.addTextNode(x, y)
    else if (value === 'rectangle') store.addRectangleNode(x, y)
    else if (value.startsWith('shape:')) {
      store.addShapeNode(value.slice('shape:'.length) as Parameters<typeof store.addShapeNode>[0], x, y)
    }
    else if (value === 'image') onAddImage(x, y)
    else if (value === 'video') onAddVideo(x, y)
    else if (value.startsWith('component-preset:')) {
      const [encodedPackageId, encodedPresetId] = value
        .slice('component-preset:'.length)
        .split(':', 2)
      if (encodedPackageId && encodedPresetId) {
        store.addExternalComponentNode(
          decodeURIComponent(encodedPackageId),
          x,
          y,
          decodeURIComponent(encodedPresetId),
        )
      }
    }
    else if (value.startsWith('component:')) {
      store.addExternalComponentNode(value.slice('component:'.length), x, y)
    }
  }

  return (
    <main
      ref={workspaceRef}
      className={`workspace workspace--${canvasMode}`}
      aria-label="课件画布"
      onDragOver={(event) => {
        if (canvasMode !== 'edit') return
        if (
          event.dataTransfer.types.includes(
            'application/x-courseware-element',
          )
        ) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={onDrop}
      onWheel={(event) => {
        if (canvasMode !== 'edit' || (!event.ctrlKey && !event.metaKey)) return
        event.preventDefault()
        setZoom(view.zoom + (event.deltaY < 0 ? 0.1 : -0.1))
      }}
      onPointerDownCapture={(event) => {
        if (
          canvasMode !== 'edit' ||
          (event.button !== 1 && !(event.button === 0 && spacePressedRef.current))
        ) return
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        panRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          originX: view.x,
          originY: view.y,
        }
        setPanning(true)
      }}
      onPointerMoveCapture={(event) => {
        const pan = panRef.current
        if (!pan || pan.pointerId !== event.pointerId) return
        event.preventDefault()
        event.stopPropagation()
        setView((current) => ({
          ...current,
          x: pan.originX + event.clientX - pan.clientX,
          y: pan.originY + event.clientY - pan.clientY,
        }))
      }}
      onPointerUpCapture={(event) => {
        if (panRef.current?.pointerId !== event.pointerId) return
        event.preventDefault()
        event.stopPropagation()
        panRef.current = null
        setPanning(false)
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }}
    >
      <div className="canvas-mode-switch" role="group" aria-label="画布模式">
        <button
          type="button"
          className={canvasMode === 'edit' ? 'canvas-mode-switch__active' : ''}
          aria-pressed={canvasMode === 'edit'}
          onClick={() => setCanvasMode('edit')}
        >
          <MousePointer2 size={13} />编辑状态
        </button>
        <button
          type="button"
          className={canvasMode === 'run' ? 'canvas-mode-switch__active' : ''}
          aria-pressed={canvasMode === 'run'}
          onClick={() => setCanvasMode('run')}
        >
          <Play size={13} />当前位置试运行
        </button>
      </div>
      {canvasMode === 'edit' && (
        <div className="canvas-view-controls" role="group" aria-label="画布视图">
          <button type="button" aria-label="缩小画布" onClick={() => setZoom(view.zoom - 0.1)}>
            <Minus size={14} />
          </button>
          <output aria-label="画布缩放比例">{Math.round(view.zoom * 100)}%</output>
          <button type="button" aria-label="放大画布" onClick={() => setZoom(view.zoom + 0.1)}>
            <Plus size={14} />
          </button>
          <button type="button" aria-label="适合窗口" title="重置缩放与平移" onClick={resetView}>
            <Maximize2 size={14} />
          </button>
          <span title="Ctrl+滚轮缩放；按住空格或鼠标中键拖动画布">
            <Hand size={13} />
          </span>
        </div>
      )}
      {showRuntimeEditHint && (
        <div className="runtime-edit-hint" data-testid="runtime-edit-hint">
          运行时效果请点“当前位置试运行”
        </div>
      )}
      <div className={`canvas-label${editingScope === 'global' ? ' canvas-label--global' : ''}`}>
        1280 × 720 · {editingScope === 'global'
          ? `全局层 · ${editingNodes.length} 个元素`
          : `${scene.name} · ${activePresentationStateId === null
            ? '基础'
            : ensureScenePresentation(scene).states.find((state) => state.id === activePresentationStateId)?.name ?? '状态'}`}
      </div>
      <div
        ref={gameHostRef}
        className="canvas-stage canvas-stage--editor"
        data-testid="canvas-stage"
        aria-hidden={canvasMode === 'run'}
        data-panning={panning || undefined}
        style={{
          transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.zoom})`,
          transition: panning ? 'none' : 'transform 120ms ease-out',
        }}
      />
      {canvasMode === 'run' && previewUrl && (
        <iframe
          ref={runtimeFrameRef}
          className="runtime-preview-frame"
          title="当前位置试运行"
          sandbox="allow-scripts"
          src={previewUrl}
          onError={() => {
            const token = previewInitRef.current?.token
            if (token) failRuntimePreview(token, '隔离预览页面无法载入。')
          }}
        />
      )}
      {canvasMode === 'run' && previewFeedback && (
        <div
          className={`runtime-preview-loading runtime-preview-loading--${previewFeedback.kind}`}
          role={previewFeedback.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          <div className="runtime-preview-loading__panel">
            {previewFeedback.kind === 'loading' && (
              <LoaderCircle
                className="runtime-preview-loading__spinner"
                size={24}
                aria-hidden="true"
              />
            )}
            <strong>{previewFeedback.title}</strong>
            <span>{previewFeedback.message}</span>
            {previewFeedback.kind === 'error' && (
              <button type="button" onClick={retryRuntimePreview}>
                <RotateCcw size={14} aria-hidden="true" />重新试运行
              </button>
            )}
          </div>
        </div>
      )}
      {canvasMode === 'run' && !previewUrl && !previewFeedback && (
        <div className="runtime-preview-loading" role="status" aria-live="polite">
          <div className="runtime-preview-loading__panel">
            <LoaderCircle
              className="runtime-preview-loading__spinner"
              size={24}
              aria-hidden="true"
            />
            <strong>正在准备当前位置试运行</strong>
          </div>
        </div>
      )}
      {canvasMode === 'edit' && editingNode && canvas && workspaceRef.current && (
        <TextEditOverlay
          key={editingNode.id}
          node={editingNode}
          workspace={workspaceRef.current}
          canvas={canvas}
          onPreview={(text, runs) => {
            const draftNode = { ...editingNode, text, runs }
            const height = editingNode.style.overflow === 'auto-height'
              ? renderTextNodeCanvas(draftNode).height
              : editingNode.height
            useEditorStore
              .getState()
              .updateTextEditDraft(editingNode.id, text, runs, height)
            gameRef.current?.bridge.previewText(editingNode.id, text, runs)
          }}
          onCommit={(text, runs) => {
            const store = useEditorStore.getState()
            const draftNode = { ...editingNode, text, runs }
            const height = editingNode.style.overflow === 'auto-height'
              ? renderTextNodeCanvas(draftNode).height
              : editingNode.height
            store.updateTextEditDraft(editingNode.id, text, runs, height)
            store.commitTextEdit()

            // Synchronize the committed Store node into Phaser before making
            // the interaction target draggable again. This closes the small
            // window in which the adapter could still hold its old text.
            const committedNode = selectEditingNodes(
              useEditorStore.getState(),
            ).find((node) => node.id === editingNode.id)
            if (committedNode?.type === 'text') {
              gameRef.current?.bridge.applyNode(committedNode)
            }
            gameRef.current?.bridge.setTextEditing(null)
          }}
          onCancel={() => {
            const store = useEditorStore.getState()
            store.cancelTextEdit()
            const restoredNode = selectEditingNodes(
              useEditorStore.getState(),
            ).find((node) => node.id === editingNode.id)
            if (restoredNode?.type === 'text') {
              gameRef.current?.bridge.applyNode(restoredNode)
            }
            gameRef.current?.bridge.setTextEditing(null)
          }}
        />
      )}
    </main>
  )
}
