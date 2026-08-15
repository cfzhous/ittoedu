import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Info,
  LocateFixed,
  X,
} from 'lucide-react'
import { useMemo } from 'react'
import { analyzeInformationRelease } from '../../shared/informationRelease'
import { analyzeVisualDensity } from '../../shared/visualDensity'
import {
  collectProjectHealth,
  summarizeProjectHealth,
  type ProjectHealthDiagnostic,
  type ProjectHealthSeverity,
} from '../../shared/projectHealth'
import { resolveProjectHealthRoute } from '../diagnostics/projectHealthNavigation'
import { useEditorStore } from '../store/editorStore'

interface ProjectHealthPanelCommonProps {
  open: boolean
  onClose(): void
}

interface LegacyProjectHealthPanelProps extends ProjectHealthPanelCommonProps {
  documentControl?: undefined
  onExportDiagnostics?(): void
}

export interface ProjectHealthPanelSummary {
  readonly error: number
  readonly warning: number
  readonly info: number
  readonly canExport: boolean
}

export interface ProjectHealthPanelDiagnostic {
  readonly severity: ProjectHealthSeverity
  readonly message: string
  readonly code?: string
}

export interface ProjectHealthPanelDocumentControl {
  readonly summary: ProjectHealthPanelSummary
  readonly diagnostics: readonly ProjectHealthPanelDiagnostic[]
  readonly description: string
  readonly footer: string
  onLocate?(diagnostic: ProjectHealthPanelDiagnostic, index: number): void
  onExportDiagnostics?(): void
}

interface ControlledProjectHealthPanelProps extends ProjectHealthPanelCommonProps {
  documentControl: ProjectHealthPanelDocumentControl
  /** Controlled diagnostics must export through their own document port. */
  onExportDiagnostics?: never
}

export type ProjectHealthPanelProps =
  | LegacyProjectHealthPanelProps
  | ControlledProjectHealthPanelProps

const severityLabel = {
  error: '错误',
  warning: '提醒',
  info: '建议',
} as const

function SeverityIcon({ severity }: Pick<ProjectHealthPanelDiagnostic, 'severity'>) {
  if (severity === 'error') return <CircleAlert size={17} aria-hidden="true" />
  if (severity === 'warning') return <AlertTriangle size={17} aria-hidden="true" />
  return <Info size={17} aria-hidden="true" />
}

export function ProjectHealthPanel(props: ProjectHealthPanelProps) {
  if (props.documentControl) {
    const control = props.documentControl
    return (
      <ProjectHealthPanelView
        open={props.open}
        onClose={props.onClose}
        summary={control.summary}
        diagnostics={control.diagnostics}
        description={control.description}
        footer={control.footer}
        onLocate={control.onLocate}
        onExportDiagnostics={control.onExportDiagnostics}
      />
    )
  }
  return <LegacyProjectHealthPanelAdapter {...props} />
}

