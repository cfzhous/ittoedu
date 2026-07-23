# 互动组件开发指南（V4）

本文定义 Editor 1.6.0 / Project V7 使用的 `.h5component` 协议。类型真值以 [`src/shared/componentTypes.ts`](../src/shared/componentTypes.ts) 和 [`src/shared/componentSchema.ts`](../src/shared/componentSchema.ts) 为准。

编辑器兼容四代协议：

- V1：原子组件，仅兼容旧包；
- V2：场景组件，支持公开属性、页面、变体、预设、工程图片和宿主动作；
- V3：增加场景/全局作用域，并默认递归暴露 `props.content` 中全部字符串；
- V4：增加严格 `renderMode`、DOM/Phaser 分能力上下文、可见性/暂停生命周期和确定性捕获准备。

新组件必须使用 V4。Project V7 JSON 是组件实例、公开参数、作用域、几何和业务状态的工程真相；DOM、Phaser 和 Three.js 只是组件内部的呈现/交互实现。Project V7 中，可枚举的场景节点/全局元素点击、元素入场/退场、状态/场景跳转、声音和视频控制优先使用 `SceneDocument.interactions` 或 `ProjectDocument.globalInteractions`；全局规则通过 `scene.in` 限定生效场景。一次性复杂场景互动或一次性跨场景规则不必做成组件，可分别使用 `scene.runtime` 和 `globalRuntime`。组件只用于高复用、需参数化、需版本化或便于教师反复配置的能力。V1–V6 Project 只作为迁移输入，新保存统一写 V7。

编辑器选中节点时通过“属性/交互”维护 `node.click`；右侧常驻“自动化”Tab 维护状态/场景进入、节点激活、动画完成、音视频生命周期/时间点、`component.event` 和带 `scene/global` 来源的 `runtime.event`。步骤可用 `after-previous` / `with-previous` 编排顺序与并行，并设局部延迟。组件若只需发出一个可枚举事件，应使用 V4 `ctx.emit()`，再由自动化编排元素动画、状态、声音、视频或导航。

组件不应重复实现编辑器已有的一等能力：常规视频使用 `VideoNode`，课程声音使用 `media.audio` 声音库与声道，默认教师控制平台使用 `globalLayer` 中的 `TeacherControllerNode`。内置控制器的默认 `scene.open-picker` 按钮展开全部场景，选择后只进入目标初始状态；固定 `scene.go` 是高级按钮动作。只有策划要求独特视觉、复用封装或内置节点无法表达的行为时，才把媒体播放器或控制平台制作成 V4 组件。

## 1. 组件包结构

`.h5component` 本质是 ZIP，根目录必须直接包含 `manifest.json` 和 manifest 指定的入口：

```text
global-controls.h5component
├── manifest.json
├── runtime.js
├── thumbnail.png          # 可选
└── assets/
    └── click.wav          # 可选
```

约束：

- 单包不超过 50 MB；
- 路径使用 `/`，不得有绝对路径、盘符、反斜线、`..` 或路径穿越；
- 入口是同步注册的普通浏览器 JavaScript，不能使用 `import`、`export` 或 `require`；
- 不依赖 Node.js、Electron、CDN、远程字体、远程 API 或绝对文件路径；
- 包内素材全部在 manifest `assets` 中声明；
- 缩略图可选，支持 PNG、JPG、WebP、GIF 或 SVG；正式可视组件建议始终提供。

## 2. V4 manifest

```json
{
  "schemaVersion": 4,
  "runtimeApiVersion": 4,
  "renderMode": "dom",
  "supportedScopes": ["global"],
  "id": "com.example.global-controls",
  "name": "全局课程控制条",
  "version": "4.0.0",
  "description": "跨场景持续存在的课程控制条",
  "entry": "runtime.js",
  "thumbnail": "thumbnail.png",
  "defaultSize": { "width": 1060, "height": 74 },
  "minSize": { "width": 520, "height": 60 },
  "preserveAspectRatio": false,
  "assets": {},
  "defaultProps": {
    "content": {
      "title": "课程控制",
      "buttons": {
        "previous": "上一页",
        "replay": "重播本页",
        "next": "下一页",
        "restart": "重开课程"
      },
      "status": {
        "ready": "控制条跨场景保持",
        "replayed": "已重播当前场景"
      }
    },
    "accent": "#38bdf8",
    "background": "#0f172a"
  },
  "editor": {
    "properties": [
      { "key": "content.title", "label": "控制条标题", "type": "text", "maxLength": 40 },
      { "key": "content.buttons.previous", "label": "上一页按钮", "type": "text" },
      { "key": "content.buttons.replay", "label": "重播按钮", "type": "text" },
      { "key": "accent", "label": "强调色", "type": "color" },
      { "key": "background", "label": "背景色", "type": "color" }
    ]
  }
}
```

