import { Music2, Shapes, Sigma, Type } from 'lucide-react'
import { compareStableStrings } from '../../shared/stableOrder'
import type { FlowEditorLayerView } from '../course/flowEditorView'
import type { ProjectDesignTokens, SoundDefinition } from '../../shared/projectTypes'
import { ElementsTab, type ElementsTabDocumentControl } from './ElementsTab'
import { NodesTab, type NodesTabDocumentControl } from './NodesTab'
import {
  PropertiesTab,
  type PropertiesTabDocumentControl,
} from './PropertiesTab'
import { AutomationTab } from './AutomationTab'
import { DeveloperTab } from './DeveloperTab'
import { ComponentsTab } from './ComponentsTab'
import { DesignTokensEditor } from './DesignTokensEditor'
import {
  EffectiveLayerList,
  type EffectiveLayerListProps,
} from './editor-actions/EffectiveLayerList'
import { useEditorStore, type SidebarTab } from '../store/editorStore'
import type {
  AvailableComponentCatalogPackage,
  ComponentCatalogSnapshot,
} from '../../shared/componentCatalog'
import {
  FlowElementsTab,
  type FlowElementsTabProps,
} from './FlowElementsTab'
import {
  FlowPropertiesTab,
  type FlowPropertiesTabProps,
} from './FlowPropertiesTab'
import {
  SpatialLayerInspector,
  type SpatialLayerInspectorProps,
} from './SpatialLayerInspector'
import {
  SpatialCameraPanel,
  type SpatialCameraPanelProps,
} from './SpatialCameraPanel'
import {
  SpatialPathEditor,
  type SpatialPathEditorProps,
} from './SpatialPathEditor'

export interface RightSidebarDocumentControl {
  readonly elements?: ElementsTabDocumentControl
  readonly layers?: NodesTabDocumentControl
  readonly properties?: PropertiesTabDocumentControl
  /** Professional tabs stay mounted only while the V9 backend can serve them. */
  readonly components?: boolean
  readonly automation?: boolean
  readonly developer?: boolean
  /** A missing controlled tab stays visible but mounts no legacy document editor. */
  readonly unavailableReasons?: Partial<Record<SidebarTab, string>>
}

export interface RightSidebarFlowLayerControl {
  readonly layers: readonly FlowEditorLayerView[]
  readonly selectedLayerItemId?: string | null
  onSelectLayer?(layerItemId: string): void
}

export interface RightSidebarFlowDocumentControl {
  readonly elements: FlowElementsTabProps
  readonly properties: FlowPropertiesTabProps
  /** When present, the layers tab shows the same teacher-facing Flow layer list. */
  readonly layers?: RightSidebarFlowLayerControl
}

export interface RightSidebarSpatialElementsControl {
  onAddText(): void
  onAddShape(): void
  onAddFormula(): void
  readonly disabledReason?: string
}

export interface RightSidebarSpatialDocumentControl {
  readonly elements: RightSidebarSpatialElementsControl
  readonly layers: SpatialLayerInspectorProps
  readonly properties: {
    readonly camera: SpatialCameraPanelProps
    readonly paths: SpatialPathEditorProps
  }
}

export interface RightSidebarCourseAudioControl {
  readonly sounds: readonly SoundDefinition[]
  onImportAudio(): void
}

export interface RightSidebarDesignTokensControl {
  readonly value: ProjectDesignTokens
  onChange(value: ProjectDesignTokens): void
}

