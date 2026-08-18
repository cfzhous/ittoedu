import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('Read model boundary checks', () => {
  it('NodesTab does not import archive or migration modules directly', () => {
    const nodesTabPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../src/renderer/ui/NodesTab.tsx',
    )
    const source = readFileSync(nodesTabPath, 'utf8')

    expect(source).not.toMatch(/courseProjectArchive/)
    expect(source).not.toMatch(/courseProjectMigration/)
    expect(source).not.toMatch(/from ['"]@\/renderer\/project\/courseProjectArchive['"]/)
    expect(source).not.toMatch(/from ['"]@\/renderer\/project\/courseProjectMigration['"]/)
    expect(source).not.toMatch(/from ['"]\.\.\/store\/slideEditorProjection['"]/)
  })
})
