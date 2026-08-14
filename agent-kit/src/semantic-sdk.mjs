import {
  assertPlainObject,
  assertStableId,
  cloneJson,
  deepFreeze,
  jsonPointerEscape,
} from './common.mjs'
import { makeAuthoringAddress } from './authoring-patch.mjs'

export const CONTRACT_ID = 'courseware.agent-kit/course-project-input@1'
export const TARGET_COURSE_PROJECT_SCHEMA_VERSION = 9
const SURFACE_KINDS = new Set(['slide', 'flow', 'spatial-2d'])
const ITEM_KINDS = new Set(['text', 'image', 'formula', 'shape', 'video', 'dynamic-module'])

function uniqueById(items, label) {
  const seen = new Set()
  for (const item of items) {
    if (seen.has(item.id)) throw new Error(`duplicate ${label} id: ${item.id}`)
    seen.add(item.id)
  }
}

function normalizeAuthoring(authoring) {
  if (authoring === undefined) return []
  if (!Array.isArray(authoring)) throw new TypeError('authoring bindings must be an array')
  return authoring.map((binding, index) => {
    assertPlainObject(binding, `authoring[${index}]`)
    if (typeof binding.field !== 'string' || !binding.field) throw new TypeError('authoring field is required')
    if (typeof binding.pointer !== 'string' || !binding.pointer.startsWith('/data/')) {
      throw new TypeError('authoring pointer must address item data with /data/...')
    }
    return { field: binding.field, pointer: binding.pointer, kind: binding.kind ?? 'property' }
  })
}

function item(kind, input, defaultAuthoring) {
  assertPlainObject(input, `${kind} item`)
  const value = {
    id: assertStableId(input.id, `${kind}.id`),
    kind,
    carrier: kind === 'dynamic-module' ? (input.carrier ?? 'runtime') : 'native',
    data: cloneJson(input.data ?? {}, `${kind}.data`),
    authoring: normalizeAuthoring(input.authoring ?? defaultAuthoring),
  }
  if (input.geometry !== undefined) value.geometry = cloneJson(input.geometry, `${kind}.geometry`)
  if (input.layer !== undefined) value.layer = cloneJson(input.layer, `${kind}.layer`)
  if (kind === 'dynamic-module') {
    if (!['runtime', 'component'].includes(value.carrier)) throw new TypeError('dynamic module carrier must be runtime or component')
    if (typeof input.module !== 'string' || !/\.(?:mjs|js|ts|tsx)$/.test(input.module)) {
      throw new TypeError('dynamic module requires a module file path')
    }
    if (/(?:^|\/)(?:inline|source|code)(?:\/|$)/i.test(input.module)) {
      throw new TypeError('dynamic module must reference a normal source module')
    }
    value.module = input.module
    value.exportName = input.exportName ?? 'default'
  }
  return deepFreeze(value)
}

export const author = Object.freeze({
  text(input) {
    if (typeof input.text !== 'string') throw new TypeError('text item requires text')
    return item('text', { ...input, data: { text: input.text, ...(input.data ?? {}) } }, [
      { field: 'text', pointer: '/data/text', kind: 'text' },
    ])
  },
  image(input) {
    assertStableId(input.assetId, 'image.assetId')
    return item('image', { ...input, data: { assetId: input.assetId, ...(input.data ?? {}) } }, [
      { field: 'assetId', pointer: '/data/assetId', kind: 'asset' },
    ])
  },
  formula(input) {
    if (typeof input.latex !== 'string' || !input.latex) throw new TypeError('formula item requires latex')
    return item('formula', { ...input, data: { latex: input.latex, ...(input.data ?? {}) } }, [
      { field: 'latex', pointer: '/data/latex', kind: 'text' },
    ])
  },
  shape(input) {
    return item('shape', input, input.authoring ?? [])
  },
  video(input) {
    assertStableId(input.assetId, 'video.assetId')
    return item('video', { ...input, data: { assetId: input.assetId, ...(input.data ?? {}) } }, [
      { field: 'assetId', pointer: '/data/assetId', kind: 'asset' },
    ])
  },
  dynamic(input) {
    if ('source' in input || 'code' in input || 'script' in input) {
      throw new TypeError('inline Runtime/Component source is forbidden; pass a module file path')
    }
    return item('dynamic-module', input, input.authoring ?? [])
  },
})

export function defineScene(input) {
  assertPlainObject(input, 'scene')
  const items = cloneJson(input.items ?? [], 'scene.items')
  uniqueById(items, 'layer item')
  return deepFreeze({
    id: assertStableId(input.id, 'scene.id'),
    name: typeof input.name === 'string' ? input.name : input.id,
    items,
    ...(input.data === undefined ? {} : { data: cloneJson(input.data, 'scene.data') }),
  })
}

export function defineSurface(input) {
  assertPlainObject(input, 'surface')
  if (!SURFACE_KINDS.has(input.kind)) throw new TypeError(`unsupported surface kind: ${input.kind}`)
  const scenes = cloneJson(input.scenes ?? [], 'surface.scenes')
  uniqueById(scenes, 'scene')
  return deepFreeze({
    id: assertStableId(input.id, 'surface.id'),
    kind: input.kind,
    scenes,
    ...(input.data === undefined ? {} : { data: cloneJson(input.data, 'surface.data') }),
  })
}

