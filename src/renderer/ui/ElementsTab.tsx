import {
  Globe2,
  ImageIcon,
  MousePointerClick,
  Shapes,
  Type,
  Video,
  SlidersHorizontal,
  Music2,
  Search,
  Sigma,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ShapeType } from '../../shared/projectTypes'
import { renderShapeCanvas } from '../../shared/canvasShapeRenderer'
import { createShapeNode } from '../project/createProject'
import { useEditorStore } from '../store/editorStore'
import { MediaTab } from './MediaTab'

interface LegacyElementsTabProps {
  documentControl?: undefined
  onAddImage(x?: number, y?: number): void
  onAddVideo?(x?: number, y?: number): void
  onImportImage?(): void
  onImportAudio?(): void
  onImportVideo?(): void
}

export interface ElementsTabDocumentControl {
  readonly editingScope: 'scene' | 'global'
  readonly editorMode: 'simple' | 'professional'
  /** Visible product-language reason used for media actions that are not wired yet. */
  readonly mediaUnavailableReason: string
  /** Visible product-language reason used for the global controller action. */
  readonly controllerUnavailableReason: string
  onAddText(x?: number, y?: number): void
  onAddFormula(x?: number, y?: number): void
  onAddShape(shapeType: ShapeType, x?: number, y?: number): void
}

interface ControlledElementsTabProps {
  documentControl: ElementsTabDocumentControl
  /** Legacy callbacks may still be present on the shell, but this path never invokes them. */
  onAddImage?(x?: number, y?: number): void
  onAddVideo?(x?: number, y?: number): void
  onImportImage?(): void
  onImportAudio?(): void
  onImportVideo?(): void
}

export type ElementsTabProps = LegacyElementsTabProps | ControlledElementsTabProps

interface ElementsTabViewProps {
  readonly editingScope: 'scene' | 'global'
  readonly editorMode: 'simple' | 'professional'
  readonly assetSearchLabels: readonly string[]
  readonly mediaUnavailableReason?: string
  readonly controllerUnavailableReason?: string
  readonly dragEnabled: boolean
  onAddText(x?: number, y?: number): void
  onAddFormula(x?: number, y?: number): void
  onAddShape(shapeType: ShapeType, x?: number, y?: number): void
  onAddImage?(x?: number, y?: number): void
  onAddVideo?(x?: number, y?: number): void
  onAddAudio?(): void
  onAddController?(): void
  renderMedia?(filterQuery: string): ReactNode
}

type AddCategory =
  | 'common'
  | 'media'
  | 'controls'

const SIMPLE_ADD_CATEGORIES: Array<{ id: AddCategory; label: string }> = [
  { id: 'common', label: '常用' },
  { id: 'media', label: '媒体' },
]

const PROFESSIONAL_ADD_CATEGORIES: Array<{ id: AddCategory; label: string }> = [
  ...SIMPLE_ADD_CATEGORIES,
  { id: 'controls', label: '控制与全局' },
]

function setDragData(
  event: React.DragEvent,
  value: string,
  label: string,
) {
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-courseware-element', value)
  event.dataTransfer.setData('text/plain', label)
}

function ShapePreview({ type }: { type: ShapeType }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const node = createShapeNode(type, { width: 42, height: 26 })
    node.style.fillColor = '#8dbbff'
    node.style.fillOpacity = node.style.fillOpacity > 0 ? 0.72 : 0
    node.style.borderColor = '#8dbbff'
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.save()
    context.scale(2, 2)
    renderShapeCanvas(context, node, 42, 26)
    context.restore()
  }, [type])
  return <canvas ref={canvasRef} className="shape-preview" width={84} height={52} aria-hidden="true" />
}

export function ElementsTab(props: ElementsTabProps) {
  if (props.documentControl) {
    const control = props.documentControl
    return (
      <ElementsTabView
        editingScope={control.editingScope}
        editorMode={control.editorMode}
        assetSearchLabels={[]}
        mediaUnavailableReason={control.mediaUnavailableReason}
        controllerUnavailableReason={control.controllerUnavailableReason}
        dragEnabled={false}
        onAddText={control.onAddText}
        onAddFormula={control.onAddFormula}
        onAddShape={control.onAddShape}
      />
    )
  }
  return <LegacyElementsTabAdapter {...props} />
}

