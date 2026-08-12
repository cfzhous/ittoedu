import type {
  ComponentPackageData,
} from './componentTypes'
import type {
  ExternalComponentNode,
  ProjectDocument,
  SceneNode,
} from './projectTypes'
import type { RuntimeDocument } from './runtimeTypes'
import { materializeScene } from './presentation'
import {
  getComponentPropValue,
  mergeComponentProps,
} from './componentProps'

export type ProjectAssetReferenceCertainty = 'direct' | 'conservative'

export type ProjectAssetReferenceKind =
  | 'scene-background'
  | 'state-background'
  | 'node-image'
  | 'node-video'
  | 'video-poster'
  | 'sound'
  | 'runtime-binding'
  | 'runtime-fallback'
  | 'runtime-content'
  | 'runtime-source'
  | 'component-prop'
  | 'component-manifest-default'
  | 'component-runtime-source'
  | 'component-context-unavailable'

export interface ProjectAssetReference {
  assetId: string
  kind: ProjectAssetReferenceKind
  path: Array<string | number>
  sceneId?: string
  stateId?: string
  nodeId?: string
  packageId?: string
  certainty: ProjectAssetReferenceCertainty
}

export type ProjectAssetReferenceGraph = ReadonlyMap<
  string,
  readonly ProjectAssetReference[]
>

export type ComponentAssetReferenceContext = Pick<
  ComponentPackageData,
  'manifest' | 'runtimeSource'
>

export interface MissingComponentAssetContext {
  packageId: string
  version: string
  path: Array<string | number>
  sceneId?: string
  stateId?: string
  nodeId: string
}

export interface ProjectAssetReferenceAnalysis {
  graph: ProjectAssetReferenceGraph
  missingComponentContexts: readonly MissingComponentAssetContext[]
}

export interface ProjectAssetReferenceOptions {
  componentPackages?: Readonly<Record<string, ComponentAssetReferenceContext>>
  /** Publishing excludes disabled runtimes; authoring safety includes them. */
  includeDisabledRuntimes?: boolean
}

interface ReferenceLocation {
  path: Array<string | number>
  sceneId?: string
  stateId?: string
  nodeId?: string
  packageId?: string
}

function componentPackage(
  packages: ProjectAssetReferenceOptions['componentPackages'],
  packageId: string,
  version: string,
): readonly [string, ComponentAssetReferenceContext] | undefined {
  return Object.entries(packages ?? {}).find(([, { manifest }]) => (
    manifest.id === packageId && manifest.version === version
  ))
}

function visitKnownAssetValues(
  value: unknown,
  knownAssetIds: ReadonlySet<string>,
  path: Array<string | number>,
  visit: (assetId: string, path: Array<string | number>) => void,
): void {
  if (typeof value === 'string') {
    if (knownAssetIds.has(value)) visit(value, path)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitKnownAssetValues(
      item,
      knownAssetIds,
      [...path, index],
      visit,
    ))
    return
  }
  if (typeof value !== 'object' || value === null) return
  Object.entries(value).forEach(([key, item]) => visitKnownAssetValues(
    item,
    knownAssetIds,
    [...path, key],
    visit,
  ))
}

function sourceAssetIds(
  source: string,
  knownAssetIds: ReadonlySet<string>,
): string[] {
  // Runtime/component code is not executed here. Decode quoted JS literals so
  // escaped known IDs are protected. Quoted literals inside comments can also
  // conservatively block deletion; random substrings in identifiers do not.
  const found = new Set<string>()
  let index = 0
  while (index < source.length) {
    const quote = source[index]
    if (quote !== "'" && quote !== '"' && quote !== '`') {
      index += 1
      continue
    }
    let value = ''
    index += 1
    while (index < source.length) {
      const character = source[index]!
      if (character === quote) {
        index += 1
        if (knownAssetIds.has(value)) found.add(value)
        break
      }
      if (character !== '\\') {
        value += character
        index += 1
        continue
      }
      const escaped = source[index + 1]
      if (escaped === undefined) {
        index += 1
        continue
      }
      const simple: Readonly<Record<string, string>> = {
        b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', 0: '\0',
      }
      if (escaped in simple) {
        value += simple[escaped]!
        index += 2
      } else if (escaped === 'x' && /^[\da-f]{2}$/i.test(source.slice(index + 2, index + 4))) {
        value += String.fromCharCode(Number.parseInt(source.slice(index + 2, index + 4), 16))
        index += 4
      } else if (escaped === 'u' && /^[\da-f]{4}$/i.test(source.slice(index + 2, index + 6))) {
        value += String.fromCharCode(Number.parseInt(source.slice(index + 2, index + 6), 16))
        index += 6
      } else {
        value += escaped
        index += 2
      }
    }
  }
  return [...found]
}

