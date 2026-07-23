import type { ImageFit } from '../../../shared/projectTypes'

export interface VideoFrameLayout {
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
  destinationX: number
  destinationY: number
  destinationWidth: number
  destinationHeight: number
}

/**
 * Computes a centered object-fit layout without depending on Phaser or the DOM.
 * Keeping this math independent also makes editor and future thumbnail rendering
 * use the same visible crop.
 */
export function calculateVideoFrameLayout(
  sourceWidth: number,
  sourceHeight: number,
  destinationWidth: number,
  destinationHeight: number,
  fit: ImageFit,
): VideoFrameLayout {
  const sw = Math.max(1, sourceWidth)
  const sh = Math.max(1, sourceHeight)
  const dw = Math.max(1, destinationWidth)
  const dh = Math.max(1, destinationHeight)

  if (fit === 'stretch') {
    return {
      sourceX: 0,
      sourceY: 0,
      sourceWidth: sw,
      sourceHeight: sh,
      destinationX: 0,
      destinationY: 0,
      destinationWidth: dw,
      destinationHeight: dh,
    }
  }

  if (fit === 'cover') {
    const sourceAspect = sw / sh
    const destinationAspect = dw / dh
    if (sourceAspect > destinationAspect) {
      const croppedWidth = sh * destinationAspect
      return {
        sourceX: (sw - croppedWidth) / 2,
        sourceY: 0,
        sourceWidth: croppedWidth,
        sourceHeight: sh,
        destinationX: 0,
        destinationY: 0,
        destinationWidth: dw,
        destinationHeight: dh,
      }
    }
    const croppedHeight = sw / destinationAspect
    return {
      sourceX: 0,
      sourceY: (sh - croppedHeight) / 2,
      sourceWidth: sw,
      sourceHeight: croppedHeight,
      destinationX: 0,
      destinationY: 0,
      destinationWidth: dw,
      destinationHeight: dh,
    }
  }

  const scale = Math.min(dw / sw, dh / sh)
  const renderedWidth = sw * scale
  const renderedHeight = sh * scale
  return {
    sourceX: 0,
    sourceY: 0,
    sourceWidth: sw,
    sourceHeight: sh,
    destinationX: (dw - renderedWidth) / 2,
    destinationY: (dh - renderedHeight) / 2,
    destinationWidth: renderedWidth,
    destinationHeight: renderedHeight,
  }
}

/** Avoid seeking exactly to duration, which several browsers reject. */
export function resolveVideoPosterTime(requested: number, duration: number): number {
  const safeRequested = Number.isFinite(requested) ? Math.max(0, requested) : 0
  if (!Number.isFinite(duration) || duration <= 0) return safeRequested
  return Math.min(safeRequested, Math.max(0, duration - 0.001))
}
