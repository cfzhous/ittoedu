// @vitest-environment node

import { execFile } from 'node:child_process'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const root = path.resolve(__dirname, '..', '..')
const installer = path.join(root, 'scripts', 'install-courseware-skills.ps1')
const windowsDescribe = process.platform === 'win32' ? describe : describe.skip

let temporaryRoot = ''
let sourceRoot = ''
let destinationRoot = ''

async function exists(filename: string): Promise<boolean> {
  try {
    await access(filename)
    return true
  } catch {
    return false
  }
}

async function createSkill(parent: string, name: string, body: string): Promise<void> {
  const directory = path.join(parent, name)
  await mkdir(path.join(directory, 'agents'), { recursive: true })
  await writeFile(
    path.join(directory, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Test.\n---\n\n${body}\n`,
    'utf8',
  )
  await writeFile(path.join(directory, 'agents', 'openai.yaml'), 'interface: {}\n', 'utf8')
}

async function runInstaller(options: { source?: string; destination?: string } = {}) {
  return execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      installer,
      '-SourceRoot',
      options.source ?? sourceRoot,
      '-DestinationRoot',
      options.destination ?? destinationRoot,
    ],
    { encoding: 'utf8' },
  )
}

beforeEach(async () => {
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'ittoedu-skill-install-'))
  sourceRoot = path.join(temporaryRoot, 'source')
  destinationRoot = path.join(temporaryRoot, 'destination')
  await mkdir(sourceRoot, { recursive: true })
  await createSkill(sourceRoot, 'orchestrate-courseware', 'orchestrate-v1')
  await createSkill(sourceRoot, 'build-courseware-project', 'build-v1')
})

afterEach(async () => {
  await rm(temporaryRoot, { recursive: true, force: true })
})

windowsDescribe('thin local Skill installer', () => {
  it('installs exactly the two current Skills and removes exact retired directories', async () => {
    await createSkill(destinationRoot, 'build-project-v8-courseware', 'retired-v8')
    await createSkill(destinationRoot, 'build-project-v7-courseware', 'retired-v7')
    await createSkill(destinationRoot, 'personal-skill', 'keep-me')

    const result = await runInstaller()

    expect(result.stdout).toContain('Installed: orchestrate-courseware, build-courseware-project')
    expect(await exists(path.join(destinationRoot, 'orchestrate-courseware', 'SKILL.md'))).toBe(true)
    expect(await exists(path.join(destinationRoot, 'build-courseware-project', 'SKILL.md'))).toBe(true)
    expect(await exists(path.join(destinationRoot, 'build-project-v8-courseware'))).toBe(false)
    expect(await exists(path.join(destinationRoot, 'build-project-v7-courseware'))).toBe(false)
    expect(await exists(path.join(destinationRoot, 'personal-skill', 'SKILL.md'))).toBe(true)
  })

  it('replaces the managed directories from source without retaining stale files or state manifests', async () => {
    await runInstaller()
    await writeFile(
      path.join(destinationRoot, 'build-courseware-project', 'stale.md'),
      'obsolete',
      'utf8',
    )
    await writeFile(
      path.join(sourceRoot, 'build-courseware-project', 'SKILL.md'),
      '---\nname: build-courseware-project\ndescription: Test.\n---\n\nbuild-v2\n',
      'utf8',
    )

    await runInstaller()

    expect(await readFile(
      path.join(destinationRoot, 'build-courseware-project', 'SKILL.md'),
      'utf8',
    )).toContain('build-v2')
    expect(await exists(path.join(destinationRoot, 'build-courseware-project', 'stale.md'))).toBe(false)
    expect(await exists(path.join(destinationRoot, '.ittoedu-courseware-editor-managed-skills.json')))
      .toBe(false)
  })

  it('rejects missing Skill sources before changing existing targets', async () => {
    await mkdir(destinationRoot, { recursive: true })
    await writeFile(path.join(destinationRoot, 'marker.txt'), 'unchanged', 'utf8')
    await rm(path.join(sourceRoot, 'build-courseware-project'), { recursive: true })

    await expect(runInstaller()).rejects.toMatchObject({ code: expect.any(Number) })
    expect(await readFile(path.join(destinationRoot, 'marker.txt'), 'utf8')).toBe('unchanged')
    expect(await exists(path.join(destinationRoot, 'orchestrate-courseware'))).toBe(false)
  })

  it('rejects using the source tree as the destination', async () => {
    await expect(runInstaller({ destination: sourceRoot })).rejects.toMatchObject({
      code: expect.any(Number),
    })
    expect(await readFile(path.join(sourceRoot, 'orchestrate-courseware', 'SKILL.md'), 'utf8'))
      .toContain('orchestrate-v1')
  })
})