export function analyzeProjectAssetReferences(
  project: ProjectDocument,
  options: ProjectAssetReferenceOptions = {},
): ProjectAssetReferenceAnalysis {
  const includeDisabledRuntimes = options.includeDisabledRuntimes ?? true
  const knownAssetIds = new Set([
    ...Object.keys(project.assets),
    ...Object.values(project.assets).map(({ id }) => id),
  ])
  const mutableGraph = new Map<string, ProjectAssetReference[]>()
  const referenceKeys = new Set<string>()
  const missingComponentContexts: MissingComponentAssetContext[] = []

  const add = (
    assetId: string | null | undefined,
    kind: ProjectAssetReferenceKind,
    certainty: ProjectAssetReferenceCertainty,
    location: ReferenceLocation,
  ): void => {
    if (!assetId) return
    const reference: ProjectAssetReference = {
      assetId,
      kind,
      certainty,
      path: [...location.path],
      ...(location.sceneId ? { sceneId: location.sceneId } : {}),
      ...(location.stateId ? { stateId: location.stateId } : {}),
      ...(location.nodeId ? { nodeId: location.nodeId } : {}),
      ...(location.packageId ? { packageId: location.packageId } : {}),
    }
    const key = JSON.stringify(reference)
    if (referenceKeys.has(key)) return
    referenceKeys.add(key)
    mutableGraph.set(assetId, [...(mutableGraph.get(assetId) ?? []), reference])
  }

  const scanRuntime = (
    runtime: RuntimeDocument | undefined,
    location: ReferenceLocation,
  ): void => {
    if (!runtime || (!includeDisabledRuntimes && !runtime.enabled)) return
    Object.entries(runtime.assets).forEach(([key, binding]) => add(
      binding.assetId,
      'runtime-binding',
      'direct',
      { ...location, path: [...location.path, 'assets', key, 'assetId'] },
    ))
    add(runtime.staticFallback?.assetId, 'runtime-fallback', 'direct', {
      ...location,
      path: [...location.path, 'staticFallback', 'assetId'],
    })
    visitKnownAssetValues(
      runtime.content.values,
      knownAssetIds,
      [...location.path, 'content', 'values'],
      (assetId, path) => add(assetId, 'runtime-content', 'conservative', {
        ...location,
        path,
      }),
    )
    sourceAssetIds(runtime.source, knownAssetIds).forEach((assetId) => add(
      assetId,
      'runtime-source',
      'conservative',
      { ...location, path: [...location.path, 'source'] },
    ))
  }

  const scanComponent = (
    node: ExternalComponentNode,
    location: ReferenceLocation,
    props: unknown = node.props,
  ): void => {
    const packageEntry = componentPackage(
      options.componentPackages,
      node.component.packageId,
      node.component.version,
    )
    if (!packageEntry) {
      visitKnownAssetValues(
        props,
        knownAssetIds,
        [...location.path, 'props'],
        (assetId, path) => add(assetId, 'component-prop', 'conservative', {
          ...location,
          packageId: node.component.packageId,
          path,
        }),
      )
      missingComponentContexts.push({
        packageId: node.component.packageId,
        version: node.component.version,
        path: [...location.path, 'component'],
        ...(location.sceneId ? { sceneId: location.sceneId } : {}),
        ...(location.stateId ? { stateId: location.stateId } : {}),
        nodeId: node.id,
      })
      // Missing executable context is not evidence that an asset is unused.
      // Block deletion conservatively until the matching package is available.
      knownAssetIds.forEach((assetId) => add(
        assetId,
        'component-context-unavailable',
        'conservative',
        {
          ...location,
          packageId: node.component.packageId,
          path: [...location.path, 'component'],
        },
      ))
      return
    }
    const [packageKey, data] = packageEntry
    const explicitProps = typeof props === 'object' && props !== null && !Array.isArray(props)
      ? props as Record<string, unknown>
      : {}
    const effectiveProps = mergeComponentProps(data.manifest, explicitProps)
    visitKnownAssetValues(
      effectiveProps,
      knownAssetIds,
      [...location.path, 'props'],
      (assetId, path) => add(assetId, 'component-prop', 'conservative', {
        ...location,
        packageId: node.component.packageId,
        path,
      }),
    )
    for (const property of data.manifest.editor?.properties ?? []) {
      if (property.type !== 'image') continue
      const assetId = getComponentPropValue(effectiveProps, property.key)
      if (typeof assetId !== 'string' || !assetId) continue
      const explicit = getComponentPropValue(explicitProps, property.key) !== undefined
      add(
        assetId,
        explicit ? 'component-prop' : 'component-manifest-default',
        'direct',
        explicit
          ? {
              ...location,
              packageId: node.component.packageId,
              path: [...location.path, 'props', ...property.key.split('.')],
            }
          : {
              ...location,
              packageId: node.component.packageId,
              path: ['componentPackages', packageKey, 'manifest', 'defaultProps', ...property.key.split('.')],
            },
      )
    }
    sourceAssetIds(data.runtimeSource, knownAssetIds).forEach((assetId) => add(
      assetId,
      'component-runtime-source',
      'conservative',
      {
        ...location,
        packageId: node.component.packageId,
        path: ['componentPackages', packageKey, 'runtimeSource'],
      },
    ))
  }

  const scanNode = (node: SceneNode, location: ReferenceLocation): void => {
    if (node.type === 'image') {
      add(node.assetId, 'node-image', 'direct', {
        ...location,
        path: [...location.path, 'assetId'],
      })
    } else if (node.type === 'video') {
      add(node.assetId, 'node-video', 'direct', {
        ...location,
        path: [...location.path, 'assetId'],
      })
      if (node.poster.mode === 'image') {
        add(node.poster.assetId, 'video-poster', 'direct', {
          ...location,
          path: [...location.path, 'poster', 'assetId'],
        })
      }
    } else if (node.type === 'external-component') {
      scanComponent(node, location)
    }
  }

  scanRuntime(project.globalRuntime, { path: ['globalRuntime'] })
  Object.entries(project.media.audio.sounds).forEach(([soundKey, sound]) => add(
    sound.assetId,
    'sound',
    'direct',
    { path: ['media', 'audio', 'sounds', soundKey, 'assetId'] },
  ))
  project.globalLayer.forEach((item, index) => scanNode(item.node, {
    path: ['globalLayer', index, 'node'],
    nodeId: item.node.id,
  }))

  project.scenes.forEach((scene, sceneIndex) => {
    const scenePath: Array<string | number> = ['scenes', sceneIndex]
    add(scene.backgroundAssetId, 'scene-background', 'direct', {
      path: [...scenePath, 'backgroundAssetId'],
      sceneId: scene.id,
    })
    scene.nodes.forEach((node, nodeIndex) => scanNode(node, {
      path: [...scenePath, 'nodes', nodeIndex],
      sceneId: scene.id,
      nodeId: node.id,
    }))
    scanRuntime(scene.runtime, {
      path: [...scenePath, 'runtime'],
      sceneId: scene.id,
    })
    scene.presentation?.states.forEach((state, stateIndex) => {
      const statePath = [...scenePath, 'presentation', 'states', stateIndex]
      add(state.backgroundAssetId, 'state-background', 'direct', {
        path: [...statePath, 'backgroundAssetId'],
        sceneId: scene.id,
        stateId: state.id,
      })
      const effectiveNodes = new Map(
        materializeScene(scene, state.id).nodes.map((node) => [node.id, node]),
      )
      Object.keys(state.nodeOverrides).forEach((nodeId) => {
        const node = effectiveNodes.get(nodeId)
        if (!node) return
        scanNode(node, {
          path: [...statePath, 'nodeOverrides', nodeId],
          sceneId: scene.id,
          stateId: state.id,
          nodeId,
        })
      })
    })
  })

  return {
    graph: new Map([...mutableGraph].map(([assetId, references]) => [
      assetId,
      Object.freeze(references.map((reference) => Object.freeze(reference))),
    ])),
    missingComponentContexts: Object.freeze(missingComponentContexts),
  }
}

