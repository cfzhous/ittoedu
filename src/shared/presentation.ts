import type {
  DeepPartial,
  SceneDocument,
  SceneNode,
  SceneNodeOverride,
  ScenePresentation,
  ScenePresentationState,
} from './projectTypes'

export const DEFAULT_PRESENTATION_STATE_ID = 'state_initial'

export function createDefaultScenePresentation(): ScenePresentation {
  return {
    initialStateId: DEFAULT_PRESENTATION_STATE_ID,
    thumbnailStateId: DEFAULT_PRESENTATION_STATE_ID,
    states: [{
      id: DEFAULT_PRESENTATION_STATE_ID,
      name: '初始',
      nodeOverrides: {},
    }],
  }
}

export function ensureScenePresentation(
  scene: Pick<SceneDocument, 'presentation'> | { presentation?: ScenePresentation },
): ScenePresentation {
  const presentation = scene.presentation
  if (!presentation || presentation.states.length === 0) {
    return createDefaultScenePresentation()
  }
  const stateIds = new Set(presentation.states.map((state) => state.id))
  const fallbackId = presentation.states[0]!.id
  const initialStateId = stateIds.has(presentation.initialStateId)
    ? presentation.initialStateId
    : fallbackId
  return {
    initialStateId,
    thumbnailStateId: presentation.thumbnailStateId && stateIds.has(presentation.thumbnailStateId)
      ? presentation.thumbnailStateId
      : initialStateId,
    states: presentation.states,
  }
}

export function findPresentationState(
  scene: Pick<SceneDocument, 'presentation'>,
  stateId: string | null | undefined,
): ScenePresentationState | undefined {
  if (stateId === null) return undefined
  const presentation = ensureScenePresentation(scene)
  const resolvedId = stateId ?? presentation.initialStateId
  return presentation.states.find((state) => state.id === resolvedId)
}

/**
 * Resolve a requested scene-entry state without ever leaving the Player in the
 * non-runtime base canvas. Invalid or stale optional ids safely fall back to
 * the target scene's authored initial state.
 */
export function resolveSceneEntryStateId(
  scene: Pick<SceneDocument, 'presentation'>,
  requestedStateId?: string | null,
): string {
  const presentation = ensureScenePresentation(scene)
  return requestedStateId && presentation.states.some(
    (state) => state.id === requestedStateId,
  )
    ? requestedStateId
    : presentation.initialStateId
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeValue(base: unknown, override: unknown): unknown {
  if (override === undefined) return structuredClone(base)
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return structuredClone(override)
  }
  const result: Record<string, unknown> = structuredClone(base)
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue
    Object.defineProperty(result, key, {
      value: mergeValue(base[key], value),
      configurable: true,
      enumerable: true,
      writable: true,
    })
  }
  return result
}

/** Apply one authored state override while preserving the node identity/type. */
export function applySceneNodeOverride(
  baseNode: SceneNode,
  override: SceneNodeOverride | DeepPartial<SceneNode> | undefined,
): SceneNode {
  if (!override) return structuredClone(baseNode)
  const sanitized = structuredClone(override) as Record<string, unknown>
  delete sanitized.id
  delete sanitized.type
  if (baseNode.type === 'external-component') delete sanitized.component
  const merged = mergeValue(baseNode, sanitized) as SceneNode
  if (baseNode.type === 'formula' && Object.hasOwn(sanitized, 'ast')) {
    const formula = merged as Extract<SceneNode, { type: 'formula' }>
    formula.ast = structuredClone(sanitized.ast) as typeof formula.ast
  }
  merged.id = baseNode.id
  merged.type = baseNode.type
  return merged
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => valuesEqual(value, right[index]))
  }
  if (!isPlainObject(left) || !isPlainObject(right)) return false
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  return [...keys].every((key) => valuesEqual(left[key], right[key]))
}

function diffValue(base: unknown, effective: unknown): unknown {
  if (valuesEqual(base, effective)) return undefined
  if (!isPlainObject(base) || !isPlainObject(effective)) {
    return structuredClone(effective)
  }
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(effective)) {
    const difference = diffValue(base[key], effective[key])
    if (difference !== undefined) {
      Object.defineProperty(result, key, {
        value: difference,
        configurable: true,
        enumerable: true,
        writable: true,
      })
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

/** Produce the smallest serializable override that recreates `effectiveNode`. */
export function deriveSceneNodeOverride(
  baseNode: SceneNode,
  effectiveNode: SceneNode,
): SceneNodeOverride | undefined {
  const base = structuredClone(baseNode) as unknown as Record<string, unknown>
  const effective = structuredClone(effectiveNode) as unknown as Record<string, unknown>
  delete base.id
  delete base.type
  delete effective.id
  delete effective.type
  if (baseNode.type === 'external-component') {
    delete base.component
    delete effective.component
  }
  return diffValue(base, effective) as SceneNodeOverride | undefined
}

/**
 * Resolve an editable/runtime scene snapshot. `null` means the canonical base;
 * `undefined` means the authored initial state.
 */
export function materializeScene(
  scene: SceneDocument,
  stateId?: string | null,
): SceneDocument {
  const state = findPresentationState(scene, stateId)
  if (!state) return structuredClone(scene)
  const nodes = scene.nodes.map((node) => applySceneNodeOverride(
    node,
    state.nodeOverrides[node.id],
  ))
  const orderedNodes = state.nodeOrder
    ? (() => {
        const byId = new Map(nodes.map((node) => [node.id, node]))
        const listed = state.nodeOrder!
          .map((id) => byId.get(id))
          .filter((node): node is SceneNode => Boolean(node))
        const listedIds = new Set(listed.map((node) => node.id))
        return [...listed, ...nodes.filter((node) => !listedIds.has(node.id))]
      })()
    : nodes
  return {
    ...structuredClone(scene),
    backgroundColor: state.backgroundColor ?? scene.backgroundColor,
    backgroundAssetId: state.backgroundAssetId === undefined
      ? scene.backgroundAssetId
      : state.backgroundAssetId,
    nodes: orderedNodes,
  }
}

export function isNodeOverriddenInState(
  scene: SceneDocument,
  stateId: string | null,
  nodeId: string,
): boolean {
  if (stateId === null) return false
  return Boolean(findPresentationState(scene, stateId)?.nodeOverrides[nodeId])
}

/** Rewrite state override keys when a scene's canonical node ids are cloned. */
export function rewritePresentationNodeIds(
  presentation: ScenePresentation,
  nodeIds: ReadonlyMap<string, string>,
): ScenePresentation {
  return {
    ...structuredClone(presentation),
    states: presentation.states.map((state) => ({
      ...structuredClone(state),
      nodeOverrides: Object.fromEntries(
        Object.entries(state.nodeOverrides)
          .map(([nodeId, override]) => [nodeIds.get(nodeId), structuredClone(override)] as const)
          .filter((entry): entry is readonly [string, SceneNodeOverride] => Boolean(entry[0])),
      ),
      ...(state.nodeOrder
        ? {
            nodeOrder: state.nodeOrder
              .map((nodeId) => nodeIds.get(nodeId))
              .filter((nodeId): nodeId is string => Boolean(nodeId)),
          }
        : {}),
    })),
  }
}

export function stateReferencesAsset(
  state: ScenePresentationState,
  assetId: string,
): boolean {
  if (state.backgroundAssetId === assetId) return true
  return Object.values(state.nodeOverrides).some((override) =>
    (override as { assetId?: unknown }).assetId === assetId,
  )
}
