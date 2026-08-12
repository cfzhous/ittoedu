import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  projectValidationExitCode,
  serializeProjectValidationReport,
  unreadableProjectValidationReport,
  validateProjectArchiveBytes,
  type ProjectValidationFatalError,
} from '../src/renderer/project/validateProjectArchive'

interface ValidationCliIo {
  stdout(value: string): void
  stderr(value: string): void
  read(path: string): Promise<Uint8Array>
}

const defaultIo: ValidationCliIo = {
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
  read: async (filename) => readFile(filename),
}

function fatal(
  filename: string,
  error: ProjectValidationFatalError,
  io: ValidationCliIo,
): 2 {
  const report = unreadableProjectValidationReport(filename, error)
  io.stdout(serializeProjectValidationReport(report))
  io.stderr(`${error.title}：${error.message}\n`)
  return 2
}

export async function runValidateProjectCli(
  argv: readonly string[],
  io: ValidationCliIo = defaultIo,
): Promise<0 | 1 | 2> {
  if (argv.length !== 1 || argv[0]?.startsWith('-')) {
    return fatal('', {
      code: 'usage-error',
      title: '参数错误',
      message: '用法：npm run --silent validate:project -- <project.h5lesson>',
    }, io)
  }

  const inputPath = path.resolve(argv[0])
  const filename = path.basename(inputPath)
  if (path.extname(inputPath).toLowerCase() !== '.h5lesson') {
    return fatal(filename, {
      code: 'usage-error',
      title: '文件类型不支持',
      message: '无界面工程校验只接受当前 Project V8 .h5lesson 文件。',
    }, io)
  }

  let bytes: Uint8Array
  try {
    bytes = await io.read(inputPath)
  } catch (error) {
    return fatal(filename, {
      code: 'input-unreadable',
      title: '工程文件不可读',
      message: error instanceof Error ? error.message : '无法读取指定文件。',
    }, io)
  }

  const report = validateProjectArchiveBytes(bytes, filename)
  io.stdout(serializeProjectValidationReport(report))
  if (report.fatal) {
    io.stderr(`${report.fatal.title}：${report.fatal.message}\n`)
  }
  return projectValidationExitCode(report)
}

const invokedPath = process.argv[1]
if (
  invokedPath &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  void runValidateProjectCli(process.argv.slice(2))
    .then((exitCode) => { process.exitCode = exitCode })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : '发生未知错误。'
      const report = unreadableProjectValidationReport('', {
        code: 'validation-failed',
        title: '工程校验失败',
        message,
      })
      process.stdout.write(serializeProjectValidationReport(report))
      process.stderr.write(`工程校验失败：${message}\n`)
      process.exitCode = 2
    })
}
