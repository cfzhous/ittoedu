import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

const COMPONENT_CONTENT_DIGEST_DOMAIN =
  'ittoedu.courseware-component-content-sha256.v1\0'
const encoder = new TextEncoder()

function unsignedLength(value: number, bytes: 4 | 8): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`无法编码无效长度：${value}`)
  }
  const result = new Uint8Array(bytes)
  const view = new DataView(result.buffer)
  if (bytes === 4) view.setUint32(0, value, false)
  else view.setBigUint64(0, BigInt(value), false)
  return result
}

function compareBytes(left: Uint8Array, right: Uint8Array): number {
  const length = Math.min(left.byteLength, right.byteLength)
  for (let index = 0; index < length; index += 1) {
    const difference = left[index]! - right[index]!
    if (difference !== 0) return difference
  }
  return left.byteLength - right.byteLength
}

/**
 * Hashes executable component content independently of ZIP entry order,
 * timestamps and compression. Versioned domain and length prefixes make every
 * path/file boundary unambiguous.
 */
export function componentContentSha256(
  files: Readonly<Record<string, Uint8Array>>,
): string {
  const entries = Object.entries(files)
    .map(([path, bytes]) => ({ pathBytes: encoder.encode(path), bytes }))
    .sort((left, right) => compareBytes(left.pathBytes, right.pathBytes))

  const digest = sha256.create()
  digest.update(encoder.encode(COMPONENT_CONTENT_DIGEST_DOMAIN))
  digest.update(unsignedLength(entries.length, 4))
  for (const entry of entries) {
    digest.update(unsignedLength(entry.pathBytes.byteLength, 4))
    digest.update(entry.pathBytes)
    digest.update(unsignedLength(entry.bytes.byteLength, 8))
    digest.update(entry.bytes)
  }
  return bytesToHex(digest.digest())
}
