import { describe, expect, it } from 'vitest'
import { makeAuthoringAddress } from '@/shared/authoringAddress'

describe('stable authoring address and AI selection bridge', () => {
  it('AI authoring URI requires stable surface and scene scope', () => {
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
