import { describe, expect, it } from 'vitest'
const agentKit = await import('../../agent-kit/index.mjs')
const {
  PRODUCT_COMPILER_ID,
  author,
  compileCourseProjectV9,
  defineCourseProject,
  defineScene,
  defineSurface,
} = agentKit
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'

function semanticCourse() {
  return defineCourseProject({
    id: 'agent-kit-v9',
    title: 'Agent Kit V9',
    assets: {
      figure: {
        id: 'figure',
        filename: 'figure.png',
        mimeType: 'image/png',
        kind: 'image',
        path: 'assets/figure.png',
        byteLength: 3,
      },
    },
    surfaces: [
      defineSurface({
        id: 'slide-main',
        kind: 'slide',
        scenes: [defineScene({
          id: 'slide-intro',
          name: 'Intro',
          items: [author.text({ id: 'slide-title', text: '二次函数', geometry: { x: 80, y: 60, width: 800, height: 100 } })],
        })],
      }),
      defineSurface({
        id: 'flow-handout',
        kind: 'flow',
        scenes: [defineScene({
          id: 'flow-content',
          items: [
            author.text({ id: 'flow-paragraph', text: '连续阅读正文' }),
            author.image({ id: 'flow-image', assetId: 'figure' }),
          ],
        })],
      }),
      defineSurface({
        id: 'spatial-map',
        kind: 'spatial-2d',
        scenes: [defineScene({
          id: 'spatial-world',
          items: [author.shape({ id: 'spatial-card', data: { shapeType: 'rounded-rectangle' }, geometry: { x: -200, y: -120, width: 400, height: 240 } })],
        })],
      }),
    ],
  })
}

describe('Agent Kit semantic input to product V9 compiler', () => {
  it('emits the actual strict product document for Slide, Flow and Spatial', () => {
    expect(PRODUCT_COMPILER_ID).toBe('courseware.agent-kit/input-to-course-project-v9@1')
    const first = compileCourseProjectV9(semanticCourse())
    const second = compileCourseProjectV9(semanticCourse())
    expect(first).toEqual(second)
    const project = courseProjectDocumentSchema.parse(first)
    expect(project.schemaVersion).toBe(9)
    expect(project.revision).toBe(0)
    expect(project.surfaces.map((surface) => surface.type)).toEqual(['slide', 'flow', 'spatial-2d'])
    expect(project.locations).toHaveLength(4)
    expect(project.globalLayerItems).toEqual([
      expect.objectContaining({ item: expect.objectContaining({ kind: 'native', layerItemId: 'teacher-controller' }) }),
    ])
    expect(project.mixedPrintPlan?.entries).toHaveLength(3)
    expect(JSON.stringify(project)).not.toContain('courseware.agent-kit/course-project-input@1')
  })

  it('requires an explicit dynamic module resolver and maps its result directly to a product carrier', () => {
    const semantic = defineCourseProject({
      id: 'dynamic-course',
      surfaces: [defineSurface({
        id: 'dynamic-slide',
        kind: 'slide',
        scenes: [defineScene({
          id: 'dynamic-scene',
          items: [author.dynamic({ id: 'graph', module: 'src/modules/graph.mjs', carrier: 'runtime', data: {} })],
        })],
      })],
    })
    expect(() => compileCourseProjectV9(semantic)).toThrow(/requires resolveDynamic/)
    const project = courseProjectDocumentSchema.parse(compileCourseProjectV9(semantic, {
      resolveDynamic: (module: string) => ({
        kind: 'runtime',
        runtime: {
          protocol: 'surface-v1',
          runtimeApiVersion: 3,
          enabled: true,
          renderMode: 'dom',
          source: `window.__resolvedModule=${JSON.stringify(module)}`,
          content: { values: {} },
          assets: {},
        },
      }),
    }))
    const surface = project.surfaces[0]
    expect(surface.type === 'slide' ? surface.scenes[0]?.layerItems[0] : undefined)
      .toMatchObject({ kind: 'runtime', layerItemId: 'graph' })
  })
})
