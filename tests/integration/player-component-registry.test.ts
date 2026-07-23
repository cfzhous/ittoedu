import type { ComponentManifest } from '../../src/shared/componentTypes'
import { afterEach, describe, expect, it } from 'vitest'
import { ComponentRegistry } from '../../src/player/ComponentRegistry'

const manifest: ComponentManifest = {
  schemaVersion: 1,
  runtimeApiVersion: 1,
  id: 'com.example.counter',
  name: '计数器',
  version: '1.0.0',
  entry: 'runtime.js',
  defaultSize: { width: 320, height: 180 },
  minSize: { width: 160, height: 90 },
  preserveAspectRatio: true,
  assets: {},
  defaultProps: {},
}

describe('ComponentRegistry', () => {
  afterEach(() => {
    delete window.CoursewareComponent
  })

  it('通过全局 API 注册无模块 runtime', () => {
    const registry = new ComponentRegistry()
    const definition = registry.executeRuntime(
      manifest,
      `window.CoursewareComponent.define({
        id: 'com.example.counter',
        runtimeApiVersion: 1,
        create() { return { destroy() {} } }
      })`,
    )

    expect(definition.id).toBe(manifest.id)
    expect(registry.get(manifest.id)).toBe(definition)
    expect(registry.getLoadError(manifest.id)).toBeUndefined()
    registry.dispose()
  })

  it('ID 不匹配或 runtime 抛错时记录错误且不污染注册表', () => {
    const registry = new ComponentRegistry()

    expect(() =>
      registry.executeRuntime(
        manifest,
        `window.CoursewareComponent.define({
          id: 'com.example.wrong',
          runtimeApiVersion: 1,
          create() { return { destroy() {} } }
        })`,
      ),
    ).toThrow('组件 ID 不匹配')
    expect(registry.get(manifest.id)).toBeUndefined()
    expect(registry.getLoadError(manifest.id)?.message).toContain('注册失败')

    expect(() =>
      registry.executeRuntime(manifest, "throw new Error('boom')"),
    ).toThrow('boom')
    expect(registry.get(manifest.id)).toBeUndefined()
    registry.dispose()
  })

  it('注册 V2 runtime 并拒绝 manifest/runtime API 不匹配', () => {
    const registry = new ComponentRegistry()
    const v2Manifest: ComponentManifest = {
      ...manifest,
      schemaVersion: 2,
      runtimeApiVersion: 2,
      editor: {
        properties: [{ key: 'title', label: '标题', type: 'text' }],
      },
    }

    expect(registry.executeRuntime(
      v2Manifest,
      `window.CoursewareComponent.define({
        id: 'com.example.counter',
        runtimeApiVersion: 2,
        create() { return { destroy() {} } }
      })`,
    ).runtimeApiVersion).toBe(2)

    expect(() => registry.executeRuntime(
      v2Manifest,
      `window.CoursewareComponent.define({
        id: 'com.example.counter',
        runtimeApiVersion: 1,
        create() { return { destroy() {} } }
      })`,
    )).toThrow('运行时 API 不匹配')
    registry.dispose()
  })

  it('注册 Component API 4 runtime，并以 V4 manifest 校验版本一致性', () => {
    const registry = new ComponentRegistry()
    const v4Manifest: ComponentManifest = {
      ...manifest,
      schemaVersion: 4,
      runtimeApiVersion: 4,
      version: '4.0.0',
      supportedScopes: ['scene'],
      renderMode: 'dom',
    }

    const definition = registry.executeRuntime(
      v4Manifest,
      `window.CoursewareComponent.define({
        id: 'com.example.counter',
        runtimeApiVersion: 4,
        create() { return { destroy() {} } }
      })`,
    )

    expect(definition.runtimeApiVersion).toBe(4)
    expect(registry.get(v4Manifest.id)).toBe(definition)
    expect(() => registry.executeRuntime(
      v4Manifest,
      `window.CoursewareComponent.define({
        id: 'com.example.counter',
        runtimeApiVersion: 3,
        create() { return { destroy() {} } }
      })`,
    )).toThrow('manifest 为 4，runtime 为 3')

    // A rejected reload must retain the last known-good V4 definition.
    expect(registry.get(v4Manifest.id)).toBe(definition)
    registry.dispose()
  })
})
