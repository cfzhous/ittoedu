import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  assertPlainObject,
  assertPortableId,
  assertStableId,
  canonicalJson,
  cloneJson,
  digestJson,
  ensureInside,
} from './common.mjs'
import { validateCourseProject } from './semantic-sdk.mjs'

const BUILTIN_KINDS = new Set(['course-input', 'copy-file', 'emit-json'])

export function createBuildGraph(input) {
  assertPlainObject(input, 'build graph')
  return {
    contract: 'courseware.agent-kit/build-graph@1',
    version: 1,
    projectId: assertStableId(input.projectId, 'projectId'),
    tasks: cloneJson(input.tasks ?? [], 'tasks'),
  }
}

export function validateBuildGraph(graph, options = {}) {
  const errors = []
  try {
    assertPlainObject(graph, 'build graph')
    if (graph.contract !== 'courseware.agent-kit/build-graph@1' || graph.version !== 1) errors.push('invalid build graph contract')
    assertStableId(graph.projectId, 'projectId')
    if (!Array.isArray(graph.tasks) || graph.tasks.length === 0) errors.push('build graph requires at least one task')
    const ids = new Set()
    const outputs = new Map()
    for (const task of graph.tasks ?? []) {
      assertPlainObject(task, 'task')
      assertPortableId(task.id, 'task.id')
      if (ids.has(task.id)) errors.push(`duplicate task id: ${task.id}`)
      ids.add(task.id)
      if (typeof task.kind !== 'string' || !task.kind) errors.push(`task ${task.id} requires kind`)
      if (!BUILTIN_KINDS.has(task.kind) && !(options.handlerKinds ?? []).includes(task.kind)) {
        errors.push(`task ${task.id} uses unknown kind: ${task.kind}`)
      }
      if (!Array.isArray(task.dependsOn ?? [])) errors.push(`task ${task.id} dependsOn must be an array`)
      else for (const dependency of task.dependsOn ?? []) {
        try { assertPortableId(dependency, `task ${task.id} dependency`) } catch (error) { errors.push(error.message) }
      }
      if (BUILTIN_KINDS.has(task.kind) && (task.outputs ?? []).length !== 1) {
        errors.push(`built-in task ${task.id} requires exactly one output`)
      }
      for (const output of task.outputs ?? []) {
        if (typeof output !== 'string' || !output) errors.push(`task ${task.id} has invalid output`)
        else if (isAbsolute(output) || output.split(/[\\/]/).includes('..')) errors.push(`task ${task.id} output must stay inside the workspace: ${output}`)
        if (outputs.has(output)) errors.push(`output ${output} is owned by both ${outputs.get(output)} and ${task.id}`)
        outputs.set(output, task.id)
      }
    }
    for (const task of graph.tasks ?? []) {
      for (const dependency of task.dependsOn ?? []) {
        if (!ids.has(dependency)) errors.push(`task ${task.id} depends on missing task ${dependency}`)
      }
    }
    if (errors.length === 0) planBuildGraph(graph)
  } catch (error) {
    errors.push(error.message)
  }
  return { valid: errors.length === 0, errors }
}

export function planBuildGraph(graph) {
  const tasks = new Map(graph.tasks.map((task) => [task.id, task]))
  const indegree = new Map(graph.tasks.map((task) => [task.id, 0]))
  const next = new Map(graph.tasks.map((task) => [task.id, []]))
  for (const task of graph.tasks) {
    for (const dependency of task.dependsOn ?? []) {
      if (!tasks.has(dependency)) throw new Error(`task ${task.id} depends on missing task ${dependency}`)
      indegree.set(task.id, indegree.get(task.id) + 1)
      next.get(dependency).push(task.id)
    }
  }
  const ready = [...indegree].filter(([, count]) => count === 0).map(([id]) => id).sort()
  const ordered = []
  while (ready.length > 0) {
    const id = ready.shift()
    ordered.push(tasks.get(id))
    for (const dependent of next.get(id).sort()) {
      indegree.set(dependent, indegree.get(dependent) - 1)
      if (indegree.get(dependent) === 0) ready.push(dependent)
      ready.sort()
    }
  }
  if (ordered.length !== graph.tasks.length) throw new Error('build graph contains a cycle')
  return ordered
}

async function hashFile(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

async function taskInputFingerprints(task, workspace) {
  const paths = []
  if (task.kind === 'course-input' && typeof task.input?.module === 'string') paths.push(task.input.module)
  if (task.kind === 'copy-file' && typeof task.input?.source === 'string') paths.push(task.input.source)
  const result = []
  for (const configured of paths.sort()) {
    const path = ensureInside(workspace, configured, `task ${task.id} input`)
    result.push({ path: relative(workspace, path).replaceAll('\\', '/'), sha256: await hashFile(path) })
  }
  return result
}

async function builtinHandler(task, context) {
  if (task.kind === 'emit-json') {
    const output = ensureInside(context.workspace, task.outputs?.[0], `task ${task.id} output`)
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, `${canonicalJson(task.input?.value, 2)}\n`, 'utf8')
    return
  }
  if (task.kind === 'copy-file') {
    const source = ensureInside(context.workspace, task.input?.source, `task ${task.id} source`)
    const output = ensureInside(context.workspace, task.outputs?.[0], `task ${task.id} output`)
    await mkdir(dirname(output), { recursive: true })
    await copyFile(source, output)
    return
  }
  if (task.kind === 'course-input') {
    const modulePath = ensureInside(context.workspace, task.input?.module, `task ${task.id} module`)
    const sourceDigest = await hashFile(modulePath)
    const imported = await import(`${pathToFileURL(modulePath).href}?source=${sourceDigest}`)
    const project = imported[task.input?.exportName ?? 'default']
    const report = validateCourseProject(project)
    if (!report.valid) throw new Error(`task ${task.id} produced invalid course input: ${report.errors.join('; ')}`)
    const output = ensureInside(context.workspace, task.outputs?.[0], `task ${task.id} output`)
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, `${canonicalJson(project, 2)}\n`, 'utf8')
    return
  }
  throw new Error(`no handler for task kind ${task.kind}`)
}

export async function assembleBuildGraph(graph, options) {
  const workspace = resolve(options.workspace)
  const customHandlers = options.handlers ?? {}
  const validation = validateBuildGraph(graph, { handlerKinds: Object.keys(customHandlers) })
  if (!validation.valid) throw new Error(validation.errors.join('; '))
  const graphDigest = digestJson(graph)
  const records = []
  for (const task of planBuildGraph(graph)) {
    const inputs = await taskInputFingerprints(task, workspace)
    const handler = customHandlers[task.kind] ?? builtinHandler
    await handler(task, { workspace, graph, graphDigest, records })
    const outputs = []
    for (const outputName of task.outputs ?? []) {
      const output = ensureInside(workspace, outputName, `task ${task.id} output`)
      const info = await stat(output)
      if (!info.isFile()) throw new Error(`task ${task.id} did not produce file ${outputName}`)
      outputs.push({ path: relative(workspace, output).replaceAll('\\', '/'), bytes: info.size, sha256: await hashFile(output) })
    }
    records.push({
      id: task.id,
      kind: task.kind,
      cacheKey: digestJson({ graphDigest, task, inputs }),
      inputs,
      outputs,
    })
  }
  return {
    contract: 'courseware.agent-kit/assembly-manifest@1',
    projectId: graph.projectId,
    graphDigest,
    tasks: records,
  }
}
