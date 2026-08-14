import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { assertPlainObject } from './common.mjs'

function asTerms(value) {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value.flatMap(asTerms)
  if (typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => [key, ...asTerms(item)])
  return [String(value)]
}

function card(input) {
  return {
    id: input.id,
    label: input.label ?? input.id,
    purpose: input.purpose ?? '',
    tags: [...new Set(input.tags ?? [])].sort(),
    inputs: input.inputs ?? [],
    outputs: input.outputs ?? [],
    authoringBoundary: input.authoringBoundary ?? '',
    limitations: input.limitations ?? [],
    status: input.status ?? 'unknown',
    source: input.source,
    ...(input.example ? { example: input.example } : {}),
  }
}

function sourceFile(root, schemaReference, fallback = 'index.json') {
  const path = typeof schemaReference === 'string' ? schemaReference.split('#', 1)[0] : fallback
  return resolve(root, path || fallback)
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function loadCapabilityCards(indexPath, options = {}) {
  const index = await readJson(indexPath)
  assertPlainObject(index, 'capability index')
  const sourceRoot = dirname(resolve(indexPath))
  const cards = []

  for (const value of index.cards ?? []) {
    cards.push(card({
      ...value,
      source: sourceFile(sourceRoot, value.source),
    }))
  }

  for (const node of index.nodes ?? []) {
    cards.push(card({
      id: `node:${node.type}`,
      label: node.label,
      purpose: `Author editable ${node.type} content with native export behavior.`,
      tags: ['native', 'node', node.type, ...(node.authoringScopes ?? [])],
      inputs: [node.schema].filter(Boolean),
      outputs: asTerms(node.exports),
      authoringBoundary: `modes=${(node.authoringModes ?? []).join(',')}; scopes=${(node.authoringScopes ?? []).join(',')}`,
      limitations: Object.entries(node.exports ?? {}).filter(([, mode]) => /omit|fallback|raster|placeholder/.test(String(mode))).map(([surface, mode]) => `${surface}:${mode}`),
      status: 'available',
      source: sourceFile(sourceRoot, node.schema),
    }))
  }

  if (index.runtime) {
    cards.push(card({
      id: 'carrier:runtime',
      label: 'Runtime module',
      purpose: 'Implement a one-off dynamic surface as a normal source module.',
      tags: ['runtime', 'dynamic', ...(index.runtime.scopes ?? [])],
      inputs: [index.runtime.schema].filter(Boolean),
      outputs: asTerms(index.runtime.exports),
      authoringBoundary: 'Visible text/assets/parameters must register stable authoring bindings.',
      limitations: ['Use a module reference; do not inline a giant Runtime source string.'],
      status: 'available',
      source: sourceFile(sourceRoot, index.runtime.schema),
    }))
  }

  if (index.components?.catalog) {
    const catalogPath = resolve(sourceRoot, index.components.catalog)
    const catalog = await readJson(catalogPath)
    for (const component of catalog.components ?? catalog.packages ?? []) {
      cards.push(card({
        id: `component:${component.packageId ?? component.id}`,
        label: component.name ?? component.label ?? component.packageId ?? component.id,
        purpose: component.description ?? 'Reusable external component.',
        tags: ['component', ...(component.tags ?? [])],
        inputs: asTerms(component.props ?? component.inputs ?? component.componentSchemaVersion),
        outputs: asTerms(component.events ?? component.outputs ?? component.supportedScopes),
        authoringBoundary: component.authoringBoundary ?? 'Only declared props and authoring targets are editable.',
        limitations: asTerms(component.releaseBlockers ?? component.limitations),
        status: component.availability === 'available' ? (component.quality ?? 'available') : (component.availability ?? component.status ?? 'unknown'),
        source: catalogPath,
        example: component.example,
      }))
    }
  }

  for (const evaluator of index.assessmentEvaluators ?? []) {
    cards.push(card({
      id: `evaluator:${evaluator.id}`,
      label: evaluator.id,
      purpose: 'Evaluate a declared response using a product-provided evaluator.',
      tags: ['assessment', ...(evaluator.responseTypes ?? []), ...(evaluator.authorities ?? [])],
      inputs: evaluator.responseTypes ?? [],
      outputs: evaluator.authorities ?? [],
      authoringBoundary: 'Only use for the declared response types and authority.',
      limitations: [],
      status: evaluator.status,
      source: resolve(sourceRoot, 'index.json'),
    }))
  }

  for (const extraPath of options.extraCards ?? []) {
    const extra = await readJson(extraPath)
    for (const value of extra.cards ?? extra) cards.push(card({ ...value, source: value.source ?? resolve(extraPath) }))
  }

  const byId = new Map()
  for (const value of cards) byId.set(value.id, value)
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id))
}

export function searchCapabilityCards(cards, query, options = {}) {
  const limit = Number.isSafeInteger(options.limit) && options.limit > 0 ? options.limit : 8
  const terms = String(query ?? '').toLocaleLowerCase().split(/[\s,;，；]+/u).filter(Boolean)
  const scored = cards.map((value) => {
    const id = value.id.toLocaleLowerCase()
    const label = value.label.toLocaleLowerCase()
    const tags = value.tags.join(' ').toLocaleLowerCase()
    const body = asTerms(value).join(' ').toLocaleLowerCase()
    const score = terms.reduce((total, term) => {
      if (id === term) return total + 20
      if (id.split(':').at(-1) === term) return total + 15
      if (id.includes(term)) return total + 10
      if (label.includes(term)) return total + 8
      if (tags.includes(term)) return total + 5
      if (body.includes(term)) return total + 1
      return total
    }, terms.length === 0 ? 1 : 0)
    const statusBoost = ['stable', 'available'].includes(value.status) ? 2 : 0
    return { value, score: score + (score > 0 ? statusBoost : 0) }
  })
  return scored
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.value.id.localeCompare(right.value.id))
    .slice(0, limit)
    .map(({ value }) => value)
}
