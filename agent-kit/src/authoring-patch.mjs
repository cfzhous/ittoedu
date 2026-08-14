import {
  assertPlainObject,
  assertStableId,
  canonicalJson,
  cloneJson,
  jsonPointerUnescape,
} from './common.mjs'

const CARRIERS = new Set(['native', 'runtime', 'component'])
const SCOPES = new Set(['global', 'surface', 'scene'])

export class RevisionConflictError extends Error {
  constructor(expected, actual) {
    super(`stale project revision: expected ${expected}, actual ${actual}`)
    this.name = 'RevisionConflictError'
    this.expectedRevision = expected
    this.actualRevision = actual
  }
}

export function makeAuthoringAddress(input) {
  assertPlainObject(input, 'authoring address')
  const projectId = assertStableId(input.projectId, 'projectId')
  const scope = input.scope
  const carrier = input.carrier
  if (!SCOPES.has(scope)) throw new TypeError(`unsupported authoring scope: ${scope}`)
  if (!CARRIERS.has(carrier)) throw new TypeError(`unsupported authoring carrier: ${carrier}`)
  const surfaceId = input.surfaceId ? assertStableId(input.surfaceId, 'surfaceId') : '-'
  const sceneId = input.sceneId ? assertStableId(input.sceneId, 'sceneId') : '-'
  const layerItemId = assertStableId(input.layerItemId, 'layerItemId')
  if (scope === 'scene' && (surfaceId === '-' || sceneId === '-')) {
    throw new TypeError('scene authoring address requires surfaceId and sceneId')
  }
  const field = typeof input.field === 'string' && input.field.length > 0 ? input.field : null
  if (!field) throw new TypeError('authoring address field is required')
  return `courseware://authoring/${encodeURIComponent(projectId)}/${scope}/${encodeURIComponent(surfaceId)}/${encodeURIComponent(sceneId)}/${carrier}/${encodeURIComponent(layerItemId)}?field=${encodeURIComponent(field)}`
}

export function parseAuthoringAddress(value) {
  if (typeof value !== 'string') throw new TypeError('authoringAddress must be a string')
  const url = new URL(value)
  if (url.protocol !== 'courseware:') throw new TypeError('authoringAddress must use courseware://')
  if (url.hostname !== 'authoring') throw new TypeError('authoringAddress host must be authoring')
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (parts.length !== 6) throw new TypeError('authoringAddress has an invalid path')
  const [projectId, scope, surfaceId, sceneId, carrier, layerItemId] = parts
  const result = {
    projectId: assertStableId(projectId, 'projectId'),
    scope,
    carrier,
    layerItemId: assertStableId(layerItemId, 'layerItemId'),
    field: url.searchParams.get('field'),
  }
  if (!SCOPES.has(scope)) throw new TypeError(`unsupported authoring scope: ${scope}`)
  if (!CARRIERS.has(carrier)) throw new TypeError(`unsupported authoring carrier: ${carrier}`)
  if (surfaceId !== '-') result.surfaceId = assertStableId(surfaceId, 'surfaceId')
  if (sceneId !== '-') result.sceneId = assertStableId(sceneId, 'sceneId')
  if (!result.field) throw new TypeError('authoringAddress field is required')
  return result
}

function resolvePointer(document, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/') || pointer === '/') {
    throw new TypeError(`invalid authoring JSON pointer: ${pointer}`)
  }
  const segments = pointer.slice(1).split('/').map(jsonPointerUnescape)
  if (segments.some((segment) => ['__proto__', 'prototype', 'constructor'].includes(segment))) {
    throw new Error('authoring target contains a forbidden prototype segment')
  }
  let parent = document
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]
    if (parent === null || typeof parent !== 'object' || !(segment in parent)) {
      throw new Error(`authoring target no longer resolves at ${segments.slice(0, index + 1).join('/')}`)
    }
    parent = parent[segment]
  }
  const key = segments.at(-1)
  if (parent === null || typeof parent !== 'object' || !(key in parent)) {
    throw new Error(`authoring target field no longer exists: ${key}`)
  }
  return { parent, key }
}

export function applyAuthoringPatch(state, patch) {
  assertPlainObject(state, 'project state')
  assertPlainObject(patch, 'authoring patch')
  const inventory = state.inventory ?? state
  const document = state.document
  const revisions = [state.revision, inventory.revision, document?.revision]
    .filter((value) => value !== undefined)
  const actualRevision = revisions[0]
  if (!Number.isSafeInteger(actualRevision) || actualRevision < 0) {
    throw new TypeError('project state revision must be a non-negative safe integer')
  }
  if (revisions.some((value) => value !== actualRevision)) {
    throw new Error('project document and authoring inventory revisions do not match')
  }
  if (patch.expectedRevision !== actualRevision) {
    throw new RevisionConflictError(patch.expectedRevision, actualRevision)
  }
  if (patch.op !== 'replace') throw new TypeError('only replace authoring patches are supported')
  const address = parseAuthoringAddress(patch.authoringAddress)
  const projectId = state.projectId ?? inventory.projectId ?? document?.id
  if (address.projectId !== projectId) throw new Error('authoringAddress belongs to another project')
  const entries = state.authoringIndex ?? state.entries ?? inventory.entries
  const inventoryEntry = entries?.[patch.authoringAddress]
  const pointer = typeof inventoryEntry === 'string' ? inventoryEntry : inventoryEntry?.jsonPointer
  if (!pointer) throw new Error('authoringAddress is not present in the current authoring index')

  const next = cloneJson(state, 'project state')
  const { parent, key } = resolvePointer(next.document, pointer)
  if ('expectedValue' in patch) {
    const current = canonicalJson(parent[key])
    const expected = canonicalJson(patch.expectedValue)
    if (current !== expected) throw new Error('authoring field changed since it was inspected')
  }
  parent[key] = cloneJson(patch.value, 'patch value')
  const nextRevision = actualRevision + 1
  if (next.revision !== undefined) next.revision = nextRevision
  if (next.inventory?.revision !== undefined) next.inventory.revision = nextRevision
  if (next.document?.revision !== undefined) next.document.revision = nextRevision
  return next
}