interface RightSidebarProps {
  /**
   * Keeps the original shell/tabs available while preventing an unsupported
   * document backend from mounting controls that would mutate another model.
   * @deprecated Use `documentControl` for per-tab capability routing.
   */
  documentEditingUnavailableReason?: string
  documentControl?: RightSidebarDocumentControl
  flowDocumentControl?: RightSidebarFlowDocumentControl
  spatialDocumentControl?: RightSidebarSpatialDocumentControl
  effectiveLayers?: EffectiveLayerListProps
  designTokens?: RightSidebarDesignTokensControl
  courseAudio?: RightSidebarCourseAudioControl
  onRestoreTeacherController?: () => void
  onAddImage(x?: number, y?: number): void
  onReplaceImage(): void
  onAddVideo(x?: number, y?: number): void
  onImportImage?(): void
  onImportAudio(): void
  onImportVideo(): void
  onImportExternalComponents?(): void
  onReplaceComponent?(packageId: string): void
  componentCatalog?: ComponentCatalogSnapshot
  onRefreshComponentCatalog?(): void
  onAddCatalogComponents?(
    entries: AvailableComponentCatalogPackage[],
  ): boolean | Promise<boolean>
  onUpdateCatalogComponent?(entry: AvailableComponentCatalogPackage): void
}

const simpleTabs: Array<{ id: SidebarTab; label: string }> = [
  { id: 'elements', label: '元素' },
  { id: 'layers', label: '图层' },
  { id: 'properties', label: '属性' },
]

const professionalTabs: Array<{ id: SidebarTab; label: string }> = [
  { id: 'elements', label: '元素' },
  { id: 'components', label: '组件' },
  { id: 'layers', label: '图层' },
  { id: 'properties', label: '属性' },
  { id: 'automation', label: '互动与动画' },
  { id: 'developer', label: '开发' },
]

function SpatialElementsPanel({
  control,
}: {
  control: RightSidebarSpatialElementsControl
}) {
  const disabled = Boolean(control.disabledReason)
  return (
    <div className="elements-scroll" data-testid="spatial-elements-tab" aria-disabled={disabled}>
      <div className="section-heading section-heading--spaced">
        <span>Spatial 内容</span>
        <Type size={14} aria-hidden="true" />
      </div>
      {control.disabledReason && (
        <div className="empty-state add-category-empty" role="status" data-testid="spatial-elements-disabled-reason">
          {control.disabledReason}
        </div>
      )}
      <div className="element-grid" role="group" aria-label="Spatial 内容类型">
        <button
          type="button"
          className="element-card"
          aria-label="文字"
          data-testid="add-spatial-text"
          disabled={disabled}
          title={disabled ? control.disabledReason : '插入空间文字'}
          onClick={control.onAddText}
        >
          <span className="element-icon"><Type size={20} aria-hidden="true" /></span>
          文字
        </button>
        <button
          type="button"
          className="element-card"
          aria-label="图形"
          data-testid="add-spatial-shape"
          disabled={disabled}
          title={disabled ? control.disabledReason : '插入空间图形'}
          onClick={control.onAddShape}
        >
          <span className="element-icon"><Shapes size={20} aria-hidden="true" /></span>
          图形
        </button>
        <button
          type="button"
          className="element-card"
          aria-label="公式"
          data-testid="add-spatial-formula"
          disabled={disabled}
          title={disabled ? control.disabledReason : '插入空间公式'}
          onClick={control.onAddFormula}
        >
          <span className="element-icon"><Sigma size={20} aria-hidden="true" /></span>
          公式
        </button>
      </div>
    </div>
  )
}

function sortFlowLayerViews(
  layers: readonly FlowEditorLayerView[],
): FlowEditorLayerView[] {
  return [...layers].sort((left, right) =>
    left.item.order - right.item.order ||
    compareStableStrings(left.selectionId, right.selectionId),
  )
}

