import { nanoid } from 'nanoid'
import { useEffect, useMemo, useState } from 'react'
import type { InteractionRule } from '../../shared/interactionTypes'
import type {
  CourseNavigationGuard,
  CourseProjectDocument,
  CourseStateCondition,
  CourseStateDeclaration,
  CourseStateScalar,
  CourseSurfaceDocument,
  SlideSceneDocument,
} from '../../shared/courseProjectTypes'
import {
  addCourseStateDeclaration,
  deleteCourseStateDeclaration,
  replaceCourseGlobalInteractions,
  replaceCourseNavigationGuards,
  updateCourseStateDeclaration,
} from './courseLogicModel'
import {
  V9GlobalInteractionEditor,
  type V9InteractionLayerEntry,
} from './V9InteractionEditor'

type CourseLogicOperation = (project: CourseProjectDocument) => CourseProjectDocument

export interface V9CourseLogicEditorProps {
  project: CourseProjectDocument
  activeSurface: CourseSurfaceDocument
  activeScene?: SlideSceneDocument
  layerEntries: readonly V9InteractionLayerEntry[]
  selectedLayerItemId: string | null
  disabled?: boolean
  onCommit(operation: CourseLogicOperation, message: string): void
}

function CommitField({
  value,
  ariaLabel,
  multiline = false,
  allowEmpty = false,
  disabled,
  onCommit,
}: {
  value: string
  ariaLabel: string
  multiline?: boolean
  allowEmpty?: boolean
  disabled?: boolean
  onCommit(value: string): void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const finish = () => {
    const next = allowEmpty ? draft : draft.trim()
    if ((!allowEmpty && !next) || next === value) {
      setDraft(value)
      return
    }
    onCommit(next)
  }
  const props = {
    'aria-label': ariaLabel,
    value: draft,
    disabled,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.currentTarget.value),
    onBlur: finish,
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!multiline && event.key === 'Enter') event.currentTarget.blur()
      if (multiline && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) event.currentTarget.blur()
      if (event.key === 'Escape') {
        setDraft(value)
        event.currentTarget.blur()
      }
    },
  }
  return multiline ? <textarea {...props} rows={3} /> : <input {...props} type="text" />
}

