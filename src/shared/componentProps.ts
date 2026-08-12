import type {
  ComponentEditorProperty,
  ComponentEditorState,
  ComponentManifest,
  ConfigurableComponentManifest,
  ComponentPreset,
  ComponentVariant,
} from './componentTypes'
import { componentUsesRecursiveContent } from './componentCapabilities'

const FORBIDDEN_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor'])

function pathParts(path: string): string[] {
  const parts = path.split('.')
  if (
    parts.length === 0 ||
    parts.some((part) => part.length === 0 || FORBIDDEN_PATH_PARTS.has(part))
  ) {
    throw new Error(`不安全的组件属性路径：${path}`)
  }
  return parts
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneProps(props: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(props)
}

function mergeContentValue(base: unknown, override: unknown): unknown {
  if (Array.isArray(base) && Array.isArray(override)) {
    const result = structuredClone(base)
    override.forEach((value, index) => {
      result[index] = index < result.length
        ? mergeContentValue(result[index], value)
        : structuredClone(value)
    })
    return result
  }
  if (!isRecord(base) || !isRecord(override)) {
    return structuredClone(override)
  }
  const result = structuredClone(base)
  for (const [key, value] of Object.entries(override)) {
    result[key] = Object.hasOwn(result, key)
      ? mergeContentValue(result[key], value)
      : structuredClone(value)
  }
  return result
}

/**
 * Component API 4 reserves props.content for editable copy. Merge it recursively so changing
 * one string does not replace sibling copy inherited from defaults/variants.
 * Other props retain the established top-level replacement semantics.
 */
function mergeRecursiveContentProps(
  ...layers: ReadonlyArray<Readonly<Record<string, unknown>>>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      result[key] = key === 'content' && Object.hasOwn(result, key)
        ? mergeContentValue(result[key], value)
        : structuredClone(value)
    }
  }
  return result
}

export function getComponentPropValue(
  props: Readonly<Record<string, unknown>>,
  path: string,
): unknown {
  let current: unknown = props
  for (const part of pathParts(path)) {
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      current = current[Number(part)]
    } else if (isRecord(current)) {
      current = current[part]
    } else {
      return undefined
    }
  }
  return current
}

export function setComponentPropValue(
  props: Readonly<Record<string, unknown>>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const result = cloneProps(props as Record<string, unknown>)
  const parts = pathParts(path)
  let current: Record<string, unknown> | unknown[] = result

  parts.forEach((part, index) => {
    const last = index === parts.length - 1
    if (last) {
      if (value === undefined) {
        if (Array.isArray(current) && /^\d+$/.test(part)) {
          current.splice(Number(part), 1)
        } else {
          delete (current as Record<string, unknown>)[part]
        }
      } else {
        ;(current as Record<string, unknown>)[part] = structuredClone(value)
      }
      return
    }

    const nextPart = parts[index + 1]!
    const existing = (current as Record<string, unknown>)[part]
    if (isRecord(existing) || Array.isArray(existing)) {
      current = existing
      return
    }
    const next: Record<string, unknown> | unknown[] = /^\d+$/.test(nextPart)
      ? []
      : {}
    ;(current as Record<string, unknown>)[part] = next
    current = next
  })
  return result
}

export function mergeComponentProps(
  manifest: ComponentManifest,
  instanceProps: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  if (componentUsesRecursiveContent(manifest)) {
    return mergeRecursiveContentProps(manifest.defaultProps, instanceProps)
  }
  return cloneProps({ ...manifest.defaultProps, ...instanceProps })
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) =>
      valuesEqual(value, right[index]))
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    return leftKeys.length === rightKeys.length && leftKeys.every((key) =>
      Object.hasOwn(right, key) && valuesEqual(left[key], right[key]))
  }
  return false
}

function propsContain(
  props: Readonly<Record<string, unknown>>,
  expected: Readonly<Record<string, unknown>>,
): boolean {
  return Object.entries(expected).every(([key, value]) =>
    Object.hasOwn(props, key) && valuesEqual(props[key], value))
}

function valueContains(value: unknown, expected: unknown): boolean {
  if (isRecord(value) && isRecord(expected)) {
    return Object.entries(expected).every(([key, nestedExpected]) =>
      Object.hasOwn(value, key) && valueContains(value[key], nestedExpected))
  }
  return valuesEqual(value, expected)
}

function propsDeepContain(
  props: Readonly<Record<string, unknown>>,
  expected: Readonly<Record<string, unknown>>,
): boolean {
  return Object.entries(expected).every(([key, value]) =>
    Object.hasOwn(props, key) && valueContains(props[key], value))
}

