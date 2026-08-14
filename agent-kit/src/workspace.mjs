import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertPortableId, assertStableId, canonicalJson, ensureInside, writeJsonAtomic } from './common.mjs'
import { createBuildGraph, validateBuildGraph } from './build-graph.mjs'

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function moduleSpecifier(fromDirectory, target) {
  let value = relative(fromDirectory, target).replaceAll('\\', '/')
  if (isAbsolute(value)) return pathToFileURL(target).href
  if (!value.startsWith('.')) value = `./${value}`
  return value
}

export async function scaffoldWorkspace(root, input) {
  const workspace = resolve(root)
  const id = assertStableId(input.id, 'project id')
  const files = ['courseware.workspace.json', 'build-graph.json', 'src/course.mjs']
  for (const file of files) {
    if (await exists(resolve(workspace, file))) throw new Error(`workspace already contains ${file}`)
  }
  for (const directory of ['src/modules', 'assets', 'rigs', 'build']) {
    await mkdir(resolve(workspace, directory), { recursive: true })
  }
  const kitRoot = resolve(input.kitRoot ?? KIT_ROOT)
  const source = `import { defineCourseProject } from '${moduleSpecifier(resolve(workspace, 'src'), resolve(kitRoot, 'index.mjs'))}'\n\nexport default defineCourseProject({\n  id: ${JSON.stringify(id)},\n  title: ${JSON.stringify(input.title ?? id)},\n  surfaces: [],\n})\n`
  await writeFile(resolve(workspace, 'src/course.mjs'), source, 'utf8')
  const graph = createBuildGraph({
    projectId: id,
    tasks: [{
      id: 'course-input',
      kind: 'course-input',
      dependsOn: [],
      input: { module: 'src/course.mjs', exportName: 'default' },
      outputs: ['build/course-project.input.json'],
    }],
  })
  await writeJsonAtomic(resolve(workspace, 'build-graph.json'), graph)
  await writeJsonAtomic(resolve(workspace, 'courseware.workspace.json'), {
    contract: 'courseware.agent-kit/workspace@1',
    version: 1,
    projectId: id,
    title: input.title ?? id,
    teachingPlan: input.teachingPlan,
    presentationScript: input.presentationScript,
    capabilityIndex: input.capabilityIndex,
    buildGraph: 'build-graph.json',
    source: 'src/course.mjs',
  })
  return { workspace, files }
}

export async function createMicroRig(workspaceRoot, input) {
  const workspace = resolve(workspaceRoot)
  const id = assertPortableId(input.id, 'rig id')
  const rigRoot = ensureInside(workspace, `rigs/${id}`, 'rig directory')
  if (await exists(resolve(rigRoot, 'rig.json'))) throw new Error(`rig ${id} already exists`)
  await mkdir(rigRoot, { recursive: true })
  await writeJsonAtomic(resolve(rigRoot, 'input.json'), input.input ?? {})
  await writeJsonAtomic(resolve(rigRoot, 'expected.json'), input.expected ?? {})
  const modulePath = ensureInside(workspace, input.module, 'rig module')
  await writeJsonAtomic(resolve(rigRoot, 'rig.json'), {
    contract: 'courseware.agent-kit/micro-rig@1',
    version: 1,
    id,
    capability: input.capability,
    module: relative(rigRoot, modulePath).replaceAll('\\', '/'),
    exportName: input.exportName ?? 'runRig',
    input: 'input.json',
    expected: 'expected.json',
    checks: input.checks ?? ['behavior', 'authoring-hit', 'save-reopen'],
  })
  return resolve(rigRoot, 'rig.json')
}

export async function validateMicroRig(rigFile) {
  const errors = []
  let rig
  try {
    rig = JSON.parse(await readFile(rigFile, 'utf8'))
    if (rig.contract !== 'courseware.agent-kit/micro-rig@1') errors.push('invalid rig contract')
    assertStableId(rig.id, 'rig id')
    if (typeof rig.module !== 'string' || !rig.module) errors.push('rig module is required')
    if (!Array.isArray(rig.checks) || rig.checks.length === 0) errors.push('rig checks are required')
    for (const path of [rig.input, rig.expected]) {
      if (!(await exists(resolve(dirname(rigFile), path)))) errors.push(`missing rig file: ${path}`)
    }
    const modulePath = resolve(dirname(rigFile), rig.module)
    if (!(await exists(modulePath))) errors.push(`missing rig module: ${rig.module}`)
    if (errors.length === 0) {
      const input = JSON.parse(await readFile(resolve(dirname(rigFile), rig.input), 'utf8'))
      const expected = JSON.parse(await readFile(resolve(dirname(rigFile), rig.expected), 'utf8'))
      const imported = await import(pathToFileURL(modulePath).href)
      const runner = imported[rig.exportName ?? 'runRig']
      if (typeof runner !== 'function') errors.push(`rig module must export ${rig.exportName ?? 'runRig'}`)
      else {
        const actual = await runner(input)
        if (canonicalJson(actual) !== canonicalJson(expected)) errors.push('rig output does not match expected.json')
      }
    }
  } catch (error) {
    errors.push(error.message)
  }
  return { valid: errors.length === 0, errors, rig }
}

export async function validateWorkspace(root) {
  const workspace = resolve(root)
  const errors = []
  const warnings = []
  let config
  try {
    config = JSON.parse(await readFile(resolve(workspace, 'courseware.workspace.json'), 'utf8'))
    if (config.contract !== 'courseware.agent-kit/workspace@1') errors.push('invalid workspace contract')
    assertStableId(config.projectId, 'project id')
    for (const [label, configured] of [
      ['teaching plan', config.teachingPlan],
      ['presentation script', config.presentationScript],
      ['capability index', config.capabilityIndex],
      ['source', config.source],
      ['build graph', config.buildGraph],
    ]) {
      if (typeof configured !== 'string' || !configured) errors.push(`${label} path is required`)
      else if (!(await exists(resolve(workspace, configured)))) errors.push(`${label} does not exist: ${configured}`)
    }
    if (typeof config.buildGraph === 'string' && await exists(resolve(workspace, config.buildGraph))) {
      const graph = JSON.parse(await readFile(resolve(workspace, config.buildGraph), 'utf8'))
      const report = validateBuildGraph(graph)
      errors.push(...report.errors)
      if (graph.projectId !== config.projectId) errors.push('build graph projectId does not match workspace projectId')
    }
    if (typeof config.capabilityIndex === 'string' && await exists(resolve(workspace, config.capabilityIndex))) {
      try { JSON.parse(await readFile(resolve(workspace, config.capabilityIndex), 'utf8')) } catch (error) { errors.push(`capability index is not valid JSON: ${error.message}`) }
    }
    const rigRoot = resolve(workspace, 'rigs')
    if (!(await exists(rigRoot))) warnings.push('workspace has no micro rigs yet')
  } catch (error) {
    errors.push(error.message)
  }
  return { valid: errors.length === 0, errors, warnings, config }
}
