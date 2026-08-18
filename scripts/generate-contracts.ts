import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { componentManifestSchema } from '../src/shared/componentSchema'
import { courseProjectDocumentSchema } from '../src/shared/courseProjectSchema'
import { publishedCourseV2Schema } from '../src/shared/publishedCourseSchema'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultProjectRoot = path.resolve(scriptDirectory, '..')

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

export interface ContractGenerationOptions {
  projectRoot?: string
  outputRoot?: string
}

export interface ContractGenerationResult {
  files: ReadonlyMap<string, string>
}

export function generateContractArtifacts(
  options: ContractGenerationOptions = {},
): ContractGenerationResult {
  const files = new Map<string, string>()

  const courseProjectSchemaJson = z.toJSONSchema(courseProjectDocumentSchema, {
    unrepresentable: 'any',
  })
  const publishedCourseSchemaJson = z.toJSONSchema(publishedCourseV2Schema, {
    unrepresentable: 'any',
  })
  const componentManifestSchemaJson = z.toJSONSchema(componentManifestSchema, {
    unrepresentable: 'any',
  })

  const courseProjectFormatted = `${JSON.stringify(courseProjectSchemaJson, null, 2)}\n`
  const publishedCourseFormatted = `${JSON.stringify(publishedCourseSchemaJson, null, 2)}\n`
  const componentManifestFormatted = `${JSON.stringify(componentManifestSchemaJson, null, 2)}\n`

  files.set('course-project-v9.schema.json', courseProjectFormatted)
  files.set('published-course-v2.schema.json', publishedCourseFormatted)
  files.set('component-manifest.schema.json', componentManifestFormatted)

  const manifest = {
    manifestVersion: 1,
    generator: 'scripts/generate-contracts.ts',
    generationCommand: 'npm run generate:contracts',
    contracts: [
      {
        name: 'courseProjectDocumentSchema',
        file: 'course-project-v9.schema.json',
        sourceOfTruth: 'src/shared/courseProjectSchema.ts',
        sha256: sha256(courseProjectFormatted),
      },
      {
        name: 'publishedCourseV2Schema',
        file: 'published-course-v2.schema.json',
        sourceOfTruth: 'src/shared/publishedCourseSchema.ts',
        sha256: sha256(publishedCourseFormatted),
      },
      {
        name: 'componentManifestSchema',
        file: 'component-manifest.schema.json',
        sourceOfTruth: 'src/shared/componentSchema.ts',
        sha256: sha256(componentManifestFormatted),
      },
    ],
  }

  const manifestFormatted = `${JSON.stringify(manifest, null, 2)}\n`
  files.set('contract-manifest.json', manifestFormatted)

  return { files }
}

async function listJsonFiles(rootPath: string): Promise<string[]> {
  const output: string[] = []
  const visit = async (directory: string): Promise<void> => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(absolute)
      else if (entry.isFile() && entry.name.endsWith('.json')) {
        output.push(path.relative(rootPath, absolute).replaceAll('\\', '/'))
      }
    }
  }
  await visit(rootPath)
  return output.sort((left, right) => left.localeCompare(right, 'en'))
}

export async function writeContractArtifacts(
  outputRoot: string,
  generated: ContractGenerationResult,
): Promise<void> {
  for (const [relativePath, content] of generated.files) {
    const absolute = path.join(outputRoot, ...relativePath.split('/'))
    await fs.mkdir(path.dirname(absolute), { recursive: true })
    await fs.writeFile(absolute, content, 'utf8')
  }
  const expectedPaths = new Set(generated.files.keys())
  for (const relativePath of await listJsonFiles(outputRoot)) {
    if (expectedPaths.has(relativePath)) continue
    await fs.rm(path.join(outputRoot, ...relativePath.split('/')), { force: true })
  }
}

export async function checkContractArtifacts(
  outputRoot: string,
  generated: ContractGenerationResult,
): Promise<void> {
  const failures: string[] = []
  const stalePaths: string[] = []
  for (const [relativePath, expected] of generated.files) {
    const absolute = path.join(outputRoot, ...relativePath.split('/'))
    let actual: string
    try {
      actual = await fs.readFile(absolute, 'utf8')
    } catch {
      failures.push(`缺失 ${relativePath}`)
      continue
    }
    if (actual !== expected) stalePaths.push(relativePath)
  }
  if (stalePaths.length > 0) {
    failures.push(...stalePaths.map((relativePath) => `合同生成物过期 ${relativePath}`))
  }
  const expectedPaths = new Set(generated.files.keys())
  for (const relativePath of await listJsonFiles(outputRoot)) {
    if (!expectedPaths.has(relativePath)) failures.push(`多余 ${relativePath}`)
  }
  if (failures.length > 0) {
    throw new Error(
      `合同清单生成检查失败：\n${failures.map((item) => `- ${item}`).join('\n')}\n` +
      '请运行 npm run generate:contracts 后重试。',
    )
  }
}

interface CliOptions {
  check: boolean
  projectRoot: string
  outputRoot: string
}

function parseCliOptions(argv: readonly string[]): CliOptions {
  let check = false
  let projectRoot = defaultProjectRoot
  let outputRoot: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--check') {
      check = true
      continue
    }
    if (argument === '--project-root' || argument === '--output-root') {
      const value = argv[index + 1]
      if (!value) throw new Error(`${argument} 缺少路径参数。`)
      index += 1
      if (argument === '--project-root') projectRoot = path.resolve(value)
      else if (argument === '--output-root') outputRoot = path.resolve(value)
      continue
    }
    throw new Error(`未知参数：${argument}`)
  }
  return {
    check,
    projectRoot,
    outputRoot: outputRoot ?? path.join(projectRoot, 'artifacts', 'contracts'),
  }
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2))
  const generated = generateContractArtifacts({
    projectRoot: options.projectRoot,
    outputRoot: options.outputRoot,
  })
  if (options.check) {
    await checkContractArtifacts(options.outputRoot, generated)
    console.log(
      `合同 JSON 快照已是最新状态；共 ${generated.files.size} 个合同产物文件通过校验。`,
    )
    return
  }
  await writeContractArtifacts(options.outputRoot, generated)
  console.log(
    `已生成 ${generated.files.size} 个合同产物文件到 ${options.outputRoot}。`,
  )
}

const invokedPath = process.argv[1]
if (invokedPath && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