export function defineCourseProject(input) {
  assertPlainObject(input, 'course project input')
  const surfaces = cloneJson(input.surfaces ?? [], 'surfaces')
  uniqueById(surfaces, 'surface')
  const project = {
    contract: CONTRACT_ID,
    version: 1,
    target: { kind: 'course-project', schemaVersion: TARGET_COURSE_PROJECT_SCHEMA_VERSION },
    id: assertStableId(input.id, 'course.id'),
    title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : input.id,
    surfaces,
    assets: cloneJson(input.assets ?? {}, 'assets'),
    theme: cloneJson(input.theme ?? {}, 'theme'),
    data: cloneJson(input.data ?? {}, 'course.data'),
  }
  const result = validateCourseProject(project)
  if (!result.valid) throw new TypeError(result.errors.join('; '))
  return deepFreeze(project)
}

export function validateCourseProject(project) {
  const errors = []
  try {
    assertPlainObject(project, 'course project')
    if (project.contract !== CONTRACT_ID) errors.push(`contract must be ${CONTRACT_ID}`)
    if (project.target?.kind !== 'course-project' || project.target?.schemaVersion !== TARGET_COURSE_PROJECT_SCHEMA_VERSION) {
      errors.push(`target must be CourseProject schema ${TARGET_COURSE_PROJECT_SCHEMA_VERSION}`)
    }
    assertStableId(project.id, 'course.id')
    if (!Array.isArray(project.surfaces)) errors.push('surfaces must be an array')
    else {
      uniqueById(project.surfaces, 'surface')
      for (const surface of project.surfaces) {
        assertStableId(surface.id, 'surface.id')
        if (!SURFACE_KINDS.has(surface.kind)) errors.push(`unsupported surface kind: ${surface.kind}`)
        if (!Array.isArray(surface.scenes)) errors.push(`surface ${surface.id} scenes must be an array`)
        else {
          uniqueById(surface.scenes, 'scene')
          for (const scene of surface.scenes) {
            assertStableId(scene.id, 'scene.id')
            if (!Array.isArray(scene.items)) errors.push(`scene ${scene.id} items must be an array`)
            else {
              uniqueById(scene.items, 'layer item')
              for (const candidate of scene.items) {
                assertStableId(candidate.id, 'layerItem.id')
                if (!ITEM_KINDS.has(candidate.kind)) errors.push(`unsupported item kind: ${candidate.kind}`)
                if (!['native', 'runtime', 'component'].includes(candidate.carrier)) errors.push(`unsupported item carrier: ${candidate.carrier}`)
                if (candidate.kind === 'dynamic-module' && typeof candidate.module !== 'string') {
                  errors.push(`dynamic item ${candidate.id} must reference a module`)
                }
                if (candidate.kind === 'dynamic-module' && ('source' in candidate || 'code' in candidate || 'script' in candidate)) {
                  errors.push(`dynamic item ${candidate.id} contains forbidden inline source`)
                }
                if (!Array.isArray(candidate.authoring)) errors.push(`item ${candidate.id} authoring must be an array`)
                else for (const binding of candidate.authoring) {
                  if (typeof binding.field !== 'string' || !binding.field) errors.push(`item ${candidate.id} has invalid authoring field`)
                  if (typeof binding.pointer !== 'string' || !binding.pointer.startsWith('/data/')) errors.push(`item ${candidate.id} has invalid authoring pointer`)
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    errors.push(error.message)
  }
  return { valid: errors.length === 0, errors }
}

export function buildAuthoringIndex(project) {
  const result = validateCourseProject(project)
  if (!result.valid) throw new TypeError(result.errors.join('; '))
  const index = {}
  project.surfaces.forEach((surface, surfaceIndex) => {
    surface.scenes.forEach((scene, sceneIndex) => {
      scene.items.forEach((candidate, itemIndex) => {
        for (const binding of candidate.authoring ?? []) {
          const address = makeAuthoringAddress({
            projectId: project.id,
            scope: 'scene',
            surfaceId: surface.id,
            sceneId: scene.id,
            carrier: candidate.carrier,
            layerItemId: candidate.id,
            field: binding.field,
          })
          const base = `/surfaces/${surfaceIndex}/scenes/${sceneIndex}/items/${itemIndex}`
          index[address] = `${base}${binding.pointer
            .split('/')
            .map((segment, index) => (index === 0 ? '' : `/${jsonPointerEscape(segment)}`))
            .join('')}`
        }
      })
    })
  })
  return Object.fromEntries(Object.entries(index).sort(([left], [right]) => left.localeCompare(right)))
}

export function makeProjectState(project, revision = 0) {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new TypeError('revision must be a non-negative safe integer')
  return {
    contract: 'courseware.agent-kit/project-state@1',
    version: 1,
    projectId: project.id,
    revision,
    document: cloneJson(project),
    authoringIndex: buildAuthoringIndex(project),
  }
}
