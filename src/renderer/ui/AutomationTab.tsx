import { useMemo } from 'react'
import { collectProjectDiagnostics } from '../../shared/projectDiagnostics'
import {
  useEditorStore,
  selectActiveScene,
  selectEditingNodes,
} from '../store/editorStore'
import { SceneAutomationEditor } from './InteractionEditor'

export function AutomationTab() {
  const scene = useEditorStore(selectActiveScene)
  const editingNodes = useEditorStore(selectEditingNodes)
  const editingScope = useEditorStore((state) => state.editingScope)
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId)
  const activeStateId = useEditorStore(
    (state) => state.activePresentationStateId,
  )
  const project = useEditorStore((state) => state.project)
  const addInteractionRule = useEditorStore(
    (state) => state.addInteractionRule,
  )
  const updateInteractionRule = useEditorStore(
    (state) => state.updateInteractionRule,
  )
  const deleteInteractionRule = useEditorStore(
    (state) => state.deleteInteractionRule,
  )
  const duplicateInteractionRule = useEditorStore(
    (state) => state.duplicateInteractionRule,
  )
  const moveInteractionRule = useEditorStore(
    (state) => state.moveInteractionRule,
  )
  const addGlobalInteractionRule = useEditorStore(
    (state) => state.addGlobalInteractionRule,
  )
  const updateGlobalInteractionRule = useEditorStore(
    (state) => state.updateGlobalInteractionRule,
  )
  const deleteGlobalInteractionRule = useEditorStore(
    (state) => state.deleteGlobalInteractionRule,
  )
  const duplicateGlobalInteractionRule = useEditorStore(
    (state) => state.duplicateGlobalInteractionRule,
  )
  const moveGlobalInteractionRule = useEditorStore(
    (state) => state.moveGlobalInteractionRule,
  )
  const setActiveTab = useEditorStore((state) => state.setActiveTab)
  const setCanvasMode = useEditorStore((state) => state.setCanvasMode)
  const updateNodes = useEditorStore((state) => state.updateNodes)
  const diagnostics = useMemo(
    () => collectProjectDiagnostics(project).filter(
      (diagnostic) => diagnostic.sceneId === scene.id,
    ),
    [project, scene.id],
  )
  const ruleWarnings = useMemo(() => {
    const warnings: Record<string, string[]> = {}
    for (const diagnostic of diagnostics) {
      for (const ruleId of diagnostic.ruleIds) {
        warnings[ruleId] = [...(warnings[ruleId] ?? []), diagnostic.message]
      }
    }
    return warnings
  }, [diagnostics])
  const prepareMotionTargets = (nodeIds: string[]) => {
    updateNodes(nodeIds.map((nodeId) => ({
      nodeId,
      patch: { playbackInitialVisibility: 'hidden' as const },
    })))
  }
  const sharedProps = {
    selectedNodeId,
    sourceNodes: editingNodes,
    activeStateId,
    scenes: project.scenes,
    sounds: project.media.audio.sounds,
    onOpenClickRules: () => setActiveTab('properties'),
    onPrepareMotionTargets: prepareMotionTargets,
    onRunPreview: () => setCanvasMode('run'),
  }

  if (editingScope === 'global') {
    return (
      <div className="properties-scroll" data-testid="automation-tab">
        <section className="property-section interaction-overview">
          <h2>互动与动画</h2>
          <p>用“当—如果—就”组织行为。点击交互在属性中维护，其他事件规则集中在这里。</p>
        </section>
        <SceneAutomationEditor
          {...sharedProps}
          scene={scene}
          sourceScope="global"
          sourceRules={project.globalInteractions}
          onAddRule={addGlobalInteractionRule}
          onUpdateRule={(ruleId, patch) => {
            const current = project.globalInteractions.find(
              (rule) => rule.id === ruleId,
            )
            if (current) {
              updateGlobalInteractionRule(ruleId, { ...current, ...patch })
            }
          }}
          onDeleteRule={deleteGlobalInteractionRule}
          onDuplicateRule={duplicateGlobalInteractionRule}
          onMoveRule={moveGlobalInteractionRule}
        />
      </div>
    )
  }

  return (
    <div className="properties-scroll" data-testid="automation-tab">
      <section className="property-section interaction-overview">
        <h2>互动与动画</h2>
        <p>先从模板开始，再用“当—如果—就”微调。这里不重复显示元素单击规则。</p>
      </section>
      {diagnostics.length > 0 ? (
        <section
          className="property-section automation-diagnostics"
          aria-labelledby="automation-diagnostics-title"
        >
          <h3 className="property-title" id="automation-diagnostics-title">
            需要处理的映射
          </h3>
          {diagnostics.map((diagnostic) => (
            <p
              key={`${diagnostic.code}:${diagnostic.nodeId}`}
              className="property-hint"
              role="alert"
            >
              {diagnostic.message}
            </p>
          ))}
        </section>
      ) : null}
      <SceneAutomationEditor
        {...sharedProps}
        scene={scene}
        ruleWarnings={ruleWarnings}
        onAddRule={(rule) => addInteractionRule(scene.id, rule)}
        onUpdateRule={(ruleId, patch) => {
          const current = scene.interactions.find((rule) => rule.id === ruleId)
          if (current) {
            updateInteractionRule(scene.id, ruleId, { ...current, ...patch })
          }
        }}
        onDeleteRule={(ruleId) => deleteInteractionRule(scene.id, ruleId)}
        onDuplicateRule={(ruleId) => {
          duplicateInteractionRule(scene.id, ruleId)
        }}
        onMoveRule={(ruleId, direction) => {
          moveInteractionRule(scene.id, ruleId, direction)
        }}
      />
    </div>
  )
}
