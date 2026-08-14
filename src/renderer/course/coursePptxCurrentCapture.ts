import {
  slideItemCaptureFailureWarning,
  type SlideSurfaceHost,
} from '../../player/surfaces/slide/SlideSurfaceHost'
import type {
  CourseProjectDocument,
  LayerItem,
  SlideSceneDocument,
  SlideSurfaceDocument,
} from '../../shared/courseProjectTypes'
import { captureMountedElementPng } from '../export/playerCapture'

type DynamicLayerItem = Extract<LayerItem, { kind: 'component' | 'runtime' }>

export interface CurrentPptxDynamicCaptureContext {
  project: CourseProjectDocument
  surface: SlideSurfaceDocument
  scene: SlideSceneDocument
  item: DynamicLayerItem
}

export function currentPptxDynamicCapture(
  getHost: () => SlideSurfaceHost | null,
  getActiveSurfaceId: () => string,
  captureItem: (
    host: SlideSurfaceHost,
    item: DynamicLayerItem,
  ) => Promise<string> = captureCurrentSlideDynamicItem,
) {
  return async ({ surface, scene, item }:
    CurrentPptxDynamicCaptureContext): Promise<string> => {
    const currentHost = getHost()
    if (
      !currentHost ||
      getActiveSurfaceId() !== surface.id ||
      currentHost.sceneId !== scene.id
    ) {
      throw new Error('当前实例未在画布上打开，无法捕获当前帧')
    }
    const expectedStateId = scene.presentation?.initialStateId
    if (currentHost.stateId !== expectedStateId) {
      throw new Error('当前画布不是该幻灯片的初始画面，已改用静态预览以避免混用不同画面状态')
    }
    return captureItem(currentHost, item)
  }
}

/**
 * Captures one dynamic item from the already-mounted Course Studio surface.
 * The live host is cloned without invoking arbitrary prepareCapture hooks.
 * Current DOM and Canvas pixels are materialized by SlideSurfaceHost itself,
 * so exporting cannot mutate course state, emit lesson events or navigate.
 */
export async function captureCurrentSlideDynamicItem(
  host: SlideSurfaceHost,
  item: DynamicLayerItem,
): Promise<string> {
  const prepared = await host.capture({
    purpose: 'export',
    dynamicPreparation: 'preserve-current',
  })
  if (prepared.warnings?.includes(slideItemCaptureFailureWarning(item.label))) {
    throw new Error('当前实例的画面生成失败')
  }
  if (prepared.format !== 'html') {
    throw new Error('当前幻灯片实例未返回可捕获的画面')
  }

  // Consume the clone returned by the live host capture contract. DOM
  // instances keep their current rendered state, while Canvas/Phaser hosts can
  // replace otherwise non-clonable bitmaps with the image returned by capture.
  const template = document.createElement('template')
  template.innerHTML = prepared.content
  const root = template.content.querySelector<HTMLElement>('.slide-surface')
  const wrapper = [...(root?.querySelectorAll<HTMLElement>(
    ':scope > .slide-layer-item',
  ) ?? [])].find((candidate) => candidate.dataset.layerItemId === item.layerItemId)
  if (!root || !wrapper || wrapper.hidden) {
    throw new Error('当前实例在画布上不可见，无法捕获当前帧')
  }
  const content = wrapper.querySelector<HTMLElement>(':scope > .slide-layer-content')
  if (!content) throw new Error('当前实例缺少可捕获的画面根节点')

  root.hidden = false
  Object.assign(root.style, {
    position: 'fixed', left: '-100000px', top: '0', transform: 'none',
  })
  wrapper.style.transform = 'none'
  wrapper.style.opacity = '1'
  content.querySelectorAll<HTMLElement>('.course-dynamic-authoring-targets')
    .forEach((overlay) => { overlay.style.display = 'none' })
  document.body.appendChild(root)
  try {
    return await captureMountedElementPng(content)
  } finally {
    root.remove()
  }
}
