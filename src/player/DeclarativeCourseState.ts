import type {
  CourseNavigationGuard,
  CourseProjectDocument,
  CourseStateCondition,
  CourseStateDeclaration,
  CourseStateScalar,
} from '@/shared/courseProjectTypes'
import { CourseStateStore } from './CourseStateStore'

export type CourseStateAction =
  | { type: 'set'; key: string; value: CourseStateScalar }
  | { type: 'increment'; key: string; delta: number }
  | { type: 'delete'; key: string }

export type CourseStateExecutionErrorCode =
  | 'duplicate-declaration'
  | 'unknown-key'
  | 'wrong-type'
  | 'invalid-action'
  | 'missing-value'
  | 'frozen'
  | 'checkpoint-invalid'
  | 'checkpoint-stale'
  | 'guard-invalid'
  | 'unknown-location'

export class CourseStateExecutionError extends Error {
  constructor(
    public readonly code: CourseStateExecutionErrorCode,
    message: string,
    public readonly key?: string,
  ) {
    super(message)
    this.name = 'CourseStateExecutionError'
  }
}

export interface CourseStateCheckpoint {
  format: 'course-state-checkpoint'
  version: 1
  projectId: string
  projectRevision: number
  values: Record<string, CourseStateScalar>
}

export type GuardedNavigationEntryPoint =
  | 'presenter'
  | 'teacher-controller'
  | 'runtime'
  | 'component'

export type UnguardedNavigationEntryPoint =
  | 'initial-entry'
  | 'replay'
  | 'restart'
  | 'author-force'
  | 'static-capture'

export type CourseNavigationEntryPoint =
  | GuardedNavigationEntryPoint
  | UnguardedNavigationEntryPoint

export interface CourseNavigationRequest {
  entryPoint: CourseNavigationEntryPoint
  fromLocationId?: string
  toLocationId: string
}

export interface CourseNavigationDecision {
  allowed: boolean
  entryPoint: CourseNavigationEntryPoint
  fromLocationId?: string
  toLocationId: string
  checkedGuardIds: string[]
  blockedBy: Array<{ guardId: string; message: string }>
}

export interface DeclarativeCourseStateConfig {
  projectId: string
  projectRevision: number
  declarations: readonly CourseStateDeclaration[]
  navigationGuards: readonly CourseNavigationGuard[]
  locationIds: readonly string[]
  startLocationId: string
}

interface DeclarativeCourseStateOptions {
  onChange?: ConstructorParameters<typeof CourseStateStore>[0]
}

const GUARDED_ENTRY_POINTS = new Set<CourseNavigationEntryPoint>([
  'presenter',
  'teacher-controller',
  'runtime',
  'component',
])

function scalarType(value: CourseStateScalar): CourseStateDeclaration['valueType'] {
  if (value === null) return 'null'
  return typeof value as Exclude<CourseStateDeclaration['valueType'], 'null'>
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function ownKeysEqual(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index])
}

function cloneValues(values: Readonly<Record<string, CourseStateScalar>>): Record<string, CourseStateScalar> {
  return Object.fromEntries(Object.entries(values))
}

function normalizeConfig(
  config: DeclarativeCourseStateConfig | CourseProjectDocument,
): DeclarativeCourseStateConfig {
  if ('schemaVersion' in config) {
    return {
      projectId: config.id,
      projectRevision: config.revision,
      declarations: config.courseState,
      navigationGuards: config.navigationGuards,
      locationIds: config.locations.map((location) => location.id),
      startLocationId: config.startLocationId,
    }
  }
  return config
}

/**
 * Strict author-facing semantics layered on the existing CourseStateStore.
 * This is the only value store: declarations, actions, checkpoints and guards
 * all read and mutate the same backing instance.
 */
export class DeclarativeCourseState {
  private readonly store: CourseStateStore
  private readonly declarations = new Map<string, CourseStateDeclaration>()
  private readonly navigationGuards: CourseNavigationGuard[]
  private readonly locationIds: Set<string>
  private readonly projectId: string
  private readonly projectRevision: number
  readonly startLocationId: string