核心字段：

- `schemaVersion` 与 `runtimeApiVersion` 均为 `4`；
- `renderMode` 必须是 `dom`、`phaser` 或 `hybrid`，并且与入口实际访问的能力一致；
- `supportedScopes` 至少包含一个且不能重复，可选 `scene`、`global`；
- `id` 推荐反向域名，`version` 使用语义化版本；
- `defaultProps.content` 是所有人工可见文字的保留树；
- `defaultSize`、`minSize` 和 `preserveAspectRatio` 定义实例变换边界。
- `thumbnail` 可选，但所有面向交付的可视组件都应提供；路径必须指向包内 PNG、JPG、WebP、GIF 或 SVG。

只有 `supportedScopes` 包含 `global` 的 V3/V4 组件能作为组件添加到全局层。统一全局层也直接接收原生文字、图片、图形、视频和教师控制器；这些原生元素不需要组件 manifest。V1/V2 组件只能放在普通场景。

V4 的 `renderMode` 是能力声明，不是自动转换开关：改成 `dom` 不会把 Phaser 对象变成 HTML，改成 `phaser` 也不会把表格或 CSS 布局转换成 Canvas。字段、入口代码和验收必须一起修改。选择原则：密集文字、表格、表单和可访问控件偏 DOM；粒子、碰撞、精灵和高频程序动画偏 Phaser；确实需要两者协作才使用 `hybrid`。

缩略图应使用与 `defaultSize` 相同的宽高比，展示组件的稳定默认外观，不要依赖远程字体、运行时网络或透明到不可辨认的内容。编辑器会把它绘制到左侧场景缩略图；未提供或解码失败时改用带组件名称的边框后备框。后备框只保证组件可见，不代表视觉质量合格。

## 3. 所有组件文字必须放入 `props.content`

V3/V4 编辑器会对合并后的 `props.content` 递归遍历，把其中每个字符串自动显示为文字编辑项。支持对象和数组，例如：

```json
{
  "content": {
    "question": "请选择正确答案",
    "options": ["叶绿体", "线粒体", "细胞核"],
    "feedback": {
      "correct": "回答正确",
      "wrong": "请再观察一次"
    }
  }
}
```

运行时只能从 `ctx.props.content` 读取这些文案。不得把最终显示文字仅硬编码在 `runtime.js`，也不得因某个状态不在编辑器预览首页就漏登记。

V3/V4 对 `content` 使用递归合并。修改一个深层字符串不会丢失默认值、变体或预设中的兄弟文案；其他 props 仍沿用顶层覆盖语义。

`editor.properties` 对文字的作用是指定顺序、友好标签、说明、多行和长度，不决定文字是否可编辑。即使某个 `content` 字符串没有显式字段，它仍会自动出现。显式声明 `content...` 时只能使用 `text` 或 `textarea`。

动态分数和时间可计算，但人工模板仍放入 content，例如 `得分：{score}`。Logo、照片原有文字和不可拆分艺术字属于需说明的素材例外。

## 4. 公开属性

除自动文字外，`editor.properties` 支持：

| 类型 | 属性值 | 用途 |
| --- | --- | --- |
| `text` | 字符串 | 单行文案 |
| `textarea` | 字符串 | 长文案 |
| `number` | 数字 | 分值、速度、数量、时长 |
| `boolean` | 布尔值 | 功能开关 |
| `color` | `#rrggbb` | 颜色 |
| `select` | 选项字符串 | 布局、模式、题型 |
| `image` | 工程素材 ID | 教师可替换图片 |

`key` 是点分路径，例如 `content.feedback.correct`、`items.0.imageId`。禁止空路径段、`__proto__`、`prototype` 和 `constructor`。

图片属性存的是工程 `AssetMeta.id`，运行时通过 `ctx.projectAssetUrl(assetId)` 读取。组件自带且不需替换的图片通过 manifest `assets` 和 `ctx.assetUrl(assetKey)` 读取。

