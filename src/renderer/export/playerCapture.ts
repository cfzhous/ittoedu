import { bytesToBase64 } from './base64'

interface DomCaptureContext {
  context: CanvasRenderingContext2D
  stageRect: DOMRect
  imageCache: Map<string, Promise<HTMLImageElement>>
  /** Immediate copies keep WebGL canvases readable after prepareCapture(). */
  canvasCache: WeakMap<HTMLCanvasElement, HTMLCanvasElement>
}

function numericCss(value: string, fallback = 0): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function boundedOpacity(value: string, fallback = 1): number {
  return Math.max(0, Math.min(1, numericCss(value, fallback)))
}

function isTransparentColor(value: string): boolean {
  const compact = value.replace(/\s+/g, '').toLowerCase()
  if (compact === '' || compact === 'transparent') return true

  const functional = compact.match(/^[a-z]+\((.*)\)$/)
  if (!functional) return false
  const body = functional[1] ?? ''
  const slashIndex = body.lastIndexOf('/')
  const parts = body.split(',')
  const alphaToken = slashIndex >= 0
    ? body.slice(slashIndex + 1)
    : parts.length === 4
      ? parts.at(-1) ?? ''
      : ''
  if (!alphaToken) return false
  const alpha = Number.parseFloat(alphaToken)
  return Number.isFinite(alpha) && alpha <= 0
}

function roundedRectangle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const boundedRadius = Math.max(0, Math.min(radius, width / 2, height / 2))
  context.beginPath()
  if (boundedRadius <= 0) {
    context.rect(x, y, width, height)
    return
  }
  context.roundRect(x, y, width, height, boundedRadius)
}

function localRectangle(rect: DOMRect, stageRect: DOMRect): DOMRect {
  return new DOMRect(
    rect.left - stageRect.left,
    rect.top - stageRect.top,
    rect.width,
    rect.height,
  )
}

function intersectsStage(rect: DOMRect, stageRect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0
    && rect.right > stageRect.left && rect.bottom > stageRect.top
    && rect.left < stageRect.right && rect.top < stageRect.bottom
}

