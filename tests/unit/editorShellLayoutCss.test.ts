// @vitest-environment node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(
  resolve(process.cwd(), 'src/renderer/styles/globals.css'),
  'utf8',
)

function declarationsFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'u'))
  expect(match, `missing CSS rule for ${selector}`).not.toBeNull()
  return match![1]!
}

describe('editor shell layout CSS contract', () => {
  it('inherits the frozen root geometry but cannot grow beyond the viewport', () => {
    const appShell = declarationsFor('.app-shell')

    expect(appShell).toMatch(/height:\s*100%\s*;/u)
    expect(appShell).toMatch(/max-height:\s*100vh\s*;/u)
    expect(appShell).toMatch(
      /grid-template-rows:\s*52px\s+minmax\(0,\s*1fr\)\s+26px\s*;/u,
    )
  })
})
