import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  RevisionConflictError,
  applyAuthoringPatch,
  assembleBuildGraph,
  author,
  createBuildGraph,
  createMicroRig,
  compileCourseProjectV9,
  defineCourseProject,
  defineScene,
  defineSurface,
  loadCapabilityCards,
  makeProjectState,
  planBuildGraph,
  scaffoldWorkspace,
  searchCapabilityCards,
  validateMicroRig,
  validateWorkspace,
} from '../index.mjs'

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(kitRoot, '..')

async function listFiles(root, prefix = '') {
  const entries = await readdir(resolve(root, prefix), { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...await listFiles(root, name))
    else files.push(name)
  }
  return files.sort()
}

function exampleProject(text = '观察图像') {
  return defineCourseProject({
    id: 'quadratic-function',
    title: '二次函数',
    surfaces: [defineSurface({
      id: 'main-slide',
      kind: 'slide',
      scenes: [defineScene({
        id: 'observe',
        items: [author.text({ id: 'prompt', text })],
      })],
    })],
  })
}

test('semantic SDK keeps dynamic code in modules and indexes editable data', () => {
  const project = exampleProject()
  const state = makeProjectState(project, 4)
  const [address] = Object.keys(state.authoringIndex)
  assert.match(address, /^courseware:\/\/authoring\/quadratic-function\/scene\//)
  assert.equal(state.authoringIndex[address], '/surfaces/0/scenes/0/items/0/data/text')
  assert.throws(() => author.dynamic({ id: 'bad', source: 'window.alert(1)', data: {} }), /inline Runtime/)
  assert.equal(author.dynamic({ id: 'graph', module: 'src/modules/graph.mjs', data: {} }).module, 'src/modules/graph.mjs')
})

test('product V9 compiler emits schema-compatible native image geometry', () => {
  const input = defineCourseProject({
    id: 'image-course',
    title: '图片课例',
    assets: {
      hero: {
        id: 'hero', filename: 'hero.png', mimeType: 'image/png', kind: 'image',
        path: 'assets/hero.png', byteLength: 8, width: 320, height: 180,
      },
    },
    surfaces: [defineSurface({
      id: 'main-slide',
      kind: 'slide',
      scenes: [defineScene({
        id: 'image-scene',
        items: [author.image({ id: 'hero-image', assetId: 'hero' })],
      })],
    })],
  })
  const product = compileCourseProjectV9(input)
  const item = product.surfaces[0].scenes[0].layerItems[0]
  assert.equal(item.content.nativeType, 'image')
  assert.deepEqual(item.content.data.feather, { amount: 0, mode: 'rectangle' })
})

test('revision-protected patch changes one stable address and rejects stale writes', () => {
  const state = makeProjectState(exampleProject(), 4)
  const [authoringAddress] = Object.keys(state.authoringIndex)
  const next = applyAuthoringPatch(state, {
    op: 'replace',
    expectedRevision: 4,
    expectedValue: '观察图像',
    authoringAddress,
    value: '比较开口方向',
  })
  assert.equal(next.revision, 5)
  assert.equal(next.document.surfaces[0].scenes[0].items[0].data.text, '比较开口方向')
  assert.equal(state.document.surfaces[0].scenes[0].items[0].data.text, '观察图像')
  assert.throws(() => applyAuthoringPatch(next, { op: 'replace', expectedRevision: 4, authoringAddress, value: 'stale' }), RevisionConflictError)

  const productInventoryState = {
    ...state,
    projectId: 'course:2026',
    document: { value: { text: '原文' } },
    authoringIndex: {
      'courseware://authoring/course%3A2026/scene/slide%3Amain/scene%3A1/native/text%3A1?field=content.data.text': {
        stablePath: 'surfaces/slide:main/scenes/scene:1/layerItems/text:1/content.data.text',
        jsonPointer: '/value/text',
      },
    },
  }
  const productAddress = Object.keys(productInventoryState.authoringIndex)[0]
  const productPatched = applyAuthoringPatch(productInventoryState, {
    op: 'replace', expectedRevision: 4, authoringAddress: productAddress, value: '新文',
  })
  assert.equal(productPatched.document.value.text, '新文')
  const v9Envelope = {
    document: { id: 'course:2026', revision: 4, value: { text: '原文' } },
    inventory: {
      projectId: 'course:2026',
      revision: 4,
      entries: productInventoryState.authoringIndex,
    },
  }
  const v9Patched = applyAuthoringPatch(v9Envelope, {
    op: 'replace', expectedRevision: 4, authoringAddress: productAddress, value: 'V9 新文',
  })
  assert.equal(v9Patched.document.revision, 5)
  assert.equal(v9Patched.inventory.revision, 5)
  assert.equal(v9Patched.document.value.text, 'V9 新文')
  assert.throws(() => applyAuthoringPatch({
    ...v9Envelope,
    inventory: { ...v9Envelope.inventory, revision: 3 },
  }, {
    op: 'replace', expectedRevision: 4, authoringAddress: productAddress, value: '冲突',
  }), /revisions do not match/)
  assert.throws(() => applyAuthoringPatch({
    ...productInventoryState,
    authoringIndex: { [productAddress]: { jsonPointer: '/value/__proto__/polluted' } },
  }, {
    op: 'replace', expectedRevision: 4, authoringAddress: productAddress, value: true,
  }), /forbidden prototype/)
})

test('capability search returns compact cards from the real index shape', async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), 'courseware-cards-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(resolve(root, 'index.json'), JSON.stringify({
    nodes: [{ type: 'text', label: '文本', schema: 'text.json', authoringScopes: ['scene'], authoringModes: ['professional'], exports: { pdf: 'static-capture' } }],
    runtime: { schema: 'runtime.json', scopes: ['scene'], exports: { singleHtml: 'interactive' } },
  }))
  const cards = await loadCapabilityCards(resolve(root, 'index.json'))
  const result = searchCapabilityCards(cards, '文本 native')
  assert.equal(result[0].id, 'node:text')
  assert.ok(Object.keys(result[0]).length <= 10)
})

