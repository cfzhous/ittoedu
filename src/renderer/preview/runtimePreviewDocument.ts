import runtimePreviewBootstrapSource from './runtimePreviewBootstrap.js?raw'

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeInlineScript(value: string): string {
  return value
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '\\x3C!--')
}

/**
 * Replaces the self-starting standalone Player scripts with a small bridge.
 * The bridge receives the payload and Player bundle only after the sandbox has
 * proved that it belongs to the current preview session.
 */
export function buildRuntimePreviewDocument(
  standaloneHtml: string,
  token: string,
): string {
  const withoutStandaloneScripts = standaloneHtml.replace(
    /\s*<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
    '',
  )
  const bootstrap = `  <script data-token="${escapeHtmlAttribute(token)}">${escapeInlineScript(runtimePreviewBootstrapSource)}</script>\n`

  if (/<\/body\s*>/i.test(withoutStandaloneScripts)) {
    return withoutStandaloneScripts.replace(/<\/body\s*>/i, `${bootstrap}</body>`)
  }
  return `${withoutStandaloneScripts}\n${bootstrap}`
}

export interface RuntimePreviewBlobResources {
  documentUrl: string
  revoke(): void
}

export function createRuntimePreviewBlobResources(
  standaloneHtml: string,
  token: string,
): RuntimePreviewBlobResources {
  // Blob documents inherit the editor CSP. index.html authorizes precisely the
  // hash of this bridge, without enabling arbitrary inline scripts.
  const document = buildRuntimePreviewDocument(standaloneHtml, token)
  const documentUrl = URL.createObjectURL(new Blob([document], {
    type: 'text/html;charset=utf-8',
  }))
  let revoked = false
  return {
    documentUrl,
    revoke() {
      if (revoked) return
      revoked = true
      URL.revokeObjectURL(documentUrl)
    },
  }
}