## 5. 页面、变体和预设

V4 保留 V2/V3 的 `editor.pages`、`variants` 和 `presets`：

- `editor.pages` 只对属性分组并控制编辑器正在预览的内部页；
- 声明页面时需提供 `previewPageProp`；
- `ctx.editorState.pageId` 是编辑状态，不要与学生播放的业务初始页混用；
- `variants` 是可切换属性补丁；
- `presets` 是可直接添加的起点，可引用变体和预览页。

V4 预设合并顺序：

```text
defaultProps → variant props → preset props → instance props
```

其中各层 `content` 递归合并。无论页面、变体和状态有多少，所有可达状态的可见文案都必须出现在有效 `props.content` 中。

## 6. 注册运行时

```js
window.CoursewareComponent.define({
  id: 'com.example.global-controls',
  runtimeApiVersion: 4,

  create(ctx) {
    let mode = ctx.mode
    let props = ctx.props

    return {
      setMode(nextMode) {
        mode = nextMode
      },
      resize(width, height) {
        // 重新布局已有对象。
      },
      updateProps(nextProps) {
        props = nextProps
        // 立即更新文字、图片和样式。
      },
      setEditorState(state) {
        // 仅处理编辑预览页/变体状态。
      },
      destroy() {
        // 清理监听、Timer、Tween、音频和外部引用。
      }
    }
  }
})
```

注册的 `id`、`runtimeApiVersion` 必须与 manifest 一致。入口同步且只注册一个定义；`create()` 必须返回含 `destroy()` 的生命周期对象。

## 7. V4 `create(ctx)` 上下文

```ts
interface ComponentCreateContextBase {
  runtimeApiVersion: 4
  renderMode: 'dom' | 'phaser' | 'hybrid'
  instanceId: string
  width: number
  height: number
  mode: 'edit' | 'preview' | 'capture'
  props: Record<string, unknown>
  editorState: Readonly<{ pageId?: string; variantId?: string }>

  actions: Readonly<{
    goToScene(sceneId: string, targetStateId?: string): boolean
    nextScene(): boolean
    previousScene(): boolean
    replayScene(): boolean
    restartCourse(): boolean
  }>

  scope: 'scene' | 'global'
  events?: CourseEventBus
  courseState?: CourseStateStore
  presentation?: RuntimePresentationApi

  assetUrl(assetKey: string): string
  projectAssetUrl(assetId: string): string
  capture: { waitUntil(promise: Promise<unknown>): void }
  emit(eventName: string, payload?: unknown): void
}

interface ComponentCreateContextDom extends ComponentCreateContextBase {
  renderMode: 'dom'
  dom: { root: HTMLElement }
}

interface ComponentCreateContextPhaser extends ComponentCreateContextBase {
  renderMode: 'phaser'
  phaser: {
    Phaser: typeof Phaser
    scene: Phaser.Scene
    root: Phaser.GameObjects.Container
  }
}

interface ComponentCreateContextHybrid extends ComponentCreateContextBase {
  renderMode: 'hybrid'
  dom: { root: HTMLElement }
  phaser: {
    Phaser: typeof Phaser
    scene: Phaser.Scene
    root: Phaser.GameObjects.Container
  }
}
```

- DOM 对象加入 `ctx.dom.root`，Phaser 可见对象加入 `ctx.phaser.root`；
- `dom` 模式不存在 `ctx.phaser`，`phaser` 模式不存在 `ctx.dom`，只有 `hybrid` 同时提供两者；
- `mode === 'edit'` 时内部交互不得改变学习状态或跳转；`capture` 只产生确定静态画面，不推进学生业务；
- `props` 已合并默认值和实例值；
- `actions` 在预览和互动网页导出中工作，在编辑画布中返回 `false`；捕获模式不得主动导航或推进状态；
- V4 的 `scope` 始终存在；Player 还提供生命周期作用域的可选 `events`、课程级 `courseState` 和场景 `presentation`，这些可选值仍需按类型判空；
- `events` 订阅在组件销毁时由宿主自动解除，组件仍可保存 disposer 并显式清理；
- `courseState` 普通翻页和重播保留，`restartCourse()` 时清空；只可存纯数据；
- `emit()` 在 Player 中包装为 `component:event`，并同时派发兼容的浏览器事件。
- 异步字体、图片、GLB、纹理或解码器初始化必须用 `capture.waitUntil()` 登记，Promise 必须可确定结束。

