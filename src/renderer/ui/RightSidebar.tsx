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

export interface RightSidebarDocumentControl {
  readonly elements?: ElementsTabDocumentControl
  readonly layers?: NodesTabDocumentControl
  readonly properties?: PropertiesTabDocumentControl
  /** A missing controlled tab stays visible but mounts no legacy document editor. */
  readonly unavailableReasons?: Partial<Record<SidebarTab, string>>
}

interface RightSidebarProps {
  /**
   * Keeps the original shell/tabs available while preventing an unsupported
   * document backend from mounting controls that would mutate another model.
   * @deprecated Use `documentControl` for per-tab capability routing.
   */
  documentEditingUnavailableReason?: string
  documentControl?: RightSidebarDocumentControl
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

export function RightSidebar({
  documentEditingUnavailableReason,
  documentControl,
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
  const controlledTabAvailable = documentControl
    ? activeTab === 'elements'
      ? Boolean(documentControl.elements)
      : activeTab === 'layers'
        ? Boolean(documentControl.layers)
        : activeTab === 'properties'
          ? Boolean(documentControl.properties)
          : false
    : false
  const activeUnavailableReason = documentControl
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
