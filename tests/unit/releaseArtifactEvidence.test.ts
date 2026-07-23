import { createPackage } from '@electron/asar'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertExpectedAsarPackage,
  assertExpectedWindowsVersion,
  collectFileArtifactEvidence,
  isExpectedWindowsVersion,
  readAsarPackageMetadata,
} from '../../scripts/releaseArtifactEvidence'

describe('release artifact version evidence', () => {
  it('accepts only the expected Windows FileVersion/ProductVersion forms', () => {
    expect(isExpectedWindowsVersion('1.6.0', '1.6.0')).toBe(true)
    expect(isExpectedWindowsVersion('1.6.0.0', '1.6.0')).toBe(true)
    expect(isExpectedWindowsVersion('1.5.0', '1.6.0')).toBe(false)
    expect(isExpectedWindowsVersion('1.6.0.1', '1.6.0')).toBe(false)

    expect(() =>
      assertExpectedWindowsVersion(
        {
          fileVersion: '1.5.0',
          productVersion: '1.5.0.0',
          productName: 'Phaser Courseware Editor',
        },
        '1.6.0',
        'win-unpacked exe',
      ),
    ).toThrow(/win-unpacked exe.*1\.5\.0.*期望 1\.6\.0/)
  })

  it('reads the packaged application identity and hashes the actual app.asar', async () => {
    const temporaryRoot = await mkdtemp(
      path.join(tmpdir(), 'courseware-release-evidence-'),
    )
    const applicationDirectory = path.join(temporaryRoot, 'application')
    const asarPath = path.join(temporaryRoot, 'app.asar')
    try {
      await mkdir(applicationDirectory)
      await writeFile(
        path.join(applicationDirectory, 'package.json'),
        JSON.stringify({
          name: 'phaser-courseware-editor',
          version: '1.6.0',
          productName: 'Phaser Courseware Editor',
        }),
        'utf8',
      )
      await createPackage(applicationDirectory, asarPath)

      const metadata = readAsarPackageMetadata(asarPath)
      expect(metadata).toEqual({
        name: 'phaser-courseware-editor',
        version: '1.6.0',
        productName: 'Phaser Courseware Editor',
      })
      expect(() =>
        assertExpectedAsarPackage(
          metadata,
          'phaser-courseware-editor',
          '1.6.0',
        ),
      ).not.toThrow()
      expect(() =>
        assertExpectedAsarPackage(
          metadata,
          'phaser-courseware-editor',
          '1.5.0',
        ),
      ).toThrow(/app\.asar.*1\.6\.0.*期望.*1\.5\.0/)

      const evidence = await collectFileArtifactEvidence(asarPath)
      expect(evidence.path).toBe(asarPath)
      expect(evidence.sizeBytes).toBeGreaterThan(0)
      expect(evidence.sha256).toMatch(/^[A-F0-9]{64}$/)
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  })
})
