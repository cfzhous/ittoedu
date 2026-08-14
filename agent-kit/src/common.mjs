import { createHash, randomUUID } from 'node:crypto'
import { dirname, resolve, sep } from 'node:path'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'

export function assertPlainObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return value
}

export function assertStableId(value, label = 'id') {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 240) {
    throw new TypeError(`${label} must be a non-empty stable id of at most 240 characters`)
  }
  return value
}

export function assertPortableId(value, label = 'id') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new TypeError(`${label} must use letters, numbers, dot, underscore, or hyphen`)
  }
  return value
}

export function cloneJson(value, label = 'value') {
  try {
    const text = JSON.stringify(value)
    if (text === undefined) throw new Error('not JSON serializable')
    return JSON.parse(text)
  } catch (error) {
    throw new TypeError(`${label} must be JSON serializable: ${error.message}`)
  }
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJson(value[key])]),
    )
  }
  return value
}

export function canonicalJson(value, indent = 0) {
  return JSON.stringify(sortJson(value), null, indent)
}

export function digestJson(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

export function ensureInside(root, candidate, label = 'path') {
  const resolvedRoot = resolve(root)
  const resolvedCandidate = resolve(root, candidate)
  const prefix = resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(prefix)) {
    throw new Error(`${label} escapes workspace: ${candidate}`)
  }
  return resolvedCandidate
}

export async function writeJsonAtomic(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp-${process.pid}-${randomUUID()}`
  try {
    await writeFile(temporary, `${canonicalJson(value, 2)}\n`, 'utf8')
    await rename(temporary, filePath)
  } finally {
    await rm(temporary, { force: true })
  }
}

export function jsonPointerEscape(segment) {
  return String(segment).replaceAll('~', '~0').replaceAll('/', '~1')
}

export function jsonPointerUnescape(segment) {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~')
}
