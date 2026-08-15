import { useMemo } from 'react'
import { collectProjectDiagnostics } from '../../shared/projectDiagnostics'
import type { InteractionRule } from '../../shared/interactionTypes'
import {
  buildV9SlideWorkspaceSnapshot,
  type V9SlideVerticalSliceState,
} from '../course/v9SlideVerticalSlice'
import {
  v9InteractionSceneDocument,
  v9InteractionSounds,
  v9SlideScenes,
} from '../course/slideInteractionView'
import {
  useEditorStore,
  selectActiveScene,
  selectEditingNodes,
} from '../store/editorStore'
import { SceneAutomationEditor } from './InteractionEditor'

function v9AutomationSceneContext(
  session: V9SlideVerticalSliceState,
): { sceneName: string; interactions: readonly InteractionRule[] } | null {
  const project = session.history.present
  const location = project.locations.find(
    (candidate) => candidate.id === session.selection.locationId,
  )
  if (!location || location.kind !== 'slide-scene') return null
  const surface = project.surfaces.find((candidate) => candidate.id === location.surfaceId)
  if (!surface || surface.type !== 'slide') return null
  const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
  return scene
    ? { sceneName: scene.name, interactions: scene.interactions }
    : null
}

export function AutomationTab() {
  const courseSession = useEditorStore((state) => state.courseSession)
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
  const addCourseRule = useEditorStore((state) => state.addCourseInteractionRule)
  const updateCourseRule = useEditorStore(
    (state) => state.updateCourseInteractionRule,
  )
  const deleteCourseRule = useEditorStore(
    (state) => state.deleteCourseInteractionRule,
  )
  const duplicateCourseRule = useEditorStore(
    (state) => state.duplicateCourseInteractionRule,
  )
  const moveCourseRule = useEditorStore(
    (state) => state.moveCourseInteractionRule,
  )
  const prepareCourseMotionTargets = useEditorStore(
    (state) => state.prepareCourseMotionTargets,
  )
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

  if (courseSession !== null) {
    return (
      <V9AutomationTab
        onOpenClickRules={() => setActiveTab('properties')}
        onPrepareMotionTargets={prepareCourseMotionTargets}
        onAddRule={addCourseRule}
        onUpdateRule={updateCourseRule}
        onDeleteRule={deleteCourseRule}
        onDuplicateRule={duplicateCourseRule}
        onMoveRule={moveCourseRule}
      />
    )
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

interface V9AutomationTabProps {
  onOpenClickRules(): void
  onPrepareMotionTargets(nodeIds: readonly string[]): void
  onAddRule(rule: InteractionRule): void
  onUpdateRule(
    ruleId: string,
    patch: Partial<Omit<InteractionRule, 'id'>>,
  ): void
  onDeleteRule(ruleId: string): void
  onDuplicateRule(ruleId: string): void
  onMoveRule(ruleId: string, direction: -1 | 1): void
}

function V9AutomationTab({
  onOpenClickRules,
  onPrepareMotionTargets,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
  onDuplicateRule,
  onMoveRule,
}: V9AutomationTabProps) {
  const courseSession = useEditorStore((state) => state.courseSession)
  const snapshot = useMemo(
    () => courseSession === null
      ? null
      : buildV9SlideWorkspaceSnapshot(courseSession),
    [courseSession],
  )
  const context = useMemo(
    () => courseSession === null
      ? null
      : v9AutomationSceneContext(courseSession),
    [courseSession],
  )
  if (courseSession === null || snapshot === null || context === null) return null

  const project = courseSession.history.present
  const editingScope = courseSession.editingScope
  const sourceScope = editingScope === 'global' ? 'global' : 'scene'
  const rules = sourceScope === 'global'
    ? project.globalInteractions
    : context.interactions
  const scenes = v9SlideScenes(project)
  const sounds = v9InteractionSounds(project)
  const activeScene = scenes.find((candidate) => candidate.id === snapshot.document.id)
  const sceneDocument = v9InteractionSceneDocument(
    snapshot.document.id,
    context.sceneName,
    snapshot.document.nodes,
    [...context.interactions],
    activeScene?.presentation,
  )
  const selectedNodeId = courseSession.selection.selectionIds.at(-1) ?? null

  return (
    <div className="properties-scroll" data-testid="automation-tab">
      <section className="property-section interaction-overview">
        <h2>互动与动画</h2>
        <p>先从模板开始，再用“当—如果—就”微调。这里不重复显示元素单击规则。</p>
      </section>
      <SceneAutomationEditor
        scene={sceneDocument}
        sourceScope={sourceScope}
        sourceNodes={snapshot.document.nodes}
        sourceRules={[...rules]}
        selectedNodeId={selectedNodeId}
        activeStateId={courseSession.selection.stateId}
        scenes={scenes}
        sounds={sounds}
        onOpenClickRules={onOpenClickRules}
        onPrepareMotionTargets={(nodeIds) => onPrepareMotionTargets(nodeIds)}
        onAddRule={onAddRule}
        onUpdateRule={onUpdateRule}
        onDeleteRule={onDeleteRule}
        onDuplicateRule={onDuplicateRule}
        onMoveRule={onMoveRule}
      />
    </div>
  )
}