function topLevelParts(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote = ''
  let start = 0
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? ''
    if (quote) {
      if (character === quote && value[index - 1] !== '\\') quote = ''
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
    } else if (character === '(') {
      depth += 1
    } else if (character === ')') {
      depth = Math.max(0, depth - 1)
    } else if (character === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts.filter(Boolean)
}

function gradientCoordinates(
  direction: string,
  rect: DOMRect,
): [number, number, number, number] {
  const normalized = direction.trim().toLowerCase()
  if (normalized.startsWith('to ')) {
    const horizontal = normalized.includes('right')
      ? 1
      : normalized.includes('left') ? -1 : 0
    const vertical = normalized.includes('bottom')
      ? 1
      : normalized.includes('top') ? -1 : 0
    const centerX = rect.x + rect.width / 2
    const centerY = rect.y + rect.height / 2
    return [
      centerX - horizontal * rect.width / 2,
      centerY - vertical * rect.height / 2,
      centerX + horizontal * rect.width / 2,
      centerY + vertical * rect.height / 2,
    ]
  }
  if (normalized.endsWith('deg')) {
    const degrees = numericCss(normalized, 180)
    const radians = (degrees - 90) * Math.PI / 180
    const horizontal = Math.cos(radians)
    const vertical = Math.sin(radians)
    const centerX = rect.x + rect.width / 2
    const centerY = rect.y + rect.height / 2
    const extent = Math.abs(horizontal) * rect.width / 2
      + Math.abs(vertical) * rect.height / 2
    return [
      centerX - horizontal * extent,
      centerY - vertical * extent,
      centerX + horizontal * extent,
      centerY + vertical * extent,
    ]
  }
  return [rect.x, rect.y, rect.x, rect.bottom]
}

function linearGradient(
  context: CanvasRenderingContext2D,
  cssValue: string,
  rect: DOMRect,
): CanvasGradient | null {
  const match = /^linear-gradient\((.*)\)$/i.exec(cssValue.trim())
  if (!match) return null
  const values = topLevelParts(match[1] ?? '')
  if (values.length < 2) return null
  const hasDirection = /^(?:to\s|[-+.\d]+deg)/i.test(values[0] ?? '')
  const direction = hasDirection ? values.shift() ?? '' : 'to bottom'
  if (values.length < 2) return null
  const gradient = context.createLinearGradient(
    ...gradientCoordinates(direction, rect),
  )
  values.forEach((stop, index) => {
    const positionMatch = /\s+([-+.\d]+)%\s*$/.exec(stop)
    const color = positionMatch
      ? stop.slice(0, positionMatch.index).trim()
      : stop.trim()
    const offset = positionMatch
      ? Math.max(0, Math.min(1, numericCss(positionMatch[1] ?? '', 0) / 100))
      : index / Math.max(1, values.length - 1)
    try {
      gradient.addColorStop(offset, color)
    } catch {
      // Ignore an invalid authored stop and retain the remaining gradient.
    }
  })
  return gradient
}

async function embeddableImageUrl(source: string): Promise<string> {
  if (source.startsWith('data:')) return source
  const response = await fetch(source)
  if (!response.ok) throw new Error(`DOM 快照素材读取失败（${response.status}）`)
  const blob = await response.blob()
  const mimeType = blob.type || 'application/octet-stream'
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`
}

function loadCaptureImage(
  source: string,
  capture: DomCaptureContext,
): Promise<HTMLImageElement> {
  const cached = capture.imageCache.get(source)
  if (cached) return cached
  const loading = (async () => {
    const image = new Image()
    const embedded = await embeddableImageUrl(source)
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('DOM 快照图片解码失败'))
      image.src = embedded
    })
    return image
  })()
  capture.imageCache.set(source, loading)
  return loading
}

function drawReplacedImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  rect: DOMRect,
  fit: string,
): void {
  if (sourceWidth <= 0 || sourceHeight <= 0 || rect.width <= 0 || rect.height <= 0) {
    return
  }
  if (fit === 'contain') {
    const scale = Math.min(rect.width / sourceWidth, rect.height / sourceHeight)
    const width = sourceWidth * scale
    const height = sourceHeight * scale
    context.drawImage(
      image,
      rect.x + (rect.width - width) / 2,
      rect.y + (rect.height - height) / 2,
      width,
      height,
    )
    return
  }
  if (fit === 'cover') {
    const scale = Math.max(rect.width / sourceWidth, rect.height / sourceHeight)
    const sourceCropWidth = rect.width / scale
    const sourceCropHeight = rect.height / scale
    context.drawImage(
      image,
      (sourceWidth - sourceCropWidth) / 2,
      (sourceHeight - sourceCropHeight) / 2,
      sourceCropWidth,
      sourceCropHeight,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
    )
    return
  }
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height)
}

async function drawBackgroundImage(
  style: CSSStyleDeclaration,
  rect: DOMRect,
  capture: DomCaptureContext,
): Promise<void> {
  const backgroundImage = style.backgroundImage.trim()
  if (!backgroundImage || backgroundImage === 'none') return
  const gradient = linearGradient(capture.context, backgroundImage, rect)
  if (gradient) {
    capture.context.fillStyle = gradient
    capture.context.fillRect(rect.x, rect.y, rect.width, rect.height)
    return
  }
  const urlMatch = /^url\(["']?(.*?)["']?\)$/i.exec(backgroundImage)
  if (!urlMatch?.[1]) return
  const image = await loadCaptureImage(urlMatch[1], capture)
  const fit = style.backgroundSize === 'contain'
    ? 'contain'
    : style.backgroundSize === 'cover' ? 'cover' : 'fill'
  drawReplacedImage(
    capture.context,
    image,
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    rect,
    fit,
  )
}

async function paintElementBox(
  style: CSSStyleDeclaration,
  rect: DOMRect,
  opacity: number,
  capture: DomCaptureContext,
): Promise<void> {
  if (rect.width <= 0 || rect.height <= 0) return
  const context = capture.context
  const radius = Math.max(
    numericCss(style.borderTopLeftRadius),
    numericCss(style.borderTopRightRadius),
    numericCss(style.borderBottomRightRadius),
    numericCss(style.borderBottomLeftRadius),
  )
  context.save()
  context.globalAlpha = opacity
  roundedRectangle(context, rect.x, rect.y, rect.width, rect.height, radius)
  context.clip()
  if (!isTransparentColor(style.backgroundColor)) {
    context.fillStyle = style.backgroundColor
    context.fillRect(rect.x, rect.y, rect.width, rect.height)
  }
  await drawBackgroundImage(style, rect, capture)
  context.restore()

  const widths = [
    numericCss(style.borderTopWidth),
    numericCss(style.borderRightWidth),
    numericCss(style.borderBottomWidth),
    numericCss(style.borderLeftWidth),
  ]
  const colors = [
    style.borderTopColor,
    style.borderRightColor,
    style.borderBottomColor,
    style.borderLeftColor,
  ]
  const styles = [
    style.borderTopStyle,
    style.borderRightStyle,
    style.borderBottomStyle,
    style.borderLeftStyle,
  ]
  if (widths.every((width) => width <= 0)) return
  context.save()
  context.globalAlpha = opacity
  if (
    widths.every((width) => Math.abs(width - widths[0]!) < 0.1)
    && colors.every((color) => color === colors[0])
    && styles.every((borderStyle) => borderStyle !== 'none')
  ) {
    const width = widths[0] ?? 0
    context.lineWidth = width
    context.strokeStyle = colors[0] ?? '#000000'
    roundedRectangle(
      context,
      rect.x + width / 2,
      rect.y + width / 2,
      Math.max(0, rect.width - width),
      Math.max(0, rect.height - width),
      Math.max(0, radius - width / 2),
    )
    context.stroke()
  } else {
    const edges: Array<[number, number, number, number]> = [
      [rect.left, rect.top, rect.right, rect.top],
      [rect.right, rect.top, rect.right, rect.bottom],
      [rect.right, rect.bottom, rect.left, rect.bottom],
      [rect.left, rect.bottom, rect.left, rect.top],
    ]
    edges.forEach(([x1, y1, x2, y2], index) => {
      if ((widths[index] ?? 0) <= 0 || styles[index] === 'none') return
      context.beginPath()
      context.lineWidth = widths[index] ?? 0
      context.strokeStyle = colors[index] ?? '#000000'
      context.moveTo(x1, y1)
      context.lineTo(x2, y2)
      context.stroke()
    })
  }
  context.restore()
}

function transformedCharacter(character: string, transform: string): string {
  if (transform === 'uppercase') return character.toUpperCase()
  if (transform === 'lowercase') return character.toLowerCase()
  if (transform === 'capitalize') return character.toUpperCase()
  return character
}

function paintTextNode(
  node: Text,
  style: CSSStyleDeclaration,
  opacity: number,
  capture: DomCaptureContext,
): void {
  if (!node.data || isTransparentColor(style.color)) return
  const context = capture.context
  const fontSize = Math.max(1, numericCss(style.fontSize, 16))
  context.save()
  context.globalAlpha = opacity
  context.fillStyle = style.color
  context.font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.direction = style.direction === 'rtl' ? 'rtl' : 'ltr'

  const range = document.createRange()
  let offset = 0
  for (const character of node.data) {
    const nextOffset = offset + character.length
    range.setStart(node, offset)
    range.setEnd(node, nextOffset)
    const clientRect = range.getBoundingClientRect()
    offset = nextOffset
    if (!intersectsStage(clientRect, capture.stageRect) || /^\s$/u.test(character)) {
      continue
    }
    const rect = localRectangle(clientRect, capture.stageRect)
    const baseline = rect.top + Math.max(
      fontSize * 0.8,
      (rect.height - fontSize) / 2 + fontSize * 0.82,
    )
    context.fillText(
      transformedCharacter(character, style.textTransform),
      rect.left,
      baseline,
    )
    if (style.textDecorationLine.includes('underline')) {
      context.beginPath()
      context.lineWidth = Math.max(1, fontSize / 14)
      context.strokeStyle = style.color
      context.moveTo(rect.left, baseline + Math.max(1, fontSize / 14))
      context.lineTo(rect.right, baseline + Math.max(1, fontSize / 14))
      context.stroke()
    }
  }
  range.detach()
  context.restore()
}

function paintControlValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  style: CSSStyleDeclaration,
  rect: DOMRect,
  opacity: number,
  capture: DomCaptureContext,
): void {
  const value = element instanceof HTMLSelectElement
    ? element.selectedOptions[0]?.textContent ?? ''
    : element.value
  if (!value || element.childNodes.length > 0) return
  const context = capture.context
  const fontSize = Math.max(1, numericCss(style.fontSize, 16))
  context.save()
  context.globalAlpha = opacity
  context.fillStyle = style.color
  context.font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`
  context.textBaseline = 'middle'
  context.fillText(
    value,
    rect.x + numericCss(style.paddingLeft, 4),
    rect.y + rect.height / 2,
    Math.max(0, rect.width - numericCss(style.paddingLeft) - numericCss(style.paddingRight)),
  )
  context.restore()
}

async function paintReplacedElement(
  element: Element,
  style: CSSStyleDeclaration,
  rect: DOMRect,
  opacity: number,
  capture: DomCaptureContext,
): Promise<boolean> {
  let image: CanvasImageSource | null = null
  let sourceWidth = 0
  let sourceHeight = 0
  if (element instanceof HTMLImageElement) {
    const loaded = await loadCaptureImage(element.currentSrc || element.src, capture)
    image = loaded
    sourceWidth = loaded.naturalWidth || loaded.width
    sourceHeight = loaded.naturalHeight || loaded.height
  } else if (element instanceof HTMLCanvasElement) {
    const cached = capture.canvasCache.get(element) ?? element
    image = cached
    sourceWidth = cached.width
    sourceHeight = cached.height
  } else if (element instanceof HTMLVideoElement) {
    image = element
    sourceWidth = element.videoWidth
    sourceHeight = element.videoHeight
  } else if (element instanceof SVGSVGElement) {
    const clone = element.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const serialized = new XMLSerializer().serializeToString(clone)
    const source = `data:image/svg+xml;base64,${bytesToBase64(
      new TextEncoder().encode(serialized),
    )}`
    const loaded = await loadCaptureImage(source, capture)
    image = loaded
    sourceWidth = loaded.naturalWidth || rect.width
    sourceHeight = loaded.naturalHeight || rect.height
  }
  if (!image) return false

  const context = capture.context
  const radius = Math.max(
    numericCss(style.borderTopLeftRadius),
    numericCss(style.borderTopRightRadius),
    numericCss(style.borderBottomRightRadius),
    numericCss(style.borderBottomLeftRadius),
  )
  context.save()
  context.globalAlpha = opacity
  roundedRectangle(context, rect.x, rect.y, rect.width, rect.height, radius)
  context.clip()
  drawReplacedImage(
    context,
    image,
    sourceWidth,
    sourceHeight,
    rect,
    style.objectFit || 'fill',
  )
  context.restore()
  return true
}

async function paintNode(
  node: Node,
  inheritedOpacity: number,
  capture: DomCaptureContext,
): Promise<void> {
  if (node instanceof Text) {
    const parent = node.parentElement
    if (parent) paintTextNode(node, getComputedStyle(parent), inheritedOpacity, capture)
    return
  }
  if (!(node instanceof Element)) return
  if (node instanceof HTMLStyleElement || node instanceof HTMLScriptElement) return

  const style = getComputedStyle(node)
  if (style.display === 'none' || style.contentVisibility === 'hidden') return
  const opacity = inheritedOpacity * boundedOpacity(style.opacity)
  if (opacity <= 0.001) return
  const visible = style.visibility !== 'hidden' && style.visibility !== 'collapse'
  const clientRect = node.getBoundingClientRect()
  const rect = localRectangle(clientRect, capture.stageRect)
  const intersects = intersectsStage(clientRect, capture.stageRect)
  if (visible && intersects) {
    await paintElementBox(style, rect, opacity, capture)
    const replaced = await paintReplacedElement(node, style, rect, opacity, capture)
    if (replaced) return
    if (
      node instanceof HTMLInputElement
      || node instanceof HTMLTextAreaElement
      || node instanceof HTMLSelectElement
    ) {
      paintControlValue(node, style, rect, opacity, capture)
    }
  }

  if (node instanceof HTMLSlotElement) {
    for (const assigned of node.assignedNodes({ flatten: true })) {
      await paintNode(assigned, opacity, capture)
    }
    return
  }
  const children = node.shadowRoot?.childNodes ?? node.childNodes
  for (const child of children) await paintNode(child, opacity, capture)
}

function snapshotDomCanvases(
  stage: HTMLElement,
  preparedSnapshot?: (
    source: HTMLCanvasElement,
  ) => HTMLCanvasElement | undefined,
): WeakMap<HTMLCanvasElement, HTMLCanvasElement> {
  const cache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>()
  const canvases = new Set<HTMLCanvasElement>()
  const collect = (node: Node): void => {
    if (node instanceof HTMLCanvasElement) canvases.add(node)
    if (node instanceof HTMLSlotElement) {
      const assigned = node.assignedNodes({ flatten: true })
      const composedChildren = assigned.length > 0
        ? assigned
        : [...node.childNodes]
      composedChildren.forEach(collect)
      return
    }
    if (node instanceof Element && node.shadowRoot) {
      collect(node.shadowRoot)
      return
    }
    node.childNodes.forEach(collect)
  }
  collect(stage)
  for (const source of canvases) {
    const prepared = preparedSnapshot?.(source)
    if (prepared) {
      cache.set(source, prepared)
      continue
    }
    const copy = document.createElement('canvas')
    copy.width = source.width
    copy.height = source.height
    const context = copy.getContext('2d')
    if (!context || copy.width <= 0 || copy.height <= 0) continue
    context.drawImage(source, 0, 0)
    cache.set(source, copy)
  }
  return cache
}

/**
 * Rasterizes one already-mounted DOM subtree after its Runtime/Component
 * capture hook has settled. Course Studio uses the same image, canvas, SVG and
 * text painting rules when it snapshots the currently mounted V9 item.
 */
export async function captureMountedElementPng(
  element: HTMLElement,
): Promise<string> {
  const rect = element.getBoundingClientRect()
  const width = Math.ceil(rect.width)
  const height = Math.ceil(rect.height)
  if (width <= 0 || height <= 0) {
    throw new Error('动态实例没有可捕获的画面尺寸')
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建动态实例快照画布')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  await paintNode(element, 1, {
    context,
    stageRect: rect,
    imageCache: new Map(),
    // Copy every live Canvas immediately. This is essential for current
    // Runtime/Component instances whose drawing buffer may be transient.
    canvasCache: snapshotDomCanvases(element),
  })
  const dataUrl = canvas.toDataURL('image/png')
  if (!dataUrl.startsWith('data:image/png')) {
    throw new Error('动态实例快照未生成 PNG')
  }
  return dataUrl
}
