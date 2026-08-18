import type { LayerItem } from '../../shared/courseProjectTypes'
import type {
  SpatialCoordinateSpace,
  SpatialEditorLayerScope,
  SpatialEditorLayerView,
} from '../course/spatialEditorView'
import {
  adaptV9SlideLayerItemHit,
  hitTestV9SlideLayerItems,
  marqueeHitV9SlideLayerItems,
  v9SlideLayerItemBounds,
  type V9SlideHitBounds,
  type V9SlideHitTarget,
} from './v9SlideHitAdapter'
import type { StagePoint, StageRect } from '../authoring/stageViewportTransform'

/**
 * Geometry-only Spatial hit adapter. Reuses the R2 Slide hittability rules
 * (Native / Component / Runtime, pass-through, teacher-controller only on
 * viewport/global) and tags the R5-A coordinate space. Phaser is not required.
 */
export interface V9SpatialHitTarget extends V9SlideHitTarget {
  readonly coordinateSpace: SpatialCoordinateSpace
  readonly source: SpatialEditorLayerScope
}

export type { V9SlideHitBounds as V9SpatialHitBounds }

export function v9SpatialLayerItemBounds(item: LayerItem): V9SlideHitBounds {
  return v9SlideLayerItemBounds(item)
}

export function adaptV9SpatialLayerHit(layer: SpatialEditorLayerView): V9SpatialHitTarget {
  const slideScope = layer.coordinateSpace === 'viewport' ? 'global' : 'scene'
  const adapted = adaptV9SlideLayerItemHit(
    layer.item as LayerItem,
    layer.effectiveVisible,
    slideScope,
  )
  return {
    ...adapted,
    coordinateSpace: layer.coordinateSpace,
    source: layer.source,
  }
}

export function adaptV9SpatialEditorLayers(
  layers: readonly SpatialEditorLayerView[],
): V9SpatialHitTarget[] {
  return layers.map(adaptV9SpatialLayerHit)
}

/**
 * Viewport/global first, then world (including page-shared surface items).
 * Camera frames / path / relation are not in this list and must not steal.
 */
export function hitTestV9SpatialLayerItems(
  targets: readonly V9SpatialHitTarget[],
  points: { readonly viewport: StagePoint; readonly world: StagePoint },
): V9SpatialHitTarget | null {
  const viewportHit = hitTestV9SlideLayerItems(
    targets.filter((target) => target.coordinateSpace === 'viewport'),
    points.viewport,
  )
  if (viewportHit) return viewportHit as V9SpatialHitTarget
  const worldHit = hitTestV9SlideLayerItems(
    targets.filter((target) => target.coordinateSpace === 'world'),
    points.world,
  )
  return (worldHit as V9SpatialHitTarget | null) ?? null
}

export function marqueeHitV9SpatialWorldLayerItems(
  targets: readonly V9SpatialHitTarget[],
  worldRect: StageRect,
): V9SpatialHitTarget[] {
  return marqueeHitV9SlideLayerItems(
    targets.filter((target) => target.coordinateSpace === 'world'),
    worldRect,
  ) as V9SpatialHitTarget[]
}
