import { Shapes, Sigma, Type } from 'lucide-react'
import { ElementsTab, type ElementsTabDocumentControl } from './ElementsTab'
import { NodesTab, type NodesTabDocumentControl } from './NodesTab'
import {
  PropertiesTab,
  type PropertiesTabDocumentControl,
} from './PropertiesTab'
import { AutomationTab } from './AutomationTab'
import { DeveloperTab } from './DeveloperTab'
import { ComponentsTab } from './ComponentsTab'
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

export interface RightSidebarFlowDocumentControl {
  readonly elements: FlowElementsTabProps
  readonly properties: FlowPropertiesTabProps
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

export function RightSidebar({
  documentEditingUnavailableReason,
  documentControl,
  flowDocumentControl,
  spatialDocumentControl,
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
  const controlledTabAvailable = flowDocumentControl
    ? activeTab === 'elements' || activeTab === 'properties'
    : spatialDocumentControl
      ? activeTab === 'elements' || activeTab === 'layers' || activeTab === 'properties'
      : documentControl
        ? activeTab === 'elements'
          ? Boolean(documentControl.elements)
          : activeTab === 'layers'
            ? Boolean(documentControl.layers)
            : activeTab === 'properties'
              ? Boolean(documentControl.properties)
              : activeTab === 'components'
                ? Boolean(documentControl.components)
                : activeTab === 'automation'
                  ? Boolean(documentControl.automation)
                  : activeTab === 'developer'
                    ? Boolean(documentControl.developer)
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
        ) : flowDocumentControl ? (
          activeTab === 'elements' ? (
            <FlowElementsTab {...flowDocumentControl.elements} />
          ) : activeTab === 'properties' ? (
            <FlowPropertiesTab {...flowDocumentControl.properties} />
          ) : null
        ) : spatialDocumentControl ? (
          activeTab === 'elements' ? (
            <SpatialElementsPanel control={spatialDocumentControl.elements} />
          ) : activeTab === 'layers' ? (
            <SpatialLayerInspector {...spatialDocumentControl.layers} />
          ) : activeTab === 'properties' ? (
            <>
              <SpatialCameraPanel {...spatialDocumentControl.properties.camera} />
              <SpatialPathEditor {...spatialDocumentControl.properties.paths} />
            </>
          ) : null
        ) : activeTab === 'elements' ? (
          documentControl?.elements ? (
            <ElementsTab documentControl={documentControl.elements} />
          ) : (
            <ElementsTab
              onAddImage={onAddImage}
              onAddVideo={onAddVideo}
              onImportImage={onImportImage}
              onImportAudio={onImportAudio}
              onImportVideo={onImportVideo}
            />
          )
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
          <NodesTab documentControl={documentControl?.layers} />
        ) : activeTab === 'properties' ? (
          documentControl?.properties ? (
            <PropertiesTab documentControl={documentControl.properties} />
          ) : (
            <PropertiesTab onReplaceImage={onReplaceImage} />
          )
        ) : activeTab === 'automation' && editorMode === 'professional' ? (
          <AutomationTab />
        ) : activeTab === 'developer' && editorMode === 'professional' ? (
          <DeveloperTab />
        ) : null}
      </div>
    </aside>
  )
}
