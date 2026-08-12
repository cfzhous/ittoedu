// @vitest-environment node

import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DiagnosticLog } from '../../src/main/diagnosticLog'
import { APP_NAME } from '../../src/shared/constants'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true }),
  ))
})

describe('DiagnosticLog', () => {
  it('serializes concurrent entries and produces a support report', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'courseware-log-'))
    directories.push(directory)
    const log = new DiagnosticLog(directory)

    await Promise.all([
      log.append({ source: 'renderer', message: 'first' }),
      log.append({ source: 'component', message: 'second', stack: 'stack' }),
    ])
    const report = await log.report()

    expect(report).toContain(`${APP_NAME}诊断报告`)
    expect(report).toContain('"message":"first"')
    expect(report).toContain('"message":"second"')
    expect(report).toContain('"source":"component"')
  })
})
