import { describe, expect, it } from 'vitest'
import { createProject } from '@/renderer/project/createProject'
import { createBlankCourseProject, createCourseProject } from '@/renderer/project/createCourseProject'
import {
  createCourseProjectArchive,
  detectCourseProjectArchiveFormat,
  openCourseProjectArchive,
} from '@/renderer/project/courseProjectArchive'
import { createProjectArchive } from '@/renderer/project/projectArchive'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import { UserFacingError } from '@/shared/errors'

const NOW = '2026-08-17T12:00:00.000Z'

describe('V8 import removed', () => {
  it('refuses Project V8 archives as unsupported and does not open a savable session', () => {
    const v8 = createProject({
      id: 'course-stable',
      title: '旧版工程',
      now: NOW,
      includeDefaultController: false,
      controls: 'none',
    })
    const sourceProject = structuredClone(v8)
    const v8Bytes = createProjectArchive({
      project: v8,
      assetFiles: {},
      componentFiles: {},
    }, { mtime: NOW })
    const sourceBytes = v8Bytes.slice()

    expect(detectCourseProjectArchiveFormat(v8Bytes).kind).toBe('unsupported')
    expect(() => openCourseProjectArchive(v8Bytes)).toThrow(UserFacingError)
    expect(() => openCourseProjectArchive(v8Bytes)).toThrow(/版本不支持|格式版本为 8/)
    expect(v8).toEqual(sourceProject)
    expect(v8Bytes).toEqual(sourceBytes)
  })

  it('saves and restores a native V9 blank project without V8 fields', () => {
    let seq = 0
    const idFactory = () => `stable-${++seq}`
    const options = {
      id: 'course-stable',
      title: '当前课程',
      now: NOW,
      idFactory,
      includeDefaultController: false as const,
      controls: 'none' as const,
    }
    const project = createCourseProject(options)
    seq = 0
    expect(project).toEqual(createBlankCourseProject({ ...options, idFactory }))
    expect(project.schemaVersion).toBe(9)
    expect('scenes' in project).toBe(false)
    const bytes = createCourseProjectArchive({
      project,
      assetFiles: {},
      componentFiles: {},
    }, { mtime: NOW })
    const reopened = openCourseProjectArchive(bytes)
    expect(reopened.project.schemaVersion).toBe(9)
    expect(reopened.project.id).toBe('course-stable')
    expect(courseProjectDocumentSchema.parse(structuredClone(reopened.project)))
      .toEqual(reopened.project)
    expect(createCourseProjectArchive({
      project: reopened.project,
      assetFiles: reopened.assetFiles,
      componentFiles: reopened.componentFiles,
    }, { mtime: NOW })).toEqual(bytes)
  })
})
