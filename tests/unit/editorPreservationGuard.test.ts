// @vitest-environment node

import { beforeAll, describe, expect, it } from 'vitest'
import {
  cloneRepositorySnapshot,
  createRepositorySnapshot,
  deleteSnapshotPath,
  type RepositorySnapshot,
  setSnapshotText,
  verifyRepositorySnapshot,
} from '../../scripts/verify-editor-preservation'

let repositorySnapshot: RepositorySnapshot

beforeAll(() => {
  repositorySnapshot = createRepositorySnapshot()
})

describe('editor preservation guard', () => {
  it('accepts the current transition repository without mutating the worktree', async () => {
    await expect(verifyRepositorySnapshot(repositorySnapshot, { entryMode: 'transition' }))
      .resolves.toBeUndefined()
  })

  it('fails when the original Workspace path is deleted in memory', async () => {
    const mutated = cloneRepositorySnapshot(repositorySnapshot)
    deleteSnapshotPath(mutated, 'src/renderer/ui/Workspace.tsx')

    await expect(verifyRepositorySnapshot(mutated, { entryMode: 'transition' }))
      .rejects.toMatchObject({ code: 'CORE_FILE_MISSING' })
  })

  it('fails when a ConvergedEditorApp replacement path is added in memory', async () => {
    const mutated = cloneRepositorySnapshot(repositorySnapshot)
    setSnapshotText(
      mutated,
      'src/renderer/converged/ConvergedEditorApp.tsx',
      'export default function ConvergedEditorApp() { return null }\n',
    )

    await expect(verifyRepositorySnapshot(mutated, { entryMode: 'transition' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN_FRONTEND_PATH' })
  })

  it('passes a V8-only entry and fails if ProductApp reimports CourseStudioApp', async () => {
    const v8Only = cloneRepositorySnapshot(repositorySnapshot)
    setSnapshotText(v8Only, 'src/renderer/ProductApp.tsx', `
import LegacyApp from './App'
export default function ProductApp() {
  return <LegacyApp />
}
`)
    await expect(verifyRepositorySnapshot(v8Only, { entryMode: 'v8-only' }))
      .resolves.toBeUndefined()

    const reintroduced = cloneRepositorySnapshot(v8Only)
    setSnapshotText(reintroduced, 'src/renderer/ProductApp.tsx', `
import LegacyApp from './App'
import CourseStudioApp from './course/CourseStudioApp'
void CourseStudioApp
export default function ProductApp() {
  return <LegacyApp />
}
`)
    await expect(verifyRepositorySnapshot(reintroduced, { entryMode: 'v8-only' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN_ENTRY_REACHABLE' })
  })
})
