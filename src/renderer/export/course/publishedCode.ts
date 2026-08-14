import type { PublishedCourseExecutableCode } from '../../../shared/publishedCourseTypes'
import { bytesToBase64 } from '../base64'

/** Encode executable source for the current Published Course V2 payload. */
export function encodePublishedCourseCode(source: string): PublishedCourseExecutableCode {
  const bytes = new Uint8Array(source.length * 2)
  for (let index = 0; index < source.length; index += 1) {
    const codeUnit = source.charCodeAt(index)
    bytes[index * 2] = codeUnit & 0xff
    bytes[index * 2 + 1] = codeUnit >>> 8
  }
  return {
    encoding: 'base64-utf16le',
    data: bytesToBase64(bytes),
  }
}
