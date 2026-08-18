import { describe, expect, it } from 'vitest'
import { COURSE_PROJECT_SCHEMA_VERSION } from '@/shared/contracts/course-project-v9'
import {
  PUBLISHED_COURSE_FORMAT,
  PUBLISHED_COURSE_VERSION,
} from '@/shared/contracts/published-course-v2'
import {
  COMPONENT_SCOPES,
} from '@/shared/contracts/component-v4'
import {
  SURFACE_RUNTIME_API_VERSION,
} from '@/shared/contracts/runtime'
import {
  INTERACTION_TRIGGER_TYPES,
} from '@/shared/contracts/interaction-v1'
import {
  SHAPE_TYPES,
} from '@/shared/contracts/native-v1'
import type {
  ProjectMediaSettings,
} from '@/shared/contracts/media-v1'
import type {
  ProjectDesignTokens,
} from '@/shared/contracts/design-v1'
import {
  COURSE_PROJECT_SCHEMA_VERSION as ROOT_COURSE_PROJECT_SCHEMA_VERSION,
  PUBLISHED_COURSE_VERSION as ROOT_PUBLISHED_COURSE_VERSION,
  SHAPE_TYPES as ROOT_SHAPE_TYPES,
} from '@/shared/contracts'

describe('contracts barrels', () => {
  it('re-exports course project v9 contract symbols', () => {
    expect(COURSE_PROJECT_SCHEMA_VERSION).toBe(9)
    expect(ROOT_COURSE_PROJECT_SCHEMA_VERSION).toBe(9)
  })

  it('re-exports published course v2 contract symbols', () => {
    expect(PUBLISHED_COURSE_VERSION).toBe(2)
    expect(PUBLISHED_COURSE_FORMAT).toBe('h5course-published')
    expect(ROOT_PUBLISHED_COURSE_VERSION).toBe(2)
  })

  it('re-exports component v4, runtime, and interaction v1 symbols', () => {
    expect(COMPONENT_SCOPES).toBeDefined()
    expect(SURFACE_RUNTIME_API_VERSION).toBe(3)
    expect(INTERACTION_TRIGGER_TYPES).toBeDefined()
  })

  it('re-exports native-v1, media-v1, and design-v1 symbols', () => {
    expect(SHAPE_TYPES).toBeDefined()
    expect(ROOT_SHAPE_TYPES).toBeDefined()
    const sampleMedia: ProjectMediaSettings = {
      audio: {
        defaultMuted: false,
        masterVolume: 1,
        channelVolumes: { music: 1, narration: 1, sfx: 1, ui: 1, video: 1 },
        sounds: {},
        narrationDucking: { enabled: false, musicVolume: 0.5, fadeMs: 200 },
      },
    }
    expect(sampleMedia.audio.defaultMuted).toBe(false)
    const sampleDesign: ProjectDesignTokens = {
      fonts: [],
      colors: [],
    }
    expect(sampleDesign.fonts).toEqual([])
  })
})
