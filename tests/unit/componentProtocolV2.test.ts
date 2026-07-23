import { describe, expect, it } from 'vitest'
import { componentManifestSchema } from '@/shared/componentSchema'
import {
  getComponentPropValue,
  mergeComponentProps,
  resolveComponentEditorState,
  resolveComponentPresetProps,
  setComponentPropValue,
} from '@/shared/componentProps'
import type {
  ComponentManifestV1,
  ComponentManifestV2,
} from '@/shared/componentTypes'

const v1: ComponentManifestV1 = {
  schemaVersion: 1,
  runtimeApiVersion: 1,
  id: 'com.example.legacy',
  name: '旧组件',
  version: '1.0.0',
  entry: 'runtime.js',
  defaultSize: { width: 320, height: 180 },
  minSize: { width: 16, height: 16 },
  preserveAspectRatio: true,
  assets: {},
  defaultProps: { legacy: true },
}

const v2: ComponentManifestV2 = {
  schemaVersion: 2,
  runtimeApiVersion: 2,
  id: 'com.example.multiview',
  name: '多页组件',
  version: '2.0.0',
  entry: 'runtime.js',
  defaultSize: { width: 640, height: 360 },
  minSize: { width: 160, height: 90 },
  preserveAspectRatio: true,
  assets: {},
  defaultProps: {
    title: '默认标题',
    count: 1,
    enabled: true,
    accent: '#2563eb',
    layout: 'story',
    pages: { intro: { body: '导入' }, detail: { body: '详情' } },
  },
  editor: {
    properties: [
      { key: 'title', label: '标题', type: 'text' },
      { key: 'pages.intro.body', label: '导入正文', type: 'textarea' },
      { key: 'count', label: '数量', type: 'number', min: 0, max: 10 },
      { key: 'enabled', label: '启用', type: 'boolean' },
      { key: 'accent', label: '强调色', type: 'color' },
      {
        key: 'layout',
        label: '布局',
        type: 'select',
        options: [
          { value: 'story', label: '故事' },
          { value: 'quiz', label: '测验' },
        ],
      },
      { key: 'coverAssetId', label: '封面', type: 'image' },
    ],
    pages: [
      { id: 'intro', label: '导入页', propertyKeys: ['pages.intro.body'] },
      { id: 'detail', label: '详情页', propertyKeys: [] },
    ],
    defaultPageId: 'intro',
    previewPageProp: 'editor.previewPageId',
  },
  variants: [
    { id: 'quiz', label: '测验模式', props: { layout: 'quiz' } },
  ],
  presets: [
    {
      id: 'detail-quiz',
      label: '详情测验',
      variantId: 'quiz',
      props: { title: '预设标题' },
      previewPageId: 'detail',
    },
  ],
}

describe('component protocol V2', () => {
  it('accepts both legacy V1 and schema-driven V2 manifests', () => {
    expect(componentManifestSchema.parse(v1)).toEqual(v1)
    expect(componentManifestSchema.parse(v2)).toEqual(v2)
  })

  it('rejects mismatched versions and broken page/variant references', () => {
    expect(componentManifestSchema.safeParse({
      ...v2,
      runtimeApiVersion: 1,
    }).success).toBe(false)
    expect(componentManifestSchema.safeParse({
      ...v2,
      editor: {
        ...v2.editor,
        pages: [{ id: 'intro', label: '导入', propertyKeys: ['missing.path'] }],
      },
    }).success).toBe(false)
    expect(componentManifestSchema.safeParse({
      ...v2,
      presets: [{
        id: 'broken',
        label: '错误',
        variantId: 'missing',
        props: {},
      }],
    }).success).toBe(false)
  })

  it('updates nested props without mutating the source and resolves preset/editor state', () => {
    const base = mergeComponentProps(v2, { title: '实例标题' })
    const changed = setComponentPropValue(base, 'pages.intro.body', '新正文')

    expect(getComponentPropValue(base, 'pages.intro.body')).toBe('导入')
    expect(getComponentPropValue(changed, 'pages.intro.body')).toBe('新正文')

    const preset = resolveComponentPresetProps(v2, 'detail-quiz')
    expect(preset).toMatchObject({
      title: '预设标题',
      layout: 'quiz',
      editor: { previewPageId: 'detail' },
    })
    expect(resolveComponentEditorState(v2, preset)).toEqual({
      pageId: 'detail',
      variantId: 'quiz',
    })
    expect(resolveComponentEditorState(v1, v1.defaultProps)).toEqual({})
  })
})
