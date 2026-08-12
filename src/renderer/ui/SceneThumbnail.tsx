import { useEffect, useMemo, useRef, useState } from 'react'
import type { SceneDocument } from '../../shared/projectTypes'
import {
  ensureScenePresentation,
  materializeScene,
} from '../../shared/presentation'
import { useEditorStore } from '../store/editorStore'
import { renderShapeCanvas } from '../../shared/canvasShapeRenderer'
import { renderFormulaNodeCanvas } from '../../shared/formulaRenderer'
import { renderImageNodeCanvas } from '../../shared/imageEffects'
import { renderTextNodeCanvas } from '../../shared/textLayout'
import { buildSceneThumbnailComposition } from './sceneThumbnailComposition'

const WIDTH = 160
const HEIGHT = 90
const SCALE = WIDTH / 1280

export function SceneThumbnail({ scene }: { scene: SceneDocument }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [shouldRender, setShouldRender] = useState(false)
  const assets = useEditorStore((state) => state.project.assets)
  const assetFiles = useEditorStore((state) => state.assetFiles)
  const components = useEditorStore((state) => state.componentPackages)
  const globalLayer = useEditorStore((state) => state.project.globalLayer)
  const globalRuntime = useEditorStore((state) => state.project.globalRuntime)
  const renderedScene = useMemo(() => {
    const presentation = ensureScenePresentation(scene)
    return materializeScene(
      scene,
      presentation.thumbnailStateId ?? presentation.initialStateId,
    )
  }, [scene])
  const composition = useMemo(
    () => buildSceneThumbnailComposition(
      renderedScene,
      globalLayer,
      globalRuntime,
    ),
    [globalLayer, globalRuntime, renderedScene],
  )

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
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    let disposed = false
    const urls: string[] = []
    const draw = async () => {
      context.clearRect(0, 0, WIDTH, HEIGHT)
      context.fillStyle = renderedScene.backgroundColor
      context.fillRect(0, 0, WIDTH, HEIGHT)
      const backgroundAssetId = renderedScene.backgroundAssetId
      if (backgroundAssetId) {
        const meta = assets[backgroundAssetId]
        const bytes = assetFiles[backgroundAssetId]
        if (meta && bytes) {
          const url = URL.createObjectURL(new Blob(
            [Uint8Array.from(bytes)],
            { type: meta.mimeType },
          ))
          urls.push(url)
          const image = new Image()
          image.src = url
          try {
            await image.decode()
            if (disposed) return
            const sourceWidth = image.naturalWidth || meta.width || WIDTH
            const sourceHeight = image.naturalHeight || meta.height || HEIGHT
            const scale = Math.max(WIDTH / sourceWidth, HEIGHT / sourceHeight)
            const width = sourceWidth * scale
            const height = sourceHeight * scale
            context.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height)
          } catch {
            // The authored background colour remains a visible fallback.
          }
        }
      }
      for (const entry of composition) {
        if (disposed) break
        if (entry.kind === 'runtime-fallback') {
          const { fallback } = entry
          const meta = assets[fallback.assetId]
          const bytes = assetFiles[fallback.assetId]
          if (!meta || !bytes) continue
          const url = URL.createObjectURL(new Blob(
            [Uint8Array.from(bytes)],
            { type: meta.mimeType },
          ))
          urls.push(url)
          const image = new Image()
          image.src = url
          try {
            await image.decode()
            if (disposed) break
            context.save()
            context.globalAlpha = 1
            if (fallback.coverage === 'full-scene') {
              // A full-scene fallback replaces everything below its authored
              // layer; a runtime-layer fallback preserves those editable nodes.
              context.clearRect(0, 0, WIDTH, HEIGHT)
            }
            context.drawImage(image, 0, 0, WIDTH, HEIGHT)
            context.restore()
          } catch {
            // Missing runtime fallback assets leave the editable thumbnail intact.
          }
          continue
        }

        const { node } = entry
        const renderedText = node.type === 'text'
          ? renderTextNodeCanvas(node, node.width, SCALE)
          : null
        const renderedFormula = node.type === 'formula'
          ? renderFormulaNodeCanvas(node, node.width, node.height, SCALE)
          : null
        const visualWidth = renderedText?.width ?? renderedFormula?.width ?? node.width
        const visualHeight = renderedText?.height ?? renderedFormula?.height ?? node.height
        context.save()
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
          const meta = assets[node.assetId]
          const bytes = assetFiles[node.assetId]
          if (meta && bytes) {
            const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: meta.mimeType }))
            urls.push(url)
            const image = new Image()
            image.src = url
            try {
              await image.decode()
              if (!disposed) {
                const rendered = renderImageNodeCanvas(
                  image,
                  image.naturalWidth || meta.width || node.width,
                  image.naturalHeight || meta.height || node.height,
                  node,
                  node.width,
                  node.height,
                  SCALE,
                )
                context.drawImage(rendered, -node.width * SCALE / 2, -node.height * SCALE / 2, node.width * SCALE, node.height * SCALE)
              }
            } catch {
              // Missing thumbnails remain represented by the empty frame.
            }
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
          const component = components[node.component.packageId]
          const thumbnailUrl = component?.thumbnailUrl
          const width = node.width * SCALE
          const height = node.height * SCALE
          let thumbnailDrawn = false
          context.fillStyle = '#151d2b'
          context.fillRect(-width / 2, -height / 2, width, height)
          if (thumbnailUrl) {
            const image = new Image()
            image.src = thumbnailUrl
            try {
              await image.decode()
              if (!disposed) {
                const naturalWidth = image.naturalWidth || node.width
                const naturalHeight = image.naturalHeight || node.height
                const fit = Math.min(width / naturalWidth, height / naturalHeight)
                const drawWidth = naturalWidth * fit
                const drawHeight = naturalHeight * fit
                context.drawImage(
                  image,
                  -drawWidth / 2,
                  -drawHeight / 2,
                  drawWidth,
                  drawHeight,
                )
                thumbnailDrawn = true
              }
            } catch {
              // Fall through to the labelled component frame below.
            }
          }
          context.strokeStyle = 'rgba(91, 156, 255, 0.8)'
          context.lineWidth = 1
          context.strokeRect(-width / 2, -height / 2, width, height)
          if (!thumbnailDrawn) {
            context.fillStyle = '#cfe1ff'
            context.font = '600 8px "Microsoft YaHei", sans-serif'
            context.textAlign = 'center'
            context.textBaseline = 'middle'
            context.fillText(
              component?.manifest.name ?? node.name,
              0,
              0,
              Math.max(12, width - 8),
            )
          }
        }
        context.restore()
      }
    }
    void draw()
    return () => {
      disposed = true
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [assetFiles, assets, components, composition, renderedScene, shouldRender])

  return <canvas ref={ref} className="scene-thumbnail" width={WIDTH} height={HEIGHT} aria-hidden="true" />
}
