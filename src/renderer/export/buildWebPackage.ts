import { strToU8, zip, zipSync } from 'fflate'
import type {
  ComponentManifest,
  ComponentPackageData,
  ExportPayload,
} from '../../shared/componentTypes'
import type { ProjectDocument } from '../../shared/projectTypes'
import { componentPackageKey } from '../project/archivePath'
import { assertV3ExportDependencies } from './v3ExportSupport'

export interface WebPackageOptions {
  playerBundle: string
  lang?: string
}

export interface WebPackageProjectSources {
  project: ProjectDocument
  assetFiles: Readonly<Record<string, Uint8Array>>
  components: Readonly<Record<string, ComponentPackageData>>
}

const PLAYER_STYLES = `
:root {
  color-scheme: dark;
  font-family: Inter, "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif;
  background: #111318;
}

* {
  box-sizing: border-box;
}

html,
body,
#lesson-root {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
}

body {
  background: #111318;
}

.lesson-shell {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 280px;
  min-height: 180px;
  flex-direction: column;
  background: #111318;
}

.lesson-stage {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.lesson-canvas-host {
  width: 100%;
  height: 100%;
}

.lesson-canvas-host canvas {
  display: block;
}

.lesson-footer {
  z-index: 10;
  display: flex;
  min-height: 58px;
  flex: 0 0 58px;
  align-items: center;
  justify-content: flex-end;
  padding: 8px 18px;
  border-top: 1px solid #2b303a;
  background: rgba(21, 24, 30, 0.98);
}

.lesson-controls {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.lesson-control-button {
  min-width: 76px;
  min-height: 38px;
  padding: 8px 14px;
  border: 1px solid #444b59;
  border-radius: 8px;
  color: #f3f5f7;
  background: #272c35;
  font: inherit;
  cursor: pointer;
}

.lesson-control-button:hover:not(:disabled) {
  border-color: #5b9cff;
  background: #303744;
}

.lesson-control-button:focus-visible {
  outline: 2px solid #77adff;
  outline-offset: 2px;
}

.lesson-control-button:disabled {
  color: #737b89;
  cursor: default;
  opacity: 0.72;
}

.lesson-page-indicator {
  min-width: 74px;
  color: #e3e7ed;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.lesson-player-error {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  padding: 32px;
  color: #fecaca;
  background: #1b1114;
  font: 16px/1.6 Inter, "Microsoft YaHei", sans-serif;
  text-align: center;
}

@media (max-height: 360px) {
  .lesson-footer {
    min-height: 46px;
    flex-basis: 46px;
    padding-block: 4px;
  }

  .lesson-control-button {
    min-height: 34px;
    padding-block: 5px;
  }
}

@media (max-width: 420px) {
  .lesson-footer {
    padding-inline: 8px;
  }

  .lesson-controls {
    gap: 4px;
  }

  .lesson-control-button {
    min-width: 58px;
    padding-inline: 6px;
  }

  .lesson-page-indicator {
    min-width: 50px;
  }
}
`.trim()

const EXTENSIONS_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'font/woff': 'woff',
  'font/woff2': 'woff2',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
  'application/json': 'json',
  'text/plain': 'txt',
  'model/gltf-binary': 'glb',
  'model/gltf+json': 'gltf',
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizeOptions(
  playerBundleOrOptions: string | WebPackageOptions,
): Required<WebPackageOptions> {
  if (typeof playerBundleOrOptions === 'string') {
    return { playerBundle: playerBundleOrOptions, lang: 'zh-CN' }
  }

  return {
    playerBundle: playerBundleOrOptions.playerBundle,
    lang: playerBundleOrOptions.lang ?? 'zh-CN',
  }
}

function safeSegment(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 80)

  return normalized && normalized !== '.' && normalized !== '..'
    ? normalized
    : fallback
}

function basename(value: string): string {
  return value.split(/[\\/]/).pop() ?? value
}

