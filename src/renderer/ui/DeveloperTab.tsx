import {
  Braces,
  Code2,
  CopyPlus,
  Play,
  ShieldCheck,
  WandSparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ComponentManifest } from '../../shared/componentTypes'
import { componentManifestSchema } from '../../shared/componentSchema'
import { interactionRuleSchema } from '../../shared/interactionSchema'
import { sceneNodeSchema } from '../../shared/projectSchema'
import { runtimeDocumentSchema } from '../../shared/runtimeSchema'
import { courseRuntimeDefinitionSchema } from '../../shared/courseProjectSchema'
import type { CourseRuntimeDefinition } from '../../shared/courseProjectTypes'
import type { RuntimeDocument } from '../../shared/runtimeTypes'
import type { SceneNode, AssetMeta } from '../../shared/projectTypes'
import { validateRuntimeSource } from '../../player/RuntimeRegistry'
import { validateComponentRuntimeSource } from '../components/importComponentPackage'
import {
  buildV9SlideWorkspaceSnapshot,
  type V9SlideRuntimePatch,
  v9ScopedRuntimeView,
} from '../course/v9SlideVerticalSlice'
import {
  selectActiveScene,
  selectSelectedNode,
  useEditorStore,
} from '../store/editorStore'

type DeveloperSection = 'runtime' | 'object' | 'rules' | 'component'
type ComponentDocument = 'manifest' | 'runtime'

const EMPTY_RUNTIME_SOURCE = `CoursewareRuntime.define({
  runtimeApiVersion: 2,
  create(ctx) {
    return {
      destroy() {},
    }
  },
})`

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function syntaxCheck(source: string): void {
  // Compile without executing. Registration and lifecycle execution continue
  // to happen only inside the existing isolated player/component host.
  Function(`"use strict";\n${source}`)
}

interface CodeDocumentEditorProps {
  title: string
  description: string
  value: string
  language: 'json' | 'javascript'
  readOnly?: boolean
  applyLabel?: string
  onApply?(value: string): void
}

function CodeDocumentEditor({
  title,
  description,
  value,
  language,
  readOnly = false,
  applyLabel = '校验并应用',
  onApply,
}: CodeDocumentEditorProps) {
  const [draft, setDraft] = useState(value)
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    setDraft(value)
    setMessage(null)
  }, [value])

  const format = (): void => {
    if (language !== 'json') return
    try {
      setDraft(JSON.stringify(JSON.parse(draft), null, 2))
      setMessage('JSON 已格式化，尚未写入工程。')
    } catch (error) {
      setMessage(`格式化失败：${errorMessage(error)}`)
    }
  }
  const apply = (): void => {
    if (!onApply) return
    try {
      onApply(draft)
      setMessage('校验通过，修改已写入工程历史。')
    } catch (error) {
      setMessage(`未应用：${errorMessage(error)}`)
    }
  }

  return (
    <section className="developer-card">
      <div className="developer-card__heading">
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <code>{language === 'json' ? 'JSON' : 'JS'}</code>
      </div>
      <textarea
        className="developer-code-editor"
        aria-label={title}
        value={draft}
        readOnly={readOnly}
        wrap="off"
        spellCheck={false}
        onChange={(event) => {
          setDraft(event.currentTarget.value)
          setMessage(null)
        }}
      />
      <div className="developer-card__actions">
        {language === 'json' && !readOnly && (
          <button type="button" className="secondary-button" onClick={format}>
            <WandSparkles size={13} />格式化
          </button>
        )}
        {!readOnly && onApply && (
          <button type="button" className="primary-button" onClick={apply}>
            <ShieldCheck size={13} />{applyLabel}
          </button>
        )}
      </div>
      {message && (
        <p
          className={message.startsWith('未应用') || message.startsWith('格式化失败')
            ? 'developer-card__message developer-card__message--error'
            : 'developer-card__message'}
          role="status"
        >
          {message}
        </p>
      )}
    </section>
  )
}

function freshRuntime(): RuntimeDocument {
  return {
    runtimeApiVersion: 2,
    enabled: true,
    renderMode: 'phaser',
    source: EMPTY_RUNTIME_SOURCE,
    content: { values: {} },
    assets: {},
  }
}

export function DeveloperTab() {
  const courseSession = useEditorStore((state) => state.courseSession)
  if (courseSession !== null) return <V9DeveloperTab />
  return <LegacyDeveloperTab />
}

