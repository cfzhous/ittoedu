import type {
  ComponentCreateContextV4,
  ComponentHostActions,
  ComponentManifest,
  ComponentPackageData,
} from '../../shared/componentTypes'
import type {
  PublishedCourseAsset,
  PublishedCourseComponent,
  PublishedCourseExecutableCode,
} from '../../shared/publishedCourseTypes'
import {
  tryCreateComponentLifecycle,
  type GuardedComponentInstanceLifecycle,
} from '../../shared/componentLifecycleGuard'
import {
  mergeComponentProps,
  resolveComponentEditorState,
} from '../../shared/componentProps'
import { ComponentRegistry } from '../ComponentRegistry'
import { createPlayerComponentHostActions } from '../componentHostActions'
import { decodePublishedCode } from '../publishedLesson'

export type PublishedComponentPackageSource =
  | PublishedCourseComponent
  | ComponentPackageData

export interface PublishedComponentMountOptions {
  container: HTMLElement
  componentId: string
  version?: string
  instanceId?: string
  width: number
  height: number
  props?: Record<string, unknown>
  staticFallbackAssetId?: string
  components?: Record<string, PublishedComponentPackageSource>
  resolveAsset?: (assetId: string) => string | undefined
  registry?: ComponentRegistry
  mode?: 'preview' | 'edit' | 'capture'
  scope?: 'scene' | 'global'
  interactive?: boolean
  actions?: Readonly<ComponentHostActions>
  events?: ComponentCreateContextV4['events']
  courseState?: ComponentCreateContextV4['courseState']
  presentation?: ComponentCreateContextV4['presentation']
  emit?: (eventName: string, payload?: unknown) => void
}

export interface PublishedComponentMountHandle {
  readonly ok: boolean
  readonly instanceId: string
  readonly componentId: string
  readonly lifecycle?: GuardedComponentInstanceLifecycle
  readonly element: HTMLElement
  resize(width: number, height: number): void
  updateProps(props: Record<string, unknown>): void
  destroy(): void
}

const sharedComponentRegistry = new ComponentRegistry()

export function getSharedComponentRegistry(): ComponentRegistry {
  return sharedComponentRegistry
}

export function findComponentPackageSource(
  components: Record<string, PublishedComponentPackageSource> | undefined,
  componentId: string,
  version?: string,
): PublishedComponentPackageSource | undefined {
  if (!components) return undefined
  if (version) {
    const keyed = components[`${componentId}@${version}`]
    if (keyed) return keyed
  }
  const direct = components[componentId]
  if (direct) {
    const directVersion = 'manifest' in direct ? direct.manifest.version : direct.version
    if (!version || directVersion === version) return direct
  }
  return Object.values(components).find((candidate) => {
    const id = 'manifest' in candidate ? candidate.manifest.id : candidate.id
    const candidateVersion = 'manifest' in candidate ? candidate.manifest.version : candidate.version
    return id === componentId && (!version || candidateVersion === version)
  })
}

function extractManifest(source: PublishedComponentPackageSource): ComponentManifest {
  if ('manifest' in source && source.manifest) {
    return source.manifest
  }
  const published = source as PublishedCourseComponent
  return {
    schemaVersion: 4,
    runtimeApiVersion: 4,
    id: published.id,
    name: published.name ?? published.id,
    version: published.version ?? '1.0.0',
    entry: '',
    defaultSize: { width: 400, height: 300 },
    minSize: { width: 100, height: 100 },
    preserveAspectRatio: false,
    supportedScopes: published.scopes ?? ['scene', 'global'],
    renderMode: published.renderMode ?? 'dom',
    assets: {},
    defaultProps: {},
  }
}

function extractRuntimeSource(source: PublishedComponentPackageSource): string {
  if ('runtimeSource' in source && typeof source.runtimeSource === 'string') {
    return source.runtimeSource
  }
  if ('code' in source && source.code) {
    return decodePublishedCode(source.code as PublishedCourseExecutableCode)
  }
  return ''
}

function createFallbackElement(
  container: HTMLElement,
  options: PublishedComponentMountOptions,
): HTMLElement {
  const dom = container.ownerDocument
  const fallbackEl = dom.createElement('div')
  fallbackEl.className = 'published-component-fallback'
  fallbackEl.dataset.componentInstanceId = options.instanceId ?? options.componentId
  fallbackEl.dataset.componentPackageId = options.componentId
  Object.assign(fallbackEl.style, {
    boxSizing: 'border-box',
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  })

  const fallbackUrl = options.staticFallbackAssetId
    ? options.resolveAsset?.(options.staticFallbackAssetId)
    : undefined

  if (fallbackUrl) {
    const img = dom.createElement('img')
    img.src = fallbackUrl
    img.alt = `${options.componentId} 后备`
    img.dataset.staticFallbackAssetId = options.staticFallbackAssetId
    Object.assign(img.style, {
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      display: 'block',
    })
    fallbackEl.appendChild(img)
  } else {
    const text = dom.createElement('div')
    text.className = 'published-component-fallback-label'
    text.textContent = `[组件后备：${options.componentId}${options.version ? `@${options.version}` : ''}]`
    Object.assign(text.style, {
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      padding: '12px 16px',
      background: '#0f766e',
      color: '#ffffff',
      font: 'bold 16px "Microsoft YaHei", sans-serif',
      textAlign: 'center',
    })
    fallbackEl.appendChild(text)
  }

  return fallbackEl
}