function extensionFor(mimeType: string, sourceName: string): string {
  const normalizedMimeType = mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  const knownExtension = EXTENSIONS_BY_MIME_TYPE[normalizedMimeType]
  if (knownExtension) return knownExtension

  const sourceExtension = basename(sourceName).match(/\.([A-Za-z0-9]{1,10})$/)?.[1]
  return sourceExtension?.toLowerCase() ?? 'bin'
}

function mimeTypeForPath(path: string): string {
  const extension = basename(path).match(/\.([A-Za-z0-9]{1,10})$/)?.[1]?.toLowerCase()
  if (!extension) return 'application/octet-stream'
  if (extension === 'jpeg') return 'image/jpeg'
  if (extension === 'm4a') return 'audio/mp4'
  return Object.entries(EXTENSIONS_BY_MIME_TYPE).find(
    ([, candidate]) => candidate === extension,
  )?.[0] ?? 'application/octet-stream'
}

function safeAssetFilename(
  sourceName: string,
  fallbackStem: string,
  mimeType: string,
): string {
  const sourceBaseName = basename(sourceName)
  const sourceStem = sourceBaseName.replace(/\.[^.]*$/, '')
  const stem = safeSegment(sourceStem, fallbackStem)
  return `${stem}.${extensionFor(mimeType, sourceBaseName)}`
}

function decodeBase64(value: string, description: string): Uint8Array {
  const normalized = value.replace(/\s/g, '')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
    throw new Error(`${description} 的 Base64 数据无效`)
  }

  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=')
  const padding = padded.endsWith('==') ? 2 : padded.endsWith('=') ? 1 : 0
  const bytes = new Uint8Array((padded.length / 4) * 3 - padding)
  const chunkSize = 32_768
  let byteOffset = 0

  for (let offset = 0; offset < padded.length; offset += chunkSize) {
    const binary = atob(padded.slice(offset, offset + chunkSize))
    for (let index = 0; index < binary.length; index += 1) {
      bytes[byteOffset] = binary.charCodeAt(index)
      byteOffset += 1
    }
  }

  return bytes
}

function decodePercentEncoded(value: string, description: string): Uint8Array {
  const output: number[] = []
  const encoder = new TextEncoder()
  let cursor = 0

  while (cursor < value.length) {
    const percentIndex = value.indexOf('%', cursor)
    const literalEnd = percentIndex < 0 ? value.length : percentIndex
    if (literalEnd > cursor) {
      for (const byte of encoder.encode(value.slice(cursor, literalEnd))) {
        output.push(byte)
      }
    }
    if (percentIndex < 0) break

    const hex = value.slice(percentIndex + 1, percentIndex + 3)
    if (!/^[\da-f]{2}$/i.test(hex)) {
      throw new Error(`${description} 的百分号编码无效`)
    }
    output.push(Number.parseInt(hex, 16))
    cursor = percentIndex + 3
  }

  return new Uint8Array(output)
}

function dataUrlToBytes(dataUrl: string, description: string): Uint8Array {
  if (!dataUrl.startsWith('data:')) {
    throw new Error(`${description} 不是可打包的 Data URL`)
  }

  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) {
    throw new Error(`${description} 的 Data URL 格式无效`)
  }

  const metadata = dataUrl.slice(5, commaIndex)
  const encodedData = dataUrl.slice(commaIndex + 1)
  const isBase64 = metadata
    .split(';')
    .some((part) => part.trim().toLowerCase() === 'base64')

  return isBase64
    ? decodeBase64(encodedData, description)
    : decodePercentEncoded(encodedData, description)
}

function assertSafePackagePath(archivePath: string): void {
  const segments = archivePath.split('/')
  if (
    archivePath.length === 0 ||
    archivePath.length > 1_024 ||
    archivePath.startsWith('/') ||
    archivePath.includes('\\') ||
    archivePath.includes('\0') ||
    /^[A-Za-z]:/.test(archivePath) ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`网页包包含不安全路径：${archivePath}`)
  }
}

