import { describe, expect, expectTypeOf, it } from 'vitest'
import { makeAuthoringAddress } from '@/shared/authoringAddress'
import {
  componentRenderMode,
  componentSupportsScope,
  componentUsesRecursiveContent,
} from '@/shared/componentCapabilities'
import { componentManifestSchema } from '@/shared/componentSchema'
import {
  findComponentVariant,
  mergeComponentProps,
  resolveComponentEditorProperties,
  resolveComponentPresetProps,
} from '@/shared/componentProps'
import type {
  ComponentCreateContextV4,
  ComponentDefinitionV4,
  ComponentManifestV4,
} from '@/shared/componentTypes'

const v4: ComponentManifestV4 = {
  schemaVersion: 4,
  runtimeApiVersion: 4,
  renderMode: 'dom',
  supportedScopes: ['scene', 'global'],
  id: 'com.example.v4-dom',
  name: 'V4 DOM 组件',
  version: '4.0.0',
  entry: 'runtime.js',
  defaultSize: { width: 640, height: 360 },
  minSize: { width: 160, height: 90 },
  preserveAspectRatio: true,
  assets: {},
  defaultProps: {
    content: {
      title: '默认标题',
      rows: [
        { label: '第一行', value: '10' },
        { label: '第二行', value: '20' },
      ],
    },
    density: 'comfortable',
  },
  editor: {
    properties: [{ key: 'content.title', label: '标题', type: 'text' }],
  },
  variants: [{
    id: 'dense',
    label: '密排',
    props: { density: 'compact' },
  }],
  presets: [{
    id: 'compact',
    label: '紧凑',
    variantId: 'dense',
    props: {
      content: { rows: [{ value: '12' }] },
    },
  }],
}

describe('component protocol V4', () => {
  it('requires an explicit supported render mode and matching API version', () => {
    expect(componentManifestSchema.parse(v4)).toEqual(v4)
    expect(componentManifestSchema.safeParse({
      ...v4,
      renderMode: undefined,
    }).success).toBe(false)
    expect(componentManifestSchema.safeParse({
      ...v4,
      renderMode: 'canvas',
    }).success).toBe(false)
    expect(componentManifestSchema.safeParse({
      ...v4,
      runtimeApiVersion: 3,
    }).success).toBe(false)
    expect(componentManifestSchema.safeParse({
      ...v4,
      supportedScopes: [],
    }).success).toBe(false)
    for (const legacyVersion of [1, 2, 3]) {
      expect(componentManifestSchema.safeParse({
        ...v4,
        schemaVersion: legacyVersion,
        runtimeApiVersion: legacyVersion,
      }).success).toBe(false)
    }
  })

  it('recursively merges content and discovers editable fields', () => {
    expect(mergeComponentProps(v4, {
      content: { title: '实例标题' },
    })).toMatchObject({
      content: {
        title: '实例标题',
        rows: [
          { label: '第一行', value: '10' },
          { label: '第二行', value: '20' },
        ],
      },
      density: 'comfortable',
    })

    expect(findComponentVariant(v4, { density: 'compact' })?.id).toBe('dense')
    expect(resolveComponentPresetProps(v4, 'compact')).toMatchObject({
      content: {
        title: '默认标题',
        rows: [
          { label: '第一行', value: '12' },
          { label: '第二行', value: '20' },
        ],
      },
      density: 'compact',
    })

    expect(resolveComponentEditorProperties(v4, {}).map(({ key }) => key))
      .toEqual([
        'content.title',
        'content.rows.0.label',
        'content.rows.0.value',
        'content.rows.1.label',
        'content.rows.1.value',
      ])
  })

  it('reads capabilities directly from the current manifest', () => {
    expect(componentRenderMode(v4)).toBe('dom')
    expect(componentSupportsScope(v4, 'global')).toBe(true)
    expect(componentUsesRecursiveContent(v4)).toBe(true)
  })

  it('narrows V4 renderer capabilities without an ambiguous root', () => {
    const definition: ComponentDefinitionV4 = {
      id: v4.id,
      runtimeApiVersion: 4,
      create(context: ComponentCreateContextV4) {
        expectTypeOf(context.runtimeApiVersion).toEqualTypeOf<4>()
        expectTypeOf(context.emit).toEqualTypeOf<(eventName: string, payload?: unknown) => void>()
        if (context.renderMode === 'dom') {
          expectTypeOf(context.dom.root).toEqualTypeOf<HTMLElement>()
        } else if (context.renderMode === 'phaser') {
          expectTypeOf(context.phaser.root).toMatchTypeOf<
            import('phaser').GameObjects.Container
          >()
        } else {
          expectTypeOf(context.dom.root).toEqualTypeOf<HTMLElement>()
          expectTypeOf(context.phaser.scene).toMatchTypeOf<import('phaser').Scene>()
        }
        return { destroy() {} }
      },
    }

    expect(definition.runtimeApiVersion).toBe(4)

    const address = makeAuthoringAddress({
      projectId: 'proj-component',
      scope: 'scene',
      surfaceId: 'surface-slide',
      sceneId: 'scene-one',
      carrier: 'component',
      layerItemId: 'component-item',
      field: 'content.title',
    })
    expect(address).toContain('/component/')
    expect(address).toContain('field=content.title')
    expect(address).not.toMatch(/hitId/i)
  })
})