function LegacyDeveloperTab() {
  const scene = useEditorStore(selectActiveScene)
  const node = useEditorStore(selectSelectedNode)
  const project = useEditorStore((state) => state.project)
  const componentPackages = useEditorStore((state) => state.componentPackages)
  const editingScope = useEditorStore((state) => state.editingScope)
  const activePresentationStateId = useEditorStore(
    (state) => state.activePresentationStateId,
  )
  const updateNode = useEditorStore((state) => state.updateNode)
  const updateSceneRuntime = useEditorStore((state) => state.updateSceneRuntime)
  const updateGlobalRuntime = useEditorStore((state) => state.updateGlobalRuntime)
  const setSceneRuntime = useEditorStore((state) => state.setSceneRuntime)
  const setGlobalRuntime = useEditorStore((state) => state.setGlobalRuntime)
  const updateInteractionRule = useEditorStore((state) => state.updateInteractionRule)
  const updateGlobalInteractionRule = useEditorStore(
    (state) => state.updateGlobalInteractionRule,
  )
  const createEditableComponentCopy = useEditorStore(
    (state) => state.createEditableComponentCopy,
  )
  const updateEditableComponentPackage = useEditorStore(
    (state) => state.updateEditableComponentPackage,
  )
  const setCanvasMode = useEditorStore((state) => state.setCanvasMode)
  const runtime = editingScope === 'global' ? project.globalRuntime : scene.runtime
  const rules = editingScope === 'global'
    ? project.globalInteractions
    : scene.interactions
  const [activeSection, setActiveSection] = useState<DeveloperSection>('runtime')
  const [componentDocument, setComponentDocument] =
    useState<ComponentDocument>('runtime')
  const [selectedRuleId, setSelectedRuleId] = useState<string>('')
  useEffect(() => {
    if (!rules.some((rule) => rule.id === selectedRuleId)) {
      setSelectedRuleId(rules[0]?.id ?? '')
    }
  }, [rules, selectedRuleId])
  const selectedRule = rules.find((rule) => rule.id === selectedRuleId)
  const selectedComponent = node?.type === 'external-component'
    ? componentPackages[node.component.packageId]
    : undefined
  const selectedComponentMeta =
    node?.type === 'external-component'
      ? Object.values(project.componentPackages).find(
          (meta) =>
            meta.packageId === node.component.packageId &&
            meta.version === node.component.version,
        )
      : undefined
  const componentEditable = selectedComponentMeta?.editableCopy === true
  const copyBlockedByPresentationState =
    editingScope === 'scene' && activePresentationStateId !== null
  const nodeJson = useMemo(
    () => node ? JSON.stringify(node, null, 2) : '',
    [node],
  )

  const applyRuntimeSource = (source: string): void => {
    if (!runtime) throw new Error('当前作用域没有运行时')
    validateRuntimeSource(source)
    syntaxCheck(source)
    const result = runtimeDocumentSchema.safeParse({ ...runtime, source })
    if (!result.success) throw new Error(result.error.issues[0]?.message ?? '运行时数据无效')
    if (editingScope === 'global') updateGlobalRuntime({ source })
    else updateSceneRuntime(scene.id, { source })
  }

  const sections: Array<{
    id: DeveloperSection
    label: string
    status: string
  }> = [
    {
      id: 'runtime',
      label: '运行时',
      status: runtime ? '可编辑' : '未创建',
    },
    {
      id: 'object',
      label: '对象 JSON',
      status: node ? node.name : '未选择',
    },
    {
      id: 'rules',
      label: '规则 JSON',
      status: `${rules.length} 条`,
    },
    {
      id: 'component',
      label: '组件代码',
      status: selectedComponent
        ? componentEditable ? '工程副本' : '只读'
        : '未选择',
    },
  ]

  return (
    <div className="developer-tab" data-testid="developer-tab">
      <header className="developer-workbench-header">
        <div className="developer-workbench-title">
          <Code2 size={19} />
          <div>
            <strong>工程开发工作台</strong>
            <span>受控修改课件运行时与工程数据，不开放编辑器源码、文件系统或 Shell。</span>
          </div>
        </div>
        <div className="developer-workbench-meta">
          <span>作用域</span>
          <strong>{editingScope === 'global' ? '全局层' : `场景 · ${scene.name}`}</strong>
          <button type="button" className="secondary-button" onClick={() => setCanvasMode('run')}>
            <Play size={13} />试运行
          </button>
        </div>
      </header>

      <div
        className="developer-workspace-tabs"
        role="tablist"
        aria-label="开发工作区"
      >
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={activeSection === section.id}
            className={activeSection === section.id ? 'is-active' : ''}
            onClick={() => setActiveSection(section.id)}
          >
            <span>{section.label}</span>
            <small>{section.status}</small>
          </button>
        ))}
      </div>

      <div
        className="developer-workspace-content"
        role="tabpanel"
        aria-label={sections.find((section) => section.id === activeSection)?.label}
      >
        {activeSection === 'runtime' && (
          runtime ? (
            <CodeDocumentEditor
              title={editingScope === 'global' ? '全局运行时源码' : '场景运行时源码'}
              description="校验模块与 JavaScript 语法后写入工程；执行仍发生在隔离播放器。"
              value={runtime.source}
              language="javascript"
              onApply={applyRuntimeSource}
            />
          ) : (
            <section className="developer-empty-card">
              <Code2 size={20} />
              <strong>当前作用域没有自定义运行时</strong>
              <span>创建最小 Runtime API 2 模板后，即可在完整代码区中修改。</span>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  if (editingScope === 'global') setGlobalRuntime(freshRuntime())
                  else setSceneRuntime(scene.id, freshRuntime())
                }}
              >
                创建运行时模板
              </button>
            </section>
          )
        )}

        {activeSection === 'object' && (
          node ? (
            <CodeDocumentEditor
              title={`所选对象 · ${node.name}`}
              description="ID 和类型不可更改；其他字段按 Project Schema 校验并进入撤销历史。"
              value={nodeJson}
              language="json"
              onApply={(value) => {
                const parsed = sceneNodeSchema.safeParse(JSON.parse(value))
                if (!parsed.success) {
                  throw new Error(parsed.error.issues[0]?.message ?? '对象 JSON 无效')
                }
                if (parsed.data.id !== node.id || parsed.data.type !== node.type) {
                  throw new Error('对象 ID 和类型不可修改')
                }
                updateNode(node.id, parsed.data as SceneNode)
              }}
            />
          ) : (
            <section className="developer-empty-card">
              <Braces size={20} />
              <strong>未选择对象</strong>
              <span>在画布或图层面板选择对象后，可在这里受控修改其 JSON。</span>
            </section>
          )
        )}

        {activeSection === 'rules' && (
          <div className="developer-rule-workspace">
            <section className="developer-rule-picker">
              <label htmlFor="developer-rule-select">当前规则</label>
              <select
                id="developer-rule-select"
                value={selectedRuleId}
                onChange={(event) => setSelectedRuleId(event.currentTarget.value)}
              >
                <option value="">未选择</option>
                {rules.map((rule) => (
                  <option key={rule.id} value={rule.id}>{rule.name}</option>
                ))}
              </select>
            </section>
            {selectedRule ? (
              <CodeDocumentEditor
                title={`规则 · ${selectedRule.name}`}
                description="规则使用标准 trigger / conditions / actions 模型。"
                value={JSON.stringify(selectedRule, null, 2)}
                language="json"
                onApply={(value) => {
                  const parsed = interactionRuleSchema.safeParse(JSON.parse(value))
                  if (!parsed.success) {
                    throw new Error(parsed.error.issues[0]?.message ?? '规则 JSON 无效')
                  }
                  if (parsed.data.id !== selectedRule.id) throw new Error('规则 ID 不可修改')
                  if (editingScope === 'global') {
                    updateGlobalInteractionRule(selectedRule.id, parsed.data)
                  } else {
                    updateInteractionRule(scene.id, selectedRule.id, parsed.data)
                  }
                }}
              />
            ) : (
              <section className="developer-empty-card">
                <Braces size={20} />
                <strong>当前作用域没有规则</strong>
                <span>先在“互动与动画”中创建规则，再到这里检查或修改完整 JSON。</span>
              </section>
            )}
          </div>
        )}

        {activeSection === 'component' && (
          selectedComponent && node?.type === 'external-component' ? (
            <div className="developer-component-workspace">
              <section className="developer-component-heading">
                <div>
                  <strong>{selectedComponent.manifest.name}</strong>
                  <span>
                    {componentEditable
                      ? '工程内可编辑副本，修改不会覆盖原第三方组件。'
                      : copyBlockedByPresentationState
                        ? '请先切换到“基础”状态，再创建可编辑副本。'
                        : '第三方组件只读；创建新 ID 的工程副本后才能修改。'}
                  </span>
                </div>
                {!componentEditable && (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={copyBlockedByPresentationState}
                    onClick={() => createEditableComponentCopy(
                      selectedComponent.manifest.id,
                      node.id,
                    )}
                  >
                    <CopyPlus size={13} />创建可编辑副本
                  </button>
                )}
              </section>
              <div
                className="developer-document-tabs"
                role="tablist"
                aria-label="组件文档"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={componentDocument === 'runtime'}
                  className={componentDocument === 'runtime' ? 'is-active' : ''}
                  onClick={() => setComponentDocument('runtime')}
                >
                  Runtime.js
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={componentDocument === 'manifest'}
                  className={componentDocument === 'manifest' ? 'is-active' : ''}
                  onClick={() => setComponentDocument('manifest')}
                >
                  Manifest.json
                </button>
              </div>
              {componentDocument === 'manifest' ? (
                <CodeDocumentEditor
                  title="组件 Manifest"
                  description="需通过版本、作用域、公开字段和素材引用校验。"
                  value={JSON.stringify(selectedComponent.manifest, null, 2)}
                  language="json"
                  readOnly={!componentEditable}
                  onApply={componentEditable
                    ? (value) => {
                        const result = componentManifestSchema.safeParse(JSON.parse(value))
                        if (!result.success) {
                          throw new Error(result.error.issues[0]?.message ?? 'Manifest 无效')
                        }
                        if (
                          result.data.id !== selectedComponent.manifest.id ||
                          result.data.version !== selectedComponent.manifest.version
                        ) {
                          throw new Error('可编辑副本的 ID 和版本不可在代码框中修改')
                        }
                        updateEditableComponentPackage(
                          selectedComponent.manifest.id,
                          { manifest: result.data as ComponentManifest },
                        )
                      }
                    : undefined}
                />
              ) : (
                <CodeDocumentEditor
                  title="组件 Runtime"
                  description="只接受离线普通 JavaScript；禁止 import、export 和 require。"
                  value={selectedComponent.runtimeSource}
                  language="javascript"
                  readOnly={!componentEditable}
                  onApply={componentEditable
                    ? (source) => {
                        validateComponentRuntimeSource(source)
                        syntaxCheck(source)
                        updateEditableComponentPackage(
                          selectedComponent.manifest.id,
                          { runtimeSource: source },
                        )
                      }
                    : undefined}
                />
              )}
            </div>
          ) : (
            <section className="developer-empty-card">
              <Code2 size={20} />
              <strong>未选择互动组件</strong>
              <span>在画布或图层面板选择互动组件后，可查看其代码权限和工程副本。</span>
            </section>
          )
        )}
      </div>
    </div>
  )
}