function addFile(
  files: Record<string, Uint8Array>,
  archivePath: string,
  bytes: Uint8Array,
): void {
  assertSafePackagePath(archivePath)
  if (Object.prototype.hasOwnProperty.call(files, archivePath)) {
    throw new Error(`网页包文件路径重复：${archivePath}`)
  }
  files[archivePath] = bytes
}

function paddedIndex(index: number): string {
  return String(index).padStart(3, '0')
}

function findProjectAssetName(payload: ExportPayload, assetId: string): string {
  const direct = Object.prototype.hasOwnProperty.call(
    payload.project.assets,
    assetId,
  )
    ? payload.project.assets[assetId]
    : undefined
  if (direct) return direct.filename

  return (
    Object.values(payload.project.assets).find((asset) => asset.id === assetId)
      ?.filename ?? assetId
  )
}

function componentDirectory(
  manifest: ComponentManifest,
  componentIndex: number,
): string {
  const fallback = `component-${paddedIndex(componentIndex)}`
  const id = safeSegment(manifest.id, fallback)
  const version = safeSegment(manifest.version, 'version')
  return `components/${paddedIndex(componentIndex)}-${id}-${version}`
}

function buildIndexHtml(payload: ExportPayload, lang: string): string {
  return `<!doctype html>
<html lang="${escapeHtmlText(lang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <meta name="courseware-payload" content="./course.json">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src blob:">
  <title>${escapeHtmlText(payload.project.title)}</title>
  <link rel="stylesheet" href="./player/player.css">
</head>
<body>
  <div id="lesson-root" aria-label="${escapeHtmlText(payload.project.title)}"></div>
  <script defer src="./course-data.js"></script>
  <script defer src="./player/player.iife.js"></script>
</body>
</html>
`
}

function finishWebPackageFiles(
  files: Record<string, Uint8Array>,
  packagedPayload: ExportPayload,
  playerBundle: string,
  lang: string,
): Record<string, Uint8Array> {
  const courseJson = JSON.stringify(packagedPayload, null, 2)
  const localFallback =
    `window.__H5_LESSON_PAYLOAD_FALLBACK__=${JSON.stringify(packagedPayload)};\n`

  addFile(files, 'course.json', strToU8(courseJson))
  addFile(files, 'course-data.js', strToU8(localFallback))
  addFile(files, 'player/player.iife.js', strToU8(playerBundle))
  addFile(files, 'player/player.css', strToU8(PLAYER_STYLES))
  addFile(files, 'index.html', strToU8(buildIndexHtml(packagedPayload, lang)))
  return files
}

