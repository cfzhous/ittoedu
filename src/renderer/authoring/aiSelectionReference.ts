import type {
  ComponentAuthoringTarget,
} from '../../shared/componentTypes'
import type { RuntimeAuthoringTarget } from '../../shared/runtimeTypes'
import type { ProjectDocument } from '../../shared/projectTypes'
import {
  AUTHORING_ADDRESS_PROTOCOL_VERSION,
  makeAuthoringAddress,
  serializeAiSelectionReference,
  type AiSelectionReference,
} from '../../shared/authoringAddress'
import { getComponentPropValue } from '../../shared/componentProps'

export type AuthoringCanvasTarget =
  | { carrier: 'runtime'; target: Readonly<RuntimeAuthoringTarget> }
  | { carrier: 'component'; target: Readonly<ComponentAuthoringTarget> }

function currentValue(
  project: ProjectDocument,
  target: AuthoringCanvasTarget,
): unknown {
  if (target.carrier === 'runtime') {
    const runtime = target.target.scope === 'global'
      ? project.globalRuntime
      : project.scenes.find((scene) => scene.id === target.target.sceneId)?.runtime
    return target.target.kind === 'text'
      ? runtime?.content.values[target.target.key]
      : runtime?.assets[target.target.key]?.assetId
  }
  const nodes = target.target.scope === 'global'
    ? project.globalLayer.map((entry) => entry.node)
    : project.scenes.find((scene) => scene.id === target.target.sceneId)?.nodes ?? []
  const node = nodes.find((candidate) => (
    candidate.type === 'external-component' &&
    candidate.id === target.target.nodeId
  ))
  return node?.type === 'external-component'
    ? getComponentPropValue(node.props, target.target.key)
    : undefined
}

/**
 * Builds a stable AI handoff reference. `hitId` remains diagnostic only; the
 * address is derived exclusively from persisted project ids and a data key.
 */
export function createAiSelectionReference(input: {
  project: ProjectDocument
  projectRevision: number
  layoutRevision: number
  surfaceId: string
  activeSceneId: string
  selection: AuthoringCanvasTarget
}): AiSelectionReference {
  const { target } = input.selection
  const sceneId = target.scope === 'scene'
    ? target.sceneId ?? input.activeSceneId
    : undefined
  const field = input.selection.carrier === 'runtime'
    ? `${target.kind === 'text' ? 'content.values' : 'assets'}.${target.key}`
    : `props.${target.key}`
  return {
    protocolVersion: AUTHORING_ADDRESS_PROTOCOL_VERSION,
    projectId: input.project.id,
    projectRevision: input.projectRevision,
    layoutRevision: input.layoutRevision,
    hitId: target.targetId,
    authoringAddress: makeAuthoringAddress({
      projectId: input.project.id,
      scope: target.scope,
      ...(sceneId ? { surfaceId: input.surfaceId, sceneId } : {}),
      carrier: input.selection.carrier,
      layerItemId: input.selection.carrier === 'component'
        ? input.selection.target.nodeId
        : `runtime:${target.scope}:${sceneId ?? 'global'}`,
      field,
    }),
    kind: target.kind === 'text' || target.kind === 'component-text'
      ? 'text'
      : 'asset',
    label: target.label ?? target.key,
    currentValue: currentValue(input.project, input.selection),
  }
}

export function copyableAiSelectionReference(input: Parameters<
  typeof createAiSelectionReference
>[0]): string {
  return serializeAiSelectionReference(createAiSelectionReference(input))
}
