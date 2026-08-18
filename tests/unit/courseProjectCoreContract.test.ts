import { describe, expect, it } from 'vitest'
import {
  collectCourseProjectReferences,
  decodeFlowTableCell,
  flowPlainTextFallback,
  flowRunsFallback,
  getEffectiveCourseLayerOrder,
  migrateProjectV8ToCourseProjectV9,
  normalizeFlowRichText,
  visitCourseProject,
} from '@/shared/courseProjectModel'
import {
  courseProjectDocumentSchema,
  flowBlockSchema,
} from '@/shared/courseProjectSchema'
import {
  COURSE_PROJECT_SCHEMA_VERSION,
  type CourseProjectDocument,
  type FlowBlock,
} from '@/shared/courseProjectTypes'
import { createProject } from '@/renderer/project/createProject'

const NOW = '2026-08-17T00:00:00.000Z'

function courseShell(): Omit<CourseProjectDocument, 'locations' | 'startLocationId' | 'surfaces'> {
  return {
    schemaVersion: COURSE_PROJECT_SCHEMA_VERSION,
    id: 'course-core',
    revision: 0,
    title: '最小合同',
    createdAt: NOW,
    updatedAt: NOW,
    assets: {},
    componentPackages: {},
    designTokens: {
      fonts: [{
        id: 'body',
        label: '正文',
        fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
      }],
      colors: [
        { id: 'background', label: '背景', color: '#ffffff' },
        { id: 'text', label: '正文', color: '#1f2937' },
      ],
    },
    media: {
      audio: {
        defaultMuted: false,
        masterVolume: 1,
        channelVolumes: {
          music: 1,
          narration: 1,
          sfx: 1,
          ui: 1,
          video: 1,
        },
        sounds: {},
        narrationDucking: {
          enabled: true,
          musicVolume: 0.3,
          fadeMs: 250,
        },
      },
    },
    playback: {
      controls: 'none',
      keyboardNavigation: true,
      presenter: {
        enabled: true,
        strategy: 'scene-navigation',
        additionalBindings: [],
      },
    },
    courseState: [],
    navigationGuards: [],
    globalLayerItems: [],
    globalInteractions: [],
  }
}

function minimalSlideProject(): CourseProjectDocument {
  return {
    ...courseShell(),
    locations: [{
      id: 'location-scene-1',
      label: '场景 1',
      kind: 'slide-scene',
      surfaceId: 'surface-slide',
      sceneId: 'scene-1',
    }],
    startLocationId: 'location-scene-1',
    surfaces: [{
      id: 'surface-slide',
      title: '演示',
      type: 'slide',
      canvas: { width: 1280, height: 720 },
      surfaceLayerItems: [],
      scenes: [{
        id: 'scene-1',
        name: '场景 1',
        backgroundColor: '#ffffff',
        layerItems: [],
        interactions: [],
      }],
    }],
  }
}

function flowProject(blocks: FlowBlock[]): CourseProjectDocument {
  const start = blocks[0]
  if (!start) throw new Error('flow fixture needs at least one block')
  return {
    ...courseShell(),
    id: 'course-flow',
    locations: [{
      id: 'location-flow',
      label: start.type === 'heading' ? start.text : '正文',
      kind: 'flow-block',
      surfaceId: 'surface-flow',
      blockId: start.id,
    }],
    startLocationId: 'location-flow',
    surfaces: [{
      id: 'surface-flow',
      title: '讲义',
      type: 'flow',
      surfaceLayerItems: [],
      layout: { readingWidth: 760, wideContentWidth: 1120 },
      blocks,
    }],
  }
}

