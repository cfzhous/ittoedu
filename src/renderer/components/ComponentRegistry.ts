import { COMPONENT_RUNTIME_API_VERSION } from '@/shared/constants'
import { UserFacingError } from '@/shared/errors'
import type { ComponentDefinitionV4 } from '@/shared/componentTypes'

function isComponentDefinition(value: unknown): value is ComponentDefinitionV4 {
  if (typeof value !== 'object' || value === null) return false
  const runtimeApiVersion = Reflect.get(value, 'runtimeApiVersion')
  return (
    typeof Reflect.get(value, 'id') === 'string' &&
    runtimeApiVersion === COMPONENT_RUNTIME_API_VERSION &&
    typeof Reflect.get(value, 'create') === 'function'
  )
}

export class ComponentRegistry {
  private readonly definitions = new Map<string, ComponentDefinitionV4>()

  define(definition: unknown): void {
    if (!isComponentDefinition(definition)) {
      throw new UserFacingError(
        '组件注册失败',
        '组件注册对象必须提供 id、runtimeApiVersion: 4 和 create()。',
        '请让组件作者按照 Component API 4 开发文档修正 runtime.js。',
      )
    }
    if (definition.id.trim().length === 0) {
      throw new UserFacingError(
        '组件注册失败',
        '组件注册 ID 不能为空。',
        '请让组件作者修正 runtime.js。',
      )
    }
    if (this.definitions.has(definition.id)) {
      throw new UserFacingError(
        '组件注册失败',
        `组件“${definition.id}”被重复注册。`,
        '请确保每个 runtime.js 只调用一次 define()。',
      )
    }
    this.definitions.set(definition.id, definition)
  }

  register(definition: unknown): void {
    this.define(definition)
  }

  get(id: string): ComponentDefinitionV4 | undefined {
    return this.definitions.get(id)
  }

  require(id: string): ComponentDefinitionV4 {
    const definition = this.get(id)
    if (definition === undefined) {
      throw new UserFacingError(
        '组件注册失败',
        `runtime.js 未注册组件“${id}”。`,
        '请确认 runtime.js 使用 window.CoursewareComponent.define() 注册了正确的 ID。',
      )
    }
    return definition
  }

  has(id: string): boolean {
    return this.definitions.has(id)
  }

  remove(id: string): boolean {
    return this.definitions.delete(id)
  }

  clear(): void {
    this.definitions.clear()
  }

  list(): ComponentDefinitionV4[] {
    return [...this.definitions.values()]
  }

  get size(): number {
    return this.definitions.size
  }
}
