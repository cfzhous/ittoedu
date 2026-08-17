import { Shapes, Sigma, Type } from 'lucide-react'
import { useEffect, useState } from 'react'
import { compareStableStrings } from '../../shared/stableOrder'
import type {
  FlowEditorLayerTarget,
  FlowEditorLayerView,
} from '../course/flowEditorView'
import type {
  SpatialEditorLayerScope,
  SpatialEditorLayerView,
} from '../course/spatialEditorView'
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

export interface RightSidebarFlowLayerControl {
  readonly layers: readonly FlowEditorLayerView[]
  readonly selectedLayerTarget?: FlowEditorLayerTarget | null
  onSelectLayer?(target: FlowEditorLayerTarget): void
  onLocateController?(target: FlowEditorLayerTarget): void
}

export interface RightSidebarFlowDocumentControl {
  readonly elements: FlowElementsTabProps
  readonly properties: FlowPropertiesTabProps
  /** Selected global controller reuses the V9 controlled property editor. */
  readonly controllerProperties?: PropertiesTabDocumentControl
  /** When present, the layers tab shows the same teacher-facing Flow layer list. */
  readonly layers?: RightSidebarFlowLayerControl
}

export interface RightSidebarSpatialElementsControl {
  onAddText(): void
  onAddShape(): void
  onAddFormula(): void
  readonly disabledReason?: string
}

export interface RightSidebarSpatialLayerTarget {
  readonly source: SpatialEditorLayerScope
  readonly layerItemId: string
}

export interface RightSidebarSpatialLayerControl {
  readonly layers: readonly SpatialEditorLayerView[]
  readonly selectedLayerTarget?: RightSidebarSpatialLayerTarget | null
  onSelectLayer?(target: RightSidebarSpatialLayerTarget): void
  onLocateController?(target: RightSidebarSpatialLayerTarget): void
}

