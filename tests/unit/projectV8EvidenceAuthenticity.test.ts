// @vitest-environment node

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { strToU8, zipSync } from 'fflate'
import PptxGenJS from 'pptxgenjs'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createProject,
  createScene,
} from '@/renderer/project/createProject'
import { createProjectArchive } from '@/renderer/project/projectArchive'

const execFileAsync = promisify(execFile)
const root = path.resolve(__dirname, '..', '..')
const validator = path.join(
  root,
  '.agents',
  'skills',
  'build-project-v8-courseware',
  'scripts',
  'validate_evidence.py',
)
const python = process.platform === 'win32' ? 'python' : 'python3'

interface EvidenceArtifact {
  id: string
  kind: string
  path: string
  sha256: string
}

interface EvidenceManifest {
  schemaVersion: 1
  caseId: string
  caseRoot: '..'
  pipelineStatus: 'not-run' | 'failed' | 'passed'
  outcomeStatus: 'unusable' | 'placeholder' | 'engineering candidate' | 'art candidate' | 'accepted'
  inputs: Record<string, string>
  commands: Array<{ command: string, exitCode: number }>
  artifacts: EvidenceArtifact[]
  editRoundTrips: Array<{
    binding: string
    beforeProjectSha256: string
    afterProjectSha256: string
    evidenceArtifactIds: string[]
  }>
  sceneEvidence: Array<{ sceneId: string, sceneType: 'interactive' | 'static' }>
  requiredFrames: Array<{
    sceneId: string
    role: 'pre-interaction' | 'feedback' | 'stable-result' | 'static-stable'
    artifactId: string
  }>
  differences: string[]
  remainingRisks: string[]
  humanAcceptance: null | {
    decision: 'accepted'
    reviewer: string
    approvedAt: string
    approvalEvidence: string
    explicitOpinion: string
    scopeSha256: string
  }
}

interface ValidationReport {
  status: 'passed' | 'failed'
  currentAcceptanceScopeSha256: string
  errors: string[]
}

let temporaryRoot = ''

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function runValidator(manifestPath: string): Promise<ValidationReport> {
  try {
    const result = await execFileAsync(python, [validator, manifestPath, '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONDONTWRITEBYTECODE: '1',
      },
      timeout: 20_000,
    })
    return JSON.parse(result.stdout) as ValidationReport
  } catch (error) {
    const failure = error as Error & { stdout?: string }
    if (!failure.stdout) throw error
    return JSON.parse(failure.stdout) as ValidationReport
  }
}

async function persistManifest(
  manifestPath: string,
  manifest: EvidenceManifest,
): Promise<ValidationReport> {
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return runValidator(manifestPath)
}

