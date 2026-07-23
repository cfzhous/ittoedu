import type PptxGenJS from 'pptxgenjs'
import type { SceneNode } from '../../shared/projectTypes'

export const WIDE_SLIDE_WIDTH = 13.333
export const WIDE_SLIDE_HEIGHT = 7.5
export const PIXELS_TO_POINTS = 0.75

export type PptxSlide = ReturnType<PptxGenJS['addSlide']>

export interface CanvasScale {
  x: number
  y: number
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

export function pptxColor(value: string, fallback = '000000'): string {
  const normalized = value.trim().replace(/^#/, '')
  if (/^[0-9a-f]{6}$/i.test(normalized)) return normalized.toUpperCase()
  if (/^[0-9a-f]{3}$/i.test(normalized)) {
    return normalized
      .split('')
      .map((character) => character.repeat(2))
      .join('')
      .toUpperCase()
  }
  return fallback
}

export function pptxFontFace(
  cssFontFamily: string,
  fallback = 'Microsoft YaHei',
): string {
  const firstFamily = cssFontFamily.split(',')[0]?.trim() ?? ''
  const unquoted = firstFamily.replace(/^["']+|["']+$/g, '').trim()
  const safe = unquoted
    .replace(/[&"'<>]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
  return safe || fallback
}

export function pptxTransparency(alpha: number): number {
  return Math.round((1 - clamp(alpha, 0, 1)) * 100)
}

export function pptxRotation(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0
  const normalized = degrees % 360
  return normalized < 0 ? normalized + 360 : normalized
}

export function pptxObjectName(node: SceneNode): string {
  const label = node.name.trim()
    || (node.type === 'external-component' ? '互动组件' : node.type)
  return label + ' · ' + node.id
}

export function pptxComponentSnapshotKey(
  sceneId: string,
  nodeId: string,
): string {
  return `${sceneId}:${nodeId}`
}

export function pptxGlobalComponentSnapshotKey(
  sceneId: string,
  nodeId: string,
): string {
  return `global:${sceneId}:${nodeId}`
}

export function pptxNodePosition(
  node: Pick<SceneNode, 'x' | 'y' | 'width' | 'height'>,
  scale: CanvasScale,
): Pick<PptxGenJS.PositionProps, 'x' | 'y' | 'w' | 'h'> {
  return {
    x: node.x * scale.x,
    y: node.y * scale.y,
    w: node.width * scale.x,
    h: node.height * scale.y,
  }
}
