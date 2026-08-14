import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const CAPABILITY_INDEX_FORMAT = 'courseware.agent-kit/capability-index@1'
export const CAPABILITY_INDEX_MAX_BYTES = 24_000

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_CAPABILITY_INDEX = path.join(
  projectRoot,
  'agent-kit',
  'capabilities',
  'index.json',
)

type JsonObject = Record<string, unknown>

export interface CapabilityIndexCheck {
  valid: boolean
  errors: string[]
  cardCount: number
  bytes: number
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize)
  if (!isObject(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, normalize(value[key])]),
  )
}

export function canonicalCapabilityJson(value: unknown): string {
  return `${JSON.stringify(normalize(value), null, 2)}\n`
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export async function checkCapabilityIndex(
  indexPath = DEFAULT_CAPABILITY_INDEX,
): Promise<CapabilityIndexCheck> {
  const errors: string[] = []
  let source = ''
  let parsed: unknown
  try {
    source = await readFile(indexPath, 'utf8')
    parsed = JSON.parse(source)
  } catch (error) {
    return {
      valid: false,
      errors: [`Cannot read capability index: ${(error as Error).message}`],
      cardCount: 0,
      bytes: Buffer.byteLength(source),
    }
  }

  if (!isObject(parsed)) {
    errors.push('Capability index must be a JSON object.')
    return { valid: false, errors, cardCount: 0, bytes: Buffer.byteLength(source) }
  }
  if (parsed.format !== CAPABILITY_INDEX_FORMAT) errors.push(`format must be ${CAPABILITY_INDEX_FORMAT}.`)
  if (parsed.manifestVersion !== 1) errors.push('manifestVersion must be 1.')
  const product = isObject(parsed.product) ? parsed.product : undefined
  if (product?.projectSchemaVersion !== 9) errors.push('product.projectSchemaVersion must be 9.')
  if (product?.publishedCourseVersion !== 2) errors.push('product.publishedCourseVersion must be 2.')

  const cards = Array.isArray(parsed.cards) ? parsed.cards : []
  if (cards.length === 0) errors.push('cards must contain at least one current capability.')
  const ids = new Set<string>()
  for (const [index, value] of cards.entries()) {
    if (!isObject(value)) {
      errors.push(`cards[${index}] must be an object.`)
      continue
    }
    const id = typeof value.id === 'string' ? value.id : ''
    if (!id) errors.push(`cards[${index}].id is required.`)
    else if (ids.has(id)) errors.push(`Duplicate capability id: ${id}.`)
    else ids.add(id)
    for (const field of ['label', 'purpose', 'authoringBoundary', 'status', 'source']) {
      if (typeof value[field] !== 'string' || value[field] === '') {
        errors.push(`${id || `cards[${index}]`}.${field} is required.`)
      }
    }
    for (const field of ['tags', 'inputs', 'outputs', 'limitations']) {
      if (!strings(value[field])) errors.push(`${id || `cards[${index}]`}.${field} must be a string array.`)
    }
    if (typeof value.source === 'string') {
      const resolved = path.resolve(path.dirname(indexPath), value.source)
      try {
        await access(resolved)
      } catch {
        errors.push(`${id || `cards[${index}]`}.source does not exist: ${value.source}.`)
      }
    }
  }

  const bannedWorkflowTerms = [
    'implementation-ready',
    'review scope hash',
    'build-project-v8-courseware',
    'generation-evidence',
    '03-development-plan.md',
  ]
  const lower = source.toLocaleLowerCase()
  for (const term of bannedWorkflowTerms) {
    if (lower.includes(term)) errors.push(`Retired workflow term remains in capability index: ${term}.`)
  }
  const bytes = Buffer.byteLength(source)
  if (bytes > CAPABILITY_INDEX_MAX_BYTES) {
    errors.push(`Capability index is ${bytes} bytes; maximum is ${CAPABILITY_INDEX_MAX_BYTES}.`)
  }
  if (source !== canonicalCapabilityJson(parsed)) errors.push('Capability index is not canonical JSON.')
  return { valid: errors.length === 0, errors, cardCount: cards.length, bytes }
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes('--check')
  const pathArgument = process.argv.find((value) => value.startsWith('--index='))
  const indexPath = path.resolve(pathArgument?.slice('--index='.length) || DEFAULT_CAPABILITY_INDEX)
  if (!checkOnly) {
    const parsed = JSON.parse(await readFile(indexPath, 'utf8')) as unknown
    await writeFile(indexPath, canonicalCapabilityJson(parsed), 'utf8')
  }
  const result = await checkCapabilityIndex(indexPath)
  if (!result.valid) {
    throw new Error(result.errors.join('\n'))
  }
  process.stdout.write(`Capability index OK: ${result.cardCount} cards, ${result.bytes} bytes.\n`)
}

const invokedPath = process.argv[1]
if (invokedPath && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${(error as Error).message}\n`)
    process.exitCode = 1
  })
}
