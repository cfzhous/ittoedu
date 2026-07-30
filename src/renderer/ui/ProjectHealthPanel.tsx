import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Info,
  LocateFixed,
  X,
} from 'lucide-react'
import { useMemo } from 'react'
import {
  collectProjectHealth,
  summarizeProjectHealth,
  type ProjectHealthDiagnostic,
} from '../../shared/projectHealth'
import { resolveProjectHealthRoute } from '../diagnostics/projectHealthNavigation'
import { useEditorStore } from '../store/editorStore'

export interface ProjectHealthPanelProps {
  open: boolean
  onClose(): void
  onExportDiagnostics?(): void
}

const severityLabel = {
  error: '错误',
  warning: '提醒',
  info: '建议',
} as const

function SeverityIcon({ severity }: Pick<ProjectHealthDiagnostic, 'severity'>) {
  if (severity === 'error') return <CircleAlert size={17} aria-hidden="true" />
  if (severity === 'warning') return <AlertTriangle size={17} aria-hidden="true" />
  return <Info size={17} aria-hidden="true" />
}

export function ProjectHealthPanel({
  open,
  onClose,
  onExportDiagnostics,
}: ProjectHealthPanelProps) {
  const project = useEditorStore((state) => state.project)
  const diagnostics = useMemo(() => collectProjectHealth(project), [project])
  const summary = useMemo(() => summarizeProjectHealth(diagnostics), [diagnostics])

  if (!open) return null

  const locate = (diagnostic: ProjectHealthDiagnostic) => {
    const route = resolveProjectHealthRoute(project, diagnostic)
    const store = useEditorStore.getState()
    store.setEditingScope(route.scope)
    if (route.sceneId) store.setActiveScene(route.sceneId)
    if (route.stateId !== undefined) store.setActivePresentationState(route.stateId)
    if (route.nodeId) store.selectNode(route.nodeId)
    if (route.tab === 'automation' || diagnostic.scope === 'component-package') {
      store.setEditorMode('professional')
    }
    store.setActiveTab(route.tab)
    store.setStatus(`已定位：${diagnostic.message}`)
    onClose()
  }

  return (
    <div className="modal-backdrop project-health-backdrop" role="presentation">
      <section
        className="project-health-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-health-title"
      >
        <header className="project-health-panel__header">
          <div>
            <h2 id="project-health-title">工程检查</h2>
            <p>集中检查丢失引用、无效跳转、组件包与静态兜底；不会修改工程。</p>
          </div>
          <button type="button" aria-label="关闭工程检查" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="project-health-summary" aria-label="工程检查摘要">
          <span className="is-error"><CircleAlert size={15} />{summary.error} 个错误</span>
          <span className="is-warning"><AlertTriangle size={15} />{summary.warning} 个提醒</span>
          <span className="is-info"><Info size={15} />{summary.info} 个建议</span>
        </div>

        <div className="project-health-panel__body">
          {diagnostics.length === 0 ? (
            <div className="project-health-empty">
              <CheckCircle2 size={34} />
              <strong>未发现工程问题</strong>
              <span>当前引用关系和交付配置完整。</span>
            </div>
          ) : (
            <ol className="project-health-list">
              {diagnostics.map((diagnostic, index) => (
                <li
                  key={`${diagnostic.code}:${diagnostic.path.join('.')}:${index}`}
                  className={`project-health-issue is-${diagnostic.severity}`}
                >
                  <SeverityIcon severity={diagnostic.severity} />
                  <span className="project-health-issue__content">
                    <strong>{severityLabel[diagnostic.severity]}</strong>
                    <span>{diagnostic.message}</span>
                    <small>{diagnostic.code}</small>
                  </span>
                  <button type="button" onClick={() => locate(diagnostic)}>
                    <LocateFixed size={14} />定位
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>

        <footer className="project-health-panel__footer">
          <span>{summary.canExport ? '没有阻断导出的错误。' : '请先处理错误，再导出成品。'}</span>
          <div className="project-health-panel__footer-actions">
            {onExportDiagnostics && (
              <button type="button" className="secondary-button" onClick={onExportDiagnostics}>
                导出诊断报告
              </button>
            )}
            <button type="button" className="secondary-button" onClick={onClose}>关闭</button>
          </div>
        </footer>
      </section>
    </div>
  )
}