export function mountPublishedComponent(
  container: HTMLElement,
  options: PublishedComponentMountOptions,
): PublishedComponentMountHandle {
  const instanceId = options.instanceId ?? options.componentId
  const pkg = findComponentPackageSource(options.components, options.componentId, options.version)
  const isCapture = options.mode === 'capture'

  if (!pkg || isCapture) {
    const fallbackEl = createFallbackElement(container, options)
    container.appendChild(fallbackEl)
    return {
      ok: false,
      instanceId,
      componentId: options.componentId,
      element: fallbackEl,
      resize() {},
      updateProps() {},
      destroy() {
        fallbackEl.remove()
      },
    }
  }

  const manifest = extractManifest(pkg)
  if (manifest.renderMode === 'phaser') {
    const fallbackEl = createFallbackElement(container, options)
    container.appendChild(fallbackEl)
    return {
      ok: false,
      instanceId,
      componentId: options.componentId,
      element: fallbackEl,
      resize() {},
      updateProps() {},
      destroy() {
        fallbackEl.remove()
      },
    }
  }

  const registry = options.registry ?? sharedComponentRegistry
  let definition = registry.get(manifest.id)
  if (!definition) {
    const runtimeSource = extractRuntimeSource(pkg)
    if (runtimeSource) {
      try {
        definition = registry.executeRuntime(manifest.id, runtimeSource)
      } catch (cause) {
        console.error(`组件“${manifest.id}”注册失败`, cause)
      }
    }
  }

  if (!definition) {
    const fallbackEl = createFallbackElement(container, options)
    container.appendChild(fallbackEl)
    return {
      ok: false,
      instanceId,
      componentId: options.componentId,
      element: fallbackEl,
      resize() {},
      updateProps() {},
      destroy() {
        fallbackEl.remove()
      },
    }
  }

  const dom = container.ownerDocument
  const host = dom.createElement('div')
  host.className = 'published-component-mount'
  host.dataset.componentInstanceId = instanceId
  host.dataset.componentPackageId = manifest.id
  Object.assign(host.style, {
    boxSizing: 'border-box',
    display: 'block',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    pointerEvents: options.interactive ? 'auto' : 'none',
  })

  const shadow = host.attachShadow({ mode: 'open' })
  const reset = dom.createElement('style')
  reset.textContent = `
    :host { display: block; box-sizing: border-box; width: 100%; height: 100%; contain: layout style; }
    *, *::before, *::after { box-sizing: border-box; }
    [data-component-surface] { width: 100%; height: 100%; position: relative; }
  `
  const root = dom.createElement('div')
  root.setAttribute('data-component-surface', '')
  shadow.append(reset, root)
  container.appendChild(host)

  const mergedProps = mergeComponentProps(manifest, options.props ?? {})
  const editorState = resolveComponentEditorState(manifest, mergedProps)
  const mode = options.mode ?? 'preview'
  const actions = options.actions ?? createPlayerComponentHostActions({
    goToSceneById: () => false,
    nextScene: () => false,
    previousScene: () => false,
    replayScene: () => false,
    restartCourse: () => false,
  })

  const assetUrl = (assetKey: string): string => {
    if ('assets' in pkg && pkg.assets) {
      const asset = pkg.assets[assetKey] as PublishedCourseAsset | { dataUrl?: string } | undefined
      if (asset) {
        if ('url' in asset && typeof asset.url === 'string') return asset.url
        if ('dataUrl' in asset && typeof asset.dataUrl === 'string') return asset.dataUrl
      }
    }
    return ''
  }

  const projectAssetUrl = (assetId: string): string => {
    return options.resolveAsset?.(assetId) ?? ''
  }

  const emit = options.emit ?? ((eventName: string, payload?: unknown) => {
    const detail = {
      scope: options.scope ?? 'scene',
      componentId: manifest.id,
      instanceId,
      eventName,
      payload,
    }
    window.dispatchEvent(new CustomEvent('courseware-component-event', { detail }))
  })

  const createContext: ComponentCreateContextV4 = {
    runtimeApiVersion: 4,
    instanceId,
    width: options.width,
    height: options.height,
    props: mergedProps,
    editorState,
    renderMode: 'dom',
    mode,
    actions,
    scope: options.scope ?? 'scene',
    events: options.events,
    courseState: options.courseState,
    presentation: options.presentation,
    assetUrl,
    projectAssetUrl,
    emit,
    capture: {
      waitUntil: () => {},
    },
    dom: { root },
  }

  const creation = tryCreateComponentLifecycle(
    () => definition!.create(createContext),
    { componentId: manifest.id, instanceId },
  )

  if (!creation.ok) {
    host.remove()
    const fallbackEl = createFallbackElement(container, options)
    container.appendChild(fallbackEl)
    return {
      ok: false,
      instanceId,
      componentId: options.componentId,
      element: fallbackEl,
      resize() {},
      updateProps() {},
      destroy() {
        fallbackEl.remove()
      },
    }
  }

  const lifecycle = creation.lifecycle
  lifecycle.setMode?.(mode)
  lifecycle.resize?.(options.width, options.height)
  lifecycle.setVisible?.(true)

  return {
    ok: true,
    instanceId,
    componentId: manifest.id,
    lifecycle,
    element: host,
    resize(w: number, h: number) {
      lifecycle.resize?.(w, h)
    },
    updateProps(nextProps: Record<string, unknown>) {
      const merged = mergeComponentProps(manifest, nextProps)
      lifecycle.updateProps?.(merged)
      const nextState = resolveComponentEditorState(manifest, merged)
      lifecycle.setEditorState?.(nextState)
    },
    destroy() {
      lifecycle.destroy()
      host.remove()
    },
  }
}
