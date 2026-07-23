import { UserFacingError } from '@/shared/errors'

export interface ObjectUrlApi {
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
}

function defaultObjectUrlApi(): ObjectUrlApi {
  if (
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof URL.revokeObjectURL !== 'function'
  ) {
    throw new UserFacingError(
      '素材加载失败',
      '当前运行环境不能创建本地素材地址。',
      '请重新启动编辑器后再试。',
    )
  }
  return URL
}

export class BlobUrlRegistry {
  private readonly urls = new Map<string, string>()

  constructor(private readonly urlApi: ObjectUrlApi = defaultObjectUrlApi()) {}

  create(key: string, bytes: Uint8Array, mimeType: string): string {
    if (key.length === 0) {
      throw new TypeError('Blob URL 的键不能为空')
    }
    if (mimeType.length === 0) {
      throw new TypeError('Blob MIME 类型不能为空')
    }

    this.revoke(key)
    const stableBytes = Uint8Array.from(bytes)
    const url = this.urlApi.createObjectURL(new Blob([stableBytes], { type: mimeType }))
    this.urls.set(key, url)
    return url
  }

  get(key: string): string | undefined {
    return this.urls.get(key)
  }

  has(key: string): boolean {
    return this.urls.has(key)
  }

  revoke(key: string): boolean {
    const url = this.urls.get(key)
    if (url === undefined) return false
    this.urls.delete(key)
    this.urlApi.revokeObjectURL(url)
    return true
  }

  revokeAll(): void {
    for (const url of this.urls.values()) {
      this.urlApi.revokeObjectURL(url)
    }
    this.urls.clear()
  }

  dispose(): void {
    this.revokeAll()
  }

  get size(): number {
    return this.urls.size
  }
}