export function findComponentVariant(
  manifest: ComponentManifest,
  props: Readonly<Record<string, unknown>>,
): ComponentVariant | undefined {
  return manifest.variants?.find((variant) => (
    componentUsesRecursiveContent(manifest)
      ? propsDeepContain(props, variant.props)
      : propsContain(props, variant.props)
  ))
}

export function applyComponentVariant(
  props: Readonly<Record<string, unknown>>,
  variant: ComponentVariant,
  manifest?: ComponentManifest,
): Record<string, unknown> {
  if (manifest && componentUsesRecursiveContent(manifest)) {
    return mergeRecursiveContentProps(props, variant.props)
  }
  return cloneProps({ ...props, ...variant.props })
}

export function resolveComponentEditorState(
  manifest: ComponentManifest,
  props: Readonly<Record<string, unknown>>,
): ComponentEditorState {
  const effectiveProps = mergeComponentProps(manifest, props)
  const state: ComponentEditorState = {}
  const variant = findComponentVariant(manifest, effectiveProps)
  if (variant) state.variantId = variant.id

  const pages = manifest.editor?.pages
  const previewPageProp = manifest.editor?.previewPageProp
  if (pages && previewPageProp) {
    const candidate = getComponentPropValue(effectiveProps, previewPageProp)
    const fallback = manifest.editor?.defaultPageId ?? pages[0]?.id
    state.pageId = typeof candidate === 'string' &&
      pages.some((page) => page.id === candidate)
      ? candidate
      : fallback
  }
  return state
}

export function resolveComponentPresetProps(
  manifest: ConfigurableComponentManifest,
  presetOrId: ComponentPreset | string,
): Record<string, unknown> {
  const preset = typeof presetOrId === 'string'
    ? manifest.presets?.find((item) => item.id === presetOrId)
    : presetOrId
  if (!preset) throw new Error('组件预设不存在')

  const variant = preset.variantId
    ? manifest.variants?.find((item) => item.id === preset.variantId)
    : undefined
  let props = componentUsesRecursiveContent(manifest)
    ? mergeRecursiveContentProps(
        manifest.defaultProps,
        variant?.props ?? {},
        preset.props,
      )
    : cloneProps({
      ...manifest.defaultProps,
      ...(variant?.props ?? {}),
      ...preset.props,
    })
  if (preset.previewPageId && manifest.editor?.previewPageProp) {
    props = setComponentPropValue(
      props,
      manifest.editor.previewPageProp,
      preset.previewPageId,
    )
  }
  return props
}

function autoContentLabel(path: string): string {
  const parts = path.split('.').slice(1)
  if (parts.length === 0) return '内容'
  return parts.map((part) => {
    if (/^\d+$/.test(part)) return `第 ${Number(part) + 1} 项`
    return part
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim() || part
  }).join(' / ')
}

function discoverContentTextProperties(content: unknown): ComponentEditorProperty[] {
  const properties: ComponentEditorProperty[] = []
  const ancestors = new WeakSet<object>()

  const visit = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      properties.push({
        key: path,
        label: autoContentLabel(path),
        type: value.includes('\n') ? 'textarea' : 'text',
      })
      return
    }
    if ((!isRecord(value) && !Array.isArray(value)) || ancestors.has(value)) return

    ancestors.add(value)
    Object.entries(value).forEach(([key, nestedValue]) => {
      if (key.length === 0 || key.includes('.') || FORBIDDEN_PATH_PARTS.has(key)) return
      visit(nestedValue, `${path}.${key}`)
    })
    ancestors.delete(value)
  }

  visit(content, 'content')
  return properties
}

/**
 * Returns explicitly declared fields plus every editable string recursively
 * found below effective V4 props.content.
 */
export function resolveComponentEditorProperties(
  manifest: ComponentManifest,
  instanceProps: Readonly<Record<string, unknown>>,
): ComponentEditorProperty[] {
  const explicit = manifest.editor?.properties ?? []

  const effectiveProps = mergeComponentProps(manifest, instanceProps)
  const automatic = discoverContentTextProperties(effectiveProps.content)
  const automaticByKey = new Map(automatic.map((property) => [property.key, property]))
  const emitted = new Set<string>()
  const result: ComponentEditorProperty[] = []

  for (const property of explicit) {
    if (emitted.has(property.key)) continue
    const automaticProperty = automaticByKey.get(property.key)
    if (automaticProperty) {
      result.push(
        property.type === 'text' || property.type === 'textarea'
          ? { ...automaticProperty, ...property }
          : automaticProperty,
      )
    } else {
      result.push(property)
    }
    emitted.add(property.key)
  }

  for (const property of automatic) {
    if (emitted.has(property.key)) continue
    result.push(property)
    emitted.add(property.key)
  }
  return result
}
