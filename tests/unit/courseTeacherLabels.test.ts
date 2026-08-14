import { describe, expect, it } from 'vitest'
import { COURSE_SURFACE_TYPES } from '../../src/shared/courseProjectTypes'
import {
  COURSE_SURFACE_LABELS,
  FLOW_BLOCK_LABELS,
  LAYER_KIND_LABELS,
  LAYER_SCOPE_LABELS,
} from '../../src/renderer/course/courseTeacherLabels'

describe('V9 teacher vocabulary', () => {
  it('covers every persisted surface and Flow block identifier', () => {
    expect(Object.keys(COURSE_SURFACE_LABELS).sort()).toEqual([...COURSE_SURFACE_TYPES].sort())
    expect(Object.keys(FLOW_BLOCK_LABELS).sort()).toEqual([
      'callout', 'code', 'component', 'divider', 'formula', 'heading',
      'list', 'media', 'paragraph', 'quote', 'section', 'table',
    ])
  })

  it('does not expose protocol identifiers as ordinary labels', () => {
    const labels = [
      ...Object.values(COURSE_SURFACE_LABELS),
      ...Object.values(FLOW_BLOCK_LABELS),
      ...Object.values(LAYER_KIND_LABELS),
      ...Object.values(LAYER_SCOPE_LABELS),
    ]
    expect(labels).not.toContain('slide')
    expect(labels).not.toContain('flow')
    expect(labels).not.toContain('spatial-2d')
    expect(labels).not.toContain('native')
    expect(labels).not.toContain('runtime')
    expect(labels).not.toContain('component')
  })
})
