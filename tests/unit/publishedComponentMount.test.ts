import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ComponentPackageData,
} from '../../src/shared/componentTypes'
import type {
  PublishedCourseComponent,
} from '../../src/shared/publishedCourseTypes'
import {
  findComponentPackageSource,
  mountPublishedComponent,
} from '../../src/player/surfaces/publishedComponentMount'
import { ComponentRegistry } from '../../src/player/ComponentRegistry'

function encodeUtf16LeBase64(source: string): { encoding: 'base64-utf16le'; data: string } {
  const bytes = new Uint8Array(source.length * 2)
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i)
    bytes[i * 2] = code & 0xff
    bytes[i * 2 + 1] = code >>> 8
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return { encoding: 'base64-utf16le', data: btoa(binary) }
}

const RUNTIME_CODE = `
window.CoursewareComponent.define({
  id: 'counter-component',
  runtimeApiVersion: 4,
  create(context) {
    const button = document.createElement('button')
    button.className = 'interactive-counter-btn'
    button.textContent = (context.props.label || 'Counter') + ': ' + (context.props.count || 0)
    button.addEventListener('click', () => {
      context.emit('counter:click', { count: (context.props.count || 0) + 1 })
    })
    context.dom.root.appendChild(button)
    return {
      setMode(mode) {
        button.dataset.mode = mode
      },
      resize(w, h) {
        button.style.width = w + 'px'
        button.style.height = h + 'px'
      },
      updateProps(props) {
        button.textContent = (props.label || 'Counter') + ': ' + (props.count || 0)
      },
      destroy() {
        button.remove()
      },
    }
  },
})
`

describe('publishedComponentMount helper', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('mounts and runs a Component API 4 DOM component from PublishedCourseComponent', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const publishedComp: PublishedCourseComponent = {
      id: 'counter-component',
      name: '计数器',
      version: '1.0.0',
      contentSha256: 'dummy-sha',
      apiVersion: 4,
      scopes: ['scene', 'global'],
      renderMode: 'dom',
      code: encodeUtf16LeBase64(RUNTIME_CODE),
      assets: {},
    }

    const registry = new ComponentRegistry()
    const emittedEvents: any[] = []
    const handle = mountPublishedComponent(container, {
      container,
      componentId: 'counter-component',
      version: '1.0.0',
      instanceId: 'inst-1',
      width: 200,
      height: 60,
      props: { label: '点击次数', count: 5 },
      components: { 'counter-component@1.0.0': publishedComp },
      registry,
      interactive: true,
      emit: (eventName, payload) => {
        emittedEvents.push({ eventName, payload })
      },
    })

    expect(handle.ok).toBe(true)
    expect(handle.instanceId).toBe('inst-1')
    expect(handle.componentId).toBe('counter-component')

    const mountEl = container.querySelector<HTMLElement>('.published-component-mount')
    expect(mountEl).not.toBeNull()
    const shadow = mountEl?.shadowRoot
    expect(shadow).not.toBeNull()

    const button = shadow?.querySelector<HTMLButtonElement>('.interactive-counter-btn')
    expect(button).not.toBeNull()
    expect(button?.textContent).toBe('点击次数: 5')

    // Click interactive button
    button?.click()
    expect(emittedEvents).toEqual([{ eventName: 'counter:click', payload: { count: 6 } }])

    // Update props
    handle.updateProps({ label: '已更新', count: 10 })
    expect(button?.textContent).toBe('已更新: 10')

    // Destroy
    handle.destroy()
    expect(container.querySelector('.published-component-mount')).toBeNull()
  })

  it('mounts a component from ComponentPackageData in authoring mode', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const packageData: ComponentPackageData = {
      manifest: {
        schemaVersion: 4,
        runtimeApiVersion: 4,
        id: 'counter-component',
        name: '计数器',
        version: '1.0.0',
        entry: 'runtime.js',
        defaultSize: { width: 200, height: 60 },
        minSize: { width: 100, height: 40 },
        preserveAspectRatio: false,
        supportedScopes: ['scene', 'global'],
        renderMode: 'dom',
        defaultProps: { label: '默认', count: 0 },
        assets: {},
      },
      runtimeSource: RUNTIME_CODE,
      files: {},
      metadata: {
        packageId: 'counter-component',
        version: '1.0.0',
        contentSha256: 'dummy',
        embeddedAt: '2026-08-18',
        sourceTrust: 'built-in',
      },
    } as unknown as ComponentPackageData

    const registry = new ComponentRegistry()
    const handle = mountPublishedComponent(container, {
      container,
      componentId: 'counter-component',
      version: '1.0.0',
      instanceId: 'inst-edit',
      width: 150,
      height: 50,
      props: { label: '编辑态', count: 3 },
      components: { 'counter-component': packageData },
      registry,
      mode: 'edit',
      interactive: false,
    })

    expect(handle.ok).toBe(true)
    const mountEl = container.querySelector<HTMLElement>('.published-component-mount')
    const shadow = mountEl?.shadowRoot
    const button = shadow?.querySelector<HTMLButtonElement>('.interactive-counter-btn')
    expect(button?.dataset.mode).toBe('edit')
    expect(button?.textContent).toBe('编辑态: 3')

    handle.destroy()
  })

  it('renders a fallback image with resolved URL when package is missing and fallback asset exists', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const handle = mountPublishedComponent(container, {
      container,
      componentId: 'missing-pkg',
      version: '1.0.0',
      instanceId: 'inst-fallback',
      width: 200,
      height: 100,
      staticFallbackAssetId: 'fallback-img-1',
      resolveAsset: (id) => (id === 'fallback-img-1' ? 'https://example.test/fallback.png' : undefined),
    })

    expect(handle.ok).toBe(false)
    const fallbackEl = container.querySelector('.published-component-fallback')
    expect(fallbackEl).not.toBeNull()
    const img = fallbackEl?.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://example.test/fallback.png')
    expect(img?.getAttribute('src')).not.toBe('')

    handle.destroy()
    expect(container.querySelector('.published-component-fallback')).toBeNull()
  })

  it('renders a fallback label when package and fallback asset are both missing', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const handle = mountPublishedComponent(container, {
      container,
      componentId: 'missing-pkg',
      version: '2.0.0',
      width: 200,
      height: 100,
    })

    expect(handle.ok).toBe(false)
    const fallbackEl = container.querySelector('.published-component-fallback')
    expect(fallbackEl).not.toBeNull()
    const label = fallbackEl?.querySelector('.published-component-fallback-label')
    expect(label?.textContent).toContain('[组件后备：missing-pkg@2.0.0]')

    handle.destroy()
  })

  it('uses static fallback in capture mode even when package exists', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const publishedComp: PublishedCourseComponent = {
      id: 'counter-component',
      name: '计数器',
      version: '1.0.0',
      contentSha256: 'dummy-sha',
      apiVersion: 4,
      scopes: ['scene', 'global'],
      renderMode: 'dom',
      code: encodeUtf16LeBase64(RUNTIME_CODE),
      assets: {},
    }

    const handle = mountPublishedComponent(container, {
      container,
      componentId: 'counter-component',
      version: '1.0.0',
      width: 200,
      height: 100,
      mode: 'capture',
      staticFallbackAssetId: 'capture-fallback',
      resolveAsset: (id) => (id === 'capture-fallback' ? 'https://example.test/capture.png' : undefined),
      components: { 'counter-component': publishedComp },
    })

    expect(handle.ok).toBe(false)
    const img = container.querySelector<HTMLImageElement>('.published-component-fallback img')
    expect(img?.getAttribute('src')).toBe('https://example.test/capture.png')

    handle.destroy()
  })
})
