import { useMemo } from 'react'
import { collectProjectDiagnostics } from '../../shared/projectDiagnostics'
import { useEditorStore, selectActiveScene } from '../store/editorStore'
import { SceneAutomationEditor } from './InteractionEditor'

export function AutomationTab() {
  const scene = useEditorStore(selectActiveScene)
  const editingScope = useEditorStore((state) => state.editingScope)
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
  const addGlobalInteractionRule = useEditorStore(
    (state) => state.addGlobalInteractionRule,
  )
  const updateGlobalInteractionRule = useEditorStore(
    (state) => state.updateGlobalInteractionRule,
  )
  const deleteGlobalInteractionRule = useEditorStore(
    (state) => state.deleteGlobalInteractionRule,
  )
  const diagnostics = useMemo(
    () => collectProjectDiagnostics(project).filter(
      (diagnostic) => diagnostic.sceneId === scene.id,
    ),
    [project, scene.id],
  )

  if (editingScope === 'global') {
    return (
      <div className="properties-scroll" data-testid="automation-tab">
        <SceneAutomationEditor
          scene={scene}
          sourceScope="global"
          sourceNodes={project.globalLayer.map((item) => item.node)}
          sourceRules={project.globalInteractions}
          activeStateId={activeStateId}
          scenes={project.scenes}
          sounds={project.media.audio.sounds}
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
        />
      </div>
    )
  }

  return (
    <div className="properties-scroll" data-testid="automation-tab">
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
        scene={scene}
        activeStateId={activeStateId}
        scenes={project.scenes}
        sounds={project.media.audio.sounds}
        onAddRule={(rule) => addInteractionRule(scene.id, rule)}
        onUpdateRule={(ruleId, patch) => {
          const current = scene.interactions.find((rule) => rule.id === ruleId)
          if (current) {
            updateInteractionRule(scene.id, ruleId, { ...current, ...patch })
          }
        }}
        onDeleteRule={(ruleId) => deleteInteractionRule(scene.id, ruleId)}
      />
    </div>
  )
}