export function buildWebPackageFiles(
  payload: ExportPayload,
  playerBundle: string,
): Record<string, Uint8Array>
export function buildWebPackageFiles(
  payload: ExportPayload,
  options: WebPackageOptions,
): Record<string, Uint8Array>
export function buildWebPackageFiles(
  payload: ExportPayload,
  playerBundleOrOptions: string | WebPackageOptions,
): Record<string, Uint8Array> {
  const { playerBundle, lang } = normalizeOptions(playerBundleOrOptions)
  if (!playerBundle.trim()) {
    throw new Error('Player Runtime 为空，无法生成网页包')
  }
  assertV3ExportDependencies(payload)

  const files = Object.create(null) as Record<string, Uint8Array>
  const packagedPayload: ExportPayload = {
    project: cloneJson(payload.project),
    assets: Object.create(null) as ExportPayload['assets'],
    components: Object.create(null) as ExportPayload['components'],
  }

  let assetIndex = 0
  for (const [assetId, asset] of Object.entries(payload.assets)) {
    const prefix = paddedIndex(assetIndex)
    const filename = `${prefix}-${safeAssetFilename(
      findProjectAssetName(payload, assetId),
      `asset-${prefix}`,
      asset.mimeType,
    )}`
    const archivePath = `assets/${filename}`
    addFile(
      files,
      archivePath,
      dataUrlToBytes(asset.dataUrl, `工程素材“${assetId}”`),
    )
    packagedPayload.assets[assetId] = {
      mimeType: asset.mimeType,
      dataUrl: `./${archivePath}`,
    }
    assetIndex += 1
  }

  let componentIndex = 0
  for (const [componentKey, component] of Object.entries(payload.components)) {
    const directory = componentDirectory(component.manifest, componentIndex)
    const manifest = cloneJson(component.manifest)
    manifest.entry = 'runtime.js'
    delete manifest.thumbnail
    const packagedAssets = Object.create(null) as ExportPayload['components'][string]['assets']

    let componentAssetIndex = 0
    for (const [assetKey, asset] of Object.entries(component.assets)) {
      const prefix = paddedIndex(componentAssetIndex)
      const sourcePath = Object.prototype.hasOwnProperty.call(
        component.manifest.assets,
        assetKey,
      )
        ? component.manifest.assets[assetKey] ?? assetKey
        : assetKey
      const filename = `${prefix}-${safeAssetFilename(
        sourcePath,
        `asset-${prefix}`,
        asset.mimeType,
      )}`
      const relativeAssetPath = `assets/${filename}`
      const archivePath = `${directory}/${relativeAssetPath}`
      addFile(
        files,
        archivePath,
        dataUrlToBytes(
          asset.dataUrl,
          `组件“${component.manifest.name}”的素材“${assetKey}”`,
        ),
      )
      manifest.assets[assetKey] = relativeAssetPath
      packagedAssets[assetKey] = {
        mimeType: asset.mimeType,
        dataUrl: `./${archivePath}`,
      }
      componentAssetIndex += 1
    }

    addFile(files, `${directory}/runtime.js`, strToU8(component.runtimeSource))
    addFile(files, `${directory}/manifest.json`, strToU8(JSON.stringify(manifest, null, 2)))
    packagedPayload.components[componentKey] = {
      manifest,
      runtimeSource: component.runtimeSource,
      assets: packagedAssets,
    }
    componentIndex += 1
  }

  return finishWebPackageFiles(files, packagedPayload, playerBundle, lang)
}

function findSourceComponent(
  components: Readonly<Record<string, ComponentPackageData>>,
  recordKey: string,
  packageId: string,
  version: string,
): ComponentPackageData | undefined {
  return (
    components[recordKey] ??
    components[componentPackageKey(packageId, version)] ??
    components[packageId] ??
    Object.values(components).find(
      ({ manifest }) => manifest.id === packageId && manifest.version === version,
    )
  )
}

