import {
  Box,
  Check,
  ChevronLeft,
  Info,
  Library,
  LocateFixed,
  MoreVertical,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, useCallback } from 'react'
import type {
  AvailableComponentCatalogPackage,
  ComponentCatalogSnapshot,
} from '../../shared/componentCatalog'
import { componentSupportsScope } from '../../shared/componentCapabilities'
import { collectComponentPackageUsage } from '../../shared/componentPackageLifecycle'
import type { ComponentPackageData } from '../../shared/componentTypes'
import type { CourseProjectDocument } from '../../shared/courseProjectTypes'
import { componentCatalogInstallStatus } from '../components/componentCatalogStatus'
import {
  collectComponentLibrarySubjects,
  filterComponentLibraryPackages,
  selectCurrentCatalogPackages,
} from '../components/componentLibraryModel'
import { useEditorStore } from '../store/editorStore'

interface ComponentsTabProps {
  componentCatalog?: ComponentCatalogSnapshot
  onImportExternalComponents?(): void
  onRefreshComponentCatalog?(): void
  onAddCatalogComponents?(
    entries: AvailableComponentCatalogPackage[],
  ): boolean | Promise<boolean>
  onUpdateCatalogComponent?(entry: AvailableComponentCatalogPackage): void
  onReplaceComponent?(packageId: string): void
}

const EMPTY_CATALOG: ComponentCatalogSnapshot = {
  sources: [],
  packages: [],
  issues: [],
}

const installStatusLabels = {
  available: '可加入工程',
  embedded: '已加入工程',
  'update-available': '有新版本',
  'embedded-newer': '工程版本更新',
  'hash-conflict': '同版本哈希冲突',
  'embedded-unverified': '已加入·历史哈希缺失',
} as const

const qualityLabels = {
  experimental: '试验',
  candidate: '候选',
  stable: '稳定',
  deprecated: '已弃用',
} as const

function ComponentThumbnail({ data }: { data: ComponentPackageData }) {
  if (data.thumbnailUrl) return <img src={data.thumbnailUrl} alt="" />
  return <Box size={20} />
}

function CatalogThumbnail({ entry }: { entry: AvailableComponentCatalogPackage }) {
  if (entry.thumbnailDataUrl) return <img src={entry.thumbnailDataUrl} alt="" />
  return <Box size={20} />
}

function setComponentDragData(
  event: React.DragEvent,
  packageId: string,
  label: string,
  presetId?: string,
) {
  const value = presetId
    ? `component-preset:${encodeURIComponent(packageId)}:${encodeURIComponent(presetId)}`
    : `component:${packageId}`
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-courseware-element', value)
  event.dataTransfer.setData('text/plain', label)
}

function closeContainingMenu(target: HTMLElement) {
  target.closest('details')?.removeAttribute('open')
}

interface V9ComponentReference {
  readonly scope: 'scene' | 'surface' | 'global'
  readonly sceneId?: string
  readonly nodeId: string
  readonly nodeName: string
}

interface V9ComponentUsage extends PackageUsageSummary {
  readonly references: V9ComponentReference[]
}

interface V9ComponentLocator {
  readonly reference: V9ComponentReference | null
  readonly unavailableReason: string | null
}

/** Component instance counts shown by the project-component tab. */
interface PackageUsageSummary {
  readonly sceneInstanceCount: number
  readonly surfaceInstanceCount: number
  readonly globalInstanceCount: number
  readonly totalInstanceCount: number
}

function summarizeLegacyUsage(
  usage: ReturnType<typeof collectComponentPackageUsage>,
): PackageUsageSummary {
  return {
    sceneInstanceCount: usage.sceneInstanceCount,
    surfaceInstanceCount: 0,
    globalInstanceCount: usage.globalInstanceCount,
    totalInstanceCount: usage.totalInstanceCount,
  }
}