function minimalPdf(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1280 720] /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
  body += `startxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(body, 'ascii')
}

function minimalMp4(): Buffer {
  // A real, independently generated one-frame H.264/MP4 recording. Keeping the
  // bytes in the test avoids an ffmpeg dependency in CI while exercising an
  // actual playable media container instead of a renamed text placeholder.
  return Buffer.from([
    'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMVbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAGQAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAA',
    'AAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAj90cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAGQA',
    'AAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAABkAAAAAAABAAAA',
    'AAG3bWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAABABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABYm1pbmYAAAAU',
    'dm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAASJzdGJsAAAAvnN0c2QAAAAAAAAAAQAAAK5hdmMxAAAAAAAAAAEAAAAA',
    'AAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2Mi4yOC4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2V7ARAAAAwAE',
    'AAADAFA8SJZYAQAGaOvjyyLA/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAN2QAAAAAAAAABhzdHRzAAAAAAAAAAEAAAABAAAEAAAAABxzdHNjAAAAAAAA',
    'AAEAAAABAAAAAQAAAAEAAAAUc3RzegAAAAAAAALFAAAAAQAAABRzdGNvAAAAAAAAAAEAAANFAAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwA',
    'AAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY2Mi4xMi4xMDIAAAAIZnJlZQAAAs1tZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gy',
    'NjQgLSBjb3JlIDE2NSByMzIyMyAwNDgwY2IwIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4u',
    'b3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lf',
    'cmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bz',
    'a2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxh',
    'Y2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWln',
    'aHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTEwIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAg',
    'cmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAD2WIhAA3',
    '//728P4FNlYEwQ==',
  ].join(''), 'base64')
}

async function makePptx(): Promise<Uint8Array> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  const slide = pptx.addSlide()
  slide.addText('Project V8 evidence', { x: 0.5, y: 0.5, w: 4, h: 0.5 })
  const result = await pptx.write({ outputType: 'uint8array' })
  if (!(result instanceof Uint8Array)) throw new Error('PptxGenJS did not return bytes')
  return result
}

async function buildAuthenticManifest(): Promise<{
  caseRoot: string
  manifestPath: string
  manifest: EvidenceManifest
}> {
  const caseRoot = path.join(temporaryRoot, 'case')
  const evidenceRoot = path.join(caseRoot, 'evidence')
  const deliveryRoot = path.join(caseRoot, 'delivery')
  await mkdir(evidenceRoot, { recursive: true })
  await mkdir(deliveryRoot, { recursive: true })

  const interactiveScene = createScene({ id: 'scene_interactive', name: '交互幕' })
  const staticScene = createScene({ id: 'scene_static', name: '静态幕' })
  const project = createProject({
    id: 'evidence_authenticity',
    now: '2026-08-13T00:00:00.000Z',
    includeDefaultController: false,
  })
  project.scenes = [interactiveScene, staticScene]
  const projectBytes = createProjectArchive({
    project,
    assetFiles: {},
    componentFiles: {},
  }, { mtime: '2026-08-13T00:00:00.000Z' })

  const htmlBytes = Buffer.from(
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body>V8</body></html>',
    'utf8',
  )
  const webPackageBytes = zipSync({
    'index.html': strToU8('<!doctype html><html><body><script src="course-data.js"></script></body></html>'),
    'course-data.js': strToU8('globalThis.__COURSEWARE__={schemaVersion:1};'),
    'player/player.iife.js': strToU8('globalThis.CoursewarePlayer={mount(){}};'),
    'player/player.css': strToU8('html,body{width:100%;height:100%;}'),
  })
  const pngBytes = await Promise.all(
    ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6'].map(color =>
      sharp({
        create: { width: 16, height: 9, channels: 4, background: color },
      }).png().toBuffer(),
    ),
  )

  const artifactSpecs: Array<[string, string, string, Uint8Array]> = [
    ['project', 'project', 'delivery/lesson.h5lesson', projectBytes],
    ['html', 'html', 'delivery/lesson.html', htmlBytes],
    ['web-package', 'web-package', 'delivery/lesson-web.zip', webPackageBytes],
    ['pdf', 'pdf', 'delivery/lesson.pdf', minimalPdf()],
    ['pptx', 'pptx', 'delivery/lesson.pptx', await makePptx()],
    ['interactive-pre', 'screenshot', 'delivery/interactive-pre.png', pngBytes[0]!],
    ['interactive-feedback', 'screenshot', 'delivery/interactive-feedback.png', pngBytes[1]!],
    ['interactive-stable', 'screenshot', 'delivery/interactive-stable.png', pngBytes[2]!],
    ['static-stable', 'screenshot', 'delivery/static-stable.png', pngBytes[3]!],
    ['contact-sheet', 'contact-sheet', 'delivery/contact-sheet.png', pngBytes[4]!],
    ['recording', 'recording', 'delivery/interaction.mp4', minimalMp4()],
  ]
  const artifacts: EvidenceArtifact[] = []
  for (const [id, kind, relative, bytes] of artifactSpecs) {
    await writeFile(path.join(caseRoot, ...relative.split('/')), bytes)
    artifacts.push({ id, kind, path: relative, sha256: sha256(bytes) })
  }

  const manifest: EvidenceManifest = {
    schemaVersion: 1,
    caseId: 'evidence-authenticity',
    caseRoot: '..',
    pipelineStatus: 'passed',
    outcomeStatus: 'engineering candidate',
    inputs: {
      presentationScriptSha256: 'a'.repeat(64),
      capabilityIndexSha256: 'b'.repeat(64),
    },
    commands: [{
      command: 'npm run --silent validate:project -- delivery/lesson.h5lesson',
      exitCode: 0,
    }],
    artifacts,
    editRoundTrips: [{
      binding: 'native:scene:scene_interactive:title:text',
      beforeProjectSha256: 'c'.repeat(64),
      afterProjectSha256: 'd'.repeat(64),
      evidenceArtifactIds: ['project', 'interactive-stable'],
    }],
    sceneEvidence: [
      { sceneId: 'scene_interactive', sceneType: 'interactive' },
      { sceneId: 'scene_static', sceneType: 'static' },
    ],
    requiredFrames: [
      { sceneId: 'scene_interactive', role: 'pre-interaction', artifactId: 'interactive-pre' },
      { sceneId: 'scene_interactive', role: 'feedback', artifactId: 'interactive-feedback' },
      { sceneId: 'scene_interactive', role: 'stable-result', artifactId: 'interactive-stable' },
      { sceneId: 'scene_static', role: 'static-stable', artifactId: 'static-stable' },
    ],
    differences: [],
    remainingRisks: [],
    humanAcceptance: null,
  }
  return {
    caseRoot,
    manifestPath: path.join(evidenceRoot, 'evidence-manifest.json'),
    manifest,
  }
}

beforeEach(async () => {
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'ittoedu-v8-evidence-'))
})

afterEach(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
})

describe('Project V8 evidence authenticity gate', () => {
  it('accepts real delivery containers and binds outcomeStatus into the scope', async () => {
    const { manifestPath, manifest } = await buildAuthenticManifest()
    const engineering = await persistManifest(manifestPath, manifest)
    expect(engineering).toMatchObject({ status: 'passed', errors: [] })

    manifest.outcomeStatus = 'art candidate'
    const art = await persistManifest(manifestPath, manifest)
    expect(art).toMatchObject({ status: 'passed', errors: [] })
    expect(art.currentAcceptanceScopeSha256)
      .not.toBe(engineering.currentAcceptanceScopeSha256)
  })

  it('rejects automated reviewer tokens and phrases', async () => {
    const { manifestPath, manifest } = await buildAuthenticManifest()
    manifest.outcomeStatus = 'accepted'
    manifest.humanAcceptance = {
      decision: 'accepted',
      reviewer: 'Codex automation',
      approvedAt: '2026-08-13T08:00:00+08:00',
      approvalEvidence: 'human-review-session-1',
      explicitOpinion: '已审看真实产物并同意验收',
      scopeSha256: '',
    }
    const unbound = await persistManifest(manifestPath, manifest)
    manifest.humanAcceptance.scopeSha256 = unbound.currentAcceptanceScopeSha256
    for (const reviewer of [
      'Codex automation',
      'ChatGPT',
      'AI agent/bot',
      '中文自动化审阅',
      '课程智能体',
    ]) {
      manifest.humanAcceptance.reviewer = reviewer
      const report = await persistManifest(manifestPath, manifest)
      expect(report.errors, reviewer)
        .toContain('automation cannot be the acceptance reviewer')
    }
  }, 15_000)

  it('permits a named human only after the exact accepted scope is signed', async () => {
    const { manifestPath, manifest } = await buildAuthenticManifest()
    manifest.outcomeStatus = 'accepted'
    manifest.humanAcceptance = {
      decision: 'accepted',
      reviewer: '王老师',
      approvedAt: '2026-08-13T08:00:00+08:00',
      approvalEvidence: 'human-review-session-2',
      explicitOpinion: '已审看真实产物并同意验收',
      scopeSha256: '',
    }
    const unbound = await persistManifest(manifestPath, manifest)
    expect(unbound.errors).toContain(
      'humanAcceptance scopeSha256 does not match the current evidence scope',
    )
    manifest.humanAcceptance.scopeSha256 = unbound.currentAcceptanceScopeSha256
    expect(await persistManifest(manifestPath, manifest))
      .toMatchObject({ status: 'passed', errors: [] })
  })

  it('rejects renamed text, malformed containers, and a reused delivery path', async () => {
    const { caseRoot, manifestPath, manifest } = await buildAuthenticManifest()
    const corruptIds = new Set([
      'project',
      'html',
      'web-package',
      'pdf',
      'pptx',
      'interactive-pre',
      'contact-sheet',
      'recording',
    ])
    for (const artifact of manifest.artifacts) {
      if (!corruptIds.has(artifact.id)) continue
      const corrupt = Buffer.from(`not a real ${artifact.kind}\n`, 'utf8')
      await writeFile(path.join(caseRoot, ...artifact.path.split('/')), corrupt)
      artifact.sha256 = sha256(corrupt)
    }
    const contactSheet = manifest.artifacts.find(item => item.id === 'contact-sheet')!
    const feedback = manifest.artifacts.find(item => item.id === 'interactive-feedback')!
    contactSheet.path = feedback.path
    contactSheet.sha256 = feedback.sha256

    const report = await persistManifest(manifestPath, manifest)
    const errors = report.errors.join('\n')
    expect(report.status).toBe('failed')
    expect(errors).toContain('project artifact is not a readable ZIP container')
    expect(errors).toContain('html artifact is implausibly small')
    expect(errors).toContain('web-package artifact is not a readable ZIP container')
    expect(errors).toContain('pdf artifact has no valid PDF header')
    expect(errors).toContain('pptx artifact is not a readable OOXML ZIP container')
    expect(errors).toContain('has no recognizable image header and dimensions')
    expect(errors).toContain('recording artifact has no recognizable media container header')
    expect(errors).toContain('duplicate artifact path')
  })

  it('requires every declared interactive/static scene role and unique frame bytes', async () => {
    const { manifestPath, manifest } = await buildAuthenticManifest()
    manifest.requiredFrames = manifest.requiredFrames.filter(
      frame => frame.role !== 'feedback' && frame.role !== 'static-stable',
    )
    manifest.requiredFrames[0]!.artifactId = 'interactive-stable'

    const report = await persistManifest(manifestPath, manifest)
    const errors = report.errors.join('\n')
    expect(errors).toContain('reuses a screenshot from another frame slot')
    expect(errors).toContain('sceneEvidence scene_interactive is missing required frame roles: feedback')
    expect(errors).toContain('sceneEvidence scene_static is missing required frame roles: static-stable')
  })

  it('requires sceneEvidence to cover exactly the delivered Project V8 scenes', async () => {
    const { manifestPath, manifest } = await buildAuthenticManifest()
    manifest.sceneEvidence = [
      { sceneId: 'scene_interactive', sceneType: 'interactive' },
      { sceneId: 'scene_unknown', sceneType: 'static' },
    ]
    manifest.requiredFrames = manifest.requiredFrames.filter(
      frame => frame.sceneId !== 'scene_static',
    )
    manifest.requiredFrames.push({
      sceneId: 'scene_unknown',
      role: 'static-stable',
      artifactId: 'static-stable',
    })

    const report = await persistManifest(manifestPath, manifest)
    const errors = report.errors.join('\n')
    expect(errors).toContain('sceneEvidence is missing Project V8 scenes: scene_static')
    expect(errors).toContain('sceneEvidence declares scenes absent from Project V8: scene_unknown')
  })

  it('keeps an empty placeholder manifest resumable', async () => {
    const caseRoot = path.join(temporaryRoot, 'placeholder-case')
    const manifestPath = path.join(caseRoot, 'evidence', 'evidence-manifest.json')
    await mkdir(path.dirname(manifestPath), { recursive: true })
    const placeholder: EvidenceManifest = {
      schemaVersion: 1,
      caseId: 'placeholder-case',
      caseRoot: '..',
      pipelineStatus: 'not-run',
      outcomeStatus: 'placeholder',
      inputs: {},
      commands: [],
      artifacts: [],
      editRoundTrips: [],
      sceneEvidence: [],
      requiredFrames: [],
      differences: [],
      remainingRisks: [],
      humanAcceptance: null,
    }
    expect(await persistManifest(manifestPath, placeholder))
      .toMatchObject({ status: 'passed', errors: [] })
  })
})
