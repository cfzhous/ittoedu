import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentPackageData } from '../../shared/componentTypes'
import type { LayerItem } from '../../shared/courseProjectTypes'
import type {
  AssetMeta,
  GlobalLayerItem,
  SceneDocument,
  SceneNode,
} from '../../shared/projectTypes'
import type { RuntimeDocument } from '../../shared/runtimeTypes'
import {
  ensureScenePresentation,
  materializeScene,
} from '../../shared/presentation'
import { useEditorStore } from '../store/editorStore'
import { renderShapeCanvas } from '../../shared/canvasShapeRenderer'
import { renderFormulaNodeCanvas } from '../../shared/formulaRenderer'
import { renderImageNodeCanvas } from '../../shared/imageEffects'
import { renderTextNodeCanvas } from '../../shared/textLayout'
import {
  buildSceneThumbnailComposition,
  type SceneThumbnailCompositionEntry,
} from './sceneThumbnailComposition'

const WIDTH = 160
const HEIGHT = 90
const SCALE = WIDTH / 1280

export interface SceneThumbnailComponentResource {
  name: string
  thumbnailUrl?: string
}

export interface SceneThumbnailFrame {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
}

export interface SceneThumbnailComponentEntry {
  kind: 'course-component'
  frame: SceneThumbnailFrame
  label: string
  packageId: string
  /** When authored, this is the visual authority; package art is not consulted. */
  staticFallbackAssetId?: string
}

export interface SceneThumbnailRuntimeEntry {
  kind: 'course-runtime-fallback'
  frame: SceneThumbnailFrame
  assetId: string
}

export type SceneThumbnailRenderEntry =
  | SceneThumbnailCompositionEntry
  | SceneThumbnailComponentEntry
  | SceneThumbnailRuntimeEntry

/**
 * The thumbnail renderer deliberately consumes a small visual snapshot rather
 * than an editor project. Course Project V9 callers can therefore render the
 * effective unified layer order without constructing a Project V8 document.
 */
export interface SceneThumbnailRenderModel {
  backgroundColor: string
  backgroundAssetId?: string | null
  entries: readonly SceneThumbnailRenderEntry[]
  assets: Readonly<Record<string, AssetMeta>>
  assetFiles: Readonly<Record<string, Uint8Array>>
  components: Readonly<Record<string, SceneThumbnailComponentResource>>
}

type DeepReadonly<T> =
  T extends (...args: never[]) => unknown ? T :
    T extends readonly (infer Item)[] ? readonly DeepReadonly<Item>[] :
      T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> } :
        T

export interface CourseSceneThumbnailLayerEntry {
  /** Effective visibility already includes the global/surface location scope. */
  effectiveVisible: boolean
  item: DeepReadonly<LayerItem>
}

export interface BuildCourseSceneThumbnailRenderModelInput {
  backgroundColor: string
  backgroundAssetId?: string | null
  /** Back-to-front unified global/surface/scene entries. */
  layers: readonly CourseSceneThumbnailLayerEntry[]
  assets: Readonly<Record<string, AssetMeta>>
  assetFiles: Readonly<Record<string, Uint8Array>>
  componentPackages: Readonly<Record<string, ComponentPackageData>>
}

export interface BuildLegacySceneThumbnailRenderModelInput {
  scene: SceneDocument
  globalLayer: readonly GlobalLayerItem[]
  globalRuntime: RuntimeDocument | undefined
  assets: Readonly<Record<string, AssetMeta>>
  assetFiles: Readonly<Record<string, Uint8Array>>
  componentPackages: Readonly<Record<string, ComponentPackageData>>
}

function componentResources(
  packages: Readonly<Record<string, ComponentPackageData>>,
): Record<string, SceneThumbnailComponentResource> {
  return Object.fromEntries(Object.entries(packages).map(([id, component]) => [
    id,
    {
      name: component.manifest.name,
      ...(component.thumbnailUrl ? { thumbnailUrl: component.thumbnailUrl } : {}),
    },
  ]))
}

function courseLayerFrame(item: LayerItem): SceneThumbnailFrame {
  return {
    x: item.frame.x,
    y: item.frame.y,
    width: item.frame.width,
    height: item.frame.height,
    rotation: item.rotation,
    opacity: item.opacity,
  }
}

function courseNativeLayerNode(
  item: Extract<LayerItem, { kind: 'native' }>,
): SceneNode {
  const base = {
    id: item.layerItemId,
    name: item.label,
    x: item.frame.x,
    y: item.frame.y,
    width: item.frame.width,
    height: item.frame.height,
    rotation: item.rotation,
    opacity: item.opacity,
    visible: item.visible,
    locked: item.locked,
    playbackInitialVisibility: item.playbackInitialVisibility,
  }
  return {
    ...base,
    type: item.content.nativeType,
    ...structuredClone(item.content.data),
  } as SceneNode
}

