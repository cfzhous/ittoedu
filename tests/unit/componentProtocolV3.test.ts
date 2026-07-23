import { describe, expect, it } from 'vitest'
import { componentManifestSchema } from '@/shared/componentSchema'
import {
  applyComponentVariant,
  getComponentPropValue,
  mergeComponentProps,
  resolveComponentEditorProperties,
  resolveComponentEditorState,
  resolveComponentPresetProps,
  setComponentPropValue,
} from '@/shared/componentProps'
import type { ComponentManifestV3 } from '@/shared/componentTypes'

const v3: ComponentManifestV3 = {
  schemaVersion: 3,
  runtimeApiVersion: 3,
  supportedScopes: ['scene', 'global'],
  id: 'com.example.v3-copy',
  name: 'V3 文案组件',
  version: '3.0.0',
  entry: 'runtime.js',
  defaultSize: { width: 640, height: 360 },
  minSize: { width: 160, height: 90 },
  preserveAspectRatio: true,
  assets: {},
  defaultProps: {
    content: {
      title: '默认标题',
      pages: [
        { body: '第一页正文', button: '继续' },
        { body: '第二页\n多行正文' },
      ],
      feedback: { success: '回答正确' },
    },
    speed: 1,
    editor: { previewPageId: 'intro' },
  },
  editor: {
    properties: [
      {
        key: 'content.pages.0.body',
        label: '导入页正文',
        description: '显式定义覆盖自动元数据',
        type: 'textarea',
        maxLength: 200,
      },
      { key: 'speed', label: '速度', type: 'number', min: 0.1, max: 5 },
    ],
    pages: [
      {
        id: 'intro',
        label: '导入页',
        propertyKeys: ['content.pages.0.body'],
      },
      { id: 'result', label: '结果页', propertyKeys: [] },
    ],
    defaultPageId: 'intro',
    previewPageProp: 'editor.previewPageId',
  },
  variants: [{
    id: 'quiz',
    label: '测验',
    props: {
      content: {
        title: '测验标题',
        feedback: { retry: '再试一次' },
      },
      speed: 2,
    },
  }],
  presets: [{
    id: 'ready',
    label: '即用',
    variantId: 'quiz',
    props: {
      content: {
        pages: [{ body: '预设第一页' }],
      },
    },
    previewPageId: 'result',
  }],
}

describe('component protocol V3', () => {
  it('accepts V3 scopes and rejects missing, duplicate, or mismatched declarations', () => {
    expect(componentManifestSchema.parse(v3)).toEqual(v3)
    expect(componentManifestSchema.safeParse({
      ...v3,
      supportedScopes: [],
    }).success).toBe(false)
    expect(componentManifestSchema.safeParse({
      ...v3,
      supportedScopes: ['scene', 'scene'],
    }).success).toBe(false)
    expect(componentManifestSchema.safeParse({
      ...v3,
      runtimeApiVersion: 2,
    }).success).toBe(false)
    expect(componentManifestSchema.safeParse({
      ...v3,
      supportedScopes: undefined,
    }).success).toBe(false)
  })

  it('only permits text editors to override reserved content copy', () => {
    expect(componentManifestSchema.safeParse({
      ...v3,
      editor: {
        properties: [{
          key: 'content.title',
          label: '错误字段',
          type: 'select',
          options: [{ value: 'a', label: 'A' }],
        }],
      },
    }).success).toBe(false)
    expect(componentManifestSchema.safeParse({
      ...v3,
      defaultProps: {
        ...v3.defaultProps,
        content: { 'unsafe.key': '无法寻址的文案' },
      },
    }).success).toBe(false)
  })

  it('recursively discovers every effective content string without duplicates', () => {
    const properties = resolveComponentEditorProperties(v3, {
      content: { title: '实例标题' },
    })

    expect(properties.map((property) => property.key)).toEqual([
      'content.pages.0.body',
      'speed',
      'content.title',
      'content.pages.0.button',
      'content.pages.1.body',
      'content.feedback.success',
    ])
    expect(properties.filter(
      (property) => property.key === 'content.pages.0.body',
    )).toHaveLength(1)
    expect(properties[0]).toMatchObject({
      label: '导入页正文',
      description: '显式定义覆盖自动元数据',
      type: 'textarea',
      maxLength: 200,
    })
    expect(properties.find(
      (property) => property.key === 'content.pages.1.body',
    )?.type).toBe('textarea')
  })

  it('preserves nested copy across instance, variant, preset, and persisted path updates', () => {
    const merged = mergeComponentProps(v3, {
      content: { title: '实例标题' },
    })
    expect(merged).toMatchObject({
      content: {
        title: '实例标题',
        pages: [
          { body: '第一页正文', button: '继续' },
          { body: '第二页\n多行正文' },
        ],
        feedback: { success: '回答正确' },
      },
      speed: 1,
    })

    const variant = v3.variants![0]!
    const varied = applyComponentVariant(merged, variant, v3)
    expect(varied).toMatchObject({
      content: {
        title: '测验标题',
        feedback: { success: '回答正确', retry: '再试一次' },
      },
      speed: 2,
    })
    expect(resolveComponentEditorState(v3, varied).variantId).toBe('quiz')

    const preset = resolveComponentPresetProps(v3, 'ready')
    expect(preset).toMatchObject({
      content: {
        title: '测验标题',
        pages: [
          { body: '预设第一页', button: '继续' },
          { body: '第二页\n多行正文' },
        ],
        feedback: { success: '回答正确', retry: '再试一次' },
      },
      speed: 2,
      editor: { previewPageId: 'result' },
    })

    const persisted = setComponentPropValue(
      { content: { title: '实例标题' } },
      'content.feedback.success',
      '已完成',
    )
    expect(getComponentPropValue(persisted, 'content.feedback.success')).toBe('已完成')
    expect(getComponentPropValue(persisted, 'content.title')).toBe('实例标题')
    expect(JSON.parse(JSON.stringify(persisted))).toEqual(persisted)
  })
})