V1–V3 包继续兼容，仍取得历史顶层 `ctx.Phaser`、`ctx.scene` 和 `ctx.root`；它们没有 V4 的严格能力隔离。不要只把旧 manifest 数字改成 4：升级时应先迁移入口到 `ctx.phaser`/`ctx.dom`，补齐 `renderMode` 和生命周期，再做真实交互与捕获验收。修改 `renderMode` 也不会自动转换现有实现。

V4 组件可以直接订阅 `scene:enter`、读取/写入课程状态并与运行时协作：

```js
var removeSceneListener = ctx.events?.on('scene:enter', function (event) {
  currentSceneId = event.sceneId
  render()
})

if (ctx.courseState) {
  var uses = (ctx.courseState.get('globalControls.uses') || 0) + 1
  ctx.courseState.set('globalControls.uses', uses)
}

// 组件判定完成后切换作者可编辑的稳定场景状态。
ctx.presentation?.transitionTo('state_correct', {
  duration: 260,
  ease: 'Sine.easeInOut'
})
```

`events/courseState/presentation` 必须判空，`scope` 可直接使用。组件没有独立 `localState` 和导航守卫；复杂课程规则、跨组件编排和导航约束仍优先放在 `globalRuntime`。组件可直接切换稳定场景状态，也可通过 `emit()` 上报高层事件交给运行时协调。

### 7.1 渲染平面与真 3D

组件宿主使用固定的粗粒度 DOM/Canvas 平面，不承诺 DOM 元素与 Phaser 显示对象按每个节点的 depth 任意穿插。Phaser 部分进入主 Canvas 的组件容器；DOM 部分进入与组件框同步位置、尺寸、旋转、透明度和可见性的 Phaser DOM 表面，并整体位于 Canvas 上方、运行时 DOM overlay 下方。需要精确前后交错的对象应放在同一渲染器内，或把视觉拆成明确的前后景；不要依赖浏览器偶然的 z-index 结果。

因此 DOM/hybrid 组件的 DOM 部分应按 overlay 内容设计。场景节点顺序或全局元素的 `layer: 'underlay'` 不能把这部分 DOM 压到 Canvas 后面；它们只对组件的 Phaser 代理/Phaser 部分保持 Canvas 内层级语义。必须位于原生节点背后的可复用视觉应使用 Phaser 组件，或把后景明确交给运行时 DOM underlay。

编辑器核心和 Player 不内置 Three.js。需要可复用的地球、太阳系、立体几何等真 3D 组件时，在构建阶段把 Three.js 与所需 loader 打进组件自己的 `runtime.js`，使用 `renderMode: 'dom'` 并把 `WebGLRenderer.domElement` 挂到 `ctx.dom.root`；同时确需 Phaser 才使用 `hybrid`。3D 模型默认使用 GLB，并作为组件包内 manifest asset 交付；loader、纹理和解码器也必须离线，不得访问 CDN。当前 Project V7 没有一等 `model` 素材类型，不能用 `image` 属性伪装 GLB；若要让教师从工程素材库独立替换模型，须先扩展 Project Schema、归档、迁移、素材面板和全部导出链路。

Three.js/WebGL 组件必须在 `resize()` 更新 renderer 与相机，在 `setVisible(false)` / `suspend()` 停止 RAF 和昂贵更新，在 `prepareCapture()` 主动渲染确定帧，在 `destroy()` 释放 geometry、material、texture、render target、renderer、监听和 RAF。加载任务通过 `ctx.capture.waitUntil()` 登记，并提供可理解的缩略图与可捕获静态画面。这样 3D 成本只由使用该组件的工程承担，不成为编辑器核心依赖。

## 8. 场景组件与全局组件

### 场景组件

- 随场景渲染；
- 离开场景和重播本页时销毁；
- 适合题型、实验、动画模块和场景内工具；
- V3/V4 manifest 必须包含 `supportedScopes: ['scene']` 或同时包含两种作用域。

### 全局组件

