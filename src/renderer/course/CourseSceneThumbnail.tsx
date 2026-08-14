import type { CSSProperties, ReactNode } from 'react'
import type {
  LayerItem,
  LayerItemOverride,
  ScopedLayerItem,
  SlideSceneDocument,
} from '@/shared/courseProjectTypes'
import { isCourseLayerVisibleAtLocation } from '@/shared/courseProjectModel'
import './course-scene-thumbnail.css'

const CANVAS_WIDTH = 1280
const CANVAS_HEIGHT = 720

export interface CourseSceneThumbnailProps {
  scene: SlideSceneDocument
  /** Surface/global items that are actually part of this scene compositor. */
  sharedLayerItems?: readonly ScopedLayerItem[]
  locationId?: string
  resolveAsset?(assetId: string): string | undefined
  width?: number
  className?: string
}

interface ThumbnailItem {
  item: LayerItem
  override?: LayerItemOverride
  effectiveOrder: number
}

function thumbnailItems(
  scene: SlideSceneDocument,
  sharedLayerItems: readonly ScopedLayerItem[],
  locationId: string | undefined,
): ThumbnailItem[] {
  const presentation = scene.presentation
  const state = presentation?.states.find((candidate) => (
    candidate.id === (presentation.thumbnailStateId ?? presentation.initialStateId)
  ))
  const byId = new Map(scene.layerItems.map((item) => [item.layerItemId, item]))
  const baseOrder = scene.layerItems
    .slice()
    .sort((left, right) => left.order - right.order || left.layerItemId.localeCompare(right.layerItemId))
  const explicit = state?.layerItemOrder ?? []
  const seen = new Set(explicit)
  const orderedIds = [...explicit, ...baseOrder.filter((item) => !seen.has(item.layerItemId)).map((item) => item.layerItemId)]
  const orderSlots = baseOrder.map((item) => item.order)
  const sceneItems = orderedIds
    .map((id) => byId.get(id))
    .filter((item): item is LayerItem => Boolean(item))
    .map((item, index) => ({
      item,
      override: state?.layerItemOverrides[item.layerItemId],
      effectiveOrder: state?.layerItemOverrides[item.layerItemId]?.order ?? orderSlots[index] ?? item.order,
    }))
  const sharedItems = sharedLayerItems
    .filter((entry) => locationId
      ? isCourseLayerVisibleAtLocation(entry, locationId)
      : entry.visibility.mode === 'all')
    .map((entry) => ({ item: entry.item, effectiveOrder: entry.item.order }))
  return [...sceneItems, ...sharedItems].sort((left, right) => (
    left.effectiveOrder - right.effectiveOrder ||
    left.item.layerItemId.localeCompare(right.item.layerItemId)
  ))
}

function thumbnailContent(
  item: LayerItem,
  resolveAsset?: CourseSceneThumbnailProps['resolveAsset'],
): ReactNode {
  if (item.kind === 'runtime') return <span className="course-scene-thumbnail__dynamic">互动</span>
  if (item.kind === 'component') return <span className="course-scene-thumbnail__dynamic">组件</span>

  const { content } = item
  if (content.nativeType === 'text') {
    const style = content.data.style
    return (
      <span className="course-scene-thumbnail__text" style={{
        color: style.color,
        backgroundColor: style.backgroundOpacity > 0 ? style.backgroundColor : 'transparent',
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.bold ? 700 : 400,
        fontStyle: style.italic ? 'italic' : 'normal',
        textAlign: style.align,
        padding: style.padding,
        borderRadius: style.cornerRadius,
      }}>
        {content.data.text}
      </span>
    )
  }
  if (content.nativeType === 'formula') {
    return <span className="course-scene-thumbnail__formula">ƒ</span>
  }
  if (content.nativeType === 'image') {
    const source = resolveAsset?.(content.data.assetId)
    return source
      ? <img src={source} alt="" draggable={false} />
      : <span className="course-scene-thumbnail__dynamic">图片</span>
  }
  if (content.nativeType === 'video') {
    return <span className="course-scene-thumbnail__dynamic">视频</span>
  }
  if (content.nativeType === 'teacher-controller') return null
  const style = content.data.style
  return <span className="course-scene-thumbnail__shape" style={{
    backgroundColor: style.fillColor,
    opacity: style.fillOpacity,
    borderColor: style.borderColor,
    borderWidth: style.borderWidth,
    borderStyle: style.lineStyle === 'dashed' ? 'dashed' : style.lineStyle === 'dotted' ? 'dotted' : 'solid',
    borderRadius: content.data.shapeType === 'ellipse' ? '50%' : style.cornerRadius,
  }} />
}

function itemStyle(item: LayerItem, override?: LayerItemOverride): CSSProperties {
  const frame = { ...item.frame, ...override?.frame }
  const visible = override?.visible ?? item.visible
  return {
    position: 'absolute',
    left: frame.x,
    top: frame.y,
    width: Math.max(1, frame.width),
    height: Math.max(1, frame.height),
    opacity: visible ? (override?.opacity ?? item.opacity) : 0,
    transform: `rotate(${override?.rotation ?? item.rotation}deg)`,
    transformOrigin: 'center',
    overflow: 'hidden',
  }
}

export function CourseSceneThumbnail({
  scene,
  sharedLayerItems = [],
  locationId,
  resolveAsset,
  width = 136,
  className,
}: CourseSceneThumbnailProps) {
  const presentation = scene.presentation
  const state = presentation?.states.find((candidate) => (
    candidate.id === (presentation.thumbnailStateId ?? presentation.initialStateId)
  ))
  const backgroundAssetId = state?.backgroundAssetId ?? scene.backgroundAssetId
  const backgroundSource = backgroundAssetId ? resolveAsset?.(backgroundAssetId) : undefined
  const scale = width / CANVAS_WIDTH
  const height = CANVAS_HEIGHT * scale

  return (
    <div
      className={['course-scene-thumbnail', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={`${scene.name}缩略图`}
      data-testid="course-scene-thumbnail"
      style={{ width, height }}
    >
      <div
        className="course-scene-thumbnail__canvas"
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          transform: `scale(${scale})`,
          backgroundColor: state?.backgroundColor ?? scene.backgroundColor,
          ...(backgroundSource ? {
            backgroundImage: `url(${JSON.stringify(backgroundSource)})`,
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'cover',
          } : {}),
        }}
      >
        {thumbnailItems(scene, sharedLayerItems, locationId).map(({ item, override }) => (
          <div
            key={item.layerItemId}
            className={`course-scene-thumbnail__item is-${item.kind}`}
            data-layer-item-id={item.layerItemId}
            style={itemStyle(item, override)}
          >
            {thumbnailContent(item, resolveAsset)}
          </div>
        ))}
      </div>
    </div>
  )
}

export default CourseSceneThumbnail
