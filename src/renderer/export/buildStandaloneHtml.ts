import type { ExportPayload } from '../../shared/componentTypes'
import { jsonToBase64 } from './base64'
import { assertV3ExportDependencies } from './v3ExportSupport'

export interface StandaloneHtmlOptions {
  playerBundle: string
  lang?: string
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

function escapeHtmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeScriptContents(value: string): string {
  return value
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '\\x3C!--')
    // Phaser contains informational URL strings (for example its banner and
    // DOM namespace constants). Keep their runtime value while ensuring the
    // exported source itself has no literal remote URL.
    .replaceAll('https://', 'https:\\x2F\\x2F')
    .replaceAll('http://', 'http:\\x2F\\x2F')
}

function normalizeOptions(
  playerBundleOrOptions: string | StandaloneHtmlOptions,
): Required<StandaloneHtmlOptions> {
  if (typeof playerBundleOrOptions === 'string') {
    return {
      playerBundle: playerBundleOrOptions,
      lang: 'zh-CN',
    }
  }

  return {
    playerBundle: playerBundleOrOptions.playerBundle,
    lang: playerBundleOrOptions.lang ?? 'zh-CN',
  }
}

export function buildStandaloneHtml(
  payload: ExportPayload,
  playerBundle: string,
): string
export function buildStandaloneHtml(
  payload: ExportPayload,
  options: StandaloneHtmlOptions,
): string
export function buildStandaloneHtml(
  payload: ExportPayload,
  playerBundleOrOptions: string | StandaloneHtmlOptions,
): string {
  const { playerBundle, lang } = normalizeOptions(playerBundleOrOptions)
  if (!playerBundle.trim()) {
    throw new Error('Player Runtime 为空，无法生成独立 HTML')
  }
  assertV3ExportDependencies(payload)

  const encodedPayload = jsonToBase64(payload)
  const payloadAssignment = escapeScriptContents(
    `window.__H5_LESSON_PAYLOAD__=${JSON.stringify(encodedPayload)};`,
  )
  const safePlayerBundle = escapeScriptContents(playerBundle)

  return `<!doctype html>
<html lang="${escapeHtmlText(lang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' blob: 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; worker-src blob:">
  <title>${escapeHtmlText(payload.project.title)}</title>
  <style>${PLAYER_STYLES}</style>
</head>
<body>
  <div id="lesson-root" aria-label="${escapeHtmlText(payload.project.title)}"></div>
  <script>${payloadAssignment}</script>
  <script>${safePlayerBundle}</script>
</body>
</html>
`
}
