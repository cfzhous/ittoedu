import * as Phaser from 'phaser'
import type {
  CourseEventBus,
  CourseStateStore,
} from '../../shared/runtimeTypes'
import type {
  ComponentEditableTextRegion,
  ComponentHostActions,
  ComponentDefinition,
  ComponentPackageData,
} from '../../shared/componentTypes'
import {
  componentRenderMode,
  componentSupportsScope,
} from '../../shared/componentCapabilities'
import {
  mergeComponentProps,
  resolveComponentEditorState,
} from '../../shared/componentProps'
import {
  tryCreateComponentLifecycle,
} from '../../shared/componentLifecycleGuard'
import type {
  ComponentLifecycleFailure,
  GuardedComponentInstanceLifecycle,
} from '../../shared/componentLifecycleGuard'
import type {
  ExternalComponentNode,
  RuntimeAssetMap,
} from '../../shared/projectTypes'

declare global {
  interface Window {
    CoursewareComponent?: {
      define(definition: ComponentDefinition): void
    }
  }
}

function mimeForPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.glb')) return 'model/gltf-binary'
  if (lower.endsWith('.gltf')) return 'model/gltf+json'
  return 'application/octet-stream'
}

function bytesBlob(bytes: Uint8Array, type: string): Blob {
  const copy = Uint8Array.from(bytes)
  return new Blob([copy.buffer], { type })
}

const EDITOR_HOST_ACTIONS: Readonly<ComponentHostActions> = Object.freeze({
  goToScene: () => false,
  nextScene: () => false,
  previousScene: () => false,
  replayScene: () => false,
  restartCourse: () => false,
})

export class ComponentRegistry {
  private readonly definitions = new Map<string, ComponentDefinition>()
  private readonly packageAssetUrls = new Map<string, Map<string, string>>()
  private readonly loadedPackages = new Map<string, ComponentPackageData>()
  private readonly loadErrors = new Map<string, Error>()
  private loading = Promise.resolve()

  async loadPackages(
    packages: Record<string, ComponentPackageData>,
  ): Promise<void> {
    this.loading = this.loading.catch(() => undefined).then(async () => {
      const incomingIds = new Set(
        Object.values(packages).map((data) => data.manifest.id),
      )
      for (const loadedId of this.loadedPackages.keys()) {
        if (!incomingIds.has(loadedId)) this.disposePackage(loadedId)
      }

      for (const data of Object.values(packages)) {
        if (this.loadedPackages.get(data.manifest.id) === data) continue

        this.disposePackage(data.manifest.id)
        try {
          await this.loadPackage(data)
          this.loadedPackages.set(data.manifest.id, data)
          this.loadErrors.delete(data.manifest.id)
        } catch (cause) {
          const error =
            cause instanceof Error ? cause : new Error(String(cause))
          this.loadErrors.set(data.manifest.id, error)
          console.error(`组件“${data.manifest.name}”注册失败`, error)
        }
      }
    })
    await this.loading
  }