export interface RightSidebarSpatialDocumentControl {
  readonly elements: RightSidebarSpatialElementsControl
  readonly layers: SpatialLayerInspectorProps
  /** Current-page source-explicit list; the inspector remains world-only. */
  readonly layerList?: RightSidebarSpatialLayerControl
  readonly properties: {
    readonly camera: SpatialCameraPanelProps
    readonly paths: SpatialPathEditorProps
  }
  /** Selected global controller reuses the V9 controlled property editor. */
  readonly controllerProperties?: PropertiesTabDocumentControl
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
        <span>空间画布内容</span>
        <Type size={14} aria-hidden="true" />
      </div>
      {control.disabledReason && (
        <div className="empty-state add-category-empty" role="status" data-testid="spatial-elements-disabled-reason">
          {control.disabledReason}
        </div>
      )}
      <div className="element-grid" role="group" aria-label="空间画布内容类型">
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
  selectedLayerTarget,
  onSelectLayer,
  onLocateController,
}: RightSidebarFlowLayerControl) {
  // The right-side list remains an inspection surface: unlike the canvas
  // overlay, it must retain hidden/scoped-out rows and report their state.
  const [inspectedSharedLayer, setInspectedSharedLayer] =
    useState<FlowEditorLayerTarget | null>(null)
  useEffect(() => {
    setInspectedSharedLayer(null)
  }, [layers])
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
              layer.source === 'global' ? '全课内容' : '当前讲义共用'
            )
            const sourceLabel = layer.source === 'global' ? '全课内容' : '当前讲义共用'
            const target: FlowEditorLayerTarget = {
              source: layer.source,
              layerItemId: layer.selectionId,
            }
            const controller = layer.source === 'global' &&
              layer.item.kind === 'native' &&
              layer.item.content.nativeType === 'teacher-controller'
            const viewOnly = !controller
            const selected = inspectedSharedLayer === null
              ? selectedLayerTarget?.source === target.source &&
                selectedLayerTarget.layerItemId === target.layerItemId
              : inspectedSharedLayer.source === target.source &&
                inspectedSharedLayer.layerItemId === target.layerItemId
            const clickable = Boolean(onSelectLayer)
            return (
              <div
                key={`${layer.source}:${layer.selectionId}`}
                role="listitem"
                className="flow-layer-list-item-wrap"
              >
                <button
                  type="button"
                  className={`flow-layer-list-item${selected ? ' flow-layer-list-item--selected' : ''}`}
                  data-layer-item-id={layer.selectionId}
                  data-layer-source={layer.source}
                  data-layer-visible={layer.item.visible}
                  data-layer-locked={layer.item.locked}
                  data-layer-scoped-visible={layer.scopedVisible}
                  data-layer-effective-visible={layer.effectiveVisible}
                  data-testid={`flow-layer-list-item-${layer.source}-${layer.selectionId}`}
                  disabled={!clickable}
                  onClick={
                    clickable
                      ? () => {
                          setInspectedSharedLayer(viewOnly ? target : null)
                          onSelectLayer?.(target)
                        }
                      : undefined
                  }
                >
                  <span className="flow-layer-list-item__label">{layerLabel}</span>
                  <span className="flow-layer-list-item__source">{sourceLabel}</span>
                  <span className="flow-layer-list-item__state">
                    {layer.item.visible ? '显示' : '隐藏'} · {layer.item.locked ? '锁定' : '未锁定'}
                  </span>
                </button>
                {controller && onLocateController ? (
                  <button
                    type="button"
                    className="secondary-button flow-layer-list-item__locate-controller"
                    data-testid={`locate-controller-${layer.source}-${layer.selectionId}`}
                    aria-label={`定位控制器“${layerLabel}”`}
                    title={layer.effectiveVisible
                      ? '在当前讲义画布中定位控制器'
                      : '控制器当前不可见，无法定位到画布'}
                    disabled={!layer.effectiveVisible}
                    onClick={() => {
                      setInspectedSharedLayer(null)
                      onLocateController(target)
                    }}
                  >
                    定位控制器
                  </button>
                ) : viewOnly ? (
                  <span className="flow-layer-list-item__impact" role="status">
                    {layer.source === 'global'
                      ? '会在整门课中出现；当前仅可查看影响范围'
                      : '会在当前讲义的多个页面中出现；当前仅可查看影响范围'}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function sortSpatialLayerViews(
  layers: readonly SpatialEditorLayerView[],
): SpatialEditorLayerView[] {
  return [...layers].sort((left, right) =>
    left.item.order - right.item.order ||
    compareStableStrings(left.selectionId, right.selectionId),
  )
}

function spatialSourceLabel(source: SpatialEditorLayerScope): string {
  switch (source) {
    case 'global': return '全课内容'
    case 'surface': return '当前空间共用'
    case 'world': return '空间内容'
  }
}

function SpatialLayerList({
  layers,
  selectedLayerTarget,
  onSelectLayer,
  onLocateController,
}: RightSidebarSpatialLayerControl) {
  // Keep parity with Flow: visibility affects the canvas proxy, not whether a
  // teacher can inspect the current source-explicit layer row here.
  const [inspectedSharedLayer, setInspectedSharedLayer] =
    useState<RightSidebarSpatialLayerTarget | null>(null)
  useEffect(() => {
    setInspectedSharedLayer(null)
  }, [layers])
  const sortedLayers = sortSpatialLayerViews(layers)
  return (
    <div className="spatial-layer-list" data-testid="spatial-layer-list">
      <div className="section-heading section-heading--spaced">
        <span>当前页面图层</span>
      </div>
      {sortedLayers.length === 0 ? (
        <div className="empty-state" role="status">当前页面没有可查看的图层。</div>
      ) : (
        <div className="spatial-layer-list__items" role="list">
          {sortedLayers.map((layer) => {
            const sourceLabel = spatialSourceLabel(layer.source)
            const target: RightSidebarSpatialLayerTarget = {
              source: layer.source,
              layerItemId: layer.selectionId,
            }
            const controller = layer.source === 'global' &&
              layer.item.kind === 'native' &&
              layer.item.content.nativeType === 'teacher-controller'
            const viewOnly = layer.source !== 'world' && !controller
            const selected = inspectedSharedLayer === null
              ? selectedLayerTarget?.source === target.source &&
                selectedLayerTarget.layerItemId === target.layerItemId
              : inspectedSharedLayer.source === target.source &&
                inspectedSharedLayer.layerItemId === target.layerItemId
            return (
              <div
                key={`${layer.source}:${layer.selectionId}`}
                className="spatial-layer-list-item-wrap"
                role="listitem"
              >
                <button
                  type="button"
                  className={`spatial-layer-list-item${selected ? ' spatial-layer-list-item--selected' : ''}`}
                  data-testid={`spatial-layer-list-item-${layer.source}-${layer.selectionId}`}
                  data-layer-source={layer.source}
                  data-layer-item-id={layer.selectionId}
                  data-layer-effective-visible={layer.effectiveVisible}
                  data-layer-view-only={viewOnly ? 'true' : 'false'}
                  aria-pressed={selected}
                  onClick={() => {
                    setInspectedSharedLayer(viewOnly ? target : null)
                    onSelectLayer?.(target)
                  }}
                >
                  <span className="spatial-layer-list-item__label">{layer.item.label}</span>
                  <span className="spatial-layer-list-item__source">{sourceLabel}</span>
                  <span className="spatial-layer-list-item__state">
                    {layer.item.visible ? '显示' : '隐藏'} · {layer.item.locked ? '锁定' : '未锁定'}
                  </span>
                </button>
                {controller && onLocateController ? (
                  <button
                    type="button"
                    className="secondary-button spatial-layer-list-item__locate-controller"
                    data-testid={`locate-controller-${layer.source}-${layer.selectionId}`}
                    aria-label={`定位控制器“${layer.item.label}”`}
                    title={layer.effectiveVisible
                      ? '在当前空间画布中定位控制器'
                      : '控制器当前不可见，无法定位到画布'}
                    disabled={!layer.effectiveVisible}
                    onClick={() => {
                      setInspectedSharedLayer(null)
                      onLocateController(target)
                    }}
                  >
                    定位控制器
                  </button>
                ) : viewOnly ? (
                  <span className="spatial-layer-list-item__impact" role="status">
                    当前仅可查看影响范围
                  </span>
                ) : null}
              </div>
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
    ? activeTab === 'elements' ||
      activeTab === 'properties' ||
      (activeTab === 'layers' && Boolean(flowDocumentControl.layers))
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
      : '讲义暂不提供此面板；现有内容不会改变。'
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
            flowDocumentControl.controllerProperties
              ? <PropertiesTab documentControl={flowDocumentControl.controllerProperties} />
              : <FlowPropertiesTab {...flowDocumentControl.properties} />
          ) : activeTab === 'layers' && flowDocumentControl.layers ? (
            <FlowLayerList {...flowDocumentControl.layers} />
          ) : null
        ) : spatialDocumentControl ? (
          activeTab === 'elements' ? (
            <SpatialElementsPanel control={spatialDocumentControl.elements} />
          ) : activeTab === 'layers' ? (
            spatialDocumentControl.layerList ? (
              <>
                <SpatialLayerList {...spatialDocumentControl.layerList} />
                {spatialDocumentControl.layers.layer && (
                  <SpatialLayerInspector {...spatialDocumentControl.layers} />
                )}
              </>
            ) : <SpatialLayerInspector {...spatialDocumentControl.layers} />
          ) : activeTab === 'properties' ? (
            spatialDocumentControl.controllerProperties
              ? <PropertiesTab documentControl={spatialDocumentControl.controllerProperties} />
              : <>
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
