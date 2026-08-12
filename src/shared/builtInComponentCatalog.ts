import type { ComponentCatalogTrust } from './componentCatalog'

/** SHA-256 of the reviewed official catalog shipped with this editor build. */
export const BUILT_IN_COMPONENT_CATALOG_SHA256 =
  '407aa7311f115c80df9f37ef284302531765ccfaee197fd248e2104975063a3e'

export function trustForManagedCatalogDigest(digest: string): ComponentCatalogTrust {
  return digest.toLocaleLowerCase('en-US') === BUILT_IN_COMPONENT_CATALOG_SHA256
    ? 'built-in'
    : 'prompt'
}