function V9DeveloperTab() {
  const courseSession = useEditorStore((state) => state.courseSession)
  const updateInteractionRule = useEditorStore(
    (state) => state.updateCourseInteractionRule,
  )
  const replaceObjectJson = useEditorStore(
    (state) => state.replaceCourseObjectJson,
  )
  const updateRuntime = useEditorStore((state) => state.updateCourseRuntime)
  const [activeSection, setActiveSection] = useState<DeveloperSection>('runtime')
  const [selectedRuleId, setSelectedRuleId] = useState<string>('')
  const snapshot = useMemo(
    () => courseSession === null
      ? null
      : buildV9SlideWorkspaceSnapshot(courseSession),
    [courseSession],
  )
  const runtimeView = useMemo(
    () => courseSession === null ? null : v9ScopedRuntimeView(courseSession),
    [courseSession],
  )
  const scopeName = courseSession === null
    ? ''
    : courseSession.editingScope === 'global'
      ? '全局层'
      : '当前幻灯片'
  const project = courseSession?.history.present ?? null
  const editingScope = courseSession?.editingScope ?? 'scene'
  const activeScene = project === null
    ? null
    : (() => {
        const location = project.locations.find(
          (candidate) => candidate.id === courseSession!.selection.locationId,
        )
        if (!location || location.kind !== 'slide-scene') return null
        const surface = project.surfaces.find((candidate) => candidate.id === location.surfaceId)
        if (!surface || surface.type !== 'slide') return null
        return surface.scenes.find((candidate) => candidate.id === location.sceneId) ?? null
      })()
  const rules = project === null
    ? []
    : editingScope === 'global'
      ? project.globalInteractions
      : activeScene?.interactions ?? []
  useEffect(() => {
    if (!rules.some((rule) => rule.id === selectedRuleId)) {
      setSelectedRuleId(rules[0]?.id ?? '')
    }
  }, [rules, selectedRuleId])
  if (courseSession === null || snapshot === null) return null

  const selectedRule = rules.find((rule) => rule.id === selectedRuleId)
  const selectedNodeId = courseSession.selection.selectionIds.at(-1) ?? null
  const node = snapshot.document.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null
  const nodeJson = useMemo(
    () => node ? JSON.stringify(node, null, 2) : '',
    [node],
  )
  const applyObjectJson = (value: string): void => {
    if (!node || selectedNodeId === null) throw new Error('未选择对象')
    const parsed = sceneNodeSchema.safeParse(JSON.parse(value))
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? '对象 JSON 无效')
    }
    if (parsed.data.id !== node.id || parsed.data.type !== node.type) {
      throw new Error('对象 ID 和类型不可修改')
    }
    replaceObjectJson({
      sessionId: courseSession.sessionId,
      locationId: courseSession.selection.locationId,
      stateId: courseSession.selection.stateId,
      editingScope: courseSession.editingScope,
      layerItemId: selectedNodeId,
    }, parsed.data)
  }
  const applyRuleJson = (value: string): void => {
    if (!selectedRule) throw new Error('当前作用域没有规则')
    const parsed = interactionRuleSchema.safeParse(JSON.parse(value))
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? '规则 JSON 无效')
    }
    if (parsed.data.id !== selectedRule.id) throw new Error('规则 ID 不可修改')
    updateInteractionRule(selectedRule.id, parsed.data)
  }
  const sections: Array<{ id: DeveloperSection; label: string; status: string }> = [
    {
      id: 'runtime',
      label: '运行时',
      status: runtimeView ? '可编辑' : '未创建',
    },
    {
      id: 'object',
      label: '对象 JSON',
      status: node ? node.name : '未选择',
    },
    {
      id: 'rules',
      label: '规则 JSON',
      status: `${rules.length} 条`,
    },
    {
      id: 'component',
      label: '组件代码',
      status: '接入中',
    },
  ]

  return (
    <div className="developer-tab" data-testid="developer-tab">
      <header className="developer-workbench-header">
        <div className="developer-workbench-title">
          <Code2 size={19} />
          <div>
            <strong>工程开发工作台</strong>
            <span>受控修改课件运行时与工程数据，不开放编辑器源码、文件系统或 Shell。</span>
          </div>
        </div>
        <div className="developer-workbench-meta">
          <span>作用域</span>
          <strong>{scopeName}</strong>
          <button
            type="button"
            className="secondary-button"
            disabled
            title="当前位置试运行请使用画布下方的试运行按钮。"
          >
            <Play size={13} />试运行
          </button>
        </div>
      </header>

      <div
        className="developer-workspace-tabs"
        role="tablist"
        aria-label="开发工作区"
      >
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={activeSection === section.id}
            className={activeSection === section.id ? 'is-active' : ''}
            onClick={() => setActiveSection(section.id)}
          >
            <span>{section.label}</span>
            <small>{section.status}</small>
          </button>
        ))}
      </div>

      <div
        className="developer-workspace-content"
        role="tabpanel"
        aria-label={sections.find((section) => section.id === activeSection)?.label}
      >
        {activeSection === 'runtime' && (
          runtimeView ? (
            <V9RuntimeEditor
              runtime={runtimeView.runtime}
              assets={courseSession.history.present.assets}
              onUpdate={updateRuntime}
            />
          ) : (
            <section className="developer-empty-card">
              <Code2 size={20} />
              <strong>当前作用域没有自定义运行时</strong>
              <span>运行时的创建和宿主接入将在 Runtime 宿主（M4-RT）集成后提供；现有运行时源码仍可直接修改。</span>
              <button type="button" className="secondary-button" disabled>
                创建运行时模板
              </button>
            </section>
          )
        )}

        {activeSection === 'object' && (
          node ? (
            <CodeDocumentEditor
              title={`所选对象 · ${node.name}`}
              description="ID 和类型不可更改；其他字段按 Project Schema 校验并进入撤销历史。"
              value={nodeJson}
              language="json"
              onApply={applyObjectJson}
            />
          ) : (
            <section className="developer-empty-card">
              <Braces size={20} />
              <strong>未选择对象</strong>
              <span>在画布或图层面板选择对象后，可在这里受控修改其 JSON。</span>
            </section>
          )
        )}

        {activeSection === 'rules' && (
          <div className="developer-rule-workspace">
            <section className="developer-rule-picker">
              <label htmlFor="developer-rule-select">当前规则</label>
              <select
                id="developer-rule-select"
                value={selectedRuleId}
                onChange={(event) => setSelectedRuleId(event.currentTarget.value)}
              >
                <option value="">未选择</option>
                {rules.map((rule) => (
                  <option key={rule.id} value={rule.id}>{rule.name}</option>
                ))}
              </select>
            </section>
            {selectedRule ? (
              <CodeDocumentEditor
                title={`规则 · ${selectedRule.name}`}
                description="规则使用标准 trigger / conditions / actions 模型。"
                value={JSON.stringify(selectedRule, null, 2)}
                language="json"
                onApply={applyRuleJson}
              />
            ) : (
              <section className="developer-empty-card">
                <Braces size={20} />
                <strong>当前作用域没有规则</strong>
                <span>先在“互动与动画”中创建规则，再到这里检查或修改完整 JSON。</span>
              </section>
            )}
          </div>
        )}

        {activeSection === 'component' && (
          <section className="developer-empty-card">
            <Code2 size={20} />
            <strong>组件代码查看接入中</strong>
            <span>组件作者目标进入统一图层后，可在这里查看和受控修改组件 Manifest 与 Runtime；第三方组件修改仍走工程副本流程。</span>
          </section>
        )}
      </div>
    </div>
  )
}

