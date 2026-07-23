import { ElementsTab } from './ElementsTab'
import { NodesTab } from './NodesTab'
import { PropertiesTab } from './PropertiesTab'
import { MediaTab } from './MediaTab'
import { AutomationTab } from './AutomationTab'
import { useEditorStore, type SidebarTab } from '../store/editorStore'

interface RightSidebarProps {
  onAddImage(x?: number, y?: number): void
  onReplaceImage(): void
  onAddVideo(x?: number, y?: number): void
  onImportAudio(): void
  onImportVideo(): void
  onReplaceComponent?(packageId: string): void
}

const tabs: Array<{ id: SidebarTab; label: string }> = [
  { id: 'elements', label: '元素' },
  { id: 'layers', label: '图层' },
  { id: 'media', label: '素材' },
  { id: 'properties', label: '属性' },
  { id: 'automation', label: '自动化' },
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
  const setActiveTab = useEditorStore((state) => state.setActiveTab)

  return (
    <aside className="panel right-sidebar" aria-label="编辑面板">
      <div className="sidebar-tabs" role="tablist">
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
            onReplaceComponent={onReplaceComponent}
          />
        )}
        {activeTab === 'layers' && <NodesTab />}
        {activeTab === 'media' && (
          <MediaTab onImportAudio={onImportAudio} onImportVideo={onImportVideo} />
        )}
        {activeTab === 'properties' && (
          <PropertiesTab onReplaceImage={onReplaceImage} />
        )}
        {activeTab === 'automation' && <AutomationTab />}
      </div>
    </aside>
  )
}
