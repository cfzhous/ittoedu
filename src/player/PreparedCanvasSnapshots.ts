function collectCanvases(node: Node, output: Set<HTMLCanvasElement>): void {
  if (node instanceof HTMLCanvasElement) output.add(node)
  if (node instanceof HTMLSlotElement) {
    const assigned = node.assignedNodes({ flatten: true })
    const composedChildren = assigned.length > 0
      ? assigned
      : [...node.childNodes]
    composedChildren.forEach((child) => collectCanvases(child, output))
    return
  }
  if (node instanceof Element && node.shadowRoot) {
    collectCanvases(node.shadowRoot, output)
    return
  }
  node.childNodes.forEach((child) => collectCanvases(child, output))
}

function copyCanvas(source: HTMLCanvasElement): HTMLCanvasElement | null {
  if (source.width <= 0 || source.height <= 0) return null
  const copy = document.createElement('canvas')
  copy.width = source.width
  copy.height = source.height
  const context = copy.getContext('2d')
  if (!context) return null
  context.drawImage(source, 0, 0)
  return copy
}

/**
 * Keeps the exact DOM Canvas/WebGL frame produced by each prepareCapture hook.
 * In particular, this prevents a later async component from outliving the
 * readable drawing buffer of an earlier Three/WebGL surface.
 */
export class PreparedCanvasSnapshots {
  private snapshots = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>()

  reset(): void {
    this.snapshots = new WeakMap()
  }

  captureRoots(roots: readonly ParentNode[]): void {
    const canvases = new Set<HTMLCanvasElement>()
    roots.forEach((root) => collectCanvases(root as Node, canvases))
    for (const source of canvases) {
      const snapshot = copyCanvas(source)
      if (snapshot) this.snapshots.set(source, snapshot)
    }
  }

  get(source: HTMLCanvasElement): HTMLCanvasElement | undefined {
    return this.snapshots.get(source)
  }

  clear(): void {
    this.reset()
  }
}

export type CaptureSurfaceSnapshotter = (
  roots: readonly ParentNode[],
) => void