- 播放器启动时创建一次；
- 普通翻页和重播本页时保持同一实例；
- `restartCourse()` 时销毁并重建；
- 可声明 `underlay` 或 `overlay`；Phaser 部分遵循该层级，DOM/hybrid 的 DOM 部分仍位于固定组件 DOM 平面；
- 可见范围为 `all`、`include` 或 `exclude`，引用稳定场景 ID；
- 隐藏时宿主关闭显示和输入，但不销毁内部状态。
- 可通过 `ctx.scope === 'global'` 确认播放器挂载作用域，通过 `ctx.events` 订阅 `scene:enter` 更新常驻 HUD，通过 `ctx.courseState` 与场景运行时共享进度。

全局组件适合确有复用价值的定制导航、定制教师工具、计时和积分 UI。普通上一页/下一页/场景目录/重播/重开/声音/全屏控制优先使用内置 `TeacherControllerNode`；常规音乐优先使用 Project V7 声音库和声道。只服务一个工程的复杂课程规则通常更适合 `globalRuntime`，可枚举的按钮映射优先使用 `interactions` / `globalInteractions`。

若一个包声明同时支持两种作用域，其实现应根据可选 `ctx.scope` 正确适配两种生命周期；在字段缺失的编辑宿主中使用安全回退，不能直接解引用。

## 9. 宿主动作

```js
function next() {
  if (mode !== 'preview') return
  ctx.actions.nextScene()
}

function branch() {
  if (mode !== 'preview') return
  ctx.actions.goToScene('scene_summary', 'state_complete')
}
```

动作返回同步 `boolean`：目标不存在、越过首页/末页、当前页重入或导航守卫阻止时可能为 `false`。`goToScene(sceneId, targetStateId?)` 可原子进入目标场景的指定命名状态；省略或状态引用失效时进入目标场景初始状态。同场景调用可只切换状态；若导航守卫把请求重定向到另一个场景，原请求的目标状态不会套用到重定向场景。

`replayScene()` 只重建当前场景作用域，不重建全局组件；`restartCourse()` 会重建全局组件并从第一场景开始。不要混用。

## 10. 生命周期

```ts
interface ComponentInstanceLifecycle {
  setMode?(mode: 'edit' | 'preview' | 'capture'): void
  resize?(width: number, height: number): void
  updateProps?(props: Record<string, unknown>): void
  setEditorState?(state: Readonly<{ pageId?: string; variantId?: string }>): void
  setVisible?(visible: boolean): void
  suspend?(): void
  resume?(): void
  prepareCapture?(): void | Promise<void>
  destroy(): void
}
```

- `setMode`：切换编辑/预览/捕获行为，不重复注册输入；捕获模式不得推进学习状态；
- `resize`：重新布局现有对象；
- `updateProps`：立即刷新 `props.content`、图片和公开样式；
- `setEditorState`：切换编辑器内部预览页面；
- `setVisible`：全局可见范围或宿主显隐改变时关闭/恢复显示和输入，不销毁业务状态；
- `suspend` / `resume`：暂停/恢复 RAF、物理、媒体和昂贵更新，不把暂停时长补算成一大帧；
- `prepareCapture`：宿主会先排空此前登记的资源任务，再由此 hook 把 DOM/Canvas/WebGL 推进并渲染到确定的最终静态帧；hook 内同步登记的任务必须在异步最终绘制完成后才 resolve，宿主随后立即复制该实例 Canvas/WebGL 帧，再准备下一个实例；PPTX 组件捕获按实例依次创建隔离 Player，避免大量 Three/WebGL 组件同时占用上下文；
- `destroy`：解除监听，停止 Timer、Tween、RAF 和音频，释放组件自己的引用、纹理和 GPU 资源。

生命周期方法应可重复、安全调用。全局组件需特别防止把场景切换、隐藏或 suspend 误判为销毁或重新创建。宿主记录组件生命周期的首个失败并销毁失败挂载，后续捕获继续拒绝，不能因一次显隐或同步更新而“复活”为空白成功。`prepareCapture()` 抛错只使该组件实例产生可诊断占位，已经成功的组件快照继续保留，不应吞掉错误或让整批 PPTX 组件退化。

组件自行创建的音频、视频或媒体流不会自动进入 Project V7 的主音量、声道和画布控制器管理。若确需自建媒体，组件必须公开必要属性，监听或接受宿主静音语义，并在隐藏/销毁时暂停、解除事件、释放对象 URL 与媒体资源；常规课件声音和视频应使用内置媒体模型。