test('build graph order and assembly are deterministic', async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), 'courseware-graph-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const graph = createBuildGraph({
    projectId: 'demo',
    tasks: [
      { id: 'z-copy', kind: 'copy-file', dependsOn: ['a-data'], input: { source: 'build/a.json' }, outputs: ['build/z.json'] },
      { id: 'a-data', kind: 'emit-json', dependsOn: [], input: { value: { b: 2, a: 1 } }, outputs: ['build/a.json'] },
    ],
  })
  assert.deepEqual(planBuildGraph(graph).map(({ id }) => id), ['a-data', 'z-copy'])
  const first = await assembleBuildGraph(graph, { workspace: root })
  const second = await assembleBuildGraph(graph, { workspace: root })
  assert.deepEqual(first, second)
  assert.deepEqual(first.tasks[1].inputs.map(({ path }) => path), ['build/a.json'])
  assert.equal(await readFile(resolve(root, 'build/a.json'), 'utf8'), '{\n  "a": 1,\n  "b": 2\n}\n')
  const cyclic = createBuildGraph({ projectId: 'bad', tasks: [
    { id: 'a', kind: 'emit-json', dependsOn: ['b'], input: { value: 1 }, outputs: ['a.json'] },
    { id: 'b', kind: 'emit-json', dependsOn: ['a'], input: { value: 2 }, outputs: ['b.json'] },
  ] })
  assert.throws(() => planBuildGraph(cyclic), /cycle/)
})

test('workspace scaffold and micro rig validate without prescribing a lesson template', async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), 'courseware-workspace-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(resolve(root, 'materials'))
  await writeFile(resolve(root, '01-teaching-plan.md'), '# 教学策划\n')
  await writeFile(resolve(root, '02-presentation-script.md'), '# 教学呈现脚本\n')
  await writeFile(resolve(root, 'capabilities.json'), '{}')
  await scaffoldWorkspace(root, {
    id: 'demo',
    title: '自由课例',
    teachingPlan: '01-teaching-plan.md',
    presentationScript: '02-presentation-script.md',
    capabilityIndex: 'capabilities.json',
    kitRoot,
  })
  const workspace = await validateWorkspace(root)
  assert.equal(workspace.valid, true, workspace.errors.join('; '))
  const source = await readFile(resolve(root, 'src/course.mjs'), 'utf8')
  assert.doesNotMatch(source, /Runtime|双栏|卡片|探究课/)
  await writeFile(resolve(root, 'src/modules/drag.mjs'), 'export const runRig = (input) => input\n')
  const rigFile = await createMicroRig(root, { id: 'drag', capability: 'constraint-drag', module: 'src/modules/drag.mjs' })
  const rig = await validateMicroRig(rigFile)
  assert.equal(rig.valid, true, rig.errors.join('; '))
})

