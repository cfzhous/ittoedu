import { ElementsTab } from './ElementsTab'
import { NodesTab } from './NodesTab'
import { PropertiesTab } from './PropertiesTab'
import { AutomationTab } from './AutomationTab'
import { DeveloperTab } from './DeveloperTab'
import { useEditorStore, type SidebarTab } from '../store/editorStore'

interface RightSidebarProps {
  onAddImage(x?: number, y?: number): void
  onReplaceImage(): void
  onAddVideo(x?: number, y?: number): void
  onImportAudio(): void
  onImportVideo(): void
  onReplaceComponent?(packageId: string): void
}

const simpleTabs: Array<{ id: SidebarTab; label: string }> = [
  { id: 'elements', label: '元素' },
  { id: 'layers', label: '图层' },
  { id: 'properties', label: '属性' },
]

const professionalTabs: Array<{ id: SidebarTab; label: string }> = [
  ...simpleTabs,
  { id: 'automation', label: '互动与动画' },
  { id: 'developer', label: '开发' },
]

export function RightSidebar({
  onAddImage,
  onReplaceImage,
  onAddVideo,
  onImportAudio,
  onImportVideo,
  onReplaceComponent,
}: RightSidebarProps) {
  const activeTab = useEditorStore((state) => state.activeTab)
  const editorMode = useEditorStore((state) => state.editorMode)
  const setActiveTab = useEditorStore((state) => state.setActiveTab)
  const tabs = editorMode === 'professional' ? professionalTabs : simpleTabs

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
        {activeTab === 'elements' && (
          <ElementsTab
            onAddImage={onAddImage}
            onAddVideo={onAddVideo}
            onImportAudio={onImportAudio}
            onImportVideo={onImportVideo}
            onReplaceComponent={onReplaceComponent}
          />
        )}
        {activeTab === 'layers' && <NodesTab />}
        {activeTab === 'properties' && (
          <PropertiesTab onReplaceImage={onReplaceImage} />
        )}
        {activeTab === 'automation' && editorMode === 'professional' && (
          <AutomationTab />
        )}
        {activeTab === 'developer' && editorMode === 'professional' && (
          <DeveloperTab />
        )}
      </div>
    </aside>
  )
}