function CommitNumberField({
  value,
  ariaLabel,
  disabled,
  onCommit,
}: {
  value: number
  ariaLabel: string
  disabled?: boolean
  onCommit(value: number): void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const finish = () => {
    const next = Number(draft)
    if (!Number.isFinite(next)) {
      setDraft(String(value))
      return
    }
    if (next !== value) onCommit(next)
    setDraft(String(next))
  }
  return (
    <input
      type="number"
      aria-label={ariaLabel}
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(String(value))
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function defaultValueForType(valueType: CourseStateDeclaration['valueType']): CourseStateScalar {
  if (valueType === 'boolean') return false
  if (valueType === 'number') return 0
  if (valueType === 'string') return ''
  return null
}

function declarationWith(
  declaration: CourseStateDeclaration,
  patch: { key?: string; valueType?: CourseStateDeclaration['valueType']; defaultValue?: CourseStateScalar },
): CourseStateDeclaration {
  const valueType = patch.valueType ?? declaration.valueType
  const key = patch.key ?? declaration.key
  const value = patch.defaultValue ?? (valueType === declaration.valueType
    ? declaration.defaultValue
    : defaultValueForType(valueType))
  if (valueType === 'boolean') return { key, valueType, defaultValue: typeof value === 'boolean' ? value : false }
  if (valueType === 'number') return { key, valueType, defaultValue: typeof value === 'number' && Number.isFinite(value) ? value : 0 }
  if (valueType === 'string') return { key, valueType, defaultValue: typeof value === 'string' ? value : '' }
  return { key, valueType, defaultValue: null }
}

const VALUE_TYPE_LABELS: Record<CourseStateDeclaration['valueType'], string> = {
  boolean: '是 / 否',
  number: '数字',
  string: '文字',
  null: '暂未填写',
}

function CourseStateEditor({
  project,
  disabled,
  onCommit,
}: Pick<V9CourseLogicEditorProps, 'project' | 'disabled' | 'onCommit'>) {
  const nextKey = useMemo(() => {
    let index = project.courseState.length + 1
    while (project.courseState.some((state) => state.key === `课程变量${index}`)) index += 1
    return `课程变量${index}`
  }, [project.courseState])
  const update = (previousKey: string, declaration: CourseStateDeclaration, message: string) => {
    onCommit((current) => updateCourseStateDeclaration(current, previousKey, declaration), message)
  }

  return (
    <section className="course-properties course-logic-section" aria-label="课程变量">
      <div className="course-logic-heading">
        <div>
          <h3>课程变量</h3>
          <p className="course-empty">记录“是否完成”“得分”等课程进度，供内容与翻页条件共同使用。</p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onCommit(
            (current) => addCourseStateDeclaration(current, { key: nextKey, valueType: 'boolean', defaultValue: false }),
            `已添加课程变量“${nextKey}”`,
          )}
        >添加变量</button>
      </div>
      {project.courseState.length === 0 ? (
        <p className="v9-interaction-empty">还没有课程变量。先添加变量，再设置需要满足的翻页条件。</p>
      ) : (
        <div className="course-logic-list">
          {project.courseState.map((declaration) => (
            <article className="course-logic-card" key={declaration.key} aria-label={`课程变量：${declaration.key}`}>
              <label>
                <span>变量名称</span>
                <CommitField
                  ariaLabel={`变量名称 ${declaration.key}`}
                  value={declaration.key}
                  disabled={disabled}
                  onCommit={(key) => update(declaration.key, declarationWith(declaration, { key }), '已重命名课程变量')}
                />
              </label>
              <label>
                <span>记录内容</span>
                <select
                  aria-label={`变量类型 ${declaration.key}`}
                  value={declaration.valueType}
                  disabled={disabled}
                  onChange={(event) => update(
                    declaration.key,
                    declarationWith(declaration, { valueType: event.currentTarget.value as CourseStateDeclaration['valueType'] }),
                    '已更改课程变量类型',
                  )}
                >
                  {Object.entries(VALUE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>
                <span>课程开始时</span>
                {declaration.valueType === 'boolean' ? (
                  <select
                    aria-label={`变量初始值 ${declaration.key}`}
                    value={declaration.defaultValue ? 'true' : 'false'}
                    disabled={disabled}
                    onChange={(event) => update(
                      declaration.key,
                      { ...declaration, defaultValue: event.currentTarget.value === 'true' },
                      '已更新课程变量初始值',
                    )}
                  >
                    <option value="false">否</option>
                    <option value="true">是</option>
                  </select>
                ) : declaration.valueType === 'number' ? (
                  <CommitNumberField
                    ariaLabel={`变量初始值 ${declaration.key}`}
                    value={declaration.defaultValue}
                    disabled={disabled}
                    onCommit={(defaultValue) => update(declaration.key, { ...declaration, defaultValue }, '已更新课程变量初始值')}
                  />
                ) : declaration.valueType === 'string' ? (
                  <CommitField
                    ariaLabel={`变量初始值 ${declaration.key}`}
                    value={declaration.defaultValue}
                    allowEmpty
                    disabled={disabled}
                    onCommit={(defaultValue) => update(declaration.key, { ...declaration, defaultValue }, '已更新课程变量初始值')}
                  />
                ) : <span className="course-logic-static-value">暂未填写</span>}
              </label>
              <button
                type="button"
                className="is-danger"
                disabled={disabled}
                onClick={() => onCommit(
                  (current) => deleteCourseStateDeclaration(current, declaration.key),
                  `已删除课程变量“${declaration.key}”及其关联条件`,
                )}
              >删除变量</button>
            </article>
          ))}
        </div>
      )}
      <p className="v9-interaction-note">互动组件和动态内容可以更新这些记录；普通画面动作目前不会直接改写课程变量。</p>
    </section>
  )
}

const OPERATOR_LABELS: Record<Extract<CourseStateCondition, { type: 'compare' }>['operator'], string> = {
  eq: '等于',
  neq: '不等于',
  gt: '大于',
  gte: '大于或等于',
  lt: '小于',
  lte: '小于或等于',
}

function guardValue(declaration: CourseStateDeclaration): CourseStateScalar {
  if (declaration.valueType === 'boolean') return true
  if (declaration.valueType === 'number') return 1
  if (declaration.valueType === 'string') return '完成'
  return null
}

function defaultGuardCondition(declaration: CourseStateDeclaration): CourseStateCondition {
  return { type: 'compare', key: declaration.key, operator: 'eq', value: guardValue(declaration) }
}

function conditionForKey(condition: CourseStateCondition, declaration: CourseStateDeclaration): CourseStateCondition {
  if (condition.type === 'exists') return { ...condition, key: declaration.key }
  return { type: 'compare', key: declaration.key, operator: 'eq', value: guardValue(declaration) }
}

function GuardConditionEditor({
  condition,
  declarations,
  disabled,
  onChange,
  onDelete,
  canDelete,
}: {
  condition: CourseStateCondition
  declarations: readonly CourseStateDeclaration[]
  disabled?: boolean
  onChange(condition: CourseStateCondition): void
  onDelete(): void
  canDelete: boolean
}) {
  const declaration = declarations.find((candidate) => candidate.key === condition.key) ?? declarations[0]!
  const comparisonOperators = declaration.valueType === 'number'
    ? Object.entries(OPERATOR_LABELS)
    : Object.entries(OPERATOR_LABELS).filter(([operator]) => operator === 'eq' || operator === 'neq')
  return (
    <div className="course-logic-condition">
      <label>
        <span>判断方式</span>
        <select
          aria-label="判断方式"
          value={condition.type}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value === 'exists'
            ? { type: 'exists', key: declaration.key, exists: true }
            : defaultGuardCondition(declaration))}
        >
          <option value="compare">比较内容</option>
          <option value="exists">是否已经记录</option>
        </select>
      </label>
      <label>
        <span>课程变量</span>
        <select
          aria-label="条件课程变量"
          value={condition.key}
          disabled={disabled}
          onChange={(event) => {
            const next = declarations.find((candidate) => candidate.key === event.currentTarget.value)
            if (next) onChange(conditionForKey(condition, next))
          }}
        >
          {declarations.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.key}</option>)}
        </select>
      </label>
      {condition.type === 'exists' ? (
        <label>
          <span>需要的状态</span>
          <select
            aria-label="是否已经记录"
            value={condition.exists ? 'yes' : 'no'}
            disabled={disabled}
            onChange={(event) => onChange({ ...condition, exists: event.currentTarget.value === 'yes' })}
          >
            <option value="yes">已经记录</option>
            <option value="no">尚未记录</option>
          </select>
        </label>
      ) : (
        <>
          <label>
            <span>比较关系</span>
            <select
              aria-label="比较关系"
              value={condition.operator}
              disabled={disabled}
              onChange={(event) => onChange({ ...condition, operator: event.currentTarget.value as typeof condition.operator })}
            >
              {comparisonOperators.map(([operator, label]) => <option key={operator} value={operator}>{label}</option>)}
            </select>
          </label>
          <label>
            <span>需要达到</span>
            {declaration.valueType === 'boolean' ? (
              <select
                aria-label="比较值"
                value={condition.value === true ? 'true' : 'false'}
                disabled={disabled}
                onChange={(event) => onChange({ ...condition, value: event.currentTarget.value === 'true' })}
              >
                <option value="true">是</option>
                <option value="false">否</option>
              </select>
            ) : declaration.valueType === 'number' ? (
              <CommitNumberField
                ariaLabel="比较值"
                value={typeof condition.value === 'number' ? condition.value : 0}
                disabled={disabled}
                onCommit={(value) => onChange({ ...condition, value })}
              />
            ) : declaration.valueType === 'string' ? (
              <CommitField
                ariaLabel="比较值"
                value={typeof condition.value === 'string' ? condition.value : ''}
                allowEmpty
                disabled={disabled}
                onCommit={(value) => onChange({ ...condition, value })}
              />
            ) : <span className="course-logic-static-value">暂未填写</span>}
          </label>
        </>
      )}
      <button type="button" disabled={disabled || !canDelete} onClick={onDelete}>移除此项</button>
    </div>
  )
}

