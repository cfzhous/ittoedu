import type { ComponentManifest } from '../../src/shared/componentTypes'
import { afterEach, describe, expect, it } from 'vitest'
import { ComponentRegistry } from '../../src/player/ComponentRegistry'

const manifest: ComponentManifest = {
  schemaVersion: 4,
  runtimeApiVersion: 4,
  id: 'com.example.counter',
  name: '计数器',
  version: '4.0.0',
  entry: 'runtime.js',
  defaultSize: { width: 320, height: 180 },
  minSize: { width: 160, height: 90 },
  preserveAspectRatio: true,
  assets: {},
  defaultProps: {},
  supportedScopes: ['scene'],
  renderMode: 'phaser',
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
        runtimeApiVersion: 4,
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
          runtimeApiVersion: 4,
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

  it('拒绝旧 Component API 1–3 runtime，并保留已注册的 V4 定义', () => {
    const registry = new ComponentRegistry()
    const definition = registry.executeRuntime(
      manifest,
      `window.CoursewareComponent.define({
        id: 'com.example.counter',
        runtimeApiVersion: 4,
        create() { return { destroy() {} } }
      })`,
    )

    for (const legacyVersion of [1, 2, 3]) {
      expect(() => registry.executeRuntime(
        manifest,
        `window.CoursewareComponent.define({
          id: 'com.example.counter',
          runtimeApiVersion: ${legacyVersion},
          create() { return { destroy() {} } }
        })`,
      )).toThrow('只支持 Component API 4')
      expect(registry.get(manifest.id)).toBe(definition)
    }
    registry.dispose()
  })

  it('注册 Component API 4 runtime，并以 V4 manifest 校验版本一致性', () => {
    const registry = new ComponentRegistry()
    const v4Manifest: ComponentManifest = { ...manifest, renderMode: 'dom' }

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
    )).toThrow('只支持 Component API 4')

    // A rejected reload must retain the last known-good V4 definition.
    expect(registry.get(v4Manifest.id)).toBe(definition)
    registry.dispose()
  })
})
