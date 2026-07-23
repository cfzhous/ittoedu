import { describe, expect, it } from 'vitest'
import { sceneNativeAssetIds } from '@/player/sceneAssets'
import type { SceneDocument } from '@/shared/projectTypes'

describe('PlayerScene scene-level asset planning', () => {
  it('collects only native images referenced by the requested scene', () => {
    const scene: SceneDocument = {
      id: 'scene-1',
      name: '第一页',
      backgroundColor: '#ffffff',
      backgroundAssetId: 'background',
      interactions: [],
      nodes: [
        {
          id: 'image-1',
          name: '图片一',
          type: 'image',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          opacity: 1,
          visible: true,
          playbackInitialVisibility: 'inherit',
          locked: false,
          assetId: 'shared-image',
          preserveAspectRatio: true,
          fit: 'contain',
          crop: { left: 0, top: 0, right: 0, bottom: 0 },
          cropX: 0.5,
          cropY: 0.5,
          flipX: false,
          flipY: false,
          cornerRadius: 0,
          feather: { amount: 0, mode: 'rectangle' },
        },
        {
          id: 'component-1',
          name: '组件',
          type: 'external-component',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          opacity: 1,
          visible: true,
          playbackInitialVisibility: 'inherit',
          locked: false,
          component: { packageId: 'com.example.test', version: '1.0.0' },
          props: { coverAssetId: 'component-owned-project-asset' },
        },
      ],
    }

    expect(sceneNativeAssetIds(scene)).toEqual(['background', 'shared-image'])
  })

  it('preloads native images reachable only through presentation states', () => {
    const scene: SceneDocument = {
      id: 'scene-states',
      name: '多状态场景',
      backgroundColor: '#ffffff',
      backgroundAssetId: 'base-background',
      interactions: [],
      nodes: [{
        id: 'image-1',
        name: '状态图片',
        type: 'image',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        visible: true,
        playbackInitialVisibility: 'inherit',
        locked: false,
        assetId: 'base-image',
        preserveAspectRatio: true,
        fit: 'contain',
        crop: { left: 0, top: 0, right: 0, bottom: 0 },
        cropX: 0.5,
        cropY: 0.5,
        flipX: false,
        flipY: false,
        cornerRadius: 0,
        feather: { amount: 0, mode: 'rectangle' },
      }],
      presentation: {
        initialStateId: 'state-initial',
        states: [
          { id: 'state-initial', name: '初始', nodeOverrides: {} },
          {
            id: 'state-result',
            name: '结果',
            backgroundAssetId: 'result-background',
            nodeOverrides: {
              'image-1': { assetId: 'result-image' },
            },
          },
        ],
      },
    }

    expect(sceneNativeAssetIds(scene)).toEqual([
      'base-background',
      'base-image',
      'result-background',
      'result-image',
    ])
  })
})