function NavigationGuardEditor({
  project,
  disabled,
  onCommit,
}: Pick<V9CourseLogicEditorProps, 'project' | 'disabled' | 'onCommit'>) {
  const replace = (guards: CourseNavigationGuard[], message: string) => {
    onCommit((current) => replaceCourseNavigationGuards(current, guards), message)
  }
  const changeGuard = (id: string, next: CourseNavigationGuard, message: string) => replace(
    project.navigationGuards.map((guard) => guard.id === id ? next : guard),
    message,
  )
  const canAdd = project.courseState.length > 0 && project.locations.length > 0

  return (
    <section className="course-properties course-logic-section" aria-label="翻页条件">
      <div className="course-logic-heading">
        <div>
          <h3>翻页条件</h3>
          <p className="course-empty">进入指定位置前检查课程变量；未满足时停在原处并显示教师可读提示。</p>
        </div>
        <button
          type="button"
          disabled={disabled || !canAdd}
          onClick={() => {
            const declaration = project.courseState[0]
            const location = project.locations[0]
            if (!declaration || !location) return
            replace([...project.navigationGuards, {
              id: `guard-${nanoid(10)}`,
              effect: 'block',
              toLocationIds: [location.id],
              match: 'all',
              conditions: [defaultGuardCondition(declaration)],
              message: '请先完成前面的学习任务。',
            }], '已添加翻页条件')
          }}
        >添加翻页条件</button>
      </div>
      {!canAdd && <p className="v9-interaction-note">至少需要一个课程变量和一个可到达位置，才能添加翻页条件。</p>}
      {project.navigationGuards.length === 0 ? (
        <p className="v9-interaction-empty">当前课程没有受限位置。</p>
      ) : (
        <div className="course-logic-list">
          {project.navigationGuards.map((guard, index) => (
            <article className="course-logic-card course-logic-guard" key={guard.id} aria-label={`翻页条件 ${index + 1}`}>
              <header className="course-logic-card__header">
                <strong>翻页条件 {index + 1}</strong>
                <button
                  type="button"
                  className="is-danger"
                  disabled={disabled}
                  onClick={() => replace(project.navigationGuards.filter((candidate) => candidate.id !== guard.id), '已删除翻页条件')}
                >删除</button>
              </header>
              <fieldset className="course-logic-location-list">
                <legend>要进入的位置</legend>
                {project.locations.map((location) => (
                  <label key={location.id}>
                    <input
                      type="checkbox"
                      checked={guard.toLocationIds.includes(location.id)}
                      disabled={disabled || (guard.toLocationIds.length === 1 && guard.toLocationIds[0] === location.id)}
                      onChange={(event) => changeGuard(guard.id, {
                        ...guard,
                        toLocationIds: event.currentTarget.checked
                          ? [...guard.toLocationIds, location.id]
                          : guard.toLocationIds.filter((id) => id !== location.id),
                      }, '已更新受限位置')}
                    />
                    <span>{location.label}</span>
                  </label>
                ))}
              </fieldset>
              <label>
                <span>满足方式</span>
                <select
                  aria-label={`满足方式 ${index + 1}`}
                  value={guard.match}
                  disabled={disabled}
                  onChange={(event) => changeGuard(guard.id, { ...guard, match: event.currentTarget.value as CourseNavigationGuard['match'] }, '已更新条件组合方式')}
                >
                  <option value="all">以下每一项都满足</option>
                  <option value="any">以下任意一项满足</option>
                </select>
              </label>
              <div className="course-logic-conditions">
                {guard.conditions.map((condition, conditionIndex) => (
                  <GuardConditionEditor
                    key={`${condition.key}-${conditionIndex}`}
                    condition={condition}
                    declarations={project.courseState}
                    disabled={disabled}
                    canDelete={guard.conditions.length > 1}
                    onChange={(next) => changeGuard(guard.id, {
                      ...guard,
                      conditions: guard.conditions.map((candidate, candidateIndex) => candidateIndex === conditionIndex ? next : candidate),
                    }, '已更新翻页判断')}
                    onDelete={() => changeGuard(guard.id, {
                      ...guard,
                      conditions: guard.conditions.filter((_, candidateIndex) => candidateIndex !== conditionIndex),
                    }, '已移除翻页判断')}
                  />
                ))}
              </div>
              <button
                type="button"
                disabled={disabled || project.courseState.length === 0}
                onClick={() => changeGuard(guard.id, {
                  ...guard,
                  conditions: [...guard.conditions, defaultGuardCondition(project.courseState[0]!)],
                }, '已添加翻页判断')}
              >添加一项判断</button>
              <label>
                <span>未满足时提示</span>
                <CommitField
                  ariaLabel={`未满足时提示 ${index + 1}`}
                  value={guard.message}
                  multiline
                  disabled={disabled}
                  onCommit={(message) => changeGuard(guard.id, { ...guard, message }, '已更新阻止提示')}
                />
              </label>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export function V9CourseLogicEditor({
  project,
  activeSurface,
  activeScene,
  layerEntries,
  selectedLayerItemId,
  disabled,
  onCommit,
}: V9CourseLogicEditorProps) {
  const commitGlobalInteractions = (rules: InteractionRule[], message: string) => {
    onCommit((current) => replaceCourseGlobalInteractions(current, rules), message)
  }
  return (
    <div className="v9-course-logic-editor">
      <V9GlobalInteractionEditor
        project={project}
        activeSurface={activeSurface}
        activeScene={activeScene}
        layerEntries={layerEntries}
        selectedLayerItemId={selectedLayerItemId}
        disabled={disabled}
        onCommit={commitGlobalInteractions}
      />
      <CourseStateEditor project={project} disabled={disabled} onCommit={onCommit} />
      <NavigationGuardEditor project={project} disabled={disabled} onCommit={onCommit} />
    </div>
  )
}
