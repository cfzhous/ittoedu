import {
  Box,
  ChevronDown,
  MoreHorizontal,
} from 'lucide-react'
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { APP_NAME } from '../../../shared/constants'
import './v9-editor-shell.css'

export type V9EditorMode = 'simple' | 'professional'

export type V9InspectorTabId =
  | 'elements'
  | 'layers'
  | 'properties'
  | 'interaction'
  | 'developer'

export interface V9EditorToolbarAction {
  id: string
  label: string
  icon?: ReactNode
  title?: string
  shortcut?: string
  disabled?: boolean
  active?: boolean
  emphasis?: 'default' | 'primary' | 'danger'
  testId?: string
  onSelect(): void
}

export interface V9EditorToolbarGroups {
  file: readonly V9EditorToolbarAction[]
  history: readonly V9EditorToolbarAction[]
  session: readonly V9EditorToolbarAction[]
  output: readonly V9EditorToolbarAction[]
  more?: readonly V9EditorToolbarAction[]
}

export interface V9EditorInspectorPanels {
  elements: ReactNode
  layers: ReactNode
  properties: ReactNode
  interaction: ReactNode
  developer?: ReactNode
}

export interface V9EditorShellProps {
  mode: V9EditorMode
  onModeChange(mode: V9EditorMode): void
  projectTitle: string
  projectMeta?: string
  dirty?: boolean
  busy?: boolean
  brandName?: string
  brandMark?: ReactNode
  toolbar: V9EditorToolbarGroups
  structureTitle?: string
  structureActions?: ReactNode
  structure: ReactNode
  workspaceTools?: ReactNode
  workspace: ReactNode
  activeInspectorTab: V9InspectorTabId
  onInspectorTabChange(tab: V9InspectorTabId): void
  inspectorPanels: V9EditorInspectorPanels
  status?: ReactNode
  selectionStatus?: ReactNode
  viewportStatus?: ReactNode
  professionalStatus?: ReactNode
}

interface ToolbarGroupProps {
  id: keyof Pick<V9EditorToolbarGroups, 'file' | 'history' | 'session' | 'output'>
  label: string
  actions: readonly V9EditorToolbarAction[]
  busy: boolean
}

const inspectorTabs: ReadonlyArray<{
  id: V9InspectorTabId
  label: string
}> = [
  { id: 'elements', label: '元素' },
  { id: 'layers', label: '图层' },
  { id: 'properties', label: '属性' },
  { id: 'interaction', label: '互动' },
  { id: 'developer', label: '开发' },
]

function actionTitle(action: V9EditorToolbarAction): string {
  if (action.title) return action.title
  return action.shortcut
    ? `${action.label}（${action.shortcut}）`
    : action.label
}

function ToolbarActionButton({
  action,
  busy,
  inMenu = false,
  onSelected,
}: {
  action: V9EditorToolbarAction
  busy: boolean
  inMenu?: boolean
  onSelected?(): void
}) {
  const emphasis = action.emphasis ?? 'default'
  return (
    <button
      type="button"
      role={inMenu ? 'menuitem' : undefined}
      className={`v9-editor-shell__tool-action v9-editor-shell__tool-action--${emphasis}${action.active ? ' is-active' : ''}`}
      title={actionTitle(action)}
      aria-label={actionTitle(action)}
      aria-pressed={action.active === undefined ? undefined : action.active}
      disabled={busy || action.disabled}
      data-testid={action.testId}
      onClick={() => {
        action.onSelect()
        onSelected?.()
      }}
    >
      {action.icon && (
        <span className="v9-editor-shell__tool-icon" aria-hidden="true">
          {action.icon}
        </span>
      )}
      <span className="v9-editor-shell__tool-label">{action.label}</span>
    </button>
  )
}

function ToolbarGroup({ id, label, actions, busy }: ToolbarGroupProps) {
  return (
    <div
      className="v9-editor-shell__tool-group"
      data-toolbar-group={id}
      role="group"
      aria-label={label}
    >
      {actions.map((action) => (
        <ToolbarActionButton key={action.id} action={action} busy={busy} />
      ))}
    </div>
  )
}