describe('Course Project V9 core contract', () => {
  it('validates a strict schemaVersion 9 minimal project and rejects unknown fields', () => {
    const project = minimalSlideProject()
    const parsed = courseProjectDocumentSchema.parse(project)
    expect(parsed.schemaVersion).toBe(9)
    expect(parsed.locations[0]).toMatchObject({
      kind: 'slide-scene',
      surfaceId: 'surface-slide',
      sceneId: 'scene-1',
    })
    expect(parsed.surfaces[0]).toMatchObject({ type: 'slide' })
    expect('projectMode' in parsed).toBe(false)

    expect(courseProjectDocumentSchema.safeParse({
      ...project,
      staleRoot: true,
    }).success).toBe(false)
    expect(courseProjectDocumentSchema.safeParse({
      ...project,
      projectMode: 'flow',
    }).success).toBe(false)
    expect(flowBlockSchema.safeParse({
      id: 'bad',
      type: 'paragraph',
      text: 'x',
      level: 2,
    }).success).toBe(false)
  })

  it('reads legacy Flow plain-text JSON without runs', () => {
    const legacyBlocks = [
      { id: 'heading', type: 'heading', level: 1, text: '标题' },
      { id: 'paragraph', type: 'paragraph', text: '正文' },
      {
        id: 'list',
        type: 'list',
        ordered: true,
        items: [{ id: 'item-1', text: '第一项' }],
      },
      { id: 'quote', type: 'quote', text: '引用', citation: '出处' },
      {
        id: 'table',
        type: 'table',
        columns: [{ id: 'c1', header: '列' }],
        rows: [{ id: 'r1', cells: { c1: '值' } }],
      },
    ] as const

    const parsedBlocks = legacyBlocks.map((block) => flowBlockSchema.parse(block))
    expect(parsedBlocks).toEqual(legacyBlocks)

    const project = courseProjectDocumentSchema.parse(flowProject([...parsedBlocks]))
    const surface = project.surfaces[0]
    if (surface?.type !== 'flow') throw new Error('expected flow surface')
    const heading = surface.blocks[0]
    const paragraph = surface.blocks[1]
    const list = surface.blocks[2]
    const quote = surface.blocks[3]
    const table = surface.blocks[4]
    if (heading?.type !== 'heading') throw new Error('expected heading')
    if (paragraph?.type !== 'paragraph') throw new Error('expected paragraph')
    if (list?.type !== 'list') throw new Error('expected list')
    if (quote?.type !== 'quote') throw new Error('expected quote')
    if (table?.type !== 'table') throw new Error('expected table')

    expect(heading.runs).toBeUndefined()
    expect(paragraph.runs).toBeUndefined()
    expect(list.items[0]?.runs).toBeUndefined()
    expect(quote.runs).toBeUndefined()
    expect(table.rows[0]?.cells.c1).toBe('值')

    expect(normalizeFlowRichText({ text: heading.text })).toEqual({
      text: '标题',
      runs: [{ start: 0, end: 2, style: {} }],
    })
    expect(decodeFlowTableCell(table.rows[0]!.cells.c1!)).toEqual({
      text: '值',
      runs: [{ start: 0, end: 1, style: {} }],
    })
  })

  it('round-trips Flow runs and keeps plain-text fallback consistent', () => {
    const richBlocks: FlowBlock[] = [
      {
        id: 'heading',
        type: 'heading',
        level: 1,
        text: '标题',
        runs: [{ start: 0, end: 2, style: { bold: true } }],
      },
      {
        id: 'paragraph',
        type: 'paragraph',
        text: '正文强调',
        runs: [{ start: 2, end: 4, style: { italic: true, color: '#2563eb' } }],
      },
      {
        id: 'list',
        type: 'list',
        ordered: false,
        items: [{
          id: 'item-1',
          text: '第一项',
          runs: [{ start: 0, end: 3, style: { underline: true } }],
        }],
      },
      {
        id: 'quote',
        type: 'quote',
        text: '引用',
        citation: '出处',
        runs: [{ start: 0, end: 2, style: { highlightColor: '#fde68a' } }],
      },
      {
        id: 'table',
        type: 'table',
        columns: [{ id: 'c1', header: '列' }],
        rows: [{
          id: 'r1',
          cells: {
            c1: {
              text: '值',
              runs: [{ start: 0, end: 1, style: { strike: true } }],
            },
          },
        }],
      },
    ]

    const parsed = richBlocks.map((block) => flowBlockSchema.parse(block))
    const reparsed = parsed.map((block) => flowBlockSchema.parse(
      JSON.parse(JSON.stringify(block)) as unknown,
    ))
    expect(reparsed).toEqual(parsed)

    const heading = parsed[0]
    const paragraph = parsed[1]
    const list = parsed[2]
    const quote = parsed[3]
    const table = parsed[4]
    if (heading?.type !== 'heading') throw new Error('expected heading')
    if (paragraph?.type !== 'paragraph') throw new Error('expected paragraph')
    if (list?.type !== 'list') throw new Error('expected list')
    if (quote?.type !== 'quote') throw new Error('expected quote')
    if (table?.type !== 'table') throw new Error('expected table')

    expect(flowPlainTextFallback(heading)).toBe('标题')
    expect(flowRunsFallback({ text: heading.text })).toEqual([
      { start: 0, end: 2, style: {} },
    ])
    expect(flowRunsFallback(heading)).toEqual(heading.runs)
    expect(flowPlainTextFallback({ runs: heading.runs })).toBe('')
    expect(decodeFlowTableCell(table.rows[0]!.cells.c1!)).toEqual({
      text: '值',
      runs: [{ start: 0, end: 1, style: { strike: true } }],
    })

    const project = courseProjectDocumentSchema.parse(flowProject(parsed))
    const surface = project.surfaces[0]
    if (surface?.type !== 'flow') throw new Error('expected flow surface')
    expect(surface.blocks).toEqual(parsed)
    expect(flowBlockSchema.safeParse({
      id: 'overflow',
      type: 'paragraph',
      text: '短',
      runs: [{ start: 0, end: 8, style: { bold: true } }],
    }).success).toBe(false)
  })

  it('migrates a minimal V8 document through the V9 model and round-trips schema', () => {
    const source = createProject({
      id: 'course-migrate',
      title: '迁移合同',
      now: NOW,
      includeDefaultController: false,
      controls: 'none',
    })
    const before = structuredClone(source)
    const migrated = migrateProjectV8ToCourseProjectV9(source)

    expect(source).toEqual(before)
    expect(migrated.schemaVersion).toBe(9)
    expect(courseProjectDocumentSchema.parse(structuredClone(migrated))).toEqual(migrated)
    expect(migrated.locations).toEqual([expect.objectContaining({
      id: source.scenes[0]!.id,
      kind: 'slide-scene',
      surfaceId: `slide:${source.id}`,
      sceneId: source.scenes[0]!.id,
    })])
    expect(migrated.surfaces).toEqual([expect.objectContaining({
      type: 'slide',
      scenes: [expect.objectContaining({ id: source.scenes[0]!.id })],
    })])

    const ordered = getEffectiveCourseLayerOrder({
      project: migrated,
      surfaceId: migrated.surfaces[0]!.id,
      locationId: migrated.startLocationId,
    })
    expect(ordered).toEqual([])

    const visited = { surfaces: 0, scenes: 0, locations: 0 }
    visitCourseProject(migrated, {
      surface: () => { visited.surfaces += 1 },
      scene: () => { visited.scenes += 1 },
      location: () => { visited.locations += 1 },
    })
    expect(visited).toEqual({ surfaces: 1, scenes: 1, locations: 1 })
    expect(collectCourseProjectReferences(migrated).some((entry) => (
      entry.kind === 'surface' && entry.id === migrated.surfaces[0]!.id
    ))).toBe(true)
  })
})