function LegacyElementsTabAdapter({
  onAddImage,
  onAddVideo,
  onImportImage,
  onImportAudio,
  onImportVideo,
}: LegacyElementsTabProps) {
  const addTextNode = useEditorStore((state) => state.addTextNode)
  const addFormulaNode = useEditorStore((state) => state.addFormulaNode)
  const addShapeNode = useEditorStore((state) => state.addShapeNode)
  const project = useEditorStore((state) => state.project)
  const editorMode = useEditorStore((state) => state.editorMode)
  const editingScope = useEditorStore((state) => state.editingScope)
  const ensureTeacherController = useEditorStore((state) => state.ensureTeacherController)
  const assetSearchLabels = [
    ...Object.values(project.assets).map((asset) => (
      `${asset.filename} ${asset.mimeType} ${asset.kind}`
    )),
    ...Object.values(project.media.audio.sounds).map((sound) => (
      `${sound.name} 音频 声音`
    )),
  ]

  return (
    <ElementsTabView
      editingScope={editingScope}
      editorMode={editorMode}
      assetSearchLabels={assetSearchLabels}
      dragEnabled
      onAddText={addTextNode}
      onAddFormula={addFormulaNode}
      onAddShape={addShapeNode}
      onAddImage={onAddImage}
      onAddVideo={onAddVideo}
      onAddAudio={onImportAudio}
      onAddController={ensureTeacherController}
      renderMedia={onImportAudio && onImportVideo
        ? (filterQuery) => (
            <MediaTab
              embedded
              onImportImage={onImportImage}
              showAdvancedAudioSettings={editorMode === 'professional'}
              filterQuery={filterQuery}
              onImportAudio={onImportAudio}
              onImportVideo={onImportVideo}
            />
          )
        : undefined}
    />
  )
}

