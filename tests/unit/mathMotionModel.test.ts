import { describe, expect, it } from 'vitest'
import {
  BASE_LINKED_GRAPH_MODEL,
  VERIFIED_MATH_TRUTHS,
  assertLinkedGraphModel,
  deriveAreaTruth,
  deriveLinkedGraphSnapshot,
  evaluateQuadratic,
  quadraticMaximum,
  sampleQuadraticPath,
} from '../../examples/math-motion-function-lab/mathModel'

describe('math motion linked-graph truth', () => {
  it('derives the authored quadratic from the geometry constants', () => {
    expect(deriveAreaTruth(BASE_LINKED_GRAPH_MODEL)).toEqual({
      linear: 6,
      quadratic: 1.5,
      domain: [0, 4],
    })
  })

  it.each([
    { t: 0, ap: 0, bq: 6, area: 0 },
    { t: 2, ap: 4, bq: 3, area: 6 },
    { t: 4, ap: 8, bq: 0, area: 0 },
  ])('keeps geometry and area synchronized at t=$t', (expected) => {
    expect(deriveLinkedGraphSnapshot(BASE_LINKED_GRAPH_MODEL, expected.t)).toMatchObject(expected)
  })

  it.each([
    ['base', VERIFIED_MATH_TRUTHS.base, { input: 2, value: 6 }],
    ['domain variant', VERIFIED_MATH_TRUTHS.domainVariant, { input: 4, value: 16 }],
    ['transfer', VERIFIED_MATH_TRUTHS.transfer, { input: 4, value: 12 }],
  ] as const)('finds the verified maximum for %s', (_name, truth, expected) => {
    expect(quadraticMaximum(truth)).toEqual(expected)
    expect(evaluateQuadratic(truth, expected.input)).toBe(expected.value)
  })

  it('samples both domain endpoints deterministically', () => {
    const path = sampleQuadraticPath(VERIFIED_MATH_TRUTHS.base, 8)
    expect(path).toHaveLength(9)
    expect(path[0]).toEqual({ input: 0, value: 0 })
    expect(path.at(-1)).toEqual({ input: 4, value: 0 })
  })

  it('rejects a model that moves a point outside the rectangle', () => {
    expect(() => assertLinkedGraphModel({
      ...BASE_LINKED_GRAPH_MODEL,
      tMax: 5,
    })).toThrow('outside the rectangle')
  })
})