function LegacyProjectHealthPanelAdapter({
  open,
  onClose,
  onExportDiagnostics,
}: LegacyProjectHealthPanelProps) {
  const project = useEditorStore((state) => state.project)
  const componentPackages = useEditorStore((state) => state.componentPackages)
  const diagnostics = useMemo(
    () => collectProjectHealth(project, componentPackages),
    [project, componentPackages],
  )
  const summary = useMemo(() => summarizeProjectHealth(diagnostics), [diagnostics])
  const informationRelease = useMemo(
    () => analyzeInformationRelease(project),
    [project],
  )
  const visualDensity = useMemo(() => analyzeVisualDensity(project), [project])

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
    <ProjectHealthPanelView
      open={open}
      onClose={onClose}
      summary={summary}
      diagnostics={diagnostics}
      description="集中检查丢失引用、无效跳转、组件包与静态兜底；不会修改工程。"
      footer={summary.canExport ? '没有阻断导出的错误。' : '请先处理错误，再导出成品。'}
      onLocate={locate}
      onExportDiagnostics={onExportDiagnostics}
      supplementaryAnalysis={(
        <>
          <details className="information-release-summary">
            <summary>
              信息释放（只读） · {informationRelease.summary.stateCount} 个状态，
              {informationRelease.summary.revealedCount} 个分步显示，
              {informationRelease.summary.hiddenWithoutRevealCount} 个未连通隐藏节点
            </summary>
            <p>按现有场景、状态和交互规则分析可能的显示路径；运行时、媒体和组件事件只按“可能发生”计算，不模拟真实授课。</p>
            <div className="information-release-grid" role="table" aria-label="信息释放状态概览">
              {informationRelease.states.map((state) => (
                <div className="information-release-row" role="row" key={`${state.sceneId}:${state.stateId}`}>
                  <strong role="cell">{state.sceneName} / {state.stateName}</strong>
                  <span role="cell">初始可见 {state.initialVisibleNodeIds.length}</span>
                  <span role="cell">分步显示 {state.revealSteps.length}</span>
                  <span role="cell" className={state.hiddenWithoutRevealNodeIds.length > 0 ? 'is-warning' : ''}>
                    未连通 {state.hiddenWithoutRevealNodeIds.length}
                  </span>
                </div>
              ))}
            </div>
          </details>

          <details className="information-release-summary visual-density-summary">
            <summary>
              视觉密度（启发式） · 最高 {visualDensity.summary.maximumScore}/100，
              {visualDensity.summary.denseStateCount} 个高密度状态
            </summary>
            <p>分数只汇总对象数量、文字量、面积占用和明显重叠，不判断教学重点或视觉质量，也不会阻断导出。</p>
            <div className="information-release-grid" role="table" aria-label="视觉密度状态概览">
              {visualDensity.states.map((state) => (
                <div className="information-release-row visual-density-row" role="row" key={`${state.sceneId}:${state.stateId}`}>
                  <strong role="cell">{state.sceneName} / {state.stateName}</strong>
                  <span role="cell">对象 {state.visibleNodeCount}</span>
                  <span role="cell">文字 {state.textCharacterCount}</span>
                  <span role="cell" className={state.band === 'dense' ? 'is-warning' : ''}>
                    {state.score}/100 · {state.band === 'dense' ? '高' : state.band === 'balanced' ? '中' : '低'}
                  </span>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    />
  )
}

interface ProjectHealthPanelViewProps extends ProjectHealthPanelCommonProps {
  readonly summary: ProjectHealthPanelSummary
  readonly diagnostics: readonly ProjectHealthPanelDiagnostic[]
  readonly description: string
  readonly footer: string
  readonly supplementaryAnalysis?: React.ReactNode
  onLocate?(diagnostic: ProjectHealthPanelDiagnostic, index: number): void
  onExportDiagnostics?(): void
}

function ProjectHealthPanelView({
  open,
  onClose,
  summary,
  diagnostics,
  description,
  footer,
  supplementaryAnalysis,
  onLocate,
  onExportDiagnostics,
}: ProjectHealthPanelViewProps) {
  if (!open) return null

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
            <p>{description}</p>
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

        {supplementaryAnalysis}

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
                  key={`${diagnostic.code ?? diagnostic.severity}:${index}`}
                  className={`project-health-issue is-${diagnostic.severity}`}
                >
                  <SeverityIcon severity={diagnostic.severity} />
                  <span className="project-health-issue__content">
                    <strong>{severityLabel[diagnostic.severity]}</strong>
                    <span>{diagnostic.message}</span>
                    {diagnostic.code && <small>{diagnostic.code}</small>}
                  </span>
                  {onLocate && (
                    <button type="button" onClick={() => onLocate(diagnostic, index)}>
                      <LocateFixed size={14} />定位
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        <footer className="project-health-panel__footer">
          <span>{footer}</span>
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
