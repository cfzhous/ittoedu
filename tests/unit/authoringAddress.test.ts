import { describe, expect, it } from 'vitest'
import {
  AUTHORING_ADDRESS_PROTOCOL_VERSION,
  makeAuthoringAddress,
  serializeAiSelectionReference,
  type AiSelectionReference,
} from '@/shared/authoringAddress'

describe('stable authoring address', () => {
  it('地址只包含持久工程身份，临时 hitId 单独保留', () => {
    const authoringAddress = makeAuthoringAddress({
      projectId: 'project-one',
      scope: 'scene',
      surfaceId: 'slide-main',
      sceneId: 'scene-one',
      carrier: 'runtime',
      layerItemId: 'runtime-prompt',
      field: 'content.values.prompt',
    })
    const reference: AiSelectionReference = {
      protocolVersion: AUTHORING_ADDRESS_PROTOCOL_VERSION,
      projectId: 'project-one',
      projectRevision: 7,
      layoutRevision: 3,
      hitId: 'scene-host:dom:temporary-4:text',
      authoringAddress,
      kind: 'text',
      label: '观察提示',
      currentValue: '观察图像',
    }

    expect(reference.hitId).toContain('temporary-4')
    expect(reference.authoringAddress).not.toContain('temporary-4')
    expect(reference.authoringAddress).toContain(encodeURIComponent('scene-one'))
    expect(reference.authoringAddress).toContain('field=content.values.prompt')
    expect(reference.currentValue).toBe('观察图像')
    expect(reference.projectRevision).toBe(7)
    expect(serializeAiSelectionReference(reference)).toContain('temporary-4')
    expect(serializeAiSelectionReference(reference)).toContain(authoringAddress)
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
