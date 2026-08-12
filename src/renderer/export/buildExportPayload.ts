import type {
  ComponentManifest,
  ComponentPackageData,
  ExportPayload,
} from '../../shared/componentTypes'
import type { ProjectDocument } from '../../shared/projectTypes'
import { bytesToDataUrl } from './base64'
import { assertExportPayloadDependencies } from './exportPayloadSupport'

export interface BinaryExportAsset {
  bytes: Uint8Array
  mimeType?: string
  meta?: {
    mimeType?: string
  }
}

export interface DataUrlExportAsset {
  dataUrl: string
  mimeType?: string
}

export type ExportAssetSource =
  | Uint8Array
  | ArrayBuffer
  | BinaryExportAsset
  | DataUrlExportAsset

export type ExportAssetSources = Record<string, ExportAssetSource>

export interface ExportComponentPackageSource {
  manifest: ComponentManifest
  runtimeSource: string
  files?: Record<string, Uint8Array>
  assets?: Record<string, ExportAssetSource>
}

export type ExportComponentSources = Record<
  string,
  ComponentPackageData | ExportComponentPackageSource
>

export interface BuildExportPayloadInput {
  project: ProjectDocument
  assets?: ExportAssetSources
  assetFiles?: ExportAssetSources
  components?: ExportComponentSources
  componentPackages?: ExportComponentSources
}

const MIME_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  json: 'application/json',
  txt: 'text/plain',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  webm: 'video/webm',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function inferMimeType(path: string): string {
  const cleanPath = path.split(/[?#]/, 1)[0] ?? path
  const extension = cleanPath.includes('.')
    ? (cleanPath.split('.').pop()?.toLowerCase() ?? '')
    : ''
  return MIME_TYPES_BY_EXTENSION[extension] ?? 'application/octet-stream'
}

function isDataUrlAsset(source: ExportAssetSource): source is DataUrlExportAsset {
  return (
    typeof source === 'object' &&
    source !== null &&
    'dataUrl' in source &&
    typeof source.dataUrl === 'string'
  )
}

function toUint8Array(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    Object.prototype.toString.call(value) === '[object ArrayBuffer]'
  ) {
    return new Uint8Array(value as ArrayBuffer)
  }
  return null
}

function normalizeAsset(
  source: ExportAssetSource,
  fallbackMimeType: string,
  description: string,
): { mimeType: string; dataUrl: string } {
  if (isDataUrlAsset(source)) {
    if (!/^data:[^,]*,/i.test(source.dataUrl)) {
      throw new Error(`${description} 不是有效的 Data URL`)
    }

    return {
      mimeType: source.mimeType ?? fallbackMimeType,
      dataUrl: source.dataUrl,
    }
  }

  let bytes: Uint8Array
  let mimeType = fallbackMimeType
  const directBytes = toUint8Array(source)

  if (directBytes) {
    bytes = directBytes
  } else if (
    typeof source === 'object' &&
    source !== null &&
    'bytes' in source
  ) {
    const nestedBytes = toUint8Array(source.bytes)
    if (!nestedBytes) {
      throw new Error(`${description} 缺少可导出的二进制数据`)
    }
    bytes = nestedBytes
    mimeType = source.mimeType ?? source.meta?.mimeType ?? fallbackMimeType
  } else {
    throw new Error(`${description} 缺少可导出的二进制数据`)
  }

  return {
    mimeType,
    dataUrl: bytesToDataUrl(bytes, mimeType),
  }
}

function findComponentSource(
  components: ExportComponentSources,
  recordKey: string,
  packageId: string,
  version: string,
): ComponentPackageData | ExportComponentPackageSource | undefined {
  const exact =
    components[recordKey] ??
    components[`${packageId}@${version}`] ??
    components[packageId]

  if (exact) {
    return exact
  }

  return Object.values(components).find(
    ({ manifest }) => manifest.id === packageId && manifest.version === version,
  )
}

function componentAssetSource(
  component: ComponentPackageData | ExportComponentPackageSource,
  assetKey: string,
  assetPath: string,
): ExportAssetSource | undefined {
  const explicitAsset =
    'assets' in component
      ? component.assets?.[assetKey] ?? component.assets?.[assetPath]
      : undefined
  if (explicitAsset) {
    return explicitAsset
  }

  return component.files?.[assetPath]
}

function normalizeArguments(
  inputOrProject: BuildExportPayloadInput | ProjectDocument,
  assets?: ExportAssetSources,
  components?: ExportComponentSources,
): Required<Pick<BuildExportPayloadInput, 'project'>> & {
  assets: ExportAssetSources
  components: ExportComponentSources
} {
  if ('project' in inputOrProject) {
    return {
      project: inputOrProject.project,
      assets: inputOrProject.assets ?? inputOrProject.assetFiles ?? {},
      components:
        inputOrProject.components ?? inputOrProject.componentPackages ?? {},
    }
  }

  return {
    project: inputOrProject,
    assets: assets ?? {},
    components: components ?? {},
  }
}

export function buildExportPayload(input: BuildExportPayloadInput): ExportPayload
export function buildExportPayload(
  project: ProjectDocument,
  assets: ExportAssetSources,
  components: ExportComponentSources,
): ExportPayload
export function buildExportPayload(
  inputOrProject: BuildExportPayloadInput | ProjectDocument,
  assetSources?: ExportAssetSources,
  componentSources?: ExportComponentSources,
): ExportPayload {
  const { project, assets, components } = normalizeArguments(
    inputOrProject,
    assetSources,
    componentSources,
  )

  const exportedAssets: ExportPayload['assets'] = {}
  for (const [recordKey, meta] of Object.entries(project.assets)) {
    const source = assets[recordKey] ?? assets[meta.id] ?? assets[meta.path]
    if (!source) {
      throw new Error(`素材“${meta.filename}”缺少二进制数据，无法导出`)
    }

    exportedAssets[meta.id] = normalizeAsset(
      source,
      meta.mimeType,
      `素材“${meta.filename}”`,
    )
  }

  const exportedComponents: ExportPayload['components'] = {}
  for (const [recordKey, meta] of Object.entries(project.componentPackages)) {
    const component = findComponentSource(
      components,
      recordKey,
      meta.packageId,
      meta.version,
    )
    if (!component) {
      throw new Error(`组件“${meta.name}”缺少包内容，无法导出`)
    }
    if (
      component.manifest.id !== meta.packageId ||
      component.manifest.version !== meta.version
    ) {
      throw new Error(`组件“${meta.name}”的 ID 或版本与工程记录不一致`)
    }
    if (!component.runtimeSource.trim()) {
      throw new Error(`组件“${meta.name}”缺少 runtime.js`)
    }

    const exportedComponentAssets: ExportPayload['components'][string]['assets'] =
      {}
    for (const [assetKey, assetPath] of Object.entries(component.manifest.assets)) {
      const source = componentAssetSource(component, assetKey, assetPath)
      if (!source) {
        throw new Error(`组件“${meta.name}”缺少素材“${assetPath}”`)
      }
      exportedComponentAssets[assetKey] = normalizeAsset(
        source,
        inferMimeType(assetPath),
        `组件素材“${assetPath}”`,
      )
    }

    exportedComponents[recordKey] = {
      manifest: cloneJson(component.manifest),
      runtimeSource: component.runtimeSource,
      assets: exportedComponentAssets,
    }
  }

  const payload: ExportPayload = {
    project: cloneJson(project),
    assets: exportedAssets,
    components: exportedComponents,
  }
  assertExportPayloadDependencies(payload)
  return payload
}
