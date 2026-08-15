import {
  Copy,
  Image as ImageIcon,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ensureScenePresentation } from '../../shared/presentation'
import type { ScenePresentationState } from '../../shared/projectTypes'
import { selectActiveScene, useEditorStore } from '../store/editorStore'
import { ConfirmDialog } from './ConfirmDialog'

type PendingAction = 'delete' | 'reset' | null

export type SceneStateStripEditingScope = 'scene' | 'surface' | 'global'
export type SceneStateStripEditorMode = 'simple' | 'professional'

export interface SceneStateStripStateRow {
  readonly id: string
  readonly name: string
  readonly overrideCount: number
  readonly incomingCount: number
  readonly scopedCount: number
  readonly initial: boolean
  readonly thumbnail: boolean
}

/**
 * Narrow document-control port shared by the legacy V8 adapter and the V9
 * course session. Supplying this port keeps the strip independent from the
 * legacy editor Store and presentation materializer.
 */
export interface SceneStateStripDocumentControl {
  /** Explains why the current course location has no scene-state surface. */
  readonly unavailableReason?: string
  readonly editingScope: SceneStateStripEditingScope
  readonly editorMode: SceneStateStripEditorMode
  readonly activeStateId: string | null
  readonly states: readonly SceneStateStripStateRow[]
  onSetEditorMode(mode: SceneStateStripEditorMode): void
  onActivateState(stateId: string | null): void
  onAddState(): void
  onDuplicateState(stateId: string): void
  onRenameState(stateId: string, name: string): void
  onSetInitialState(stateId: string): void
  onSetThumbnailState(stateId: string): void
  onClearState(stateId: string): void
  onDeleteState(stateId: string): void
}

export interface SceneStateStripProps {
  documentControl?: SceneStateStripDocumentControl
}

function countStateOverrides(state: ScenePresentationState): number {
  let count = Object.keys(state.nodeOverrides).length
  if (Object.prototype.hasOwnProperty.call(state, 'backgroundColor')) count += 1
  if (Object.prototype.hasOwnProperty.call(state, 'backgroundAssetId')) count += 1
  if (Object.prototype.hasOwnProperty.call(state, 'nodeOrder')) count += 1
  return count
}

export function SceneStateStrip({ documentControl }: SceneStateStripProps = {}) {
  if (documentControl?.unavailableReason) {
    return (
      <section className="scene-state-strip" aria-label="场景状态">
        <div
          className="scene-state-strip__empty"
          role="status"
          data-testid="scene-state-strip-course-location-gate"
        >
          <strong>当前内容暂不可编辑</strong>
          <span>{documentControl.unavailableReason}</span>
        </div>
      </section>
    )
  }
  if (documentControl) {
    return <SceneStateStripView documentControl={documentControl} />
  }
  return <LegacySceneStateStripAdapter />
}

function LegacySceneStateStripAdapter() {
  const scene = useEditorStore(selectActiveScene)
  const editingScope = useEditorStore((state) => state.editingScope)
  const editorMode = useEditorStore((state) => state.editorMode)
  const setEditorMode = useEditorStore((state) => state.setEditorMode)
  const activeStateId = useEditorStore(
    (state) => state.activePresentationStateId,
  )
  const setActiveState = useEditorStore(
    (state) => state.setActivePresentationState,
  )
  const addState = useEditorStore((state) => state.addPresentationState)
  const duplicateState = useEditorStore(
    (state) => state.duplicatePresentationState,
  )
  const renameState = useEditorStore(
    (state) => state.renamePresentationState,
  )
  const deleteState = useEditorStore(
    (state) => state.deletePresentationState,
  )
  const setInitialState = useEditorStore(
    (state) => state.setInitialPresentationState,
  )
  const setThumbnailState = useEditorStore(
    (state) => state.setThumbnailPresentationState,
  )
  const clearState = useEditorStore(
    (state) => state.clearPresentationStateOverrides,
  )
  const presentation = useMemo(
    () => ensureScenePresentation(scene),
    [scene],
  )
  const states = useMemo<SceneStateStripStateRow[]>(
    () => presentation.states.map((state) => ({
      id: state.id,
      name: state.name,
      overrideCount: countStateOverrides(state),
      incomingCount: scene.interactions.filter((rule) =>
        rule.actions.some(({ action }) =>
          action.type === 'presentation.set' && action.stateId === state.id,
        ),
      ).length,
      scopedCount: scene.interactions.filter((rule) =>
        rule.conditions.some((condition) =>
          condition.type === 'presentation.in' && condition.stateIds.includes(state.id),
        ),
      ).length,
      initial: state.id === presentation.initialStateId,
      thumbnail: state.id === presentation.thumbnailStateId,
    })),
    [presentation, scene.interactions],
  )

  return (
    <SceneStateStripView
      documentControl={{
        editingScope,
        editorMode,
        activeStateId,
        states,
        onSetEditorMode: setEditorMode,
        onActivateState: setActiveState,
        onAddState: () => addState(),
        onDuplicateState: duplicateState,
        onRenameState: renameState,
        onSetInitialState: setInitialState,
        onSetThumbnailState: setThumbnailState,
        onClearState: clearState,
        onDeleteState: (stateId) => { deleteState(stateId) },
      }}
    />
  )
}

