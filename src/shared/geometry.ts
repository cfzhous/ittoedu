export interface RotatedRectangle {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export interface AxisAlignedBounds {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
  centerX: number
  centerY: number
}

function stableAbsoluteTrig(value: number): number {
  const absolute = Math.abs(value)
  return absolute < 1e-12 ? 0 : absolute
}

/** Returns the visual, axis-aligned bounds of a rectangle rotated around its centre. */
export function rotatedRectangleAabb(rectangle: RotatedRectangle): AxisAlignedBounds {
  const radians = (rectangle.rotation * Math.PI) / 180
  const cosine = stableAbsoluteTrig(Math.cos(radians))
  const sine = stableAbsoluteTrig(Math.sin(radians))
  const width = rectangle.width * cosine + rectangle.height * sine
  const height = rectangle.width * sine + rectangle.height * cosine
  const centerX = rectangle.x + rectangle.width / 2
  const centerY = rectangle.y + rectangle.height / 2
  const left = centerX - width / 2
  const top = centerY - height / 2

  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    centerX,
    centerY,
  }
}
