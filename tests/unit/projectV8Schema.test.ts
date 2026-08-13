import { describe, expect, it } from 'vitest'
import { interactionTriggerSchema } from '@/shared/interactionSchema'
import { projectDocumentSchema } from '@/shared/projectSchema'
import { createProject } from '@/renderer/project/createProject'

describe('Project V8 schema boundary', () => {
  it('creates an explicit V8 slide project with presenter defaults', () => {
    const project = createProject({
      id: 'project-v8',
      now: '2026-08-07T00:00:00.000Z',
      includeDefaultController: false,
      controls: 'none',
    })

    expect(projectDocumentSchema.parse(project)).toEqual(project)
    expect(project).toMatchObject({
      schemaVersion: 8,
      canvas: { width: 1280, height: 720 },
      playback: {
        controls: 'none',
        keyboardNavigation: true,
        presenter: {
          enabled: true,
          strategy: 'scene-navigation',
          additionalBindings: [],
        },
      },
    })
  })

  it('accepts a portable additional KeyboardEvent.key binding', () => {
    const project = createProject({ includeDefaultController: false, controls: 'none' })
    project.playback.presenter.additionalBindings.push({
      id: 'binding-space-next',
      command: 'next',
      key: ' ',
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
    })

    expect(projectDocumentSchema.safeParse(project).success).toBe(true)
  })

  it('rejects the removed footer control mode', () => {
    const project = structuredClone(createProject()) as unknown as {
      playback: { controls: string }
    }
    project.playback.controls = 'footer'

    expect(projectDocumentSchema.safeParse(project).success).toBe(false)
  })

  it('enforces canvas controls and delivery-visible global controller in both directions', () => {
    const missing = createProject({ includeDefaultController: false, controls: 'none' })
    missing.playback.controls = 'canvas'
    const missingResult = projectDocumentSchema.safeParse(missing)
    expect(missingResult.success).toBe(false)
    if (!missingResult.success) {
      expect(missingResult.error.issues[0]).toMatchObject({
        path: ['playback', 'controls'],
      })
      expect(missingResult.error.issues[0]?.message).toContain('交付时可见')
    }

    const disabled = createProject()
    disabled.playback.controls = 'none'
    expect(projectDocumentSchema.safeParse(disabled).success).toBe(false)

    const explicitlyHidden = createProject({ controls: 'none' })
    expect(explicitlyHidden.globalLayer[0]?.node).toMatchObject({
      type: 'teacher-controller',
      playbackInitialVisibility: 'hidden',
    })
    expect(projectDocumentSchema.safeParse(explicitlyHidden).success).toBe(true)
  })

  it.each([1, 2, 3, 4, 5, 6, 7])(
    'rejects Project V%s instead of migrating it',
    (schemaVersion) => {
      const project = structuredClone(createProject()) as unknown as {
        schemaVersion: number
      }
      project.schemaVersion = schemaVersion

      expect(projectDocumentSchema.safeParse(project).success).toBe(false)
    },
  )

  it.each(['PageDown', 'PageUp'])(
    'rejects duplicate configuration of the built-in %s binding',
    (key) => {
      const project = createProject({ includeDefaultController: false, controls: 'none' })
      project.playback.presenter.additionalBindings.push({
        id: `duplicate-${key}`,
        command: key === 'PageDown' ? 'next' : 'previous',
        key,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      })

      const result = projectDocumentSchema.safeParse(project)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('内建标准绑定')
      }
    },
  )

  it('rejects duplicate binding ids and duplicate key/modifier signatures', () => {
    const project = createProject({ includeDefaultController: false, controls: 'none' })
    const binding = {
      id: 'same-id',
      command: 'next' as const,
      key: 'F8',
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
    }
    project.playback.presenter.additionalBindings = [
      binding,
      { ...binding, command: 'previous' },
    ]

    const result = projectDocumentSchema.safeParse(project)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          '翻页笔附加按键 ID 不能重复',
          expect.stringContaining('附加按键与第 1 项重复'),
        ]),
      )
    }
  })

  it('accepts the authored presenter command trigger', () => {
    expect(interactionTriggerSchema.parse({
      type: 'presenter.command',
      command: 'previous',
    })).toEqual({
      type: 'presenter.command',
      command: 'previous',
    })
  })
})