function SceneStateStripView({
  documentControl,
}: {
  documentControl: SceneStateStripDocumentControl
}) {
  const {
    editingScope,
    editorMode,
    activeStateId,
    states,
    onSetEditorMode,
    onActivateState,
    onAddState,
    onDuplicateState,
    onRenameState,
    onSetInitialState,
    onSetThumbnailState,
    onClearState,
    onDeleteState,
  } = documentControl
  const [editingStateId, setEditingStateId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const activeState = activeStateId === null
    ? null
    : states.find((state) => state.id === activeStateId) ?? null

  useEffect(() => {
    if (
      editingStateId &&
      !states.some((state) => state.id === editingStateId)
    ) {
      setEditingStateId(null)
    }
  }, [editingStateId, states])

  const startRename = () => {
    if (!activeState) return
    setEditingStateId(activeState.id)
    setDraftName(activeState.name)
  }

  const commitRename = () => {
    if (editingStateId && draftName.trim()) {
      onRenameState(editingStateId, draftName)
    }
    setEditingStateId(null)
  }

  if (editingScope !== 'scene') {
    return (
      <section className="scene-state-strip scene-state-strip--global" aria-label="场景状态">
        <div className="scene-state-strip__empty">
          <strong>场景状态</strong>
          <span>{editingScope === 'global'
            ? '全局层跨场景常驻，不参与单个场景的状态切换。'
            : '当前内容共用元素由所有场景共享，不参与单个场景的状态切换。'}</span>
        </div>
      </section>
    )
  }

  return (
    <section className="scene-state-strip" aria-label="场景状态">
      <header className="scene-state-strip__header">
        <div className="scene-state-strip__title">
          <strong>{editorMode === 'simple' ? '场景画面' : '场景状态'}</strong>
          <span>
            {activeState
              ? `正在编辑“${activeState.name}”的覆盖值`
              : editorMode === 'simple'
                ? '基础画面的修改会同步到继承它的其他画面'
                : '正在编辑基础；修改会被所有状态继承'}
          </span>
        </div>
        {editorMode === 'professional' ? (
          <div className="scene-state-strip__actions" aria-label="状态操作">
          <button
            type="button"
            className="state-action"
            aria-label="新建场景状态"
            title="新建场景状态"
            onClick={onAddState}
          >
            <Plus size={14} /><span>新状态</span>
          </button>
          <button
            type="button"
            className="state-action"
            onClick={() => activeState ? onDuplicateState(activeState.id) : onAddState()}
            aria-label={activeState ? '复制当前状态' : '从基础新建状态'}
            title={activeState ? '复制当前状态及其覆盖' : '从基础创建空状态'}
          >
            <Copy size={14} /><span>复制</span>
          </button>
          <button
            type="button"
            className="state-action"
            disabled={!activeState}
            aria-label="重命名当前状态"
            title={activeState ? '重命名当前状态' : '请先选择一个命名状态'}
            onClick={startRename}
          >
            <Pencil size={14} /><span>改名</span>
          </button>
          <button
            type="button"
            className="state-action"
            disabled={!activeState || activeState.initial}
            aria-label="将当前状态设为运行初始状态"
            title={activeState?.initial ? '当前已是运行初始状态' : '设为运行初始状态'}
            onClick={() => activeState && onSetInitialState(activeState.id)}
          >
            <Star size={14} /><span>设为初始</span>
          </button>
          <button
            type="button"
            className="state-action"
            disabled={!activeState || activeState.thumbnail}
            aria-label="将当前状态设为场景缩略图状态"
            title={activeState?.thumbnail ? '当前已用于场景缩略图' : '用于左侧场景缩略图'}
            onClick={() => activeState && onSetThumbnailState(activeState.id)}
          >
            <ImageIcon size={14} /><span>设为缩略图</span>
          </button>
          <button
            type="button"
            className="state-action"
            disabled={!activeState}
            aria-label="清除当前状态的全部覆盖"
            title={activeState ? '恢复为基础场景外观' : '基础场景没有状态覆盖'}
            onClick={() => setPendingAction('reset')}
          >
            <RotateCcw size={14} /><span>清除覆盖</span>
          </button>
          <button
            type="button"
            className="state-action state-action--danger"
            disabled={!activeState || states.length <= 1}
            aria-label="删除当前状态"
            title={states.length <= 1 ? '至少保留一个命名状态' : '删除当前状态'}
            onClick={() => setPendingAction('delete')}
          >
            <Trash2 size={14} /><span>删除</span>
          </button>
          </div>
        ) : (
          <button
            type="button"
            className="state-action scene-state-strip__professional-link"
            onClick={() => onSetEditorMode('professional')}
          >
            管理状态
          </button>
        )}
      </header>

      <ul className="scene-state-strip__track" aria-label="当前场景状态列表">
        <li className="scene-state-card-shell">
          <button
            type="button"
            className={`scene-state-card scene-state-card--base${activeStateId === null ? ' scene-state-card--active' : ''}`}
            aria-pressed={activeStateId === null}
            aria-label="基础场景，所有命名状态的继承源"
            onClick={() => onActivateState(null)}
          >
            <span className="scene-state-card__preview">基础</span>
            <span className="scene-state-card__name">基础场景</span>
            <small>所有命名状态的继承源</small>
          </button>
        </li>

        {states.map((state) => {
          const active = state.id === activeStateId
          const isInitial = state.initial
          const isThumbnail = state.thumbnail
          const overrideSummary = state.overrideCount === 0
            ? '继承基础，无覆盖'
            : `${state.overrideCount} 项覆盖`
          if (editingStateId === state.id) {
            return (
              <li
                key={state.id}
                className="scene-state-card scene-state-card--active scene-state-card--editing"
              >
                <span className="scene-state-card__preview">状态</span>
                <input
                  autoFocus
                  value={draftName}
                  maxLength={80}
                  aria-label="状态名称"
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') setEditingStateId(null)
                  }}
                />
                <small>Enter 保存 · Esc 取消</small>
              </li>
            )
          }
          return (
            <li key={state.id} className="scene-state-card-shell">
              <button
                type="button"
                className={`scene-state-card${active ? ' scene-state-card--active' : ''}`}
                aria-pressed={active}
                aria-label={`${state.name}，命名状态${isInitial ? '，运行初始状态' : ''}${isThumbnail ? '，场景缩略图状态' : ''}，${overrideSummary}`}
                onClick={() => onActivateState(state.id)}
                onDoubleClick={() => {
                  if (editorMode !== 'professional') return
                  onActivateState(state.id)
                  setEditingStateId(state.id)
                  setDraftName(state.name)
                }}
              >
                <span className="scene-state-card__preview">命名状态</span>
                <span className="scene-state-card__name">{state.name}</span>
                <small>{overrideSummary}</small>
                {(state.incomingCount > 0 || state.scopedCount > 0) && (
                  <small className="scene-state-card__links">
                    {state.incomingCount > 0 ? `${state.incomingCount} 个入口` : ''}
                    {state.incomingCount > 0 && state.scopedCount > 0 ? ' · ' : ''}
                    {state.scopedCount > 0 ? `${state.scopedCount} 条状态映射` : ''}
                  </small>
                )}
                <span className="scene-state-card__badges" aria-hidden="true">
                  {isInitial && <i title="运行初始状态"><Star size={9} />初始</i>}
                  {isThumbnail && <i title="场景缩略图状态"><ImageIcon size={9} />缩略图</i>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {editorMode === 'professional' && <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction === 'delete' ? '删除场景状态？' : '清除当前状态的覆盖？'}
        message={pendingAction === 'delete'
          ? `“${activeState?.name ?? ''}”及其全部覆盖值将被删除，基础场景不会受影响。此操作可以撤销。`
          : `“${activeState?.name ?? ''}”将恢复为基础场景的外观。此操作可以撤销。`}
        confirmLabel={pendingAction === 'delete' ? '删除状态' : '清除覆盖'}
        danger={pendingAction === 'delete'}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (activeState) {
            if (pendingAction === 'delete') onDeleteState(activeState.id)
            else onClearState(activeState.id)
          }
          setPendingAction(null)
        }}
      />}
    </section>
  )
}