function FlowLayerList({
  layers,
  selectedLayerItemId,
  onSelectLayer,
}: RightSidebarFlowLayerControl) {
  const sortedLayers = sortFlowLayerViews(layers)
  return (
    <div className="flow-layer-list" data-testid="flow-layer-list">
      <div className="section-heading section-heading--spaced">
        <span>图层</span>
      </div>
      {sortedLayers.length === 0 ? (
        <div className="empty-state" role="status">
          当前讲义还没有图层。
        </div>
      ) : (
        <div className="flow-layer-list__items" role="list">
          {sortedLayers.map((layer) => {
            const layerLabel = layer.item.label || (
              layer.source === 'global' ? '全局图层' : '讲义图层'
            )
            const sourceLabel = layer.source === 'global' ? '全局' : '讲义'
            const selected = layer.selectionId === selectedLayerItemId
            const clickable = Boolean(onSelectLayer)
            return (
              <button
                key={layer.selectionId}
                type="button"
                role="listitem"
                className={`flow-layer-list-item${selected ? ' flow-layer-list-item--selected' : ''}`}
                data-layer-item-id={layer.selectionId}
                data-layer-source={layer.source}
                data-layer-visible={layer.item.visible}
                data-layer-locked={layer.item.locked}
                data-layer-scoped-visible={layer.scopedVisible}
                data-layer-effective-visible={layer.effectiveVisible}
                data-testid={`flow-layer-list-item-${layer.selectionId}`}
                disabled={!clickable}
                onClick={
                  clickable
                    ? () => onSelectLayer?.(layer.selectionId)
                    : undefined
                }
              >
                <span className="flow-layer-list-item__label">{layerLabel}</span>
                <span className="flow-layer-list-item__source">{sourceLabel}</span>
                <span className="flow-layer-list-item__state">
                  {layer.item.visible ? '显示' : '隐藏'} · {layer.item.locked ? '锁定' : '未锁定'}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function RightSidebar({
  documentEditingUnavailableReason,
  documentControl,
  flowDocumentControl,
  spatialDocumentControl,
  effectiveLayers,
  designTokens,
  courseAudio,
  onRestoreTeacherController,
  onAddImage,
  onReplaceImage,
  onAddVideo,
  onImportImage,
  onImportAudio,
  onImportVideo,
  onImportExternalComponents,
  onReplaceComponent,
  componentCatalog,
  onRefreshComponentCatalog,
  onAddCatalogComponents,
  onUpdateCatalogComponent,
}: RightSidebarProps) {
  const activeTab = useEditorStore((state) => state.activeTab)
  const editorMode = useEditorStore((state) => state.editorMode)
  const setActiveTab = useEditorStore((state) => state.setActiveTab)
  const tabs = editorMode === 'professional' ? professionalTabs : simpleTabs
  const professionalTabOpen = activeTab === 'components' ||
    activeTab === 'automation' ||
    activeTab === 'developer'
  const controlledTabAvailable = professionalTabOpen
    ? documentControl
      ? Boolean(documentControl[activeTab])
      : editorMode === 'professional'
    : effectiveLayers && activeTab === 'layers'
    ? true
    : flowDocumentControl
    ? activeTab === 'elements' ||
      activeTab === 'properties' ||
      (activeTab === 'layers' && Boolean(flowDocumentControl.layers || effectiveLayers))
    : spatialDocumentControl
      ? activeTab === 'elements' || activeTab === 'layers' || activeTab === 'properties'
      : documentControl
        ? activeTab === 'elements'
          ? Boolean(documentControl.elements)
          : activeTab === 'layers'
            ? Boolean(documentControl.layers || effectiveLayers)
            : activeTab === 'properties'
              ? Boolean(documentControl.properties)
              : false
        : false
  const activeUnavailableReason = flowDocumentControl
    ? controlledTabAvailable
      ? undefined
      : 'Flow 讲义暂不提供此面板；现有内容不会改变。'
    : spatialDocumentControl
      ? controlledTabAvailable
        ? undefined
        : '空间画布暂不提供此面板；现有内容不会改变。'
      : documentControl
        ? controlledTabAvailable
          ? undefined
          : documentControl.unavailableReasons?.[activeTab] ??
            '当前版本暂不支持此面板；现有内容不会改变。'
        : documentEditingUnavailableReason

  return (
    <aside
      className={`panel right-sidebar${
        editorMode === 'professional' && activeTab === 'developer'
          ? ' right-sidebar--developer'
          : ''
      }`}
      aria-label="编辑面板"
    >
      <div
        className="sidebar-tabs"
        role="tablist"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`sidebar-tab${
              activeTab === tab.id ? ' sidebar-tab--active' : ''
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="sidebar-content">
        {activeUnavailableReason ? (
          <div
            className="right-sidebar-capability-gate"
            role="status"
            aria-disabled="true"
          >
            <strong>{tabs.find((tab) => tab.id === activeTab)?.label ?? '编辑'}面板暂不可用</strong>
            <p>{activeUnavailableReason}</p>
          </div>
        ) : flowDocumentControl && activeTab !== 'layers' ? (
          activeTab === 'elements' ? (
            <FlowElementsTab {...flowDocumentControl.elements} />
          ) : activeTab === 'properties' ? (
            <>
              <FlowPropertiesTab {...flowDocumentControl.properties} />
              {designTokens && (
                <DesignTokensEditor
                  value={designTokens.value}
                  onChange={designTokens.onChange}
                />
              )}
            </>
          ) : null
        ) : spatialDocumentControl && activeTab !== 'layers' ? (
          activeTab === 'elements' ? (
            <SpatialElementsPanel control={spatialDocumentControl.elements} />
          ) : activeTab === 'properties' ? (
            <>
              <SpatialCameraPanel {...spatialDocumentControl.properties.camera} />
              <SpatialPathEditor {...spatialDocumentControl.properties.paths} />
              {designTokens && (
                <DesignTokensEditor
                  value={designTokens.value}
                  onChange={designTokens.onChange}
                />
              )}
            </>
          ) : null
        ) : activeTab === 'elements' ? (
          <>
            {documentControl?.elements ? (
              <ElementsTab documentControl={documentControl.elements} />
            ) : (
              <ElementsTab
                onAddImage={onAddImage}
                onAddVideo={onAddVideo}
                onImportImage={onImportImage}
                onImportAudio={onImportAudio}
                onImportVideo={onImportVideo}
              />
            )}
            {courseAudio && (
              <section className="course-audio-panel" data-testid="course-audio-panel">
                <div className="section-heading section-heading--spaced">
                  <span>声音</span>
                  <Music2 size={14} aria-hidden="true" />
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  data-testid="import-course-audio"
                  onClick={courseAudio.onImportAudio}
                >
                  导入声音
                </button>
                {courseAudio.sounds.length === 0 ? (
                  <div className="empty-state" role="status">还没有声音素材。</div>
                ) : (
                  <ul className="course-audio-panel__list">
                    {courseAudio.sounds.map((sound) => (
                      <li key={sound.id}>{sound.name}</li>
                    ))}
                  </ul>
                )}
              </section>
            )}
            {onRestoreTeacherController && (
              <button
                type="button"
                className="secondary-button"
                data-testid="restore-teacher-controller"
                onClick={onRestoreTeacherController}
              >
                恢复教师控制器
              </button>
            )}
          </>
        ) : activeTab === 'components' && editorMode === 'professional' ? (
          <ComponentsTab
            componentCatalog={componentCatalog}
            onImportExternalComponents={onImportExternalComponents}
            onRefreshComponentCatalog={onRefreshComponentCatalog}
            onAddCatalogComponents={onAddCatalogComponents}
            onUpdateCatalogComponent={onUpdateCatalogComponent}
            onReplaceComponent={onReplaceComponent}
          />
        ) : activeTab === 'layers' ? (
          effectiveLayers ? (
            <EffectiveLayerList {...effectiveLayers} />
          ) : flowDocumentControl?.layers ? (
            <FlowLayerList {...flowDocumentControl.layers} />
          ) : spatialDocumentControl ? (
            <SpatialLayerInspector {...spatialDocumentControl.layers} />
          ) : (
            <NodesTab documentControl={documentControl?.layers} />
          )
        ) : activeTab === 'properties' ? (
          <>
            {documentControl?.properties ? (
              <PropertiesTab documentControl={documentControl.properties} />
            ) : (
              <PropertiesTab onReplaceImage={onReplaceImage} />
            )}
            {designTokens && (
              <DesignTokensEditor
                value={designTokens.value}
                onChange={designTokens.onChange}
              />
            )}
          </>
        ) : activeTab === 'automation' && editorMode === 'professional' ? (
          <AutomationTab />
        ) : activeTab === 'developer' && editorMode === 'professional' ? (
          <DeveloperTab />
        ) : null}
      </div>
    </aside>
  )
}
