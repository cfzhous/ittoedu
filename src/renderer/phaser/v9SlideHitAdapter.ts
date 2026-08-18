import type { LayerItem } from '../../shared/courseProjectTypes'
import {
  pointInsideRotatedWorldRect,
  rotatedWorldRectAxisBounds,
  type StagePoint,
  type StageRect,
} from '../authoring/stageViewportTransform'

/** Same shape as Phaser `AdapterBounds`; kept free of Phaser so tests stay pure. */
export interface V9SlideHitBounds {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

/**
 * Geometry-only V9 hit adapter. Image, video, Component and Runtime use the
 * same authored frame as Native text; Phaser ProxyNodeAdapter later mounts an
 * interaction zone from these bounds. Tests prove hittability without a game loop.
 */
export interface V9SlideHitTarget {
  readonly layerItemId: string
  readonly kind: LayerItem['kind']
  readonly nativeType: string | null
  readonly bounds: V9SlideHitBounds
  readonly hittable: boolean
  readonly locked: boolean
  readonly writable: boolean
}

function nativeTypeOf(item: LayerItem): string | null {
  return item.kind === 'native' ? item.content.nativeType : null
}

export function v9SlideLayerItemBounds(item: LayerItem): V9SlideHitBounds {
  return {
    x: item.frame.x,
    y: item.frame.y,
    width: item.frame.width,
    height: item.frame.height,
    rotation: item.rotation,
  }
}

export function v9SlideLayerItemIsHittable(
  item: LayerItem,
  effectiveVisible = item.visible,
  scope: 'scene' | 'surface' | 'global' = 'scene',
): boolean {
  if (!effectiveVisible) return false
  if (item.hitPolicy === 'pass-through') return false
  if (
    item.kind === 'native' &&
    item.content.nativeType === 'teacher-controller' &&
    scope !== 'global'
  ) {
    return false
  }
  return item.kind === 'native' ||
    item.kind === 'component' ||
    item.kind === 'runtime'
}

export function adaptV9SlideLayerItemHit(
  item: LayerItem,
  effectiveVisible = item.visible,
  scope: 'scene' | 'surface' | 'global' = 'scene',
): V9SlideHitTarget {
  const bounds = v9SlideLayerItemBounds(item)
  const hittable = v9SlideLayerItemIsHittable(item, effectiveVisible, scope)
  return {
    layerItemId: item.layerItemId,
    kind: item.kind,
    nativeType: nativeTypeOf(item),
    bounds,
    hittable,
    locked: item.locked,
    writable: hittable && !item.locked,
  }
}

export function hitTestV9SlideLayerItems(
  targets: readonly V9SlideHitTarget[],
  worldPoint: StagePoint,
): V9SlideHitTarget | null {
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const target = targets[index]
    if (!target?.hittable) continue
    if (pointInsideRotatedWorldRect(worldPoint, target.bounds, target.bounds.rotation)) {
      return target
    }
  }
  return null
}

export function marqueeHitV9SlideLayerItems(
  targets: readonly V9SlideHitTarget[],
  worldRect: StageRect,
): V9SlideHitTarget[] {
  const marquee = {
    left: Math.min(worldRect.x, worldRect.x + worldRect.width),
    right: Math.max(worldRect.x, worldRect.x + worldRect.width),
    top: Math.min(worldRect.y, worldRect.y + worldRect.height),
    bottom: Math.max(worldRect.y, worldRect.y + worldRect.height),
  }
  return targets.filter((target) => {
    if (!target.hittable) return false
    const bounds = rotatedWorldRectAxisBounds(target.bounds, target.bounds.rotation)
    return bounds.left <= marquee.right &&
      bounds.right >= marquee.left &&
      bounds.top <= marquee.bottom &&
      bounds.bottom >= marquee.top
  })
}

/**
 * Phaser 1280×720 logical space is Project world space. CSS zoom/pan lives on
 * the Workspace stage stack, so pointer.worldX/worldY are already world coords.
 */
export function editorPhaserPointerToWorld(pointer: {
  readonly worldX: number
  readonly worldY: number
}): StagePoint {
  return { x: pointer.worldX, y: pointer.worldY }
}
