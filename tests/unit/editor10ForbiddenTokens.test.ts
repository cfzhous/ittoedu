import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const FORBIDDEN_TOKENS = [
  'v9-slide-candidate',
  'V8SlideBackend',
  'V8_SLIDE_BACKEND',
  'migrateProjectV8ToCourseProjectV9',
  'build-project-v8-courseware',
  '导入旧版工程',
  'legacy-runtime-v2',
  'legacy-whole-canvas',
  'isV9SlideCandidateBackend',
  'selectSlideCandidateBackend',
  'executeSlideCandidateCommand',
] as const

type ForbiddenToken = (typeof FORBIDDEN_TOKENS)[number]

/**
 * Whitelist of known technical debt paths containing forbidden tokens.
 * Paths are normalized to POSIX style relative to the repository root (e.g. 'src/...').
 *
 * Rules:
 * 1. Every path here must currently hit the token in src/ (ratchet against rotting whitelist).
 * 2. No unexpected files in src/ may contain forbidden tokens.
 */
const WHITELIST: Record<ForbiddenToken, string[]> = {
  'v9-slide-candidate': [],
  V8SlideBackend: [],
  V8_SLIDE_BACKEND: [],
  migrateProjectV8ToCourseProjectV9: [
    'src/renderer/store/editorStore.ts',
    'src/shared/courseProjectModel.ts',
  ],
  'build-project-v8-courseware': [],
  导入旧版工程: [],
  'legacy-runtime-v2': [
    'src/renderer/store/editorStore.ts',
    'src/shared/courseProjectModel.ts',
    'src/shared/courseProjectSchema.ts',
    'src/shared/courseProjectTypes.ts',
    'src/shared/publishedCourseSchema.ts',
    'src/shared/publishedCourseTypes.ts',
  ],
  'legacy-whole-canvas': [
    'src/renderer/store/editorStore.ts',
    'src/shared/courseProjectModel.ts',
    'src/shared/courseProjectSchema.ts',
    'src/shared/courseProjectTypes.ts',
  ],
  isV9SlideCandidateBackend: [],
  selectSlideCandidateBackend: [],
  executeSlideCandidateCommand: [],
}

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir)
  const results: string[] = []

  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) {
      continue
    }
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      results.push(...collectSourceFiles(fullPath))
    } else if (stat.isFile()) {
      const ext = extname(entry)
      if (ext === '.ts' || ext === '.tsx') {
        results.push(fullPath)
      }
    }
  }

  return results
}

describe('Editor 1.0 forbidden tokens ratchet', () => {
  const repoRoot = join(fileURLToPath(import.meta.url), '../../..')
  const srcRoot = join(repoRoot, 'src')
  const allSourceFiles = collectSourceFiles(srcRoot)

  // Pre-scan all files for all tokens
  const tokenHits: Record<ForbiddenToken, { filePath: string; lines: number[] }[]> = {
    'v9-slide-candidate': [],
    V8SlideBackend: [],
    V8_SLIDE_BACKEND: [],
    migrateProjectV8ToCourseProjectV9: [],
    'build-project-v8-courseware': [],
    导入旧版工程: [],
    'legacy-runtime-v2': [],
    'legacy-whole-canvas': [],
    isV9SlideCandidateBackend: [],
    selectSlideCandidateBackend: [],
    executeSlideCandidateCommand: [],
  }

  for (const filePath of allSourceFiles) {
    const relPath = relative(repoRoot, filePath).replace(/\\/g, '/')
    const content = readFileSync(filePath, 'utf8')
    const lines = content.split('\n')

    for (const token of FORBIDDEN_TOKENS) {
      const matchedLines: number[] = []
      lines.forEach((line, index) => {
        if (line.includes(token)) {
          matchedLines.push(index + 1)
        }
      })
      if (matchedLines.length > 0) {
        tokenHits[token].push({ filePath: relPath, lines: matchedLines })
      }
    }
  }

  for (const token of FORBIDDEN_TOKENS) {
    it(`enforces ratchet and whitelist for token: "${token}"`, () => {
      const hits = tokenHits[token]
      const actualHitPaths = hits.map((h) => h.filePath).sort()
      const allowedPaths = [...WHITELIST[token]].sort()

      // 1. Ratchet: no unwhitelisted file in src/ contains the forbidden token
      const unexpectedHits = actualHitPaths.filter((p) => !allowedPaths.includes(p))
      if (unexpectedHits.length > 0) {
        const details = unexpectedHits.map((p) => {
          const hit = hits.find((h) => h.filePath === p)
          return `${p} (lines: ${hit?.lines.join(', ')})`
        })
        expect.fail(
          `Found unwhitelisted occurrences of forbidden token "${token}":\n  ${details.join('\n  ')}`,
        )
      }

      // 2. Anti-rot: all whitelisted files must still contain the token
      const staleWhitelist = allowedPaths.filter((p) => !actualHitPaths.includes(p))
      if (staleWhitelist.length > 0) {
        expect.fail(
          `Whitelist contains paths that no longer contain forbidden token "${token}":\n  ${staleWhitelist.join('\n  ')}`,
        )
      }

      expect(actualHitPaths).toEqual(allowedPaths)
    })
  }
})
