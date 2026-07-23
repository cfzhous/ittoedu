import {
  Box,
  Globe2,
  ImageIcon,
  MousePointerClick,
  RefreshCw,
  Shapes,
  Trash2,
  Type,
  Video,
  SlidersHorizontal,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ComponentPackageData } from '../../shared/componentTypes'
import { componentSupportsScope } from '../../shared/componentCapabilities'
import { collectComponentPackageUsage } from '../../shared/componentPackageLifecycle'
import type { ShapeType } from '../../shared/projectTypes'
import { renderShapeCanvas } from '../../shared/canvasShapeRenderer'
import { createShapeNode } from '../project/createProject'
import { useEditorStore } from '../store/editorStore'

interface ElementsTabProps {
  onAddImage(x?: number, y?: number): void
  onAddVideo?(x?: number, y?: number): void
  onReplaceComponent?(packageId: string): void
}

function setDragData(
  event: React.DragEvent,
  value: string,
  label: string,
) {
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-courseware-element', value)
  event.dataTransfer.setData('text/plain', label)
}

function ComponentThumbnail({ data }: { data: ComponentPackageData }) {
  if (data.thumbnailUrl) {
    return <img src={data.thumbnailUrl} alt="" />
  }
  return <Box size={20} />
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

export function ElementsTab({
  onAddImage,
  onAddVideo,
  onReplaceComponent,
}: ElementsTabProps) {
  const addTextNode = useEditorStore((state) => state.addTextNode)
  const addShapeNode = useEditorStore((state) => state.addShapeNode)
  const addExternalComponentNode = useEditorStore(
    (state) => state.addExternalComponentNode,
  )
  const components = useEditorStore((state) => state.componentPackages)
  const project = useEditorStore((state) => state.project)
  const deleteComponentPackage = useEditorStore(
    (state) => state.deleteComponentPackage,
  )
  const editingScope = useEditorStore((state) => state.editingScope)
  const ensureTeacherController = useEditorStore((state) => state.ensureTeacherController)
  const availableComponents = Object.values(components).filter((data) =>
    componentSupportsScope(data.manifest, editingScope),
  )
  const managedComponents = Object.values(components).sort((left, right) =>
    left.manifest.name.localeCompare(right.manifest.name, 'zh-CN'),
  )

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
      <>
          <div className="section-heading">
            <span>内置元素</span>
            <span title="可单击添加，也可拖入画布">
              <MousePointerClick size={14} />
            </span>
          </div>

          <div className="element-grid element-grid--primary">
            <button
              type="button"
              className="element-card element-card--primary"
              draggable
              data-testid="add-text"
              onDragStart={(event) => setDragData(event, 'text', '文本')}
              onClick={() => addTextNode()}
            >
              <span className="element-icon">
                <Type size={20} />
              </span>
              文本
            </button>
            <button
              type="button"
              className="element-card element-card--primary"
              draggable
              data-testid="add-image"
              onDragStart={(event) => setDragData(event, 'image', '图片')}
              onClick={() => onAddImage()}
            >
              <span className="element-icon">
                <ImageIcon size={20} />
              </span>
              图片
            </button>
            <button
              type="button"
              className="element-card element-card--primary"
              data-testid="add-video"
              draggable
              onDragStart={(event) => setDragData(event, 'video', '视频')}
              onClick={() => onAddVideo?.()}
            >
              <span className="element-icon"><Video size={20} /></span>
              视频
            </button>
            {editingScope === 'global' && (
              <button
                type="button"
                className="element-card element-card--primary"
                data-testid="add-teacher-controller"
                onClick={ensureTeacherController}
              >
                <span className="element-icon"><SlidersHorizontal size={20} /></span>
                教师控制器
              </button>
            )}
          </div>

          <div className="section-heading section-heading--spaced">
            <span>基础图形</span>
            <Shapes size={14} />
          </div>
          <div className="shape-palette">
            {SHAPE_GROUPS.map((group) => (
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
                      draggable
                      onDragStart={(event) => setDragData(event, `shape:${type}`, label)}
                      onClick={() => addShapeNode(type)}
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

      <div className="section-heading">
        <span>{editingScope === 'global' ? '可用全局组件' : '已导入组件'}</span>
        <span>{availableComponents.length}</span>
      </div>
      {availableComponents.length === 0 ? (
        <div className="empty-state">
          {editingScope === 'global'
            ? '尚未导入支持 global 的 V3 组件'
            : '尚未导入可用于场景的组件'}
          <br />使用顶部“导入组件”按钮添加
        </div>
      ) : (
        <div className="component-list">
          {availableComponents.map((data) => (
            <div key={data.manifest.id} className="component-entry">
              <button
                type="button"
                className="component-card"
                draggable
                data-testid={`component-${data.manifest.id}`}
                onDragStart={(event) =>
                  setDragData(
                    event,
                    `component:${data.manifest.id}`,
                    data.manifest.name,
                  )
                }
                onClick={() => addExternalComponentNode(data.manifest.id)}
              >
                <span className="component-thumb">
                  <ComponentThumbnail data={data} />
                </span>
                <span>
                  <span className="component-name">{data.manifest.name}</span>
                  <span className="component-version">
                    {data.manifest.id} · {data.manifest.version}
                  </span>
                </span>
                <Box size={15} />
              </button>
              {data.manifest.schemaVersion !== 1
                ? data.manifest.presets?.map((preset) => (
                    <button
                      type="button"
                      key={preset.id}
                      className="component-card component-card--preset"
                      draggable
                      data-testid={`component-${data.manifest.id}-preset-${preset.id}`}
                      title={preset.description}
                      onDragStart={(event) => setDragData(
                        event,
                        `component-preset:${encodeURIComponent(data.manifest.id)}:${encodeURIComponent(preset.id)}`,
                        `${data.manifest.name} · ${preset.label}`,
                      )}
                      onClick={() => addExternalComponentNode(
                        data.manifest.id,
                        undefined,
                        undefined,
                        preset.id,
                      )}
                    >
                      <span className="component-thumb">
                        <ComponentThumbnail data={data} />
                      </span>
                      <span>
                        <span className="component-name">{preset.label}</span>
                        <span className="component-version">
                          {data.manifest.name} · 预设
                        </span>
                      </span>
                      <Box size={15} />
                    </button>
                  ))
                : null}
            </div>
          ))}
        </div>
      )}

      {managedComponents.length > 0 && (
        <>
          <div className="section-heading section-heading--spaced">
            <span>组件包管理</span>
            <span>{managedComponents.length}</span>
          </div>
          <div className="component-package-list" data-testid="component-package-manager">
            {managedComponents.map((data) => {
              const packageId = data.manifest.id
              const usage = collectComponentPackageUsage(project, packageId)
              const deleteReason = usage.totalInstanceCount > 0
                ? `仍有 ${usage.sceneInstanceCount} 个场景实例和 ${usage.globalInstanceCount} 个全局实例，需先删除实例。`
                : '当前没有实例引用，可以安全删除。'
              return (
                <section
                  className="component-package-item"
                  data-testid={`component-package-${packageId}`}
                  key={packageId}
                >
                  <div className="component-package-summary">
                    <span className="component-thumb component-thumb--compact">
                      <ComponentThumbnail data={data} />
                    </span>
                    <span className="component-package-copy">
                      <strong>{data.manifest.name}</strong>
                      <span>{packageId} · v{data.manifest.version}</span>
                    </span>
                  </div>
                  <div className="component-package-usage">
                    <span>场景实例 {usage.sceneInstanceCount}</span>
                    <span>全局实例 {usage.globalInstanceCount}</span>
                  </div>
                  <div className="component-package-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      data-testid={`replace-component-package-${packageId}`}
                      disabled={!onReplaceComponent}
                      title={onReplaceComponent
                        ? '选择同 ID 的组件包进行替换或升级'
                        : '替换文件选择入口尚未接入'}
                      onClick={() => onReplaceComponent?.(packageId)}
                    >
                      <RefreshCw size={13} />选择新包替换
                    </button>
                    <button
                      type="button"
                      className="secondary-button secondary-button--danger"
                      data-testid={`delete-component-package-${packageId}`}
                      disabled={usage.totalInstanceCount > 0}
                      title={deleteReason}
                      onClick={() => deleteComponentPackage(packageId)}
                    >
                      <Trash2 size={13} />删除
                    </button>
                  </div>
                  <span className={`component-package-hint${
                    usage.totalInstanceCount > 0 ? ' component-package-hint--blocked' : ''
                  }`}>
                    {deleteReason}
                  </span>
                </section>
              )
            })}
          </div>
        </>
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