场景状态切换不会销毁组件实例。宿主会在同一实例上调用 `resize()` 和 `updateProps()`，因此这两个方法必须真正刷新现有显示对象，不能要求通过重新执行 `create()` 才生效。

## 11. 图片加载

```js
function loadProjectImage(assetId) {
  const textureKey = `${ctx.instanceId}:cover:${assetId}`
  const url = ctx.projectAssetUrl(assetId)
  const scene = ctx.phaser.scene

  scene.load.image(textureKey, url)
  scene.load.once(`filecomplete-image-${textureKey}`, () => {
    const image = scene.add.image(0, 0, textureKey).setOrigin(0)
    ctx.phaser.root.add(image)
  })
  scene.load.start()
}
```

上例只适用于 V4 `phaser` / `hybrid` 组件。DOM 组件使用普通图片元素并挂到 `ctx.dom.root`。两者都必须处理素材不存在、加载失败和属性切换；不要缓存物理 URL，也不要为每次属性变化创建无法释放的新纹理。异步完成条件应同时登记到 `ctx.capture.waitUntil()`。

## 12. 编辑与预览

编辑模式中，组件可整体选择、移动、缩放和旋转；属性栏可编辑 `props.content` 和公开字段。V3/V4 全局组件可与全局原生元素一起在统一“全局层”中编辑位置、层级和可见范围。

组件在“编辑状态”画布中使用 `mode: 'edit'`，可以显示稳定编辑预览；在中央“当前位置试运行”、顶部“整课预览”和网页导出中使用 `mode: 'preview'`；静态捕获使用 `mode: 'capture'`，不得推进学生业务，只生成确定画面。当前位置试运行从当前场景/状态启动（基础场景回退当前场景初始状态），整课预览从第一场景初始状态启动。场景命名状态切换时不会重新执行 `create()`，而是在同一实例上调用 `resize()` / `updateProps()`，因此状态覆盖中的组件参数必须能即时反映。

外部组件节点与原生节点一样，可作为 Project V7 `node.enter` / `node.exit` 动作目标。宿主只对组件根容器执行立即、淡化、四向滑动或缩放，不重新执行 `create()`；时机由自动化触发器决定，动作步骤可顺序、并行、延迟并以 `animation.completed` 接力。`playbackInitialVisibility: 'hidden'` 只在互动 Player 中等待入场；编辑、缩略图和静态导出仍显示组件的稳定作者画面。组件内部关键帧、循环或复杂动画仍由组件自己管理，不能与宿主动画重复叠加。

内部点击、拖拽、动画状态推进和宿主动作只在 `preview` 生效。组件不得访问编辑器 DOM，也不得假定属性栏结构。

V3/V4 保证所有 `props.content` 文字可在属性栏编辑；组件内部稳定文字区域的画布原位编辑不是公共组件 API 的必备能力。

PDF/PPTX 不执行组件互动或声音。可视组件应提供可理解的稳定编辑预览和静态结果；视频型定制组件需要明确海报/占位方案。内置 `TeacherControllerNode` 默认不进入静态导出，而自定义组件是否应出现在静态成品中由组件视觉和导出捕获结果决定。

DOM 静态捕获支持常规背景、边框、文字、图片、表单值和 Canvas/WebGL 快照，但不承诺复现所有伪元素、滤镜、混合模式、遮罩或特殊 CSS。组件作者必须实测 PDF/PPTX；必要时在 `capture` 模式提供更简单的确定画面，或把关键视觉绘制到可捕获 Canvas。

## 13. 组件包管理与故障隔离

Editor 1.6.0 在“元素”面板把组件包作为工程一等资源管理：显示包 ID、版本、场景实例数和全局实例数。仍有任一实例引用时禁止删除；只有引用数为 0 时可安全删除。

“选择新包替换”只接受 manifest ID 相同的新包。替换前会校验新包的 `supportedScopes` 是否覆盖所有现有场景/全局实例；校验、解包或迁移失败时原工程保持不变，成功后所有实例版本统一更新。不同 ID 的组件不能借替换入口隐式迁移。

组件创建、属性更新、尺寸/可见性/暂停更新、捕获准备和销毁必须可隔离失败。单个实例异常会进入本地诊断日志并保留其他页面/组件运行；静态导出也只回退该实例，不能清空此前成功快照或阻断后续实例。作者排障时先运行“工程检查”确认包和引用，再导出不含课件素材内容的诊断报告。