  constructor(
    source: DeclarativeCourseStateConfig | CourseProjectDocument,
    options: DeclarativeCourseStateOptions = {},
  ) {
    const config = normalizeConfig(source)
    this.projectId = config.projectId
    this.projectRevision = config.projectRevision
    this.startLocationId = config.startLocationId
    this.locationIds = new Set(config.locationIds)
    this.navigationGuards = config.navigationGuards.map((guard) => structuredClone(guard))
    this.store = new CourseStateStore(options.onChange)

    for (const declaration of config.declarations) {
      if (this.declarations.has(declaration.key)) {
        throw new CourseStateExecutionError(
          'duplicate-declaration',
          `课程变量“${declaration.key}”重复声明。`,
          declaration.key,
        )
      }
      if (scalarType(declaration.defaultValue) !== declaration.valueType) {
        throw new CourseStateExecutionError(
          'wrong-type',
          `课程变量“${declaration.key}”的默认值类型与声明不一致。`,
          declaration.key,
        )
      }
      if (typeof declaration.defaultValue === 'number' && !Number.isFinite(declaration.defaultValue)) {
        throw new CourseStateExecutionError(
          'wrong-type',
          `课程变量“${declaration.key}”的默认数值必须为有限数。`,
          declaration.key,
        )
      }
      this.declarations.set(declaration.key, structuredClone(declaration))
    }

    if (!this.locationIds.has(this.startLocationId)) {
      throw new CourseStateExecutionError(
        'unknown-location',
        `起始位置“${this.startLocationId}”不存在。`,
      )
    }
    this.validateGuards()
    this.restoreDefaultsUnchecked()
  }

  setFrozen(frozen: boolean): void {
    this.store.setFrozen(frozen)
  }

  isFrozen(): boolean {
    return this.store.isFrozen()
  }

  has(key: string): boolean {
    this.requireDeclaration(key)
    return Object.prototype.hasOwnProperty.call(this.store.snapshot(), key)
  }

  get(key: string): CourseStateScalar | undefined {
    this.requireDeclaration(key)
    return this.store.get<CourseStateScalar>(key)
  }