/** V9 Course Project usage collector for the project-component tab. */
function collectV9ComponentUsage(
  project: CourseProjectDocument,
  packageId: string,
): V9ComponentUsage {
  const references: V9ComponentReference[] = []
  for (const entry of project.globalLayerItems) {
    if (entry.item.kind === 'component' && entry.item.component.packageId === packageId) {
      references.push({
        scope: 'global',
        nodeId: entry.item.layerItemId,
        nodeName: entry.item.label,
      })
    }
  }
  for (const surface of project.surfaces) {
    if (surface.type === 'slide') {
      for (const entry of surface.surfaceLayerItems) {
        if (entry.item.kind === 'component' && entry.item.component.packageId === packageId) {
          references.push({
            scope: 'surface',
            nodeId: entry.item.layerItemId,
            nodeName: entry.item.label,
          })
        }
      }
      for (const scene of surface.scenes) {
        for (const item of scene.layerItems) {
          if (item.kind === 'component' && item.component.packageId === packageId) {
            references.push({
              scope: 'scene',
              sceneId: scene.id,
              nodeId: item.layerItemId,
              nodeName: item.label,
            })
          }
        }
      }
    } else if (surface.type === 'spatial-2d') {
      for (const item of surface.world.layerItems) {
        if (item.kind === 'component' && item.component.packageId === packageId) {
          references.push({ scope: 'scene', nodeId: item.layerItemId, nodeName: item.label })
        }
      }
    } else {
      for (const block of surface.blocks) {
        if (block.type === 'component' && block.component.packageId === packageId) {
          references.push({
            scope: 'scene',
            nodeId: block.id,
            nodeName: `组件·${block.component.packageId}`,
          })
        }
      }
    }
  }
  return {
    sceneInstanceCount: references.filter((reference) => reference.scope === 'scene').length,
    surfaceInstanceCount: references.filter((reference) => reference.scope === 'surface').length,
    globalInstanceCount: references.filter((reference) => reference.scope === 'global').length,
    totalInstanceCount: references.length,
    references,
  }
}

/**
 * The V9 component menu can only promise a locator when it can navigate to a
 * concrete slide-scene and select that stable layer ID. Shared references stay
 * discoverable in the current-page layer list instead of reopening a hidden
 * authoring scope.
 */
function v9ComponentLocator(usage: V9ComponentUsage): V9ComponentLocator {
  const reference = usage.references.find((candidate) => (
    candidate.scope === 'scene' && candidate.sceneId !== undefined
  )) ?? null
  if (reference !== null) return { reference, unavailableReason: null }
  if (usage.totalInstanceCount === 0) {
    return { reference: null, unavailableReason: '该组件尚未被使用。' }
  }
  const onlyShared = usage.references.every((candidate) => candidate.scope !== 'scene')
  return {
    reference: null,
    unavailableReason: onlyShared
      ? '该组件只用于全课或共用内容；请在当前页面的图层列表查看影响范围。'
      : '该组件用于非幻灯片内容；请切换到对应页面查看。',
  }
}

function v9ComponentInsertionUnavailableReason(
  courseSession: NonNullable<ReturnType<typeof useEditorStore.getState>['courseSession']>,
): string | undefined {
  if (courseSession.editingScope === 'surface') {
    return '当前内容共用层暂不能插入组件；请在当前页面添加组件。'
  }
  const location = courseSession.history.present.locations.find(
    (candidate) => candidate.id === courseSession.selection.locationId,
  )
  if (!location) return '当前页面已失效。'
  if (location.kind === 'slide-scene') return undefined
  if (location.kind === 'flow-block') {
    return '流式页面与幻灯片共用同一组件目录，不复制包；请从当前页内容入口插入组件。'
  }
  if (location.kind === 'spatial-camera') {
    return '无限画布与幻灯片共用同一组件目录，不复制包；请从当前页画布入口插入组件。'
  }
  return '当前页面不能从组件库直接插入实例。'
}

interface ComponentDetailsDialogProps {
  data?: ComponentPackageData
  entry?: AvailableComponentCatalogPackage
  usage?: PackageUsageSummary
  onClose(): void
}

