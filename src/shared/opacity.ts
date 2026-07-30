/**
 * Project documents store opacity (`0` invisible, `1` opaque), while the
 * editor exposes transparency (`0%` opaque, `100%` invisible). Keep the
 * inverse mapping in one place so every property control uses the same
 * product-facing semantics.
 */
export function opacityToTransparencyPercent(opacity: number): number {
  const boundedOpacity = Number.isFinite(opacity)
    ? Math.min(1, Math.max(0, opacity))
    : 1
  return Math.round((1 - boundedOpacity) * 100)
}

export function transparencyPercentToOpacity(transparency: number): number {
  const boundedTransparency = Number.isFinite(transparency)
    ? Math.min(100, Math.max(0, transparency))
    : 0
  return 1 - boundedTransparency / 100
}
