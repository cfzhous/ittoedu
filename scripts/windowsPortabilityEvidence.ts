import { createHash } from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'

export interface DirectoryEvidenceEntry {
  path: string
  sizeBytes: number
  sha256: string
}

function toEvidencePath(value: string): string {
  return value.replaceAll('\\', '/')
}

async function fileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex').toUpperCase()))
  })
}

/**
 * Returns a stable, cryptographic manifest for a directory copy. Directory
 * timestamps are intentionally excluded because Windows copy tools may alter
 * them without changing the runnable payload.
 */
export async function collectDirectoryEvidence(
  rootDirectory: string,
): Promise<DirectoryEvidenceEntry[]> {
  const root = path.resolve(rootDirectory)
  const entries: DirectoryEvidenceEntry[] = []

  async function visit(directory: string): Promise<void> {
    const children = await fs.readdir(directory, { withFileTypes: true })
    children.sort((left, right) => left.name.localeCompare(right.name, 'en'))
    for (const child of children) {
      const absolutePath = path.join(directory, child.name)
      if (child.isSymbolicLink()) {
        throw new Error(`可移植目录不得依赖符号链接：${absolutePath}`)
      }
      if (child.isDirectory()) {
        await visit(absolutePath)
        continue
      }
      if (!child.isFile()) {
        throw new Error(`可移植目录包含不支持的文件类型：${absolutePath}`)
      }
      const stats = await fs.stat(absolutePath)
      entries.push({
        path: toEvidencePath(path.relative(root, absolutePath)),
        sizeBytes: stats.size,
        sha256: await fileSha256(absolutePath),
      })
    }
  }

  await visit(root)
  return entries.sort((left, right) => left.path.localeCompare(right.path, 'en'))
}

export function assertEquivalentDirectoryEvidence(
  source: readonly DirectoryEvidenceEntry[],
  moved: readonly DirectoryEvidenceEntry[],
): void {
  const sourceByPath = new Map(source.map((entry) => [entry.path, entry]))
  const movedByPath = new Map(moved.map((entry) => [entry.path, entry]))
  const allPaths = [...new Set([...sourceByPath.keys(), ...movedByPath.keys()])]
    .sort((left, right) => left.localeCompare(right, 'en'))

  const differences: string[] = []
  for (const relativePath of allPaths) {
    const sourceEntry = sourceByPath.get(relativePath)
    const movedEntry = movedByPath.get(relativePath)
    if (!sourceEntry) {
      differences.push(`复制目录多出 ${relativePath}`)
    } else if (!movedEntry) {
      differences.push(`复制目录缺少 ${relativePath}`)
    } else if (
      sourceEntry.sizeBytes !== movedEntry.sizeBytes ||
      sourceEntry.sha256 !== movedEntry.sha256
    ) {
      differences.push(`复制目录内容变化 ${relativePath}`)
    }
  }

  if (differences.length > 0) {
    throw new Error(`Windows 目录版复制不完整：${differences.slice(0, 8).join('；')}`)
  }
}

function pathRepresentations(value: string): string[] {
  const resolved = path.resolve(value)
  const slash = value.replaceAll('\\', '/')
  const backslash = value.replaceAll('/', '\\')
  const resolvedSlash = resolved.replaceAll('\\', '/')
  const resolvedBackslash = resolved.replaceAll('/', '\\')
  return [...new Set([
    value,
    slash,
    backslash,
    resolved,
    resolvedSlash,
    resolvedBackslash,
  ])]
}

/**
 * Detects accidental absolute-path coupling in persisted Project/published
 * text. Matching is case-insensitive because Windows paths are normally so.
 */
export function assertNoForbiddenPathReferences(
  label: string,
  content: string,
  forbiddenRoots: readonly string[],
): void {
  const normalizedContent = content.toLocaleLowerCase('en-US')
  for (const root of forbiddenRoots) {
    for (const representation of pathRepresentations(root)) {
      if (normalizedContent.includes(representation.toLocaleLowerCase('en-US'))) {
        throw new Error(`${label} 泄漏或依赖外部绝对路径：${representation}`)
      }
    }
  }
}

export function summarizeDirectoryEvidence(
  entries: readonly DirectoryEvidenceEntry[],
): { fileCount: number; totalBytes: number; manifestSha256: string } {
  const serialized = entries
    .map((entry) => `${entry.path}\0${entry.sizeBytes}\0${entry.sha256}\n`)
    .join('')
  return {
    fileCount: entries.length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    manifestSha256: createHash('sha256')
      .update(serialized, 'utf8')
      .digest('hex')
      .toUpperCase(),
  }
}