  snapshot(): Record<string, CourseStateScalar> {
    const raw = this.store.snapshot()
    return Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, value as CourseStateScalar]),
    )
  }

  apply(action: CourseStateAction): void {
    this.assertMutable()
    if (!isPlainRecord(action)) {
      throw new CourseStateExecutionError('invalid-action', '课程变量动作必须是普通对象。')
    }
    if (action.type === 'set') {
      if (!ownKeysEqual(action, ['type', 'key', 'value']) || typeof action.key !== 'string') {
        throw new CourseStateExecutionError('invalid-action', 'set 动作字段无效。')
      }
      this.set(action.key, action.value)
      return
    }
    if (action.type === 'increment') {
      if (
        !ownKeysEqual(action, ['type', 'key', 'delta']) ||
        typeof action.key !== 'string' ||
        typeof action.delta !== 'number' ||
        !Number.isFinite(action.delta)
      ) {
        throw new CourseStateExecutionError('invalid-action', 'increment 动作字段无效。')
      }
      this.increment(action.key, action.delta)
      return
    }
    if (action.type === 'delete') {
      if (!ownKeysEqual(action, ['type', 'key']) || typeof action.key !== 'string') {
        throw new CourseStateExecutionError('invalid-action', 'delete 动作字段无效。')
      }
      this.delete(action.key)
      return
    }
    throw new CourseStateExecutionError('invalid-action', '不支持的课程变量动作。')
  }

  set(key: string, value: CourseStateScalar): void {
    this.assertMutable()
    const declaration = this.requireDeclaration(key)
    this.assertValueType(declaration, value)
    this.store.set(key, value)
  }

  increment(key: string, delta = 1): number {
    this.assertMutable()
    const declaration = this.requireDeclaration(key)
    if (declaration.valueType !== 'number') {
      throw new CourseStateExecutionError(
        'wrong-type',
        `课程变量“${key}”不是数值，不能累加。`,
        key,
      )
    }
    if (!Number.isFinite(delta)) {
      throw new CourseStateExecutionError('wrong-type', '累加值必须为有限数。', key)
    }
    const current = this.store.get<number>(key)
    if (current === undefined) {
      throw new CourseStateExecutionError(
        'missing-value',
        `课程变量“${key}”已被删除，不能隐式重建。`,
        key,
      )
    }
    const next = current + delta
    if (!Number.isFinite(next)) {
      throw new CourseStateExecutionError('wrong-type', '累加结果必须为有限数。', key)
    }
    this.store.set(key, next)
    return next
  }

  delete(key: string): void {
    this.assertMutable()
    this.requireDeclaration(key)
    this.store.delete(key)
  }

  checkpoint(): CourseStateCheckpoint {
    return this.makeCheckpoint(this.snapshot())
  }

  defaultCheckpoint(): CourseStateCheckpoint {
    return this.makeCheckpoint(this.defaultValues())
  }

  /** Static exports never inherit a previous random/student session implicitly. */
  checkpointForStaticCapture(
    explicitCheckpoint?: CourseStateCheckpoint,
  ): CourseStateCheckpoint {
    if (explicitCheckpoint === undefined) return this.defaultCheckpoint()
    return this.makeCheckpoint(this.validateCheckpoint(explicitCheckpoint))
  }

  restore(checkpoint: CourseStateCheckpoint): void {
    this.assertMutable()
    const values = this.validateCheckpoint(checkpoint)
    this.replaceValuesUnchecked(values)
  }

  restart(): CourseNavigationDecision {
    this.assertMutable()
    this.restoreDefaultsUnchecked()
    return this.requestNavigation({
      entryPoint: 'restart',
      toLocationId: this.startLocationId,
    })
  }

  requestNavigation(request: CourseNavigationRequest): CourseNavigationDecision {
    this.requireLocation(request.toLocationId)
    if (request.fromLocationId !== undefined) this.requireLocation(request.fromLocationId)

    const decision: CourseNavigationDecision = {
      allowed: true,
      entryPoint: request.entryPoint,
      fromLocationId: request.fromLocationId,
      toLocationId: request.toLocationId,
      checkedGuardIds: [],
      blockedBy: [],
    }
    if (!GUARDED_ENTRY_POINTS.has(request.entryPoint)) return decision

    for (const guard of this.navigationGuards) {
      if (!guard.toLocationIds.includes(request.toLocationId)) continue
      if (
        guard.fromLocationIds !== undefined &&
        (request.fromLocationId === undefined || !guard.fromLocationIds.includes(request.fromLocationId))
      ) {
        continue
      }
      decision.checkedGuardIds.push(guard.id)
      const conditions = guard.conditions.map((condition) => this.matches(condition))
      const requirementsMet = guard.match === 'all'
        ? conditions.every(Boolean)
        : conditions.some(Boolean)
      // Guards declare requirements. Their only effect is to block when those
      // requirements are not met; they never execute or redirect.
      if (!requirementsMet) {
        decision.allowed = false
        decision.blockedBy.push({ guardId: guard.id, message: guard.message })
      }
    }
    return decision
  }

  private validateGuards(): void {
    const guardIds = new Set<string>()
    for (const guard of this.navigationGuards) {
      if (guardIds.has(guard.id)) {
        throw new CourseStateExecutionError('guard-invalid', `翻页条件“${guard.id}”重复。`)
      }
      guardIds.add(guard.id)
      if (guard.effect !== 'block' || guard.conditions.length === 0) {
        throw new CourseStateExecutionError('guard-invalid', `翻页条件“${guard.id}”无效。`)
      }
      for (const locationId of [...(guard.fromLocationIds ?? []), ...guard.toLocationIds]) {
        this.requireLocation(locationId)
      }
      for (const condition of guard.conditions) this.validateCondition(condition, guard.id)
    }
  }

  private validateCondition(condition: CourseStateCondition, guardId: string): void {
    const declaration = this.requireDeclaration(condition.key)
    if (condition.type === 'exists') return
    if (scalarType(condition.value) !== declaration.valueType) {
      throw new CourseStateExecutionError(
        'guard-invalid',
        `翻页条件“${guardId}”比较了错误类型的变量“${condition.key}”。`,
        condition.key,
      )
    }
    if (
      condition.operator !== 'eq' &&
      condition.operator !== 'neq' &&
      declaration.valueType !== 'number'
    ) {
      throw new CourseStateExecutionError(
        'guard-invalid',
        `翻页条件“${guardId}”只能对数值使用大小比较。`,
        condition.key,
      )
    }
  }

  private matches(condition: CourseStateCondition): boolean {
    const exists = this.has(condition.key)
    if (condition.type === 'exists') return exists === condition.exists
    if (!exists) return false
    const current = this.get(condition.key)!
    switch (condition.operator) {
      case 'eq': return current === condition.value
      case 'neq': return current !== condition.value
      case 'gt': return (current as number) > (condition.value as number)
      case 'gte': return (current as number) >= (condition.value as number)
      case 'lt': return (current as number) < (condition.value as number)
      case 'lte': return (current as number) <= (condition.value as number)
    }
  }

  private requireDeclaration(key: string): CourseStateDeclaration {
    const declaration = this.declarations.get(key)
    if (!declaration) {
      throw new CourseStateExecutionError(
        'unknown-key',
        `未声明的课程变量“${key}”。`,
        key,
      )
    }
    return declaration
  }

  private requireLocation(locationId: string): void {
    if (!this.locationIds.has(locationId)) {
      throw new CourseStateExecutionError(
        'unknown-location',
        `课程位置“${locationId}”不存在。`,
      )
    }
  }

  private assertValueType(
    declaration: CourseStateDeclaration,
    value: CourseStateScalar,
  ): void {
    if (
      scalarType(value) !== declaration.valueType ||
      (typeof value === 'number' && !Number.isFinite(value))
    ) {
      throw new CourseStateExecutionError(
        'wrong-type',
        `课程变量“${declaration.key}”只接受 ${declaration.valueType} 值。`,
        declaration.key,
      )
    }
  }

  private assertMutable(): void {
    if (this.store.isFrozen()) {
      throw new CourseStateExecutionError(
        'frozen',
        '当前是作者检查或确定性捕获状态，课程变量已冻结。',
      )
    }
  }

  private defaultValues(): Record<string, CourseStateScalar> {
    return Object.fromEntries(
      [...this.declarations].map(([key, declaration]) => [key, declaration.defaultValue]),
    )
  }

  private makeCheckpoint(values: Record<string, CourseStateScalar>): CourseStateCheckpoint {
    return {
      format: 'course-state-checkpoint',
      version: 1,
      projectId: this.projectId,
      projectRevision: this.projectRevision,
      values: cloneValues(values),
    }
  }

  private validateCheckpoint(checkpoint: CourseStateCheckpoint): Record<string, CourseStateScalar> {
    if (
      !isPlainRecord(checkpoint) ||
      !ownKeysEqual(checkpoint, ['format', 'version', 'projectId', 'projectRevision', 'values']) ||
      checkpoint.format !== 'course-state-checkpoint' ||
      checkpoint.version !== 1 ||
      !isPlainRecord(checkpoint.values)
    ) {
      throw new CourseStateExecutionError('checkpoint-invalid', '课程变量检查点格式无效。')
    }
    if (
      checkpoint.projectId !== this.projectId ||
      checkpoint.projectRevision !== this.projectRevision
    ) {
      throw new CourseStateExecutionError(
        'checkpoint-stale',
        '课程变量检查点与当前工程版本不一致。',
      )
    }
    const values: Record<string, CourseStateScalar> = {}
    for (const [key, value] of Object.entries(checkpoint.values)) {
      const declaration = this.requireDeclaration(key)
      this.assertValueType(declaration, value as CourseStateScalar)
      values[key] = value as CourseStateScalar
    }
    return values
  }

  private restoreDefaultsUnchecked(): void {
    this.replaceValuesUnchecked(this.defaultValues())
  }

  private replaceValuesUnchecked(values: Readonly<Record<string, CourseStateScalar>>): void {
    this.store.clear()
    Object.entries(values).forEach(([key, value]) => this.store.set(key, value))
  }
}
