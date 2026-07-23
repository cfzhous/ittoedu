import { describe, expect, it } from 'vitest'
import { createProject } from '../../src/renderer/project/createProject'
import { resolveProjectHealthRoute } from '../../src/renderer/diagnostics/projectHealthNavigation'
import type { ProjectHealthDiagnostic } from '../../src/shared/projectHealth'

function diagnostic(patch: Partial<ProjectHealthDiagnostic>): ProjectHealthDiagnostic {
  return {
    severity: 'error',
    code: 'test',
    message: 'test',
    scope: 'project',
    path: [],
    ...patch,
  }
}

describe('resolveProjectHealthRoute', () => {
  it('routes scene interaction problems to the matching scene automation tab', () => {
    const project = createProject()
    const scene = project.scenes[0]!
    expect(resolveProjectHealthRoute(project, diagnostic({
      scope: 'interaction',
      sceneId: scene.id,
      ruleId: 'rule-1',
    }))).toEqual({
      scope: 'scene',
      tab: 'automation',
      sceneId: scene.id,
      stateId: null,
    })
  })

  it('routes global node problems to its editable properties', () => {
    const project = createProject()
    const controller = project.globalLayer[0]!.node
    expect(resolveProjectHealthRoute(project, diagnostic({
      scope: 'controller',
      nodeId: controller.id,
    }))).toEqual({
      scope: 'global',
      tab: 'properties',
      nodeId: controller.id,
    })
  })

  it('routes asset and package problems to their management panels', () => {
    const project = createProject()
    expect(resolveProjectHealthRoute(project, diagnostic({ scope: 'asset' }))).toEqual({
      scope: 'scene',
      tab: 'media',
    })
    expect(resolveProjectHealthRoute(project, diagnostic({
      scope: 'component-package',
    }))).toEqual({ scope: 'scene', tab: 'elements' })
  })
})
