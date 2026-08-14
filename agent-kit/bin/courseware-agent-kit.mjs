#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  applyAuthoringPatch,
  assembleBuildGraph,
  createMicroRig,
  loadCapabilityCards,
  scaffoldWorkspace,
  searchCapabilityCards,
  validateBuildGraph,
  validateCourseProject,
  validateMicroRig,
  validateWorkspace,
} from '../index.mjs'
import { canonicalJson, writeJsonAtomic } from '../src/common.mjs'

function parseArgs(values) {
  const result = { _: [] }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!value.startsWith('--')) result._.push(value)
    else {
      const key = value.slice(2)
      const next = values[index + 1]
      if (next === undefined || next.startsWith('--')) result[key] = true
      else {
        result[key] = next
        index += 1
      }
    }
  }
  return result
}

function required(args, key) {
  if (typeof args[key] !== 'string' || !args[key]) throw new Error(`--${key} is required`)
  return args[key]
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'))
}

function output(value) {
  process.stdout.write(`${canonicalJson(value, 2)}\n`)
}

function usage() {
  process.stderr.write(`Courseware Agent Kit\n\n`)
  process.stderr.write(`  scaffold --workspace DIR --id ID --title TITLE --plan FILE --script FILE --capabilities FILE\n`)
  process.stderr.write(`  capabilities --index FILE --query TEXT [--limit N]\n`)
  process.stderr.write(`  graph --file FILE\n`)
  process.stderr.write(`  assemble --workspace DIR [--graph FILE] [--out FILE]\n`)
  process.stderr.write(`  patch --state FILE --patch FILE [--out FILE]\n`)
  process.stderr.write(`  rig --workspace DIR --id ID --capability ID --module FILE\n`)
  process.stderr.write(`  validate --workspace DIR | --course FILE | --rig FILE\n`)
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const args = parseArgs(rest)
  if (!command || command === 'help' || args.help) {
    usage()
    return
  }
  if (command === 'scaffold') {
    const workspace = resolve(required(args, 'workspace'))
    const makeRelative = (path) => {
      const absolute = resolve(path)
      const relative = absolute.startsWith(`${workspace}\\`) || absolute.startsWith(`${workspace}/`)
        ? absolute.slice(workspace.length + 1)
        : absolute
      return relative.replaceAll('\\', '/')
    }
    output(await scaffoldWorkspace(workspace, {
      id: required(args, 'id'),
      title: required(args, 'title'),
      teachingPlan: makeRelative(required(args, 'plan')),
      presentationScript: makeRelative(required(args, 'script')),
      capabilityIndex: makeRelative(required(args, 'capabilities')),
    }))
    return
  }
  if (command === 'capabilities') {
    const cards = await loadCapabilityCards(required(args, 'index'))
    output(searchCapabilityCards(cards, required(args, 'query'), { limit: Number(args.limit ?? 8) }))
    return
  }
  if (command === 'graph') {
    const graph = await readJson(required(args, 'file'))
    const report = validateBuildGraph(graph)
    output(report)
    if (!report.valid) process.exitCode = 1
    return
  }
  if (command === 'assemble') {
    const workspace = resolve(required(args, 'workspace'))
    const graphPath = resolve(workspace, args.graph ?? 'build-graph.json')
    const manifest = await assembleBuildGraph(await readJson(graphPath), { workspace })
    const outputPath = resolve(workspace, args.out ?? 'build/assembly-manifest.json')
    await writeJsonAtomic(outputPath, manifest)
    output(manifest)
    return
  }
  if (command === 'patch') {
    const statePath = resolve(required(args, 'state'))
    const next = applyAuthoringPatch(await readJson(statePath), await readJson(required(args, 'patch')))
    await writeJsonAtomic(resolve(args.out ?? statePath), next)
    output({ projectId: next.projectId, revision: next.revision, output: resolve(args.out ?? statePath) })
    return
  }
  if (command === 'rig') {
    const rig = await createMicroRig(required(args, 'workspace'), {
      id: required(args, 'id'),
      capability: required(args, 'capability'),
      module: required(args, 'module'),
      exportName: args.export ?? 'runRig',
      checks: typeof args.checks === 'string' ? args.checks.split(',').map((value) => value.trim()).filter(Boolean) : undefined,
    })
    output({ rig })
    return
  }
  if (command === 'validate') {
    let report
    if (args.workspace) report = await validateWorkspace(args.workspace)
    else if (args.rig) report = await validateMicroRig(args.rig)
    else if (args.course) report = validateCourseProject(await readJson(args.course))
    else throw new Error('validate requires --workspace, --rig, or --course')
    output(report)
    if (!report.valid) process.exitCode = 1
    return
  }
  throw new Error(`unknown command: ${command}`)
}

main().catch((error) => {
  process.stderr.write(`${error.name}: ${error.message}\n`)
  process.exitCode = 2
})
