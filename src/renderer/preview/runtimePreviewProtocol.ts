export interface RuntimePreviewMessageEnvelope {
  type?: unknown
  token?: unknown
}

export type RuntimePreviewBootstrapMessageType =
  | 'courseware-preview-bootstrap:ready'
  | 'courseware-preview-bootstrap:error'

/**
 * Player events are accepted only from the payload currently installed in the
 * sandbox. `event.source` is insufficient because an iframe keeps the same
 * contentWindow identity across srcDoc navigations.
 */
export function isCurrentRuntimePreviewPlayerMessage(
  message: RuntimePreviewMessageEnvelope | null,
  expectedToken: string | null | undefined,
): boolean {
  return typeof expectedToken === 'string' &&
    expectedToken.length > 0 &&
    message?.token === expectedToken
}

export function isCurrentRuntimePreviewBootstrapMessage(
  message: RuntimePreviewMessageEnvelope | null,
  expectedToken: string | null | undefined,
  expectedType: RuntimePreviewBootstrapMessageType,
): boolean {
  return message?.type === expectedType &&
    typeof expectedToken === 'string' &&
    expectedToken.length > 0 &&
    message.token === expectedToken
}
