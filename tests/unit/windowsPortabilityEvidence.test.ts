import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertEquivalentDirectoryEvidence,
  assertNoForbiddenPathReferences,
  collectDirectoryEvidence,
  summarizeDirectoryEvidence,
} from '../../scripts/windowsPortabilityEvidence'

describe('Windows portability evidence', () => {
  it('proves a moved directory with stable relative paths and SHA-256 values', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ittoedu-portability-unit-'))
    const source = path.join(root, 'source')
    const moved = path.join(root, 'moved')
    try {
      await mkdir(path.join(source, 'resources'), { recursive: true })
      await mkdir(path.join(moved, 'resources'), { recursive: true })
      await writeFile(path.join(source, 'app.exe'), new Uint8Array([1, 2, 3]))
      await writeFile(path.join(source, 'resources', 'app.asar'), 'payload')
      await writeFile(path.join(moved, 'app.exe'), new Uint8Array([1, 2, 3]))
      await writeFile(path.join(moved, 'resources', 'app.asar'), 'payload')

      const sourceEvidence = await collectDirectoryEvidence(source)
      const movedEvidence = await collectDirectoryEvidence(moved)
      expect(() =>
        assertEquivalentDirectoryEvidence(sourceEvidence, movedEvidence),
      ).not.toThrow()
      expect(summarizeDirectoryEvidence(sourceEvidence)).toEqual({
        fileCount: 2,
        totalBytes: 10,
        manifestSha256: expect.stringMatching(/^[A-F0-9]{64}$/),
      })

      await writeFile(path.join(moved, 'resources', 'app.asar'), 'changed')
      const changedEvidence = await collectDirectoryEvidence(moved)
      expect(() =>
        assertEquivalentDirectoryEvidence(
          sourceEvidence,
          changedEvidence,
        ),
      ).toThrow(/复制目录内容变化 resources\/app\.asar/)

      await writeFile(path.join(moved, 'resources', 'app.asar'), 'payload')
      await writeFile(path.join(moved, 'unexpected.dll'), 'extra')
      const extraEvidence = await collectDirectoryEvidence(moved)
      expect(() =>
        assertEquivalentDirectoryEvidence(
          sourceEvidence,
          extraEvidence,
        ),
      ).toThrow(/复制目录多出 unexpected\.dll/)

      await rm(path.join(moved, 'unexpected.dll'), { force: true })
      await rm(path.join(moved, 'app.exe'), { force: true })
      const missingEvidence = await collectDirectoryEvidence(moved)
      expect(() =>
        assertEquivalentDirectoryEvidence(
          sourceEvidence,
          missingEvidence,
        ),
      ).toThrow(/复制目录缺少 app\.exe/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects Windows absolute paths in either slash form, case-insensitively', () => {
    const root = 'C:\\Users\\Teacher\\courseware-components'
    expect(() =>
      assertNoForbiddenPathReferences('Project', '{"source":"embedded"}', [root]),
    ).not.toThrow()
    expect(() =>
      assertNoForbiddenPathReferences(
        'Project',
        '{"source":"c:/users/teacher/courseware-components/counter"}',
        [root],
      ),
    ).toThrow(/外部绝对路径/)
    expect(() =>
      assertNoForbiddenPathReferences(
        'HTML',
        'C:\\USERS\\TEACHER\\COURSEWARE-COMPONENTS',
        [root],
      ),
    ).toThrow(/外部绝对路径/)
  })
})