## 14. 打包

在组件源码目录执行，确保当前目录根部就是 manifest：

```powershell
Compress-Archive -Path manifest.json,runtime.js,thumbnail.png,assets `
  -DestinationPath global-controls.zip -Force
Rename-Item global-controls.zip global-controls.h5component
```

无缩略图或素材目录时从命令中移除。不要压缩外层项目目录。

API 3 兼容示例位于 [`examples/runtime-v3-complete/components/global-controls/`](../examples/runtime-v3-complete/components/global-controls/)。执行 `npx tsx scripts/build-runtime-v3-example.ts` 可生成组件包、示例工程和单 HTML；它用于回归 V3 兼容，不是新 V4 组件的上下文范本。V4 DOM 表格、V3 Phaser 兼容组件以及按内容内联 Three.js 的完整对照见 [`examples/render-host-benchmark/`](../examples/render-host-benchmark/README.md)，可用 `npm run build:render-benchmark` 重建。其 Playwright 压力段执行 25 轮、共 100 次定制场景切换和 25 次末页重播，并检查组件/运行时挂载、Canvas/WebGL、活动 RAF、控制台异常与外部请求。

## 15. 安全边界

组件是可信浏览器 JavaScript，不是普通图片。Renderer/Player 禁用 Node.js 和 Electron API，并限制网络、弹窗、下载和系统权限，但这不是对恶意 JavaScript 的完整沙箱。

只导入可信来源组件。发布前审查入口和素材，不存放密钥、账号、隐私数据或远程控制逻辑。

## 16. 发布检查清单

- [ ] 新组件使用 schema/runtime API 4，声明准确的 `supportedScopes` 与最小 `renderMode`；V1–V3 只作为兼容输入。
- [ ] manifest 与 runtime 的 ID 和 API 版本一致，入口同步只注册一次。
- [ ] 所有人工可见文字均位于有效 `props.content`，所有状态和页面均已覆盖。
- [ ] 显式文字字段只补充标签/说明，未依赖它决定可编辑性。
- [ ] 图片、数字、颜色和模式按真实维护需求公开。
- [ ] `updateProps()`、`setEditorState()`、`resize()`、`setVisible()`、`suspend/resume()`、`prepareCapture()` 和 `destroy()` 行为正确。
- [ ] DOM/Phaser 对象只使用声明能力；没有依赖跨 DOM/Canvas 平面的逐对象交错，也没有把修改 `renderMode` 当作自动代码转换。
- [ ] 编辑模式不推进业务，预览模式交互正常。
- [ ] 可视组件提供离线缩略图；缩略图缺失/损坏时名称后备可读，场景缩略图不会空白。
- [ ] 场景/全局生命周期、隐藏输入、重播和重开已验证。
- [ ] 外层 `node.enter` / `node.exit` 与组件内部动画责任不重叠；业务触发、顺序/并行/延迟、完成事件与静态稳定帧正确。
- [ ] 组件包使用统计正确；同 ID 替换、作用域不兼容回滚、引用中禁止删除和无引用安全删除已验证。
- [ ] 未重复实现可由 `VideoNode`、声音库/声道、`TeacherControllerNode` 或声明式交互完成的一等能力；自建媒体能响应静音并完整清理。
- [ ] 必需 `scope` 使用正确；`events/courseState/presentation` 均做可选检查；事件订阅、课程状态和场景状态切换语义已验证。
- [ ] 需要跨场景指定状态时使用 `goToScene(sceneId, targetStateId)`，并验证状态失效回退与导航守卫重定向。
- [ ] 组件事件可被全局运行时接收，复杂导航规则未塞进组件私有全局变量。
- [ ] 单 HTML 与网页包离线运行，PDF/PPTX 静态化结果已检查。
- [ ] 捕获按实例产生确定帧；单实例失败只生成该实例占位，成功快照不会被后续失败清空，批量 Three/WebGL 组件不会同时创建捕获宿主。
- [ ] Three.js 如有使用，仅打包在组件内；GLB、loader、纹理和解码器离线；RAF、WebGL 与 GPU 资源可暂停、可捕获、可销毁。
- [ ] ZIP 路径安全、大小写一致，组件包不超过 50 MB。
- [ ] 工程检查没有阻断导出的组件错误；异常隔离与诊断报告路径可用。
