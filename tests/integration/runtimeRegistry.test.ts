import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeRegistry } from '@/player/RuntimeRegistry'
import type {
  RuntimeCreateContext,
  RuntimeInstanceLifecycle,
} from '@/shared/runtimeTypes'

describe('RuntimeRegistry', () => {
  afterEach(() => {
    delete window.CoursewareRuntime
  })

  it('执行离线普通 JavaScript，并通过裸全局 API 同步注册 API 2 定义', () => {
    const registry = new RuntimeRegistry()
    const definition = registry.executeRuntime(`
      CoursewareRuntime.define({
        runtimeApiVersion: 2,
        create() {
          return {
            destroyed: false,
            destroy() { this.destroyed = true }
          }
        }
      })
    `, '场景 1')

    expect(definition.runtimeApiVersion).toBe(2)
    const lifecycle = definition.create({} as RuntimeCreateContext) as
      RuntimeInstanceLifecycle & { destroyed: boolean }
    expect(lifecycle.destroyed).toBe(false)
    lifecycle.destroy()
    expect(lifecycle.destroyed).toBe(true)
    registry.dispose()
  })

  it('同时兼容 window.CoursewareRuntime.define', () => {
    const registry = new RuntimeRegistry()
    const definition = registry.executeRuntime(`
      window.CoursewareRuntime.define({
        runtimeApiVersion: 2,
        create() { return { destroy() {} } }
      })
    `)
    expect(typeof definition.create).toBe('function')
    registry.dispose()
  })

  it('拒绝重复 define、未调用 define 和空 define', () => {
    const registry = new RuntimeRegistry()
    const validDefinition = `{
      runtimeApiVersion: 2,
      create() { return { destroy() {} } }
    }`

    expect(() => registry.executeRuntime(`
      CoursewareRuntime.define(${validDefinition})
      CoursewareRuntime.define(${validDefinition})
    `, '重复定义')).toThrow('重复调用了 define')
    expect(() => registry.executeRuntime('const value = 1', '无定义'))
      .toThrow('没有同步调用 CoursewareRuntime.define')
    expect(() => registry.executeRuntime('CoursewareRuntime.define()', '空定义'))
      .toThrow('运行时定义格式无效')
    expect(() => registry.executeRuntime('  \n  ', '空源码'))
      .toThrow('运行时源码为空')
    registry.dispose()
  })

  it('只支持 API 2，并明确拒绝旧运行时定义', () => {
    const registry = new RuntimeRegistry()
    const definition = registry.executeRuntime(`
      CoursewareRuntime.define({
        runtimeApiVersion: 2,
        create() { return { destroy() {} } }
      })
    `, 'API 2 运行时', 2)
    expect(definition.runtimeApiVersion).toBe(2)

    expect(() => registry.executeRuntime(`
      CoursewareRuntime.define({
        runtimeApiVersion: 1,
        create() { return { destroy() {} } }
      })
    `, '旧版运行时', 2)).toThrow('只支持 runtimeApiVersion 2')
    registry.dispose()
  })

  it('把画布编辑 V1 作为独立可选扩展登记，并拒绝未知扩展版本', () => {
    const registry = new RuntimeRegistry()
    const definition = registry.executeRuntime(`
      CoursewareRuntime.define({
        runtimeApiVersion: 2,
        authoringApiVersion: 1,
        create() { return { destroy() {} } }
      })
    `, '画布编辑运行时', 2)
    expect(definition.authoringApiVersion).toBe(1)

    expect(() => registry.executeRuntime(`
      CoursewareRuntime.define({
        runtimeApiVersion: 2,
        authoringApiVersion: 2,
        create() { return { destroy() {} } }
      })
    `, '未知画布编辑版本', 2)).toThrow('authoringApiVersion 1')
    registry.dispose()
  })

  it('拒绝不支持的 API 版本、缺少 create 的定义和执行异常', () => {
    const registry = new RuntimeRegistry()
    expect(() => registry.executeRuntime(`
      CoursewareRuntime.define({ runtimeApiVersion: 3, create() {} })
    `, '未来版本')).toThrow('只支持 runtimeApiVersion 2')
    expect(() => registry.executeRuntime(`
      CoursewareRuntime.define({ runtimeApiVersion: 2 })
    `, '缺少创建器')).toThrow('create()')
    expect(() => registry.executeRuntime(`throw new Error('boom')`, '异常源码'))
      .toThrow('boom')
    registry.dispose()
  })

  it.each([
    ['import', `import value from './dep.js'`],
    ['动态 import', `const load = import('./dep.js')`],
    ['模板表达式内的动态 import', "const load = `${import('./dep.js')}`"],
    ['export', `export default {}`],
    ['require', `const dependency = require('./dep.js')`],
  ])('拒绝模块语法：%s', (_label, source) => {
    const registry = new RuntimeRegistry()
    expect(() => registry.executeRuntime(source)).toThrow(/import|export|require/)
    registry.dispose()
  })

  it('不会把注释或字符串中的模块关键字误判为模块语法', () => {
    const registry = new RuntimeRegistry()
    expect(() => registry.executeRuntime(`
      // import value from './dep.js'
      const help = 'do not call require("x") or export default'
      CoursewareRuntime.define({
        runtimeApiVersion: 2,
        create() { return { destroy() {}, help } }
      })
    `)).not.toThrow()
    registry.dispose()
  })

  it('不会把正则表达式中的 require/import 文本误判为模块语法', () => {
    const registry = new RuntimeRegistry()
    expect(() => registry.executeRuntime(`
      const moduleWord = /require\\s*\\(|import\\s*\\(/
      CoursewareRuntime.define({
        runtimeApiVersion: 2,
        create() { return { destroy() {}, moduleWord } }
      })
    `)).not.toThrow()
    registry.dispose()
  })

  it('dispose 恢复此前的 window 全局，且不覆盖后来接管的全局', () => {
    const previous = { define: vi.fn() }
    window.CoursewareRuntime = previous
    const registry = new RuntimeRegistry()
    registry.install()
    expect(window.CoursewareRuntime).not.toBe(previous)
    registry.dispose()
    expect(window.CoursewareRuntime).toBe(previous)

    const nextRegistry = new RuntimeRegistry()
    nextRegistry.install()
    const replacement = { define: vi.fn() }
    window.CoursewareRuntime = replacement
    nextRegistry.dispose()
    expect(window.CoursewareRuntime).toBe(replacement)
  })

  it('dispose 在原本没有全局入口时删除临时入口', () => {
    delete window.CoursewareRuntime
    const registry = new RuntimeRegistry()
    registry.install()
    expect(window.CoursewareRuntime).toBeDefined()
    registry.dispose()
    expect(Object.prototype.hasOwnProperty.call(window, 'CoursewareRuntime')).toBe(false)
  })
})
