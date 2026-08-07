export interface LinkedGraphModel {
  rectangleWidth: number
  rectangleHeight: number
  pSpeed: number
  qSpeed: number
  tMin: number
  tMax: number
}

export interface LinkedGraphSnapshot {
  t: number
  ap: number
  bq: number
  p: { x: number; y: 0 }
  q: { x: number; y: number }
  area: number
}

export interface QuadraticTruth {
  linear: number
  quadratic: number
  domain: readonly [number, number]
}

export const BASE_LINKED_GRAPH_MODEL: LinkedGraphModel = {
  rectangleWidth: 8,
  rectangleHeight: 6,
  pSpeed: 2,
  qSpeed: 1.5,
  tMin: 0,
  tMax: 4,
}

export const VERIFIED_MATH_TRUTHS = {
  base: {
    linear: 6,
    quadratic: 1.5,
    domain: [0, 4],
  },
  domainVariant: {
    linear: 6,
    quadratic: 0.5,
    domain: [0, 4],
  },
  transfer: {
    linear: 6,
    quadratic: 0.75,
    domain: [0, 8],
  },
} as const satisfies Record<string, QuadraticTruth>

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function requireFinitePositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a finite positive number`)
  }
}

export function assertLinkedGraphModel(model: LinkedGraphModel): void {
  requireFinitePositive(model.rectangleWidth, 'rectangleWidth')
  requireFinitePositive(model.rectangleHeight, 'rectangleHeight')
  requireFinitePositive(model.pSpeed, 'pSpeed')
  requireFinitePositive(model.qSpeed, 'qSpeed')
  if (!Number.isFinite(model.tMin) || !Number.isFinite(model.tMax) || model.tMin !== 0) {
    throw new Error('linked-graph currently requires a finite domain beginning at t = 0')
  }
  if (model.tMax <= model.tMin) {
    throw new Error('tMax must be greater than tMin')
  }
  const pEnd = model.pSpeed * model.tMax
  const qEnd = model.rectangleHeight - model.qSpeed * model.tMax
  if (pEnd > model.rectangleWidth + 1e-9 || qEnd < -1e-9) {
    throw new Error('the declared time domain moves P or Q outside the rectangle')
  }
}

export function deriveAreaTruth(model: LinkedGraphModel): QuadraticTruth {
  assertLinkedGraphModel(model)
  return {
    linear: 0.5 * model.pSpeed * model.rectangleHeight,
    quadratic: 0.5 * model.pSpeed * model.qSpeed,
    domain: [model.tMin, model.tMax],
  }
}

export function evaluateQuadratic(truth: QuadraticTruth, value: number): number {
  return truth.linear * value - truth.quadratic * value * value
}

export function quadraticMaximum(truth: QuadraticTruth): { input: number; value: number } {
  requireFinitePositive(truth.quadratic, 'quadratic')
  const [minimum, maximum] = truth.domain
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum < minimum) {
    throw new Error('quadratic domain is invalid')
  }
  const vertex = truth.linear / (2 * truth.quadratic)
  const candidates = [minimum, maximum, clamp(vertex, minimum, maximum)]
  return candidates
    .map((input) => ({ input, value: evaluateQuadratic(truth, input) }))
    .reduce((best, candidate) => candidate.value > best.value ? candidate : best)
}

export function deriveLinkedGraphSnapshot(
  model: LinkedGraphModel,
  input: number,
): LinkedGraphSnapshot {
  assertLinkedGraphModel(model)
  const t = clamp(input, model.tMin, model.tMax)
  const ap = model.pSpeed * t
  const bq = model.rectangleHeight - model.qSpeed * t
  return {
    t,
    ap,
    bq,
    p: { x: ap, y: 0 },
    q: { x: model.rectangleWidth, y: bq },
    area: 0.5 * ap * bq,
  }
}

export function sampleQuadraticPath(
  truth: QuadraticTruth,
  sampleCount = 80,
): Array<{ input: number; value: number }> {
  const count = Math.max(2, Math.floor(sampleCount))
  const [minimum, maximum] = truth.domain
  return Array.from({ length: count + 1 }, (_, index) => {
    const input = minimum + (maximum - minimum) * (index / count)
    return { input, value: evaluateQuadratic(truth, input) }
  })
}