function courseLayerEntry(item: LayerItem): SceneThumbnailRenderEntry | null {
  if (item.kind === 'native') {
    return {
      kind: 'node',
      scope: 'scene',
      node: courseNativeLayerNode(item),
    }
  }
  if (item.kind === 'component') {
    return {
      kind: 'course-component',
      frame: courseLayerFrame(item),
      label: item.label,
      packageId: item.component.packageId,
      ...(item.staticFallbackAssetId
        ? { staticFallbackAssetId: item.staticFallbackAssetId }
        : {}),
    }
  }
  if (!item.runtime.enabled || !item.runtime.staticFallback) return null
  return {
    kind: 'course-runtime-fallback',
    frame: courseLayerFrame(item),
    assetId: item.runtime.staticFallback.assetId,
  }
}

/** Builds a thumbnail directly from the canonical V9 unified layer view. */
export function buildCourseSceneThumbnailRenderModel(
  input: BuildCourseSceneThumbnailRenderModelInput,
): SceneThumbnailRenderModel {
  const entries = input.layers
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) =>
      left.entry.item.order - right.entry.item.order || left.index - right.index,
    )
    .flatMap(({ entry }) => {
      if (!entry.effectiveVisible || !entry.item.visible) return []
      const rendered = courseLayerEntry(structuredClone(entry.item) as LayerItem)
      return rendered ? [rendered] : []
    })
  return {
    backgroundColor: input.backgroundColor,
    backgroundAssetId: input.backgroundAssetId,
    entries,
    assets: input.assets,
    assetFiles: input.assetFiles,
    components: componentResources(input.componentPackages),
  }
}

export function buildLegacySceneThumbnailRenderModel(
  input: BuildLegacySceneThumbnailRenderModelInput,
): SceneThumbnailRenderModel {
  const presentation = ensureScenePresentation(input.scene)
  const renderedScene = materializeScene(
    input.scene,
    presentation.thumbnailStateId ?? presentation.initialStateId,
  )
  return {
    backgroundColor: renderedScene.backgroundColor,
    backgroundAssetId: renderedScene.backgroundAssetId,
    entries: buildSceneThumbnailComposition(
      renderedScene,
      input.globalLayer,
      input.globalRuntime,
    ),
    assets: input.assets,
    assetFiles: input.assetFiles,
    components: componentResources(input.componentPackages),
  }
}