test('CLI scaffolds, validates, and assembles a cold workspace', async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), 'courseware-cli-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const plan = resolve(root, '01-teaching-plan.md')
  const script = resolve(root, '02-presentation-script.md')
  const capabilities = resolve(root, 'capabilities.json')
  await writeFile(plan, '# 教学策划\n')
  await writeFile(script, '# 呈现脚本\n')
  await writeFile(capabilities, '{}')
  const cli = resolve(kitRoot, 'bin/courseware-agent-kit.mjs')
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
  const scaffold = run('scaffold', '--workspace', root, '--id', 'cli-demo', '--title', 'CLI Demo', '--plan', plan, '--script', script, '--capabilities', capabilities)
  assert.equal(scaffold.status, 0, scaffold.stderr)
  const validate = run('validate', '--workspace', root)
  assert.equal(validate.status, 0, validate.stderr)
  const assemble = run('assemble', '--workspace', root)
  assert.equal(assemble.status, 0, assemble.stderr)
  const manifest = JSON.parse(await readFile(resolve(root, 'build/assembly-manifest.json'), 'utf8'))
  assert.equal(manifest.projectId, 'cli-demo')
  assert.deepEqual(manifest.tasks.map(({ id }) => id), ['course-input'])

  const state = makeProjectState(exampleProject(), 2)
  const [authoringAddress] = Object.keys(state.authoringIndex)
  const stateFile = resolve(root, 'state.json')
  const patchFile = resolve(root, 'patch.json')
  const patchedFile = resolve(root, 'patched.json')
  await writeFile(stateFile, JSON.stringify(state))
  await writeFile(patchFile, JSON.stringify({
    op: 'replace',
    expectedRevision: 2,
    authoringAddress,
    value: 'CLI 精确修改',
  }))
  const patch = run('patch', '--state', stateFile, '--patch', patchFile, '--out', patchedFile)
  assert.equal(patch.status, 0, patch.stderr)
  const patched = JSON.parse(await readFile(patchedFile, 'utf8'))
  assert.equal(patched.revision, 3)
  assert.equal(patched.document.surfaces[0].scenes[0].items[0].data.text, 'CLI 精确修改')
})

test('the two workflow skills stay thin and the obsolete V8 skill is absent', async () => {
  const orchestrateRoot = resolve(repositoryRoot, '.agents/skills/orchestrate-courseware')
  const buildRoot = resolve(repositoryRoot, '.agents/skills/build-courseware-project')
  const orchestrate = await readFile(resolve(orchestrateRoot, 'SKILL.md'), 'utf8')
  const build = await readFile(resolve(buildRoot, 'SKILL.md'), 'utf8')
  assert.ok(orchestrate.split(/\r?\n/).length >= 50 && orchestrate.split(/\r?\n/).length <= 80)
  assert.ok(build.split(/\r?\n/).length >= 80 && build.split(/\r?\n/).length <= 120)
  assert.doesNotMatch(orchestrate, /case\.json|implementation-ready|fast \| standard \| high-risk|Project V8/)
  assert.doesNotMatch(build, /case\.json|implementation-ready|engineering candidate|Project V8/)
  assert.deepEqual(await listFiles(orchestrateRoot), ['SKILL.md', 'agents/openai.yaml'])
  assert.deepEqual(await listFiles(buildRoot), [
    'SKILL.md',
    'agents/openai.yaml',
    'references/current-capabilities.md',
    'references/validation-boundaries.md',
  ])
  await assert.rejects(access(resolve(repositoryRoot, '.agents/skills/build-project-v8-courseware')))
})