function ComponentDetailsDialog({ data, entry, usage, onClose }: ComponentDetailsDialogProps) {
  const packageId = data?.manifest.id ?? entry?.packageId ?? ''
  const name = data?.manifest.name ?? entry?.name ?? packageId
  const version = data?.manifest.version ?? entry?.version ?? ''
  const sourceLabel = data?.provenance?.sourceLabel ?? entry?.sourceLabel ?? '来源未登记'
  const sha256 = data?.provenance?.sha256 ?? entry?.sha256
  const scopes = data?.manifest.supportedScopes ?? entry?.supportedScopes ?? []
  const renderMode = data?.manifest.renderMode ?? entry?.renderMode

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" data-testid="component-details-dialog">
      <section className="modal component-details-dialog" role="dialog" aria-modal="true" aria-labelledby="component-details-title">
        <div className="component-details-dialog__header">
          <div>
            <span>组件详情</span>
            <h2 id="component-details-title">{name}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="关闭组件详情" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <dl className="component-details-dialog__list">
          <div><dt>组件 ID</dt><dd>{packageId}</dd></div>
          <div><dt>版本</dt><dd>{version}</dd></div>
          <div><dt>来源</dt><dd>{sourceLabel}</dd></div>
          <div><dt>渲染方式</dt><dd>{renderMode ?? '未知'}</dd></div>
          <div><dt>可用层</dt><dd>{scopes.map((scope) => scope === 'scene' ? '场景' : '全局').join('、')}</dd></div>
          {entry && <div><dt>质量状态</dt><dd>{qualityLabels[entry.quality]}</dd></div>}
          {usage && <div><dt>工程实例</dt><dd>场景 {usage.sceneInstanceCount} · 共用 {usage.surfaceInstanceCount} · 全局 {usage.globalInstanceCount}</dd></div>}
          {entry?.license && (
            <div><dt>许可证</dt><dd>{entry.license.status === 'declared' ? entry.license.expression : '尚未确认'}</dd></div>
          )}
          {sha256 && <div className="component-details-dialog__wide"><dt>SHA-256</dt><dd>{sha256}</dd></div>}
          {entry?.releaseBlockers && entry.releaseBlockers.length > 0 && (
            <div className="component-details-dialog__wide component-details-dialog__warning">
              <dt>发布阻断</dt><dd>{entry.releaseBlockers.join('、')}</dd>
            </div>
          )}
        </dl>
        {entry?.description && <p className="component-details-dialog__description">{entry.description}</p>}
        <div className="modal__actions">
          <button type="button" className="primary-button" onClick={onClose}>完成</button>
        </div>
      </section>
    </div>
  )
}

interface ComponentLibraryDialogProps {
  catalog: ComponentCatalogSnapshot
  components: Record<string, ComponentPackageData>
  onClose(): void
  onRefresh?(): void
  onAdd?(entries: AvailableComponentCatalogPackage[]): boolean | Promise<boolean>
  onUpdate?(entry: AvailableComponentCatalogPackage): void
}

