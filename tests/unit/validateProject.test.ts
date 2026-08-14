import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createCourseProject } from '@/renderer/course/courseStudioModel'
import { createCourseProjectArchive } from '@/renderer/project/courseProjectArchive'
import { runValidateProjectCli } from '../../scripts/validate-project'

function unsupportedV8Archive(): Uint8Array {
  return zipSync({
    'project.json': strToU8(JSON.stringify({ schemaVersion: 8 })),
  })
}

function publicValidatorCommand(
  lessonPath: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const npmCli = process.env.npm_execpath ?? path.resolve(
    path.dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  )
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [npmCli, 'run', '--silent', 'validate:project', '--', lessonPath],
      { cwd: process.cwd(), windowsHide: true },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') {
          reject(error)
          return
        }
        resolve({
          exitCode: typeof error?.code === 'number' ? error.code : 0,
          stdout: String(stdout),
          stderr: String(stderr),
        })
      },
    )
  })
}

describe('Course Project V9 headless validation', () => {
  it('accepts native V9 archives through the public validator', async () => {
    const bytes = createCourseProjectArchive({
      project: createCourseProject({
        id: 'v9-validator',
        title: 'V9 校验课例',
        now: '2026-08-14T00:00:00.000Z',
      }),
      assetFiles: {},
      componentFiles: {},
    })
    const stdout: string[] = []
    const exitCode = await runValidateProjectCli(['v9.h5lesson'], {
      stdout: (value) => stdout.push(value),
      stderr: () => undefined,
      read: async () => bytes,
    })

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      reportVersion: 2,
      status: 'valid',
      schema: { schemaVersion: 9 },
      project: {
        id: 'v9-validator',
        surfaceCount: 1,
        surfaces: { slide: 1 },
      },
    })
  })

  it('keeps stdout machine-readable and rejects every non-V9 archive', async () => {
    const stdout: string[] = []
    const stderr: string[] = []
    const exitCode = await runValidateProjectCli(['lesson.h5lesson'], {
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
      read: async () => unsupportedV8Archive(),
    })

    expect(exitCode).toBe(2)
    expect(stderr.join('')).toContain('课程工程不受支持或已损坏')
    expect(stdout).toHaveLength(1)
    expect(JSON.parse(stdout[0]!)).toMatchObject({
      reportVersion: 2,
      status: 'unreadable',
      fatal: { code: 'archive-invalid' },
    })

    const invalidStdout: string[] = []
    const invalidStderr: string[] = []
    const invalidExit = await runValidateProjectCli([], {
      stdout: (value) => invalidStdout.push(value),
      stderr: (value) => invalidStderr.push(value),
      read: async () => new Uint8Array(),
    })
    expect(invalidExit).toBe(2)
    expect(JSON.parse(invalidStdout[0]!)).toMatchObject({
      status: 'unreadable',
      fatal: { code: 'usage-error' },
    })
    expect(invalidStderr.join('')).toContain('参数错误')
  })

  it('runs the public command with pure JSON, stable exit codes, and no input writes', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'validate-project-cli-'))
    const lessonPath = path.join(directory, 'lesson.h5lesson')
    const v8Path = path.join(directory, 'v8.h5lesson')
    const invalidPath = path.join(directory, 'invalid.h5lesson')
    try {
      const validBytes = createCourseProjectArchive({
        project: createCourseProject({
          id: 'public-v9-validator',
          title: 'V9 公开校验',
          now: '2026-08-14T00:00:00.000Z',
        }),
        assetFiles: {},
        componentFiles: {},
      })
      await writeFile(lessonPath, validBytes)
      const valid = await publicValidatorCommand(lessonPath)
      expect(valid.exitCode).toBe(0)
      expect(valid.stderr).toBe('')
      expect(JSON.parse(valid.stdout)).toMatchObject({
        reportVersion: 2,
        status: 'valid',
        schema: { schemaVersion: 9 },
        project: { id: 'public-v9-validator' },
      })
      expect(await readFile(lessonPath)).toEqual(Buffer.from(validBytes))

      const v8Bytes = unsupportedV8Archive()
      await writeFile(v8Path, v8Bytes)
      const v8Result = await publicValidatorCommand(v8Path)
      expect(v8Result.exitCode).toBe(2)
      expect(v8Result.stderr).toContain('课程工程不受支持或已损坏')
      expect(JSON.parse(v8Result.stdout)).toMatchObject({
        reportVersion: 2,
        status: 'unreadable',
        fatal: { code: 'archive-invalid' },
      })
      expect(await readFile(v8Path)).toEqual(Buffer.from(v8Bytes))

      const invalidBytes = zipSync({ 'project.json': strToU8('{') })
      await writeFile(invalidPath, invalidBytes)
      const invalidResult = await publicValidatorCommand(invalidPath)
      expect(invalidResult.exitCode).toBe(2)
      expect(JSON.parse(invalidResult.stdout)).toMatchObject({
        reportVersion: 2,
        status: 'unreadable',
        fatal: { code: 'archive-invalid' },
      })
      expect(await readFile(invalidPath)).toEqual(Buffer.from(invalidBytes))
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 45_000)
})
