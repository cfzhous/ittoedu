import { describe, expect, it } from 'vitest'
import { analyzeVisualDensity } from '../../src/shared/visualDensity'
import { createProject, createTextNode } from '../../src/renderer/project/createProject'

describe('visual density overview', () => {
  it('reports visible copy, occupied area and substantial overlap per state', () => {
    const project = createProject({ includeDefaultController: false, controls: 'none' })
    const scene = project.scenes[0]!
    scene.nodes = [
      createTextNode({ id: 'a', x: 0, y: 0, width: 640, height: 360, text: '甲'.repeat(120) }),
      createTextNode({ id: 'b', x: 100, y: 100, width: 640, height: 360, text: '乙'.repeat(120) }),
      createTextNode({ id: 'hidden', visible: false, text: '不计入' }),
    ]

    const state = analyzeVisualDensity(project).states[0]!
    expect(state).toMatchObject({
      visibleNodeCount: 2,
      textCharacterCount: 240,
      significantOverlapPairs: 1,
    })
    expect(state.occupiedAreaRatio).toBeCloseTo(0.5, 5)
    expect(state.score).toBeGreaterThan(0)
  })

  it('labels a deliberately overloaded state as a heuristic, not an error', () => {
    const project = createProject({ includeDefaultController: false, controls: 'none' })
    project.scenes[0]!.nodes = Array.from({ length: 30 }, (_, index) => createTextNode({
      id: `node-${index}`,
      x: (index % 6) * 190,
      y: Math.floor(index / 6) * 130,
      width: 240,
      height: 160,
      text: '信息'.repeat(20),
    }))

    const report = analyzeVisualDensity(project)
    expect(report.states[0]!.band).toBe('dense')
    expect(report.summary.denseStateCount).toBe(1)
  })
})
