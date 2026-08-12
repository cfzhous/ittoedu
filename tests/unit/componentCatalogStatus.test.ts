import { describe, expect, it } from 'vitest'
import type { AvailableComponentCatalogPackage } from '@/shared/componentCatalog'
import type { ComponentPackageData, ComponentManifest } from '@/shared/componentTypes'
import {
  compareSemanticVersions,
  componentCatalogInstallStatus,
} from '@/renderer/components/componentCatalogStatus'

const manifest: ComponentManifest = {
  schemaVersion: 4,
  runtimeApiVersion: 4,
  renderMode: 'dom',
  supportedScopes: ['scene'],
  id: 'com.example.card',
  name: '卡片',
  version: '1.0.0',
  entry: 'runtime.js',
  defaultSize: { width: 320, height: 180 },
  minSize: { width: 160, height: 90 },
  preserveAspectRatio: false,
  assets: {},
  defaultProps: { content: { title: '卡片' } },
}

const entry: AvailableComponentCatalogPackage = {
  packageId: manifest.id,
  version: manifest.version,
  name: manifest.name,
  description: '测试卡片',
  subject: [],
  schoolStage: [],
  tags: [],
  packagePath: 'packages/card.h5component',
  thumbnailPath: 'thumb.svg',
  sha256: 'a'.repeat(64),
  componentSchemaVersion: 4,
  runtimeApiVersion: 4,
  renderMode: 'dom',
  supportedScopes: ['scene'],
  quality: 'experimental',
  maintainer: 'unassigned',
  verifiedCases: [],
  sourceId: 'source:test',
  sourceLabel: '测试目录',
  sourceTrust: 'prompt',
}

function embedded(version = '1.0.0', sha256?: string): ComponentPackageData {
  return {
    manifest: { ...manifest, version },
    runtimeSource: 'CoursewareComponent.define({ runtimeApiVersion: 4 })',
    files: {},
    ...(sha256
      ? {
          provenance: {
            sha256,
            importedAt: '2026-08-10T00:00:00.000Z',
            sourceLabel: '测试目录',
          },
        }
      : {}),
  }
}

describe('组件目录版本与哈希状态', () => {
  it('正确比较语义化版本', () => {
    expect(compareSemanticVersions('1.10.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareSemanticVersions('2.0.0-beta.1', '2.0.0')).toBeLessThan(0)
    expect(compareSemanticVersions('2.0.0-beta.10', '2.0.0-beta.2')).toBeGreaterThan(0)
    expect(compareSemanticVersions('2.0.0-2', '2.0.0-alpha')).toBeLessThan(0)
    expect(compareSemanticVersions('1.0.0', '1.0.0')).toBe(0)
  })

  it('区分未嵌入、精确锁定、可更新和同版本冲突', () => {
    expect(componentCatalogInstallStatus(entry, undefined)).toBe('available')
    expect(componentCatalogInstallStatus(entry, embedded('1.0.0', entry.sha256)))
      .toBe('embedded')
    expect(componentCatalogInstallStatus(
      { ...entry, version: '1.1.0' },
      embedded('1.0.0', entry.sha256),
    )).toBe('update-available')
    expect(componentCatalogInstallStatus(entry, embedded('1.0.0', 'b'.repeat(64))))
      .toBe('hash-conflict')
    expect(componentCatalogInstallStatus(entry, embedded())).toBe('embedded-unverified')
  })
})