function MoreActions({
  actions,
  busy,
}: {
  actions: readonly V9EditorToolbarAction[]
  busy: boolean
}) {
  const [open, setOpen] = useState(false)

  if (actions.length === 0) return null

  return (
    <div className="v9-editor-shell__more">
      <button
        type="button"
        className="v9-editor-shell__more-trigger"
        aria-label="更多操作"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={busy}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
        <span>更多</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div className="v9-editor-shell__more-menu" role="menu" aria-label="更多操作">
          {actions.map((action) => (
            <div key={action.id} role="none">
              <ToolbarActionButton
                action={action}
                busy={busy}
                inMenu
                onSelected={() => setOpen(false)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function V9EditorShell({
  mode,
  onModeChange,
  projectTitle,
  projectMeta,
  dirty = false,
  busy = false,
  brandName = APP_NAME,
  brandMark,
  toolbar,
  structureTitle = '课程结构',
  structureActions,
  structure,
  workspaceTools,
  workspace,
  activeInspectorTab,
  onInspectorTabChange,
  inspectorPanels,
  status,
  selectionStatus,
  viewportStatus,
  professionalStatus,
}: V9EditorShellProps) {
  const visibleInspectorTabs = useMemo(
    () => mode === 'professional'
      ? inspectorTabs
      : inspectorTabs.filter((tab) => tab.id !== 'developer'),
    [mode],
  )
  const resolvedInspectorTab = visibleInspectorTabs.some(
    (tab) => tab.id === activeInspectorTab,
  )
    ? activeInspectorTab
    : 'elements'
  const activePanel = inspectorPanels[resolvedInspectorTab]
  const tabStyle = {
    '--v9-inspector-tab-count': visibleInspectorTabs.length,
  } as CSSProperties

  return (
    <div
      className={`v9-editor-shell v9-editor-shell--${mode}`}
      data-editor-mode={mode}
      data-testid="v9-editor-shell"
    >
      <header className="v9-editor-shell__topbar" data-testid="v9-editor-topbar">
        <div className="v9-editor-shell__brand" title={brandName}>
          <span className="v9-editor-shell__brand-mark" aria-hidden="true">
            {brandMark ?? <Box size={18} />}
          </span>
          <span className="v9-editor-shell__brand-name">{brandName}</span>
        </div>

        <div className="v9-editor-shell__mode-switch" role="group" aria-label="编辑器模式">
          <button
            type="button"
            className={mode === 'simple' ? 'is-active' : undefined}
            aria-pressed={mode === 'simple'}
            onClick={() => onModeChange('simple')}
          >
            简洁
          </button>
          <button
            type="button"
            className={mode === 'professional' ? 'is-active' : undefined}
            aria-pressed={mode === 'professional'}
            onClick={() => onModeChange('professional')}
          >
            专业
          </button>
        </div>

        <div className="v9-editor-shell__task-groups">
          <ToolbarGroup id="file" label="文件" actions={toolbar.file} busy={busy} />
          <ToolbarGroup id="history" label="历史" actions={toolbar.history} busy={busy} />
          <ToolbarGroup id="session" label="编辑与运行" actions={toolbar.session} busy={busy} />
          <ToolbarGroup id="output" label="预览与导出" actions={toolbar.output} busy={busy} />
        </div>

        <div className="v9-editor-shell__project" title={projectTitle}>
          <strong>{projectTitle}{dirty ? ' *' : ''}</strong>
          {projectMeta && <span>{projectMeta}</span>}
        </div>

        <MoreActions actions={toolbar.more ?? []} busy={busy} />
      </header>

      <div className="v9-editor-shell__body">
        <aside className="v9-editor-shell__structure" aria-label={structureTitle}>
          <header className="v9-editor-shell__panel-header">
            <h2>{structureTitle}</h2>
            {structureActions && (
              <div className="v9-editor-shell__panel-actions">{structureActions}</div>
            )}
          </header>
          <div className="v9-editor-shell__structure-content">{structure}</div>
        </aside>

        <main className="v9-editor-shell__center" aria-label="课件编辑区">
          <div className="v9-editor-shell__workspace-tools" aria-label="画布工具">
            {workspaceTools}
          </div>
          <div className="v9-editor-shell__workspace">{workspace}</div>
        </main>

        <aside className="v9-editor-shell__inspector" aria-label="编辑面板">
          <div
            className="v9-editor-shell__inspector-tabs"
            role="tablist"
            aria-label="编辑面板"
            style={tabStyle}
          >
            {visibleInspectorTabs.map((tab) => (
              <button
                key={tab.id}
                id={`v9-editor-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-controls={`v9-editor-panel-${tab.id}`}
                aria-selected={resolvedInspectorTab === tab.id}
                tabIndex={resolvedInspectorTab === tab.id ? 0 : -1}
                onClick={() => onInspectorTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div
            id={`v9-editor-panel-${resolvedInspectorTab}`}
            className="v9-editor-shell__inspector-content"
            role="tabpanel"
            aria-labelledby={`v9-editor-tab-${resolvedInspectorTab}`}
          >
            {activePanel}
          </div>
        </aside>
      </div>

      <footer className="v9-editor-shell__statusbar" aria-label="编辑器状态">
        <span
          className={`v9-editor-shell__status-dot${busy ? ' is-busy' : ''}`}
          aria-hidden="true"
        />
        <div className="v9-editor-shell__status-primary">
          {status ?? (busy ? '正在处理' : '已就绪')}
        </div>
        {selectionStatus && (
          <div className="v9-editor-shell__status-selection">{selectionStatus}</div>
        )}
        <div className="v9-editor-shell__status-spacer" />
        {mode === 'professional' && professionalStatus && (
          <div className="v9-editor-shell__status-professional">{professionalStatus}</div>
        )}
        {viewportStatus && (
          <div className="v9-editor-shell__status-viewport">{viewportStatus}</div>
        )}
      </footer>
    </div>
  )
}