  private async loadPackage(data: ComponentPackageData): Promise<void> {
    let registered: ComponentDefinition | null = null
    const previous = window.CoursewareComponent
    window.CoursewareComponent = {
      define: (definition) => {
        if (
          definition.id !== data.manifest.id ||
          definition.runtimeApiVersion !== data.manifest.runtimeApiVersion ||
          typeof definition.create !== 'function'
        ) {
          throw new Error('组件注册信息与 manifest 不匹配')
        }
        registered = definition
      },
    }

    const blobUrl = URL.createObjectURL(
      new Blob([data.runtimeSource], { type: 'text/javascript' }),
    )
    try {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = blobUrl
        script.onload = () => {
          script.remove()
          resolve()
        }
        script.onerror = () => {
          script.remove()
          reject(new Error('组件 runtime 执行失败'))
        }
        document.head.append(script)
      })
      if (!registered) throw new Error('组件 runtime 未调用注册 API')
      this.definitions.set(data.manifest.id, registered)
      this.createAssetUrls(data)
    } finally {
      URL.revokeObjectURL(blobUrl)
      window.CoursewareComponent = previous
    }
  }

  private createAssetUrls(data: ComponentPackageData) {
    this.revokeAssetUrls(data.manifest.id)
    const urls = new Map<string, string>()
    for (const [assetKey, path] of Object.entries(data.manifest.assets)) {
      const bytes = data.files[path]
      if (!bytes) continue
      urls.set(
        assetKey,
        URL.createObjectURL(bytesBlob(bytes, mimeForPath(path))),
      )
    }
    this.packageAssetUrls.set(data.manifest.id, urls)
  }

  private revokeAssetUrls(packageId: string): void {
    const urls = this.packageAssetUrls.get(packageId)
    if (urls) {
      for (const url of urls.values()) URL.revokeObjectURL(url)
    }
    this.packageAssetUrls.delete(packageId)
  }

  private disposePackage(packageId: string): void {
    this.revokeAssetUrls(packageId)
    this.definitions.delete(packageId)
    this.loadedPackages.delete(packageId)
    this.loadErrors.delete(packageId)
  }

  getLoadError(packageId: string): Error | undefined {
    return this.loadErrors.get(packageId)
  }

  createInstance(
    data: ComponentPackageData,
    node: ExternalComponentNode,
    scene: Phaser.Scene,
    root: Phaser.GameObjects.Container,
    mode: 'edit' | 'preview',
    projectAssets: RuntimeAssetMap = {},
    scope: 'scene' | 'global' = 'scene',
    onLifecycleError?: (failure: ComponentLifecycleFailure) => void,
    domRoot?: HTMLElement,
    onTextRegionRegistered?: (region: ComponentEditableTextRegion) => () => void,
    onTextRegionsInvalidated?: () => void,
  ): GuardedComponentInstanceLifecycle {
    const definition = this.definitions.get(data.manifest.id)
    if (!definition) {
      throw this.loadErrors.get(data.manifest.id) ??
        new Error('组件尚未完成注册')
    }
    if (!componentSupportsScope(data.manifest, scope)) {
      throw new Error(
        scope === 'global'
          ? '该组件未声明支持全局挂载'
          : '该组件未声明支持场景挂载',
      )
    }
    const urls = this.packageAssetUrls.get(data.manifest.id)
    const props = mergeComponentProps(data.manifest, node.props)
    const previewState = new Map<string, unknown>()
    const capturePromises: Array<Promise<{
      ok: true
    } | {
      ok: false
      error: Error
    }>> = []
    const textRegionDisposers = new Set<() => void>()
    let editorActive = mode === 'edit'
    const previewEvents: CourseEventBus = {
      on: () => () => undefined,
      off: () => undefined,
      emit: () => undefined,
      listenerCount: () => 0,
      dispose: () => undefined,
    }
    const previewCourseState: CourseStateStore = {
      get<T = unknown>(key: string): T | undefined {
        const value = previewState.get(key)
        return value === undefined ? undefined : structuredClone(value) as T
      },
      set(key: string, value: unknown): void {
        previewState.set(key, structuredClone(value))
      },
      delete(key: string): void {
        previewState.delete(key)
      },
      clear(): void {
        previewState.clear()
      },
      snapshot(): Record<string, unknown> {
        return Object.fromEntries(
          [...previewState].map(([key, value]) => [key, structuredClone(value)]),
        )
      },
    }
    const commonContext = {
      instanceId: node.id,
      width: node.width,
      height: node.height,
      mode,
      props,
      editorState: resolveComponentEditorState(data.manifest, props),
      ...(mode === 'edit'
        ? {
            editor: {
              registerTextRegion(region: ComponentEditableTextRegion): () => void {
                if (!editorActive) return () => undefined
                const disposeHostRegion = onTextRegionRegistered?.(region) ?? (() => undefined)
                let active = true
                const dispose = (): void => {
                  if (!active) return
                  active = false
                  textRegionDisposers.delete(dispose)
                  disposeHostRegion()
                }
                textRegionDisposers.add(dispose)
                return dispose
              },
              invalidate(): void {
                if (editorActive) onTextRegionsInvalidated?.()
              },
            },
          }
        : {}),
      actions: EDITOR_HOST_ACTIONS,
      scope,
      events: previewEvents,
      courseState: previewCourseState,
      assetUrl(assetKey: string) {
        const url = urls?.get(assetKey)
        if (!url) throw new Error(`组件素材缺失：${assetKey}`)
        return url
      },
      projectAssetUrl(assetId: string) {
        const asset = projectAssets[assetId]
        if (!asset) throw new Error(`工程图片素材缺失：${assetId}`)
        return asset.url
      },
      emit(eventName: string, payload?: unknown) {
        scene.events.emit(`component:${eventName}`, {
          instanceId: node.id,
          payload,
        })
      },
    }
    const creation = tryCreateComponentLifecycle(() => {
      if (definition.runtimeApiVersion === 4) {
        if (data.manifest.schemaVersion !== 4) {
          throw new Error('组件 V4 runtime 必须搭配 V4 manifest')
        }
        const renderMode = componentRenderMode(data.manifest)
        if (renderMode !== 'phaser' && !domRoot) {
          throw new Error('组件 DOM 渲染面未创建')
        }
        const v4Base = {
          ...commonContext,
          runtimeApiVersion: 4 as const,
          renderMode,
          capture: {
            waitUntil(promise: Promise<unknown>): void {
              // Convert rejections to values immediately. Editor previews do
              // not always request a capture, so authored async work must not
              // leak an unhandled rejection while it remains registered.
              capturePromises.push(Promise.resolve(promise).then(
                () => ({ ok: true as const }),
                (cause) => ({
                  ok: false as const,
                  error: cause instanceof Error ? cause : new Error(String(cause)),
                }),
              ))
            },
          },
        }
        switch (renderMode) {
          case 'phaser':
            return definition.create({
              ...v4Base,
              renderMode,
              phaser: { Phaser, scene, root },
            })
          case 'dom':
            return definition.create({
              ...v4Base,
              renderMode,
              dom: { root: domRoot! },
            })
          case 'hybrid':
            return definition.create({
              ...v4Base,
              renderMode,
              phaser: { Phaser, scene, root },
              dom: { root: domRoot! },
            })
        }
      }

      return definition.create({
        Phaser,
        scene,
        root,
        ...commonContext,
      })
    }, {
      componentId: data.manifest.id,
      instanceId: node.id,
      onError: onLifecycleError,
    })
    if (!creation.ok) {
      editorActive = false
      for (const dispose of [...textRegionDisposers]) dispose()
      previewEvents.dispose()
      previewCourseState.clear()
      throw creation.failure.error
    }
    const lifecycle = creation.lifecycle
    const waitForCapturePromises = async (): Promise<void> => {
      let awaitedCount = 0
      while (awaitedCount < capturePromises.length) {
        const pending = capturePromises.slice(awaitedCount)
        awaitedCount = capturePromises.length
        const results = await Promise.all(pending)
        const failed = results.find((result) => !result.ok)
        if (failed && !failed.ok) throw failed.error
      }
    }
    return {
      ...(lifecycle.setMode ? { setMode: lifecycle.setMode } : {}),
      ...(lifecycle.resize ? { resize: lifecycle.resize } : {}),
      ...(lifecycle.updateProps ? { updateProps: lifecycle.updateProps } : {}),
      ...(lifecycle.setEditorState ? { setEditorState: lifecycle.setEditorState } : {}),
      ...(lifecycle.setVisible ? { setVisible: lifecycle.setVisible } : {}),
      ...(lifecycle.suspend ? { suspend: lifecycle.suspend } : {}),
      ...(lifecycle.resume ? { resume: lifecycle.resume } : {}),
      ...(definition.runtimeApiVersion === 4
        ? {
            async prepareCapture(): Promise<void> {
              await lifecycle.prepareCapture?.()
              await waitForCapturePromises()
            },
          }
        : lifecycle.prepareCapture
          ? { prepareCapture: lifecycle.prepareCapture }
          : {}),
      destroy(): void {
        editorActive = false
        try {
          lifecycle.destroy()
        } finally {
          for (const dispose of [...textRegionDisposers]) dispose()
          capturePromises.length = 0
          previewEvents.dispose()
          previewCourseState.clear()
        }
      },
      getFailure: lifecycle.getFailure,
      isFailed: lifecycle.isFailed,
    }
  }

  dispose(): void {
    for (const packageId of this.loadedPackages.keys()) {
      this.disposePackage(packageId)
    }
    this.loadErrors.clear()
  }
}
