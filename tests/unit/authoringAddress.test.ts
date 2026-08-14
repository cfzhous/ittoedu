import { describe, expect, it } from 'vitest'
import { makeAuthoringAddress } from '@/shared/authoringAddress'
import { createAiSelectionReference } from '@/renderer/authoring/aiSelectionReference'
import { createProject } from '@/renderer/project/createProject'

describe('stable authoring address and AI selection bridge', () => {
  it('地址只包含持久工程身份，临时 hitId 单独保留', () => {
    const project = createProject({
      includeDefaultController: false,
      controls: 'none',
    })
    const scene = project.scenes[0]!
    scene.runtime = {
      runtimeApiVersion: 2,
      enabled: true,
      renderMode: 'dom',
      source: 'CoursewareRuntime.define({})',
      content: { values: { prompt: '观察图像' } },
      assets: {},
    }
    const reference = createAiSelectionReference({
      project,
      projectRevision: 7,
      layoutRevision: 3,
      surfaceId: 'slide-main',
      activeSceneId: scene.id,
      selection: {
        carrier: 'runtime',
        target: {
          kind: 'text',
          targetId: 'scene-host:dom:temporary-4:text',
          scope: 'scene',
          sceneId: scene.id,
          key: 'prompt',
          label: '观察提示',
          multiline: false,
          source: 'dom',
          layer: 'overlay',
          bounds: { x: 10, y: 20, width: 200, height: 40 },
        },
      },
    })

    expect(reference.hitId).toContain('temporary-4')
    expect(reference.authoringAddress).not.toContain('temporary-4')
    expect(reference.authoringAddress).toContain(encodeURIComponent(scene.id))
    expect(reference.authoringAddress).toContain('field=content.values.prompt')
    expect(reference.currentValue).toBe('观察图像')
    expect(reference.projectRevision).toBe(7)
  })

  it('Agent Kit 兼容 URI 对 scene 地址强制 surface/scene 作用域', () => {
    expect(makeAuthoringAddress({
      projectId: 'project-one',
      scope: 'scene',
      surfaceId: 'slide-main',
      sceneId: 'scene-one',
      carrier: 'component',
      layerItemId: 'component-one',
      field: 'props.content.title',
    })).toBe(
      'courseware://authoring/project-one/scene/slide-main/scene-one/component/component-one?field=props.content.title',
    )
    expect(() => makeAuthoringAddress({
      projectId: 'project-one',
      scope: 'scene',
      carrier: 'native',
      layerItemId: 'title',
      field: 'content.text',
    })).toThrow('surfaceId')
  })
})