interface V9RuntimeEditorProps {
  runtime: CourseRuntimeDefinition
  assets: Readonly<Record<string, AssetMeta>>
  onUpdate(patch: V9SlideRuntimePatch): void
}

function V9RuntimeEditor({ runtime, assets, onUpdate }: V9RuntimeEditorProps) {
  const [sourceDraft, setSourceDraft] = useState(runtime.source)
  const [sourceMessage, setSourceMessage] = useState<string | null>(null)
  const [valuesDraft, setValuesDraft] = useState<Record<string, string>>({})
  const [valuesMessage, setValuesMessage] = useState<string | null>(null)
  const contentKeys = useMemo(() => {
    const keys = new Set(Object.keys(runtime.content.values))
    for (const key of Object.keys(runtime.content.metadata ?? {})) keys.add(key)
    return [...keys].sort()
  }, [runtime])
  useEffect(() => {
    setSourceDraft(runtime.source)
    setSourceMessage(null)
    setValuesDraft({ ...runtime.content.values })
    setValuesMessage(null)
  }, [runtime])

  const applySource = (): void => {
    try {
      validateRuntimeSource(sourceDraft)
      syntaxCheck(sourceDraft)
      onUpdate({ source: sourceDraft })
      setSourceMessage('校验通过，运行时源码已写入工程历史。')
    } catch (error) {
      setSourceMessage(`未应用：${errorMessage(error)}`)
    }
  }
  const applyValues = (): void => {
    try {
      onUpdate({ contentValues: { ...valuesDraft } })
      setValuesMessage('内容值已写入工程历史。')
    } catch (error) {
      setValuesMessage(`未应用：${errorMessage(error)}`)
    }
  }
  const updateSafely = (patch: V9SlideRuntimePatch): void => {
    try {
      onUpdate(patch)
      setSourceMessage(null)
      setValuesMessage(null)
    } catch (error) {
      setSourceMessage(`未应用：${errorMessage(error)}`)
    }
  }

  return (
    <>
      <section className="developer-card">
        <div className="developer-card__heading">
          <div>
            <strong>运行时源码</strong>
            <span>校验模块与 JavaScript 语法后写入工程；执行仍发生在隔离播放器。</span>
          </div>
          <code>JS</code>
        </div>
        <textarea
          className="developer-code-editor"
          aria-label="运行时源码"
          value={sourceDraft}
          wrap="off"
          spellCheck={false}
          onChange={(event) => {
            setSourceDraft(event.currentTarget.value)
            setSourceMessage(null)
          }}
        />
        <div className="developer-card__actions">
          <button type="button" className="primary-button" onClick={applySource}>
            <ShieldCheck size={13} />校验并应用
          </button>
        </div>
        {sourceMessage && (
          <p
            className={sourceMessage.startsWith('未应用')
              ? 'developer-card__message developer-card__message--error'
              : 'developer-card__message'}
            role="status"
          >
            {sourceMessage}
          </p>
        )}
      </section>

      <label className="property-row">
        <span>启用运行时</span>
        <input
          type="checkbox"
          checked={runtime.enabled}
          onChange={(event) => updateSafely({ enabled: event.currentTarget.checked })}
        />
      </label>

      {contentKeys.length > 0 ? (
        <section className="developer-card">
          <div className="developer-card__heading">
            <div>
              <strong>运行时内容值</strong>
              <span>运行时展示的可编辑文字，写入后随工程保存。</span>
            </div>
            <code>content</code>
          </div>
          {contentKeys.map((key) => {
            const meta = runtime.content.metadata?.[key]
            const value = valuesDraft[key] ?? ''
            const multiline = meta?.multiline === true
            return (
              <label key={key} className="property-row" htmlFor={`runtime-content-${key}`}>
                <span>{meta?.label ?? key}</span>
                {multiline ? (
                  <textarea
                    id={`runtime-content-${key}`}
                    value={value}
                    maxLength={meta?.maxLength}
                    onChange={(event) => setValuesDraft((current) => ({
                      ...current,
                      [key]: event.currentTarget.value,
                    }))}
                  />
                ) : (
                  <input
                    id={`runtime-content-${key}`}
                    type="text"
                    value={value}
                    maxLength={meta?.maxLength}
                    onChange={(event) => setValuesDraft((current) => ({
                      ...current,
                      [key]: event.currentTarget.value,
                    }))}
                  />
                )}
              </label>
            )
          })}
          <div className="developer-card__actions">
            <button type="button" className="secondary-button" onClick={applyValues}>
              <ShieldCheck size={13} />应用内容值
            </button>
          </div>
          {valuesMessage && (
            <p
              className={valuesMessage.startsWith('未应用')
                ? 'developer-card__message developer-card__message--error'
                : 'developer-card__message'}
              role="status"
            >
              {valuesMessage}
            </p>
          )}
        </section>
      ) : (
        <p className="property-hint">该运行时没有公开内容值。</p>
      )}

      {Object.keys(runtime.assets).length > 0 && (
        <section className="developer-card">
          <div className="developer-card__heading">
            <div>
              <strong>运行时素材绑定</strong>
              <span>把素材绑定到运行时声明的资源键。</span>
            </div>
            <code>assets</code>
          </div>
          {Object.keys(runtime.assets).map((key) => (
            <V9RuntimeAssetField
              key={key}
              bindingKey={key}
              assetId={runtime.assets[key]!.assetId}
              assets={assets}
              onSelect={(assetId) => updateSafely({
                assets: { ...runtime.assets, [key]: { assetId } },
              })}
            />
          ))}
        </section>
      )}
      <p className="developer-card__message">
        Runtime API 2/3 的执行与预览由运行时宿主（M4-RT）负责；这里只修改工程中的运行时定义。
      </p>
    </>
  )
}

function V9RuntimeAssetField({
  bindingKey,
  assetId,
  assets,
  onSelect,
}: {
  bindingKey: string
  assetId: string
  assets: Readonly<Record<string, AssetMeta>>
  onSelect(assetId: string): void
}) {
  const imageAssets = Object.values(assets)
    .filter((asset) => asset.mimeType.startsWith('image/'))
    .sort((left, right) => left.filename.localeCompare(right.filename, 'zh-CN'))
  return (
    <label className="property-row" htmlFor={`runtime-asset-${bindingKey}`}>
      <span>{bindingKey}</span>
      <select
        id={`runtime-asset-${bindingKey}`}
        value={assetId}
        onChange={(event) => onSelect(event.currentTarget.value)}
      >
        <option value="">未绑定</option>
        {imageAssets.map((asset) => (
          <option key={asset.id} value={asset.id}>{asset.filename}</option>
        ))}
      </select>
    </label>
  )
}
