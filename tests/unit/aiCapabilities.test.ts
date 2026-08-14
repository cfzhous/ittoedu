// @vitest-environment node

import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CAPABILITY_INDEX_MAX_BYTES,
  DEFAULT_CAPABILITY_INDEX,
  canonicalCapabilityJson,
  checkCapabilityIndex,
} from '../../scripts/generate-ai-capabilities'
import { loadCapabilityCards, searchCapabilityCards } from '../../agent-kit/index.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )))
})

describe('current Agent Kit capability index', () => {
  it('is canonical, compact and points only to existing product sources', async () => {
    const report = await checkCapabilityIndex()
    expect(report).toEqual(expect.objectContaining({ valid: true, cardCount: 12 }))
    expect(report.bytes).toBeLessThan(CAPABILITY_INDEX_MAX_BYTES)
  })

  it('loads direct cards and finds surface, state and stable patch capabilities', async () => {
    const cards = await loadCapabilityCards(DEFAULT_CAPABILITY_INDEX)
    expect(cards).toHaveLength(12)
    expect(searchCapabilityCards(cards, '长文 flow')[0]?.id).toBe('surface:flow')
    expect(searchCapabilityCards(cards, 'camera zoom')[0]?.id).toBe('surface:spatial-2d')
    expect(searchCapabilityCards(cards, 'revision authoringAddress')[0]?.id)
      .toBe('authoring:stable-patch')
    expect(cards.every((card) => path.isAbsolute(card.source))).toBe(true)
  })

  it('rejects stale protocol values, retired workflow language and missing sources', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ittoedu-capabilities-'))
    temporaryDirectories.push(directory)
    const target = path.join(directory, 'index.json')
    await copyFile(DEFAULT_CAPABILITY_INDEX, target)
    const value = JSON.parse(await readFile(target, 'utf8')) as {
      product: { projectSchemaVersion: number }
      cards: Array<{ purpose: string; source: string }>
    }
    value.product.projectSchemaVersion = 8
    value.cards[0]!.purpose = 'Requires implementation-ready and Review Scope Hash.'
    value.cards[0]!.source = './missing.ts'
    await writeFile(target, canonicalCapabilityJson(value), 'utf8')

    const report = await checkCapabilityIndex(target)
    expect(report.valid).toBe(false)
    expect(report.errors.join('\n')).toMatch(/projectSchemaVersion must be 9/)
    expect(report.errors.join('\n')).toMatch(/Retired workflow term/)
    expect(report.errors.join('\n')).toMatch(/source does not exist/)
  })
})