export function buildProjectAssetReferenceGraph(
  project: ProjectDocument,
  options: ProjectAssetReferenceOptions = {},
): ProjectAssetReferenceGraph {
  return analyzeProjectAssetReferences(project, options).graph
}

export function collectReferencedProjectAssetIds(
  project: ProjectDocument,
  options: ProjectAssetReferenceOptions = {},
): ReadonlySet<string> {
  return new Set(buildProjectAssetReferenceGraph(project, options).keys())
}

export function collectUnusedProjectAssetIds(
  project: ProjectDocument,
  options: ProjectAssetReferenceOptions = {},
): ReadonlySet<string> {
  const referenced = collectReferencedProjectAssetIds(project, options)
  return new Set(Object.entries(project.assets)
    .filter(([key, asset]) => !referenced.has(key) && !referenced.has(asset.id))
    .map(([, asset]) => asset.id))
}

export function describeProjectAssetReference(
  reference: ProjectAssetReference,
): string {
  const context = [
    reference.sceneId ? `场景 ${reference.sceneId}` : null,
    reference.stateId ? `状态 ${reference.stateId}` : null,
    reference.nodeId ? `节点 ${reference.nodeId}` : null,
    reference.packageId ? `组件 ${reference.packageId}` : null,
  ].filter(Boolean).join('、')
  const certainty = reference.certainty === 'conservative' ? '可能引用' : '引用'
  return `${context || '工程'}在 ${reference.path.join('.')} ${certainty}该素材`
}