function SceneThumbnailCanvas({ model }: { model: SceneThumbnailRenderModel }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [shouldRender, setShouldRender] = useState(false)
  const { assets, assetFiles, components } = model

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    if (typeof IntersectionObserver === 'undefined') {
      setShouldRender(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setShouldRender(true)
        observer.disconnect()
      },
      { rootMargin: '240px 0px' },
    )
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!shouldRender) return
    const canvas = ref.current
    if (!canvas) return
    let disposed = false
    const urls = new Set<string>()
    const buffer = document.createElement('canvas')
    buffer.width = WIDTH
    buffer.height = HEIGHT
    const context = buffer.getContext('2d')
    if (!context) return

    const revokeUrls = () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }

    const loadImage = async (url: string): Promise<HTMLImageElement | null> => {
      const image = new Image()
      image.src = url
      try {
        await image.decode()
        return disposed ? null : image
      } catch {
        return null
      }
    }

    const loadAssetImage = async (
      assetId: string,
    ): Promise<{ image: HTMLImageElement; meta: AssetMeta } | null> => {
      const meta = assets[assetId]
      const bytes = assetFiles[assetId]
      if (!meta || !bytes) return null
      const url = URL.createObjectURL(new Blob(
        [Uint8Array.from(bytes)],
        { type: meta.mimeType },
      ))
      urls.add(url)
      const image = await loadImage(url)
      return image ? { image, meta } : null
    }

    const withFrame = (
      frame: SceneThumbnailFrame,
      render: (width: number, height: number) => void,
    ) => {
      context.save()
      try {
        context.translate(
          (frame.x + frame.width / 2) * SCALE,
          (frame.y + frame.height / 2) * SCALE,
        )
        context.rotate((frame.rotation * Math.PI) / 180)
        context.globalAlpha = frame.opacity
        render(frame.width * SCALE, frame.height * SCALE)
      } finally {
        context.restore()
      }
    }

    const drawContainedImage = (
      image: CanvasImageSource,
      sourceWidth: number,
      sourceHeight: number,
      width: number,
      height: number,
    ) => {
      const fit = Math.min(width / sourceWidth, height / sourceHeight)
      const drawWidth = sourceWidth * fit
      const drawHeight = sourceHeight * fit
      context.drawImage(
        image,
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight,
      )
    }

    const draw = async () => {
      context.clearRect(0, 0, WIDTH, HEIGHT)
      context.fillStyle = model.backgroundColor
      context.fillRect(0, 0, WIDTH, HEIGHT)
      const backgroundAssetId = model.backgroundAssetId
      if (backgroundAssetId) {
        const loaded = await loadAssetImage(backgroundAssetId)
        if (disposed) return
        if (loaded) {
          const sourceWidth = loaded.image.naturalWidth || loaded.meta.width || WIDTH
          const sourceHeight = loaded.image.naturalHeight || loaded.meta.height || HEIGHT
          const scale = Math.max(WIDTH / sourceWidth, HEIGHT / sourceHeight)
          const width = sourceWidth * scale
          const height = sourceHeight * scale
          context.drawImage(
            loaded.image,
            (WIDTH - width) / 2,
            (HEIGHT - height) / 2,
            width,
            height,
          )
        }
      }
      for (const entry of model.entries) {
        if (disposed) return
        if (entry.kind === 'runtime-fallback') {
          const { fallback } = entry
          const loaded = await loadAssetImage(fallback.assetId)
          if (disposed) return
          if (!loaded) continue
          if (fallback.coverage === 'full-scene') {
            // A full-scene fallback replaces everything below its authored
            // layer; a runtime-layer fallback preserves those editable nodes.
            context.clearRect(0, 0, WIDTH, HEIGHT)
          }
          context.drawImage(loaded.image, 0, 0, WIDTH, HEIGHT)
          continue
        }

        if (entry.kind === 'course-runtime-fallback') {
          const loaded = await loadAssetImage(entry.assetId)
          if (disposed) return
          if (!loaded) continue
          withFrame(entry.frame, (width, height) => {
            drawContainedImage(
              loaded.image,
              loaded.image.naturalWidth || loaded.meta.width || entry.frame.width,
              loaded.image.naturalHeight || loaded.meta.height || entry.frame.height,
              width,
              height,
            )
          })
          continue
        }

        if (entry.kind === 'course-component') {
          const component = components[entry.packageId]
          const fallback = entry.staticFallbackAssetId
            ? await loadAssetImage(entry.staticFallbackAssetId)
            : null
          const packageThumbnail = !entry.staticFallbackAssetId && component?.thumbnailUrl
            ? await loadImage(component.thumbnailUrl)
            : null
          if (disposed) return
          withFrame(entry.frame, (width, height) => {
            context.fillStyle = '#151d2b'
            context.fillRect(-width / 2, -height / 2, width, height)
            if (fallback) {
              drawContainedImage(
                fallback.image,
                fallback.image.naturalWidth || fallback.meta.width || entry.frame.width,
                fallback.image.naturalHeight || fallback.meta.height || entry.frame.height,
                width,
                height,
              )
            } else if (packageThumbnail) {
              drawContainedImage(
                packageThumbnail,
                packageThumbnail.naturalWidth || entry.frame.width,
                packageThumbnail.naturalHeight || entry.frame.height,
                width,
                height,
              )
            }
            context.strokeStyle = 'rgba(91, 156, 255, 0.8)'
            context.lineWidth = 1
            context.strokeRect(-width / 2, -height / 2, width, height)
            if (!fallback && !packageThumbnail) {
              context.fillStyle = '#cfe1ff'
              context.font = '600 8px "Microsoft YaHei", sans-serif'
              context.textAlign = 'center'
              context.textBaseline = 'middle'
              context.fillText(
                component?.name ?? entry.label,
                0,
                0,
                Math.max(12, width - 8),
              )
            }
          })
          continue
        }

        const { node } = entry
        const loadedNodeImage = node.type === 'image'
          ? await loadAssetImage(node.assetId)
          : null
        const component = node.type === 'external-component'
          ? components[node.component.packageId]
          : undefined
        const loadedComponentThumbnail = node.type === 'external-component' &&
          component?.thumbnailUrl
          ? await loadImage(component.thumbnailUrl)
          : null
        if (disposed) return
        const renderedText = node.type === 'text'
          ? renderTextNodeCanvas(node, node.width, SCALE)
          : null
        const renderedFormula = node.type === 'formula'
          ? renderFormulaNodeCanvas(node, node.width, node.height, SCALE)
          : null
        const visualWidth = renderedText?.width ?? renderedFormula?.width ?? node.width
        const visualHeight = renderedText?.height ?? renderedFormula?.height ?? node.height
        context.save()
        try {
          context.translate(
            (node.x + visualWidth / 2) * SCALE,
            (node.y + visualHeight / 2) * SCALE,
          )
          context.rotate((node.rotation * Math.PI) / 180)
          context.globalAlpha = node.opacity
          if (node.type === 'shape') {
            context.scale(SCALE, SCALE)
            context.translate(-node.width / 2, -node.height / 2)
            renderShapeCanvas(context, node)
          } else if (node.type === 'text') {
            context.drawImage(
              renderedText!.canvas,
              -renderedText!.width * SCALE / 2,
              -renderedText!.height * SCALE / 2,
              renderedText!.width * SCALE,
              renderedText!.height * SCALE,
            )
          } else if (node.type === 'formula') {
            context.drawImage(
              renderedFormula!.canvas,
              -renderedFormula!.width * SCALE / 2,
              -renderedFormula!.height * SCALE / 2,
              renderedFormula!.width * SCALE,
              renderedFormula!.height * SCALE,
            )
          } else if (node.type === 'image') {
            if (loadedNodeImage) {
              const rendered = renderImageNodeCanvas(
                loadedNodeImage.image,
                loadedNodeImage.image.naturalWidth || loadedNodeImage.meta.width || node.width,
                loadedNodeImage.image.naturalHeight || loadedNodeImage.meta.height || node.height,
                node,
                node.width,
                node.height,
                SCALE,
              )
              context.drawImage(rendered, -node.width * SCALE / 2, -node.height * SCALE / 2, node.width * SCALE, node.height * SCALE)
            }
          } else if (node.type === 'video') {
            const width = node.width * SCALE
            const height = node.height * SCALE
            context.fillStyle = '#0b1120'
            context.fillRect(-width / 2, -height / 2, width, height)
            context.fillStyle = '#f8fafc'
            context.beginPath()
            context.moveTo(-4, -7)
            context.lineTo(9, 0)
            context.lineTo(-4, 7)
            context.closePath()
            context.fill()
          } else if (node.type === 'teacher-controller') {
            const width = node.width * SCALE
            const height = node.height * SCALE
            context.fillStyle = node.style.backgroundColor
            context.globalAlpha *= node.style.backgroundOpacity
            context.beginPath()
            context.roundRect(-width / 2, -height / 2, width, height, Math.min(6, height / 2))
            context.fill()
            context.fillStyle = node.style.accentColor
            context.font = '600 6px "Microsoft YaHei", sans-serif'
            context.textAlign = 'center'
            context.textBaseline = 'middle'
            context.fillText(node.title || '教师控制台', 0, 0, Math.max(12, width - 8))
          } else {
            const width = node.width * SCALE
            const height = node.height * SCALE
            context.fillStyle = '#151d2b'
            context.fillRect(-width / 2, -height / 2, width, height)
            if (loadedComponentThumbnail) {
              drawContainedImage(
                loadedComponentThumbnail,
                loadedComponentThumbnail.naturalWidth || node.width,
                loadedComponentThumbnail.naturalHeight || node.height,
                width,
                height,
              )
            }
            context.strokeStyle = 'rgba(91, 156, 255, 0.8)'
            context.lineWidth = 1
            context.strokeRect(-width / 2, -height / 2, width, height)
            if (!loadedComponentThumbnail) {
              context.fillStyle = '#cfe1ff'
              context.font = '600 8px "Microsoft YaHei", sans-serif'
              context.textAlign = 'center'
              context.textBaseline = 'middle'
              context.fillText(
                component?.name ?? node.name,
                0,
                0,
                Math.max(12, width - 8),
              )
            }
          }
        } finally {
          context.restore()
        }
      }

      if (disposed || ref.current !== canvas) return
      const target = canvas.getContext('2d')
      if (!target) return
      target.globalAlpha = 1
      target.clearRect(0, 0, WIDTH, HEIGHT)
      target.drawImage(buffer, 0, 0)
    }
    void draw().finally(revokeUrls)
    return () => {
      disposed = true
      revokeUrls()
    }
  }, [assetFiles, assets, components, model, shouldRender])

  return <canvas ref={ref} className="scene-thumbnail" width={WIDTH} height={HEIGHT} aria-hidden="true" />
}

function LegacySceneThumbnailAdapter({ scene }: { scene: SceneDocument }) {
  const assets = useEditorStore((state) => state.project.assets)
  const assetFiles = useEditorStore((state) => state.assetFiles)
  const components = useEditorStore((state) => state.componentPackages)
  const globalLayer = useEditorStore((state) => state.project.globalLayer)
  const globalRuntime = useEditorStore((state) => state.project.globalRuntime)
  const model = useMemo(() => buildLegacySceneThumbnailRenderModel({
    scene,
    globalLayer,
    globalRuntime,
    assets,
    assetFiles,
    componentPackages: components,
  }), [assetFiles, assets, components, globalLayer, globalRuntime, scene])
  return <SceneThumbnailCanvas model={model} />
}

type SceneThumbnailProps =
  | { model: SceneThumbnailRenderModel; scene?: never }
  | { scene: SceneDocument; model?: never }

export function SceneThumbnail(props: SceneThumbnailProps) {
  return props.model
    ? <SceneThumbnailCanvas model={props.model} />
    : <LegacySceneThumbnailAdapter scene={props.scene} />
}
