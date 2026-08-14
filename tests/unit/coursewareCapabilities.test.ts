import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ComponentRegistry } from '@/player/ComponentRegistry'
import { CourseEventBus } from '@/player/CourseEventBus'
import { SurfaceRuntimeRegistry } from '@/player/SurfaceRuntimeRegistry'
import { componentManifestSchema } from '@/shared/componentSchema'
import type { SurfaceRuntimeCreateContext } from '@/shared/surfaceRuntimeTypes'

const root = resolve(process.cwd(), 'courseware-capabilities')

describe('ordinary reusable courseware capability modules', () => {
  it('loads the parameter plot through the official Surface Runtime V1 registry', async () => {
    const source = await readFile(resolve(root, 'runtimes/parameter-plot.js'), 'utf8')
    expect(source).not.toMatch(/\b(?:import|export|require)\b/)
    const registry = new SurfaceRuntimeRegistry()
    const definition = registry.executeRuntime(source, 'parameter-plot')
    expect(definition.runtimeApiVersion).toBe(3)
    expect(typeof definition.create).toBe('function')
    registry.dispose()
  })

  it('requires both sign comparison and a same-sign magnitude comparison before completion', async () => {
    const source = await readFile(resolve(root, 'runtimes/parameter-plot.js'), 'utf8')
    const registry = new SurfaceRuntimeRegistry()
    const definition = registry.executeRuntime(source, 'parameter-plot-behavior')
    const rootElement = document.createElement('div')
    const state = new Map<string, unknown>()
    const events = new CourseEventBus()
    const content = {
      prompt: '改变 a，观察图像', resetLabel: '重置实验', hint: '继续比较',
      completeHint: '比较完成', upLabel: '向上', downLabel: '向下',
      narrowLabel: '更窄', wideLabel: '更宽', baselineLabel: '基准',
      directionLabel: '开口', widthLabel: '宽窄',
    }
    const context: SurfaceRuntimeCreateContext = {
      runtimeApiVersion: 3,
      mode: 'playback', width: 960, height: 540,
      content: { get: (key) => content[key as keyof typeof content]!, all: () => content },
      assets: { url: () => 'data:image/svg+xml;base64,AA==', projectUrl: () => '' },
      courseState: {
        get: <T,>(key: string) => state.get(key) as T | undefined,
        set: (key, value) => { state.set(key, value) },
        delete: (key) => { state.delete(key) },
        clear: () => state.clear(),
        snapshot: () => Object.fromEntries(state),
      },
      presentation: { current: () => null, states: () => [], setState: () => true, transitionTo: () => true },
      actions: { goToScene: () => true, nextScene: () => true, previousScene: () => true, replayScene: () => true, restartCourse: () => true },
      events,
      capture: { waitUntil: () => undefined },
      dom: { root: rootElement },
      authoring: { registerText: () => () => undefined, registerAsset: () => () => undefined, invalidate: () => undefined },
      emit: (eventName, payload) => events.emit(eventName, payload),
    }
    const instance = definition.create(context)
    const button = (label: string) => [...rootElement.querySelectorAll('button')]
      .find((candidate) => candidate.textContent === label)!

    expect(state.get('comparisonComplete')).toBe(false)
    button('-2').click()
    expect(state.get('comparisonComplete')).toBe(false)
    button('-0.5').click()
    expect(state.get('comparisonComplete')).toBe(true)
    const checkpoint = instance.exportAuthoringCheckpoint?.()
    expect(checkpoint).toMatchObject({ coefficient: -0.5 })
    button('重置实验').click()
    expect(state.get('comparisonComplete')).toBe(false)
    instance.restoreAuthoringCheckpoint?.(checkpoint)
    expect(state.get('comparisonComplete')).toBe(true)
    expect(rootElement.querySelector('[data-courseware-asset-key="gridBackground"]')).not.toBeNull()
    button('重置实验').click()
    expect(state.get('comparisonComplete')).toBe(false)
    instance.destroy()
    events.dispose()
    registry.dispose()
  })

  it('keeps the evidence sorter a valid configurable Component API 4 package', async () => {
    const manifest = componentManifestSchema.parse(JSON.parse(await readFile(
      resolve(root, 'components/evidence-sort/manifest.json'),
      'utf8',
    )))
    const source = await readFile(resolve(root, 'components/evidence-sort/runtime.js'), 'utf8')
    expect(manifest).toMatchObject({
      id: 'ittoedu.evidence-sort',
      runtimeApiVersion: 4,
      renderMode: 'dom',
      supportedScopes: ['scene'],
    })
    expect(manifest.editor?.properties.filter((property) => (
      property.type === 'text' || property.type === 'textarea'
    ))).toHaveLength(11)
    const registry = new ComponentRegistry()
    const definition = registry.executeRuntime(manifest.id, source)
    expect(definition).toMatchObject({ id: manifest.id, runtimeApiVersion: 4 })
    registry.dispose()
  })
})