export function ComponentLibraryDialog({
  catalog,
  components,
  onClose,
  onRefresh,
  onAdd,
  onUpdate,
}: ComponentLibraryDialogProps) {
  const entries = useMemo(
    () => selectCurrentCatalogPackages(
      catalog.packages.filter((entry) => entry.sourceTrust === 'built-in'),
    ),
    [catalog.packages],
  )
  const subjects = useMemo(() => collectComponentLibrarySubjects(entries), [entries])
  const schoolStages = useMemo(() => [...new Set(entries.flatMap((entry) => entry.schoolStage))]
    .sort((left, right) => left.localeCompare(right, 'zh-CN')), [entries])
  const categories = useMemo(() => [...new Set(entries.flatMap((entry) => entry.category ? [entry.category] : []))]
    .sort((left, right) => left.localeCompare(right, 'zh-CN')), [entries])
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState<string | null>(null)
  const [schoolStage, setSchoolStage] = useState('')
  const [category, setCategory] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [detailsEntry, setDetailsEntry] = useState<AvailableComponentCatalogPackage | null>(null)
  const visibleEntries = useMemo(() => filterComponentLibraryPackages(entries, {
    query,
    subject,
    schoolStage,
    category,
  }), [category, entries, query, schoolStage, subject])
  const selectableVisibleIds = visibleEntries
    .filter((entry) => componentCatalogInstallStatus(entry, components[entry.packageId]) === 'available')
    .map((entry) => entry.packageId)
  const selectedEntries = entries.filter((entry) => selectedIds.has(entry.packageId))

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !detailsEntry && !adding) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [adding, detailsEntry, onClose])

  const toggleSelection = (packageId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(packageId)) next.delete(packageId)
      else next.add(packageId)
      return next
    })
  }

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current)
      const shouldSelect = selectableVisibleIds.some((id) => !next.has(id))
      selectableVisibleIds.forEach((id) => {
        if (shouldSelect) next.add(id)
        else next.delete(id)
      })
      return next
    })
  }

  return (
    <div className="component-library" data-testid="component-library" role="dialog" aria-modal="true" aria-labelledby="component-library-title">
      <header className="component-library__header">
        <button type="button" className="secondary-button" disabled={adding} onClick={onClose}>
          <ChevronLeft size={16} />返回编辑器
        </button>
        <div>
          <h2 id="component-library-title">内置组件库</h2>
          <p>多选后只加入工程，不会在画布上自动创建实例。</p>
        </div>
        <button type="button" className="secondary-button" disabled={!onRefresh} onClick={onRefresh}>
          <RefreshCw size={14} />刷新
        </button>
      </header>

      <div className="component-library__tools">
        <label className="component-library__search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="搜索内置组件"
            placeholder="搜索名称、用途或标签"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <select aria-label="筛选学段" value={schoolStage} onChange={(event) => setSchoolStage(event.currentTarget.value)}>
          <option value="">全部学段</option>
          {schoolStages.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="筛选用途" value={category} onChange={(event) => setCategory(event.currentTarget.value)}>
          <option value="">全部用途</option>
          {categories.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>

      <div className="component-library__body">
        <nav className="component-library__subjects" aria-label="组件学科分类">
          <button type="button" className={subject === null ? 'is-active' : ''} onClick={() => setSubject(null)}>
            <span>全部组件</span><small>{entries.length}</small>
          </button>
          {subjects.map((value) => (
            <button type="button" key={value} className={subject === value ? 'is-active' : ''} onClick={() => setSubject(value)}>
              <span>{value}</span>
              <small>{entries.filter((entry) =>
                filterComponentLibraryPackages([entry], { query: '', subject: value, schoolStage: '', category: '' }).length > 0,
              ).length}</small>
            </button>
          ))}
        </nav>

        <main className="component-library__results">
          <div className="component-library__results-heading">
            <div><strong>{subject ?? '全部组件'}</strong><span>{visibleEntries.length} 个结果</span></div>
            <button
              type="button"
              className="secondary-button"
              disabled={selectableVisibleIds.length === 0}
              onClick={toggleAllVisible}
            >
              <Check size={13} />全选当前结果
            </button>
          </div>
          {catalog.issues.some((issue) =>
            catalog.sources.some((source) =>
              source.trust === 'built-in' && source.sourceId === issue.sourceId,
            ),
          ) && (
            <div className="component-library__issues" role="status">
              <ShieldAlert size={16} />
              <span>内置组件库有完整性问题；失效包已停止展示。</span>
            </div>
          )}
          {visibleEntries.length === 0 ? (
            <div className="empty-state component-library__empty">
              {entries.length === 0 ? '当前没有可用的内置组件。' : '没有符合筛选条件的组件。'}
            </div>
          ) : (
            <div className="component-library__grid">
              {visibleEntries.map((entry) => {
                const status = componentCatalogInstallStatus(entry, components[entry.packageId])
                const selectable = status === 'available'
                const selected = selectedIds.has(entry.packageId)
                return (
                  <article
                    key={entry.packageId}
                    className={`component-library-card${selected ? ' is-selected' : ''}${status === 'hash-conflict' ? ' has-conflict' : ''}`}
                    data-testid={`catalog-component-${entry.packageId}`}
                  >
                    <label className={`component-library-card__select${selectable ? '' : ' is-disabled'}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={!selectable}
                        aria-label={`选择${entry.name}`}
                        onChange={() => toggleSelection(entry.packageId)}
                      />
                      <span className="component-library-card__thumbnail"><CatalogThumbnail entry={entry} /></span>
                    </label>
                    <div className="component-library-card__copy">
                      <div className="component-library-card__title">
                        <strong>{entry.name}</strong>
                        <span className={`component-quality component-quality--${entry.quality}`}>{qualityLabels[entry.quality]}</span>
                      </div>
                      <p>{entry.description}</p>
                      <div className="component-library-card__metadata">
                        <span>v{entry.version}</span>
                        <span>{entry.subject.length > 0 ? entry.subject.join(' / ') : '通用'}</span>
                        {entry.schoolStage.length > 0 && <span>{entry.schoolStage.join(' / ')}</span>}
                      </div>
                      <div className="component-library-card__status">
                        <span>{installStatusLabels[status]}</span>
                      </div>
                    </div>
                    <div className="component-library-card__actions">
                      <button type="button" className="secondary-button" onClick={() => setDetailsEntry(entry)}>
                        <Info size={13} />详情
                      </button>
                      {status === 'update-available' && (
                        <button type="button" className="secondary-button" disabled={!onUpdate} onClick={() => onUpdate?.(entry)}>
                          <RefreshCw size={13} />审阅更新
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </main>
      </div>

      <footer className="component-library__footer">
        <span>已选择 {selectedEntries.length} 个组件</span>
        <button
          type="button"
          className="primary-button"
          disabled={selectedEntries.length === 0 || !onAdd || adding}
          onClick={() => {
            if (!onAdd || adding) return
            setAdding(true)
            void Promise.resolve(onAdd(selectedEntries))
              .then((completed) => {
                if (!completed) return
                setSelectedIds(new Set())
                onClose()
              })
              .finally(() => setAdding(false))
          }}
        >
          {adding ? '正在校验…' : `加入工程${selectedEntries.length > 0 ? `（${selectedEntries.length}）` : ''}`}
        </button>
      </footer>
      {detailsEntry && (
        <ComponentDetailsDialog entry={detailsEntry} onClose={() => setDetailsEntry(null)} />
      )}
    </div>
  )
}

export function ComponentsTab({
  componentCatalog = EMPTY_CATALOG,
  onImportExternalComponents,
  onRefreshComponentCatalog,
  onAddCatalogComponents,
  onUpdateCatalogComponent,
  onReplaceComponent,
}: ComponentsTabProps) {
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [detailsPackageId, setDetailsPackageId] = useState<string | null>(null)
  const courseSession = useEditorStore((state) => state.courseSession)
  const legacyComponents = useEditorStore((state) => state.componentPackages)
  const legacyProject = useEditorStore((state) => state.project)
  const v9Mode = courseSession !== null
  const components = v9Mode ? courseSession.componentPackages : legacyComponents
  const legacyEditingScope = useEditorStore((state) => state.editingScope)
  const editingScope = courseSession?.editingScope ?? legacyEditingScope
  const componentInsertionScope = editingScope === 'global' ? 'global' : 'scene'
  const componentInsertionUnavailableReason = v9Mode && courseSession !== null
    ? v9ComponentInsertionUnavailableReason(courseSession)
    : undefined
  const addExternalComponentNode = useEditorStore((state) => state.addExternalComponentNode)
  const deleteComponentPackage = useEditorStore((state) => state.deleteComponentPackage)
  const addCourseComponentLayer = useEditorStore((state) => state.addCourseComponentLayer)
  const deleteCourseComponentPackage = useEditorStore((state) => state.deleteCourseComponentPackage)
  const usageLookup = useCallback((packageId: string): PackageUsageSummary => {
    if (courseSession !== null) {
      return collectV9ComponentUsage(courseSession.history.present, packageId)
    }
    return summarizeLegacyUsage(collectComponentPackageUsage(legacyProject, packageId))
  }, [courseSession, legacyProject])
  const packages = useMemo(() => Object.values(components).sort((left, right) =>
    left.manifest.name.localeCompare(right.manifest.name, 'zh-CN'),
  ), [components])
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const visiblePackages = packages.filter((data) => [
    data.manifest.name,
    data.manifest.id,
    data.manifest.version,
    data.provenance?.sourceLabel ?? '',
    ...(data.manifest.presets?.map((preset) => preset.label) ?? []),
  ].join(' ').toLocaleLowerCase().includes(normalizedQuery))
  const currentCatalogEntries = useMemo(
    () => selectCurrentCatalogPackages(componentCatalog.packages),
    [componentCatalog.packages],
  )
  const detailsData = detailsPackageId ? components[detailsPackageId] : undefined
  const detailsEntry = detailsPackageId
    ? currentCatalogEntries.find((entry) => entry.packageId === detailsPackageId)
    : undefined
  const detailsUsage = detailsPackageId
    ? usageLookup(detailsPackageId)
    : undefined

  const locateFirstUsage = (packageId: string) => {
    const state = useEditorStore.getState()
    if (state.courseSession !== null) {
      const usage = collectV9ComponentUsage(
        state.courseSession.history.present,
        packageId,
      )
      const locator = v9ComponentLocator(usage)
      const reference = locator.reference
      if (reference === null || reference.sceneId === undefined) {
        if (locator.unavailableReason) state.setStatus(locator.unavailableReason)
        return
      }
      state.activateCourseScene(reference.sceneId)
      const selected = useEditorStore.getState().selectCourseLayers({
        nodeIds: [reference.nodeId],
        additive: false,
      })
      useEditorStore.getState().setStatus(
        selected
          ? `已定位“${reference.nodeName}”`
          : `已切换到“${reference.nodeName}”所在页面；请在当前页面图层列表查看。`,
      )
      return
    }
    const usage = collectComponentPackageUsage(useEditorStore.getState().project, packageId)
    const reference = usage.references[0]
    if (!reference) return
    if (reference.scope === 'global') {
      state.setEditingScope('global')
    } else if (reference.sceneId) {
      state.setActiveScene(reference.sceneId)
    }
    useEditorStore.getState().selectNode(reference.nodeId)
    useEditorStore.getState().setStatus(`已定位“${reference.nodeName}”`)
  }

  const insertComponent = (packageId: string, presetId?: string) => {
    try {
      if (v9Mode) {
        if (componentInsertionUnavailableReason) {
          useEditorStore.getState().setStatus(componentInsertionUnavailableReason)
          return
        }
        addCourseComponentLayer(packageId, undefined, undefined, presetId)
        return
      }
      addExternalComponentNode(packageId, undefined, undefined, presetId)
    } catch (error) {
      useEditorStore.getState().setStatus(
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  const removePackage = (packageId: string): boolean => {
    if (v9Mode) return deleteCourseComponentPackage(packageId)
    return deleteComponentPackage(packageId)
  }

  return (
    <div className="components-tab" data-testid="components-tab">
      <div className="component-entry-actions">
        <button type="button" className="component-entry-action" data-testid="open-component-library" onClick={() => setLibraryOpen(true)}>
          <Library size={20} />
          <span><strong>打开内置组件库</strong><small>按通用和学科浏览，可多选加入工程</small></span>
        </button>
        <button type="button" className="component-entry-action" data-testid="import-external-components" disabled={!onImportExternalComponents} onClick={onImportExternalComponents}>
          <Upload size={20} />
          <span><strong>导入外部组件</strong><small>校验后直接加入；仅选择可信来源</small></span>
        </button>
      </div>

      <div className="section-heading section-heading--spaced">
        <span>工程组件</span><span>{packages.length}</span>
      </div>
      <label className="component-project-search">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          aria-label="搜索工程组件"
          placeholder="搜索工程组件"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
        />
      </label>
      {visiblePackages.length === 0 ? (
        <div className="empty-state">
          {packages.length === 0
            ? '工程中还没有组件。请从内置组件库加入，或导入外部组件。'
            : `没有找到“${searchQuery.trim()}”。`}
        </div>
      ) : (
        <div className="project-component-list">
          {visiblePackages.map((data) => {
            const packageId = data.manifest.id
            const v9Usage = courseSession === null
              ? null
              : collectV9ComponentUsage(courseSession.history.present, packageId)
            const usage = v9Usage ?? usageLookup(packageId)
            const locator = v9Usage === null ? null : v9ComponentLocator(v9Usage)
            const locateDisabled = v9Usage === null
              ? usage.totalInstanceCount === 0
              : locator?.reference === null
            const locateUnavailableReason = v9Usage === null
              ? usage.totalInstanceCount === 0 ? '该组件尚未被使用。' : undefined
              : locator?.unavailableReason ?? undefined
            const scopeSupported = componentInsertionUnavailableReason === undefined &&
              componentSupportsScope(data.manifest, componentInsertionScope)
            const catalogEntry = currentCatalogEntries.find((entry) => entry.packageId === packageId)
            const catalogStatus = catalogEntry
              ? componentCatalogInstallStatus(catalogEntry, data)
              : null
            const canUpdate = catalogStatus === 'update-available'
            return (
              <article className="project-component-card" key={packageId} data-testid={`component-package-${packageId}`}>
                <div className="project-component-card__main">
                  <button
                    type="button"
                    className="component-card"
                    data-testid={`component-${packageId}`}
                    draggable={scopeSupported}
                    disabled={!scopeSupported}
                    title={scopeSupported
                      ? `插入“${data.manifest.name}”`
                      : componentInsertionUnavailableReason ??
                        `该组件不支持${editingScope === 'global' ? '全局层' : '场景层'}；仍可从右侧菜单管理。`}
                    onDragStart={(event) => setComponentDragData(event, packageId, data.manifest.name)}
                    onClick={() => insertComponent(packageId)}
                  >
                    <span className="component-thumb"><ComponentThumbnail data={data} /></span>
                    <span>
                      <span className="component-name">{data.manifest.name}</span>
                      <span className="component-version">v{data.manifest.version} · {data.provenance?.sourceLabel ?? '工程组件'}</span>
                      <span className="component-version">场景 {usage.sceneInstanceCount} · 共用 {usage.surfaceInstanceCount} · 全局 {usage.globalInstanceCount}{canUpdate ? ' · 有更新' : ''}</span>
                    </span>
                    <Box size={15} />
                  </button>
                  <details className="project-component-menu">
                    <summary aria-label={`管理${data.manifest.name}`} title="组件管理"><MoreVertical size={17} /></summary>
                    <div className="project-component-menu__panel" role="menu">
                      <button type="button" role="menuitem" onClick={(event) => {
                        closeContainingMenu(event.currentTarget)
                        setDetailsPackageId(packageId)
                      }}><Info size={14} />查看详情</button>
                      <button type="button" role="menuitem" disabled={!canUpdate || !onUpdateCatalogComponent} onClick={(event) => {
                        closeContainingMenu(event.currentTarget)
                        if (catalogEntry) onUpdateCatalogComponent?.(catalogEntry)
                      }}><RefreshCw size={14} />更新组件</button>
                      <button type="button" role="menuitem" disabled={!onReplaceComponent} onClick={(event) => {
                        closeContainingMenu(event.currentTarget)
                        onReplaceComponent?.(packageId)
                      }}><Upload size={14} />替换组件包</button>
                      <button type="button" role="menuitem" data-testid={`locate-component-${packageId}`} disabled={locateDisabled} title={locateUnavailableReason} onClick={(event) => {
                        closeContainingMenu(event.currentTarget)
                        locateFirstUsage(packageId)
                      }}><LocateFixed size={14} />定位使用位置</button>
                      <button type="button" role="menuitem" className="is-danger" disabled={usage.totalInstanceCount > 0} title={usage.totalInstanceCount > 0 ? '仍有实例引用，需先删除实例。' : '从工程移除未使用的组件包。'} onClick={(event) => {
                        closeContainingMenu(event.currentTarget)
                        removePackage(packageId)
                      }}><Trash2 size={14} />从工程移除</button>
                    </div>
                  </details>
                </div>
                {data.manifest.presets && data.manifest.presets.length > 0 && (
                  <div className="project-component-presets" aria-label={`${data.manifest.name}预设`}>
                    {data.manifest.presets.map((preset) => (
                      <button
                        type="button"
                        key={preset.id}
                        disabled={!scopeSupported}
                        draggable={scopeSupported}
                        title={preset.description}
                        onDragStart={(event) => setComponentDragData(event, packageId, `${data.manifest.name} · ${preset.label}`, preset.id)}
                        onClick={() => insertComponent(packageId, preset.id)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
                {!scopeSupported && (
                  <div className="project-component-card__hint">
                    {componentInsertionUnavailableReason ??
                      `当前处于${editingScope === 'global' ? '全局层' : '场景层'}，该组件只能在其他层使用。`}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {libraryOpen && (
        <ComponentLibraryDialog
          catalog={componentCatalog}
          components={components}
          onClose={() => setLibraryOpen(false)}
          onRefresh={onRefreshComponentCatalog}
          onAdd={onAddCatalogComponents}
          onUpdate={onUpdateCatalogComponent}
        />
      )}
      {detailsPackageId && detailsData && (
        <ComponentDetailsDialog
          data={detailsData}
          entry={detailsEntry}
          usage={detailsUsage}
          onClose={() => setDetailsPackageId(null)}
        />
      )}
    </div>
  )
}