/** Builds package files directly from editor bytes, without a Base64 round-trip. */
export function buildWebPackageFilesFromProject(
  sources: WebPackageProjectSources,
  playerBundleOrOptions: string | WebPackageOptions,
): Record<string, Uint8Array> {
  const { playerBundle, lang } = normalizeOptions(playerBundleOrOptions)
  if (!playerBundle.trim()) {
    throw new Error('Player Runtime 为空，无法生成网页包')
  }
  const files = Object.create(null) as Record<string, Uint8Array>
  const packagedPayload: ExportPayload = {
    project: cloneJson(sources.project),
    assets: Object.create(null) as ExportPayload['assets'],
    components: Object.create(null) as ExportPayload['components'],
  }

  let assetIndex = 0
  for (const [recordKey, meta] of Object.entries(sources.project.assets)) {
    const bytes = sources.assetFiles[recordKey] ?? sources.assetFiles[meta.id]
    if (!bytes) throw new Error(`素材“${meta.filename}”缺少二进制数据，无法导出`)
    if (bytes.byteLength !== meta.byteLength) {
      throw new Error(`素材“${meta.filename}”的字节数与工程记录不一致`)
    }
    const prefix = paddedIndex(assetIndex)
    const filename = `${prefix}-${safeAssetFilename(
      meta.filename,
      `asset-${prefix}`,
      meta.mimeType,
    )}`
    const archivePath = `assets/${filename}`
    addFile(files, archivePath, bytes)
    packagedPayload.assets[meta.id] = {
      mimeType: meta.mimeType,
      dataUrl: `./${archivePath}`,
    }
    assetIndex += 1
  }

  let componentIndex = 0
  for (const [recordKey, meta] of Object.entries(sources.project.componentPackages)) {
    const component = findSourceComponent(
      sources.components,
      recordKey,
      meta.packageId,
      meta.version,
    )
    if (!component) throw new Error(`组件“${meta.name}”缺少包内容，无法导出`)
    if (
      component.manifest.id !== meta.packageId ||
      component.manifest.version !== meta.version
    ) {
      throw new Error(`组件“${meta.name}”的 ID 或版本与工程记录不一致`)
    }
    const directory = componentDirectory(component.manifest, componentIndex)
    const manifest = cloneJson(component.manifest)
    manifest.entry = 'runtime.js'
    delete manifest.thumbnail
    const packagedAssets: ExportPayload['components'][string]['assets'] = Object.create(null) as
      ExportPayload['components'][string]['assets']

    let componentAssetIndex = 0
    for (const [assetKey, assetPath] of Object.entries(component.manifest.assets)) {
      const bytes = component.files[assetPath]
      if (!bytes) throw new Error(`组件“${meta.name}”缺少素材“${assetPath}”`)
      const prefix = paddedIndex(componentAssetIndex)
      const mimeType = mimeTypeForPath(assetPath)
      const filename = `${prefix}-${safeAssetFilename(
        assetPath,
        `asset-${prefix}`,
        mimeType,
      )}`
      const relativeAssetPath = `assets/${filename}`
      const archivePath = `${directory}/${relativeAssetPath}`
      addFile(files, archivePath, bytes)
      manifest.assets[assetKey] = relativeAssetPath
      packagedAssets[assetKey] = {
        mimeType,
        dataUrl: `./${archivePath}`,
      }
      componentAssetIndex += 1
    }

    addFile(files, `${directory}/runtime.js`, strToU8(component.runtimeSource))
    addFile(files, `${directory}/manifest.json`, strToU8(JSON.stringify(manifest, null, 2)))
    packagedPayload.components[recordKey] = {
      manifest,
      runtimeSource: component.runtimeSource,
      assets: packagedAssets,
    }
    componentIndex += 1
  }

  assertV3ExportDependencies(packagedPayload)
  return finishWebPackageFiles(files, packagedPayload, playerBundle, lang)
}

export function buildWebPackage(
  payload: ExportPayload,
  playerBundle: string,
): Uint8Array
export function buildWebPackage(
  payload: ExportPayload,
  options: WebPackageOptions,
): Uint8Array
export function buildWebPackage(
  payload: ExportPayload,
  playerBundleOrOptions: string | WebPackageOptions,
): Uint8Array {
  return zipSync(buildWebPackageFiles(payload, playerBundleOrOptions as WebPackageOptions), {
    level: 6,
  })
}

export function buildWebPackageAsync(
  payload: ExportPayload,
  playerBundle: string,
): Promise<Uint8Array>
export function buildWebPackageAsync(
  payload: ExportPayload,
  options: WebPackageOptions,
): Promise<Uint8Array>
export function buildWebPackageAsync(
  payload: ExportPayload,
  playerBundleOrOptions: string | WebPackageOptions,
): Promise<Uint8Array> {
  const files = buildWebPackageFiles(
    payload,
    playerBundleOrOptions as WebPackageOptions,
  )
  return new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level: 6 }, (error, bytes) => {
      if (error) reject(error)
      else resolve(bytes)
    })
  })
}

export function buildWebPackageFromProjectAsync(
  sources: WebPackageProjectSources,
  playerBundleOrOptions: string | WebPackageOptions,
): Promise<Uint8Array> {
  const files = buildWebPackageFilesFromProject(sources, playerBundleOrOptions)
  return new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level: 6 }, (error, bytes) => {
      if (error) reject(error)
      else resolve(bytes)
    })
  })
}