function ElementsTabView({
  editingScope,
  editorMode,
  assetSearchLabels,
  mediaUnavailableReason,
  controllerUnavailableReason,
  dragEnabled,
  onAddText,
  onAddFormula,
  onAddShape,
  onAddImage,
  onAddVideo,
  onAddAudio,
  onAddController,
  renderMedia,
}: ElementsTabViewProps) {
  const [activeCategory, setActiveCategory] = useState<AddCategory>('common')
  const [searchQuery, setSearchQuery] = useState('')
  const categories = editorMode === 'professional'
    ? PROFESSIONAL_ADD_CATEGORIES
    : SIMPLE_ADD_CATEGORIES
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const searching = normalizedQuery.length > 0
  const matchesSearch = (label: string): boolean =>
    !searching || label.toLocaleLowerCase().includes(normalizedQuery)
  const visibleShapeGroups = useMemo(() => SHAPE_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter(({ label, type }) =>
        matchesSearch(`${label} ${type}`),
      ),
    }))
    .filter((group) => group.items.length > 0), [normalizedQuery])
  const showText = searching
    ? matchesSearch('文本 文字')
    : activeCategory === 'common'
  const showFormula = searching
    ? matchesSearch('公式 数学 formula')
    : activeCategory === 'common'
  const showImage = searching
    ? matchesSearch('图片 图像')
    : activeCategory === 'common'
  const showVideo = searching
    ? matchesSearch('视频')
    : activeCategory === 'common'
  const showAudio = searching
    ? matchesSearch('声音 音频')
    : activeCategory === 'common'
  const showController = editorMode === 'professional' &&
    editingScope === 'global' &&
    (searching
      ? matchesSearch('教师控制器 导航')
      : activeCategory === 'controls')
  const showQuickAdd = showText || showFormula || showImage || showVideo || showAudio || showController
  const showShapes = searching
    ? visibleShapeGroups.length > 0
    : activeCategory === 'common'
  const shapeGroups = visibleShapeGroups
  const assetSearchMatches = searching && assetSearchLabels.some(matchesSearch)
  const showAssets = searching ? assetSearchMatches : activeCategory === 'media'
  const showControlsEmpty = editorMode === 'professional' &&
    activeCategory === 'controls' &&
    editingScope !== 'global' &&
    !searching

  useEffect(() => {
    if (
      editorMode === 'simple' &&
      activeCategory === 'controls'
    ) {
      setActiveCategory('common')
    }
  }, [activeCategory, editorMode])

  return (
    <div className="elements-scroll" data-testid="elements-tab">
      {editingScope === 'global' && (
        <div className="global-elements-notice" data-testid="global-elements-notice">
          <Globe2 size={20} />
          <div>
            <strong>母版式全局层</strong>
            <span>这里添加的文字、图片、图形和全局组件会跨场景持续存在，并可设置上下层与场景可见范围。</span>
          </div>
        </div>
      )}
      <div className="add-browser" data-testid="add-browser">
        <label className="add-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            placeholder="搜索元素、图形或素材"
            aria-label="搜索元素内容"
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
          />
        </label>
        <div className="add-category-tabs" role="tablist" aria-label="元素内容分类">
          {categories.map((category) => (
            <button
              type="button"
              role="tab"
              key={category.id}
              aria-selected={!searching && activeCategory === category.id}
              className={activeCategory === category.id && !searching ? 'is-active' : ''}
              onClick={() => {
                setSearchQuery('')
                setActiveCategory(category.id)
              }}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>
      <>
        {showQuickAdd && (
          <>
          <div className="section-heading">
            <span>快速添加</span>
            <span title={dragEnabled ? '可单击添加，也可拖入画布' : '单击添加到画布'}>
              <MousePointerClick size={14} />
            </span>
          </div>

          <div className="element-grid element-grid--primary">
            {showText && (
            <button
              type="button"
              aria-label="文本"
              className="element-card element-card--primary"
              draggable={dragEnabled}
              title={!dragEnabled ? '当前请单击添加到画布' : undefined}
              data-testid="add-text"
              onDragStart={dragEnabled
                ? (event) => setDragData(event, 'text', '文本')
                : undefined}
              onClick={() => onAddText()}
            >
              <span className="element-icon">
                <Type size={20} />
              </span>
              文本
            </button>
            )}
            {showFormula && (
            <button
              type="button"
              aria-label="公式"
              className="element-card element-card--primary"
              draggable={dragEnabled}
              title={!dragEnabled ? '当前请单击添加到画布' : undefined}
              data-testid="add-formula"
              onDragStart={dragEnabled
                ? (event) => setDragData(event, 'formula', '公式')
                : undefined}
              onClick={() => onAddFormula()}
            >
              <span className="element-icon">
                <Sigma size={20} />
              </span>
              公式
            </button>
            )}
            {showImage && (
            <button
              type="button"
              aria-label="图片"
              className="element-card element-card--primary"
              draggable={Boolean(onAddImage)}
              disabled={!onAddImage}
              title={!onAddImage ? mediaUnavailableReason : undefined}
              data-testid="add-image"
              onDragStart={onAddImage
                ? (event) => setDragData(event, 'image', '图片')
                : undefined}
              onClick={() => onAddImage?.()}
            >
              <span className="element-icon">
                <ImageIcon size={20} />
              </span>
              图片
            </button>
            )}
            {showVideo && (
            <button
              type="button"
              aria-label="视频"
              className="element-card element-card--primary"
              data-testid="add-video"
              draggable={Boolean(onAddVideo)}
              disabled={!onAddVideo}
              title={!onAddVideo ? mediaUnavailableReason : undefined}
              onDragStart={onAddVideo
                ? (event) => setDragData(event, 'video', '视频')
                : undefined}
              onClick={() => onAddVideo?.()}
            >
              <span className="element-icon"><Video size={20} /></span>
              视频
            </button>
            )}
            {showAudio && (onAddAudio || mediaUnavailableReason) && (
              <button
                type="button"
                aria-label="声音"
                className="element-card element-card--primary"
                data-testid="import-audio"
                disabled={!onAddAudio}
                title={!onAddAudio ? mediaUnavailableReason : undefined}
                onClick={onAddAudio}
              >
                <span className="element-icon"><Music2 size={20} /></span>
                声音
              </button>
            )}
            {showController && (
              <button
                type="button"
                aria-label="教师控制器"
                className="element-card element-card--primary"
                data-testid="add-teacher-controller"
                disabled={!onAddController}
                title={!onAddController ? controllerUnavailableReason : undefined}
                onClick={onAddController}
              >
                <span className="element-icon"><SlidersHorizontal size={20} /></span>
                教师控制器
              </button>
            )}
          </div>
          {mediaUnavailableReason && (showImage || showVideo || showAudio) && (
            <div className="empty-state add-category-empty" role="status">
              {mediaUnavailableReason}
            </div>
          )}
          {controllerUnavailableReason && showController && (
            <div className="empty-state add-category-empty" role="status">
              {controllerUnavailableReason}
            </div>
          )}
          </>
        )}

          {showAssets && (renderMedia
            ? renderMedia(searchQuery)
            : mediaUnavailableReason && (
                <div className="empty-state add-category-empty" role="status">
                  {mediaUnavailableReason}
                </div>
              ))}

          {showShapes && (
            <>
          <div className="section-heading section-heading--spaced">
            <span>{searching ? '搜索到的图形' : '图形'}</span>
            <Shapes size={14} />
          </div>
          <div className="shape-palette">
            {shapeGroups.map((group) => (
              <section className="shape-group" key={group.label}>
                <div className="shape-group-label">{group.label}</div>
                <div className="shape-grid">
                  {group.items.map(({ type, label, testId }) => (
                    <button
                      type="button"
                      className="shape-button"
                      key={type}
                      title={label}
                      aria-label={`添加${label}`}
                      data-testid={testId ?? `add-shape-${type}`}
                      draggable={dragEnabled}
                      onDragStart={dragEnabled
                        ? (event) => setDragData(event, `shape:${type}`, label)
                        : undefined}
                      onClick={() => onAddShape(type)}
                    >
                      <ShapePreview type={type} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
            </>
          )}

          {showControlsEmpty && (
            <div className="empty-state add-category-empty">
              {controllerUnavailableReason ??
                '教师控制器和全局元素需要在左侧切换到“全局层”后添加。'}
            </div>
          )}
      </>

      {searching && !showQuickAdd && !showShapes && !showAssets && (
        <div className="empty-state add-category-empty">
          没有找到“{searchQuery.trim()}”
        </div>
      )}
    </div>
  )
}

const SHAPE_GROUPS: Array<{
  label: string
  items: Array<{ type: ShapeType; label: string; testId?: string }>
}> = [
  {
    label: '基本',
    items: [
      { type: 'rectangle', label: '矩形', testId: 'add-rectangle' },
      { type: 'rounded-rectangle', label: '圆角矩形' },
      { type: 'ellipse', label: '圆形/椭圆' },
      { type: 'triangle', label: '三角形' },
      { type: 'diamond', label: '菱形' },
    ],
  },
  {
    label: '线条与箭头',
    items: [
      { type: 'line', label: '直线' },
      { type: 'elbow-arrow', label: '折线箭头' },
      { type: 'arrow-left', label: '左箭头' },
      { type: 'arrow-right', label: '右箭头' },
      { type: 'arrow-up', label: '上箭头' },
      { type: 'arrow-down', label: '下箭头' },
      { type: 'arrow-left-right', label: '双向箭头' },
    ],
  },
  {
    label: '括号与着重',
    items: [
      { type: 'brace-left', label: '左大括号' },
      { type: 'brace-right', label: '右大括号' },
      { type: 'brace-top', label: '上大括号' },
      { type: 'brace-bottom', label: '下大括号' },
      { type: 'brace-pair-horizontal', label: '横向括号对' },
      { type: 'brace-pair-vertical', label: '纵向括号对' },
      { type: 'bracket-left', label: '左方括号' },
      { type: 'bracket-right', label: '右方括号' },
      { type: 'emphasis-dot', label: '着重圆点' },
      { type: 'emphasis-triangle', label: '着重三角' },
    ],
  },
]
