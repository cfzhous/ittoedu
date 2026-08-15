import { describe, expect, it } from 'vitest'
import { ComponentRegistry } from '../../src/player/ComponentRegistry'
import type { ComponentManifest } from '../../src/shared/componentTypes'

function manifest(version: string, overrides: Partial<ComponentManifest> = {}): ComponentManifest {
  return {
    schemaVersion: 4,
    runtimeApiVersion: 4,
    id: 'com.example.registry',
    name: '注册表组件',
    version,
    entry: 'runtime.js',
    defaultSize: { width: 320, height: 180 },
    minSize: { width: 1, height: 1 },
    preserveAspectRatio: false,
    assets: {},
    defaultProps: {},
    supportedScopes: ['scene'],
    renderMode: 'dom',
    ...overrides,
  }
}

function runtimeSource(id: string, version: string, marker = version): string {
  return `window.CoursewareComponent.define({
    id: ${JSON.stringify(id)},
    runtimeApiVersion: 4,
    create: function () {
      return { destroy: function () {}, marker: ${JSON.stringify(marker)} }
    }
  })`
}

function runtimeSourceWithApiVersion(apiVersion: number): string {
  return `window.CoursewareComponent.define({
    id: 'com.example.registry', runtimeApiVersion: ${apiVersion},
    create: function () { return { destroy: function () {} } }
  })`
}

describe('ComponentRegistry Component API 4 load contract', () => {
  it('installs a manifest runtime and records its exact version', () => {
    const registry = new ComponentRegistry()
    const definition = registry.executeRuntime(manifest('1.0.0'), runtimeSource('com.example.registry', '1.0.0'))
    expect(definition).toBe(registry.get('com.example.registry'))
    expect(registry.getInstalledVersion('com.example.registry')).toBe('1.0.0')
    expect(registry.getLoadError('com.example.registry')).toBeUndefined()
    registry.dispose()
    expect(registry.get('com.example.registry')).toBeUndefined()
    expect(registry.getInstalledVersion('com.example.registry')).toBeUndefined()
  })

  it('explicitly rejects a second version of the same package without losing the first', () => {
    const registry = new ComponentRegistry()
    const first = registry.executeRuntime(manifest('1.0.0'), runtimeSource('com.example.registry', '1.0.0'))
    expect(() =>
      registry.executeRuntime(manifest('2.0.0'), runtimeSource('com.example.registry', '2.0.0')),
    ).toThrowError(/版本冲突/)
    expect(registry.get('com.example.registry')).toBe(first)
    expect(registry.getInstalledVersion('com.example.registry')).toBe('1.0.0')
    // A conflict is not a runtime execution failure: the installed definition
    // stays usable and the error channel for real load failures stays clean.
    expect(registry.getLoadError('com.example.registry')).toBeUndefined()
    registry.dispose()
  })

  it('rejects a second load of the same id when the string overload omits the version', () => {
    const registry = new ComponentRegistry()
    registry.executeRuntime('com.example.registry', runtimeSource('com.example.registry', '1.0.0'), {
      expectedVersion: '1.0.0',
    })
    expect(() =>
      registry.executeRuntime('com.example.registry', runtimeSource('com.example.registry', '2.0.0')),
    ).toThrowError(/expectedVersion/)
    expect(registry.getInstalledVersion('com.example.registry')).toBe('1.0.0')
    registry.dispose()
  })

  it('allows a same-version re-execution as a hot update that replaces the definition in place', () => {
    const registry = new ComponentRegistry()
    const first = registry.executeRuntime(manifest('1.0.0'), runtimeSource('com.example.registry', '1.0.0', 'old'))
    const second = registry.executeRuntime(manifest('1.0.0'), runtimeSource('com.example.registry', '1.0.0', 'new'))
    expect(second).not.toBe(first)
    expect(registry.get('com.example.registry')).toBe(second)
    expect(registry.getInstalledVersion('com.example.registry')).toBe('1.0.0')
    registry.dispose()
  })

  it('retires the installed version only through an explicit replacement', () => {
    const registry = new ComponentRegistry()
    registry.executeRuntime(manifest('1.0.0'), runtimeSource('com.example.registry', '1.0.0'))
    const replaced = registry.executeRuntime(manifest('2.0.0'), runtimeSource('com.example.registry', '2.0.0'), {
      replace: true,
    })
    expect(registry.get('com.example.registry')).toBe(replaced)
    expect(registry.getInstalledVersion('com.example.registry')).toBe('2.0.0')
    registry.dispose()
  })

  it('records a genuine load failure and restores the previously installed definition', () => {
    const registry = new ComponentRegistry()
    const first = registry.executeRuntime(manifest('1.0.0'), runtimeSource('com.example.registry', '1.0.0'))
    expect(() =>
      registry.executeRuntime(manifest('1.0.0'), 'window.CoursewareComponent.define({bad: true})'),
    ).toThrowError(/注册失败/)
    expect(registry.get('com.example.registry')).toBe(first)
    expect(registry.getInstalledVersion('com.example.registry')).toBe('1.0.0')
    expect(registry.getLoadError('com.example.registry')).toBeInstanceOf(Error)
    registry.dispose()
  })

  it('rejects a non-V4 runtime definition and an empty runtime', () => {
    const registry = new ComponentRegistry()
    expect(() =>
      registry.executeRuntime(manifest('1.0.0'), runtimeSourceWithApiVersion(3)),
    ).toThrowError(/只支持 Component API 4/)
    expect(() =>
      registry.executeRuntime(manifest('1.0.0'), ''),
    ).toThrowError(/runtime\.js 为空/)
    expect(registry.getLoadError('com.example.registry')).toBeInstanceOf(Error)
    registry.dispose()
  })

  it('enforces synchronous define rules: no active load, duplicate define and id mismatch', () => {
    const registry = new ComponentRegistry()
    expect(() =>
      registry.executeRuntime(manifest('1.0.0'), 'void 0'),
    ).toThrowError(/没有调用 CoursewareComponent\.define/)

    expect(() =>
      registry.executeRuntime(manifest('1.0.0'), `
        window.CoursewareComponent.define({
          id: 'com.example.registry', runtimeApiVersion: 4,
          create: function () { return { destroy: function () {} } }
        });
        window.CoursewareComponent.define({
          id: 'com.example.registry', runtimeApiVersion: 4,
          create: function () { return { destroy: function () {} } }
        });`),
    ).toThrowError(/重复调用了 define/)

    expect(() =>
      registry.executeRuntime(manifest('1.0.0'), runtimeSource('com.example.other', '1.0.0')),
    ).toThrowError(/ID 不匹配/)
    registry.dispose()
  })
})
