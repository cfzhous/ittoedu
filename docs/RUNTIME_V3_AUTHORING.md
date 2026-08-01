# 场景与全局自由运行时开发指南（API 2）

本文定义 Editor 1.6.0 / Project V7 中 `scene.runtime` 与 `globalRuntime` 的自由运行时创作协议。新运行时使用 `RuntimeDocument.runtimeApiVersion: 2`；API 1 继续作为兼容协议。文件名中的 V3 仅沿用播放器架构代际名称，不表示自由运行时 API 为 V3。组件协议是另一套独立版本体系。

文档同步基线：**2026-08-01**。当前包版本仍为 1.6.0；运行时入口、专业“互动与动画 / 开发”职责和 PublishedLesson 发布边界已按当前实现核对。

新工程必须写 `schemaVersion: 7`。V1–V6 仅是加载迁移输入；其中 V6 节点 `animation` 会自动迁移为事件驱动的 `node.activated → node.enter` 规则，新保存统一写 V7。

Project V7 JSON 是业务真相，DOM、Phaser 和 Three.js 都只是可替换的呈现/交互实现。运行时用于承载不必组件化的复杂判定、连续交互、事件协调与瞬态效果；它不是组件包。专业“开发”面板可以创建最小模板并受控修改工程中的 runtime source，但不会为教学需求自动生成完整实现。题目、答错、答对、完成等稳定视觉应由 `SceneDocument.presentation` 承载；简单节点/全局元素点击、状态/场景切换、声音和视频控制应优先由 `SceneDocument.interactions` 或 `ProjectDocument.globalInteractions` 声明。运行时只承担声明式规则不足以表达的部分，并可驱动这些可编辑状态。

编辑器的“编辑状态”画布不执行自由运行时，只物化基础或命名状态；中央“当前位置试运行”在 Blob sandbox iframe 中执行与导出相同的真实 Player，并直接从当前场景和当前命名状态启动（基础场景使用当前场景初始状态）。预览文档、工程素材和组件素材使用临时 Blob URL；实例替换、关闭、重试或失败时统一撤销。状态条与 Player 双向同步，已被新实例替换的旧消息会因会话不匹配而被忽略；载入或启动失败会显示原因和重试入口。顶部“整课预览”则在独立窗口中从第一场景初始状态开始。

类型真值以 [`src/shared/runtimeTypes.ts`](../src/shared/runtimeTypes.ts) 和 [`src/shared/runtimeSchema.ts`](../src/shared/runtimeSchema.ts) 为准。

## 1. 选择场景运行时还是全局运行时

| 类型 | 典型用途 | 普通翻页 | 重播本页 | 重开课件 |
| --- | --- | --- | --- | --- |
| `scene.runtime` | 当前场景独有的动画、拖拽、判定、DOM 界面、原生节点绑定 | 销毁 | 销毁并重建 | 销毁并随首场景重建 |
| `globalRuntime` | 跨场景状态、事件协调、导航守卫、常驻 HUD 或课程级效果 | 保留 | 保留 | 销毁并重建 |

只用一次且逻辑复杂的互动可以直接写运行时。稳定画面先用场景节点和状态覆盖创作；可枚举的触发、条件与动作先用声明式交互；需要多处复用、独立发布或供非程序人员配置的互动区域再制作 V4 组件。不要为“点击按钮切换状态/场景或播放声音”专门写一份自由运行时。

编辑器简洁模式用于常用图文和单元素出现动画；运行时内容与完整规则位于专业模式。选中节点后的“属性/交互”只维护该节点点击规则；右侧“互动与动画”维护场景/状态进入、节点激活、动画完成、音视频/组件/运行时事件；“开发”可校验并修改当前场景或全局 runtime source，修改进入撤销历史，试运行仍在隔离 Player 中执行。每个 Project V7 动作步骤带稳定 ID、局部延迟和 `after-previous` / `with-previous` 启动方式，可编排元素入场/退场、状态、媒体和导航。运行时应优先只负责复杂判定并 `ctx.emit()`，再由规则编排可编辑的结果。

## 2. `RuntimeDocument`

```ts
interface RuntimeDocument {
  runtimeApiVersion: 2
  enabled: boolean
  renderMode: 'phaser' | 'dom' | 'hybrid'
  source: string
  content: {
    values: Record<string, string>
    metadata?: Record<string, {
      label?: string
      description?: string
      multiline?: boolean
      maxLength?: number
    }>
  }
  assets: Record<string, { assetId: string }>
  nodeBindings?: Record<string, string>
  staticFallback?: {
    assetId: string
    coverage: 'runtime-layer' | 'full-scene'
    layer: 'underlay' | 'overlay'
  }
}
```

约束：

- `source` 非空，UTF-8 编码后不超过 2 MiB；
- `content.values`、`content.metadata`、`assets` 和 `nodeBindings` 各不超过 10,000 项；
- `metadata` 只能描述已存在的文字键；
- 素材绑定和静态后备必须引用 `project.assets` 中存在的稳定 ID；
- `enabled: false` 只停用执行，不删除源码、内容和绑定；
- API 2 中 `renderMode` 是严格能力声明：`phaser` 只提供 Phaser 能力，`dom` 只提供 DOM 能力，`hybrid` 才同时提供两者；
- 修改 `renderMode` 不会把 DOM、Phaser、Canvas、WebGL 或 Three.js 代码自动转换成另一种实现，源码必须与声明同步修改并重新验收；
- API 1 旧工程继续可运行：宿主仍同时提供 Phaser 与 DOM 两组能力，并把 `renderMode` 仅作为旧版提示字段；新创作不得借 API 1 绕过能力边界。

## 3. 注册入口

每份 `source` 必须同步且只调用一次 `CoursewareRuntime.define()`：

```js
CoursewareRuntime.define({
  runtimeApiVersion: 2,

  create(ctx) {
    const title = ctx.content.get('title')

    if (ctx.renderMode === 'dom') {
      const heading = document.createElement('h2')
      heading.textContent = title
      ctx.dom.overlay.append(heading)
    }

    return {
      destroy() {
        // 清理运行时自行创建的外部资源。
      }
    }
  }
})
```

`define()` 中的版本必须与 `RuntimeDocument.runtimeApiVersion` 一致。源码不能使用 `import`、`export` 或 `require`。需要第三方库时，先将依赖打包为同一普通浏览器脚本；不得依赖 Node.js、Electron、CDN、远程字体或远程 API。

## 4. 当前公开上下文

```ts
interface RuntimeCreateContextBase {
  runtimeApiVersion: 2
  renderMode: 'phaser' | 'dom' | 'hybrid'
  scope: 'global' | 'scene'
  mode: 'preview' | 'capture'
  sceneId?: string
  width: number
  height: number

  content: {
    get(key: string): string
    all(): Readonly<Record<string, string>>
  }

  assets: {
    url(bindingKey: string): string
    projectUrl(assetId: string): string
  }

  presentation: {
    current(): string | null
    states(): ReadonlyArray<{
      id: string
      name: string
      description?: string
    }>
    setState(stateId: string): boolean
    transitionTo(
      stateId: string,
      transition?: { duration?: number; ease?: string }
    ): boolean
  }

  actions: Readonly<{
    goToScene(sceneId: string, targetStateId?: string): boolean
    nextScene(): boolean
    previousScene(): boolean
    replayScene(): boolean
    restartCourse(): boolean
  }>

  events: CourseEventBus
  localState: CourseStateStore
  courseState: CourseStateStore
  capture: { waitUntil(promise: Promise<unknown>): void }
  navigation: { guard(guard: RuntimeNavigationGuard): () => void }
  emit(eventName: string, payload?: unknown): void
}

interface RuntimeCreateContextPhaser extends RuntimeCreateContextBase {
  renderMode: 'phaser'
  Phaser: typeof Phaser
  phaser: PhaserRoots
  nodes: RuntimeNodeResolver
}

interface RuntimeCreateContextDom extends RuntimeCreateContextBase {
  renderMode: 'dom'
  domRoot: HTMLElement
  dom: DomRoots
}

interface RuntimeCreateContextHybrid extends RuntimeCreateContextBase {
  renderMode: 'hybrid'
  Phaser: typeof Phaser
  phaser: PhaserRoots
  nodes: RuntimeNodeResolver
  domRoot: HTMLElement
  dom: DomRoots
}
```

`PhaserRoots` 提供 `scene/root/underlay/overlay`；`DomRoots` 提供 `root/underlay/overlay`。`ctx.phaser.root` 是 Phaser `overlay` 的兼容别名；`ctx.domRoot` 和 `ctx.dom.root` 是 DOM `overlay` 的兼容别名。新代码应直接写明 `underlay` 或 `overlay`，避免层级含糊。

API 2 的联合类型是能力边界，不是类型提示：`dom` 模式不存在 `ctx.Phaser`、`ctx.phaser` 或 `ctx.nodes`，`phaser` 模式不存在 `ctx.dom`/`ctx.domRoot`。需要同时操作原生节点句柄和 DOM 时使用 `hybrid`。API 1 兼容上下文仍同时暴露两组表面，旧源码无需迁移即可运行；升级到 API 2 时必须先盘点实际依赖，再选择最小的 `renderMode`。

## 5. 所有人工可见文字

运行时产生的标题、按钮、标签、选项、反馈、提示和格式模板必须来自 `content.values`：

```js
const button = document.createElement('button')
button.textContent = ctx.content.get('continueLabel')

const scoreText = ctx.content
  .get('scoreTemplate')
  .replace('{score}', String(score))
```

不得把最终显示文案只写在 `source`。内部状态键、事件名和不会显示的调试字符串不属于可编辑文案。静态后备画面中的文字应由同一内容表生成。

`metadata` 用于改善属性栏标签、说明、多行模式和长度约束；即使没有 metadata，`values` 中的每项仍可编辑。

## 6. Phaser、DOM 与 WebGL 分层

Player 使用固定的粗粒度平面，而不是把 DOM 与 Canvas 对象合并成一个可任意交错的显示列表：

```text
全局 DOM underlay
  → 场景 DOM underlay
    → Phaser Canvas
       ├─ 全局 Phaser underlay
       ├─ 场景 Phaser underlay
       ├─ 场景原生节点与 Phaser 组件
       ├─ 场景 Phaser overlay
       └─ 全局 Phaser overlay
      → V4 组件 DOM 平面
        → 场景 DOM overlay
        → 全局 DOM overlay
```

运行时宿主只按 API 2 的 `renderMode` 创建所声明的 Phaser 容器和/或 Shadow DOM 挂载点。DOM 使用 1280×720 逻辑尺寸并随 Player Canvas 等比缩放。运行时 `underlay` 永远位于整个 Canvas 下方，运行时 `overlay` 永远位于组件 DOM 平面和 Canvas 上方；V4 DOM/hybrid 组件的 DOM 部分整体位于 Canvas 上方。不同渲染器之间不能按单个对象深度任意穿插。需要精确交错时，应把相关对象放到同一渲染器，或把视觉拆成明确的前景/后景两部分。

DOM 运行时默认不能接收指针。需要交互的具体元素必须显式设置 `pointer-events: auto`：

```js
const button = document.createElement('button')
button.style.pointerEvents = 'auto'
ctx.dom.overlay.append(button)
```

`ctx.dom.underlay` 位于覆盖整个舞台的 Phaser Canvas 下方，当前只承载视觉背景，浏览器命中不会穿透 Canvas 到达它。需要直接点击、拖拽、滚轮或键盘焦点的 DOM 必须放在 `ctx.dom.overlay`；需要“视觉在 Canvas 后、命中由 Canvas 接管”的特殊效果，应由 Phaser/hybrid 运行时在 Canvas 上建立显式命中区并自行转发语义事件。

不要向宿主层写全局 CSS，也不要查询或修改编辑器 DOM。

### 6.1 Three.js 与真 3D

编辑器核心和 Player 不内置、导入或全局暴露 Three.js。需要地球、太阳系、立体几何或其他真 3D 时，由运行时作者在构建阶段把 Three.js 与所需 loader 一并打进 `source`，运行时仍声明 `renderMode: 'dom'`，把 `WebGLRenderer.domElement` 挂到 `ctx.dom.underlay` 或 `ctx.dom.overlay`；同时需要 Phaser 时才声明 `hybrid`。这让 3D 能力按课件付费，不增加不使用 3D 的工程核心负担。

需要作者提供 3D 模型时，默认交付格式使用 GLB（glTF 二进制）；不要依赖 CDN 或运行时网络。当前 Project V7 的一等素材类型只有图片、声音和视频，不能把 GLB 伪装成图片后塞入 `RuntimeDocument.assets`：一次性小模型只能在 2 MiB 源码上限内随运行时构建产物离线嵌入，较大或可复用模型应放入 V4 组件包的 manifest asset。若产品需要独立替换/管理模型，必须先正式扩展 Project Schema、归档、迁移、编辑器“媒体”管理与导出链路。纹理、网格、动画和解码器必须一并离线打包并在目标设备验证显存与加载时间。改变 `renderMode` 不会自动把 Three.js 场景转换成 Phaser 或 DOM 元素。

Three.js/WebGL 运行时至少要做到：

- `resize()` 同步 renderer 尺寸、像素比与相机投影；
- `setVisible(false)` / `suspend()` 时停止 RAF、计时和昂贵更新，恢复时避免补算整段离屏时间；
- 用 `ctx.capture.waitUntil(loadPromise)` 登记 GLB、纹理、字体或解码器初始化，用 `prepareCapture()` 在捕获前推进到确定帧并立即渲染；
- `destroy()` 取消 RAF 与监听，释放 geometry、material、texture、render target、loader 持有对象和 renderer 资源；
- 为无 WebGL、加载失败或静态导出准备可读的 `staticFallback`。

## 7. 绑定原生节点

`phaser` / `hybrid` 场景运行时在原生节点和场景组件渲染完成后创建。需要控制宿主节点的新内容应先在工程中声明语义绑定：

```json
{
  "nodeBindings": {
    "interactionCard": "intro_interaction_card",
    "title": "intro_title"
  }
}
```

源码只使用语义键：

```js
const hotspot = ctx.nodes.get('interactionCard')
if (!hotspot) throw new Error('缺少 interactionCard 绑定')

hotspot.root.setInteractive()
const onActivate = () => {
  ctx.courseState.set('hotspotComplete', true)
}
hotspot.root.on('pointerup', onActivate)

return {
  destroy() {
    hotspot.root.off('pointerup', onActivate)
  }
}
```

`phaser` / `hybrid` 运行时可以读取节点根对象、绑定输入和添加 Tween，但不得销毁宿主管理的节点。纯 `dom` 模式不暴露 `ctx.nodes`。复制场景时编辑器会自动把 `nodeBindings` 中的节点 ID 重写为副本 ID，因此运行时源码保持不变。

当变化对应一个可反复到达的稳定画面时，不要逐个永久改写 `hotspot.root`，而应切换作者状态：

```js
const onActivate = () => {
  ctx.courseState.set('hotspotComplete', true)
  ctx.presentation.transitionTo('state_correct', {
    duration: 280,
    ease: 'Sine.easeInOut'
  })
}
```

Player 会在同一批根对象上原位更新文字、图片、图形、视频、教师控制器、组件 props、显隐、几何、层级和背景，并发布 `presentation:change`。这既保留组件生命周期与临时交互状态，也让最终稳定画面仍能在编辑画布、状态条和缩略图中修改。`setState()` / `transitionTo()` 返回同步 `boolean`；状态 ID 不存在或已经处于目标状态时返回 `false`。

Project V7 不再把动画时机存在节点上。可枚举的入场/退场是 `interactions` / `globalInteractions` 的 `node.enter` / `node.exit` 动作，由点击、场景/状态进入、节点激活、音视频/组件/运行时事件或指定动画完成触发。每步可立即、淡化、滑动或缩放，并设置时长、缓动、局部延迟和顺序/并行关系。正常完成的动画按步骤 ID 发出 `animation.completed`；被新动画、状态基线更新或作用域销毁取消时不发。

`playbackInitialVisibility: 'hidden'` 只表示互动 Player 开始时先隐藏等待入场。入场/退场只改变 Player 瞬态可见性和输入，不写回节点 `visible`、不调用 `presentation.setState()`。编辑画布、缩略图、PDF/PPTX 按作者稳定可见性显示。运行时不应为同一可枚举节奏重复实现 Tween；只有路径、关键帧、物理、粒子或算法动画继续属于运行时/组件。

运行时只应使用 `presentation.states()` 返回的稳定 ID。`initialStateId` 负责进入场景时的状态，`thumbnailStateId` 决定编辑器场景缩略图的稳定节点状态；不要把悬停、拖拽中间帧或随机动画结果当作缩略图状态。缩略图不执行运行时源码，但会按“背景 → 全局 underlay 元素 → 全局运行时 underlay → 场景运行时 underlay → 场景节点 → 场景运行时 overlay → 全局 overlay 元素 → 全局运行时 overlay”的固定顺序合成已启用运行时的 `staticFallback`；没有后备的已启用运行时显示“运行时”角标。编辑画布只显示“运行时效果请点当前位置试运行”的提示，真实效果仍须在“当前位置试运行”或“整课预览”验收。

API 2 的 `phaser` / `hybrid` 上下文中，`ctx.nodes.get('actual_node_id')` 仍可直接按节点 ID 查询，用于兼容旧工程或临时诊断；新创作不应在 `source` 中硬编码节点 ID。

具备 `nodes` 能力的全局运行时可解析当前已挂载的全局层节点（文字、图片、图形、视频、教师控制器或组件）以及当前场景节点，但应容忍场景切换时场景节点暂时不存在。

## 8. 素材

`RuntimeDocument.assets` 把可读绑定名映射到工程素材 ID：

```json
{
  "assets": {
    "successSound": { "assetId": "asset_success_sound" },
    "character": { "assetId": "asset_character" }
  }
}
```

```js
const soundUrl = ctx.assets.url('successSound')
const directProjectUrl = ctx.assets.projectUrl('asset_character')
```

优先使用 `url(bindingKey)`，这样工程素材替换时无需改源码。返回值在单 HTML 中可能是 Data URL，在网页包中可能是相对 URL；不要解析或长期缓存其物理路径。

Project V7 已为常规媒体播放提供一等模型：声音先登记到 `media.audio.sounds`，由声明式规则按稳定声音 ID 控制，统一经过主音量、`music/narration/sfx/ui` 声道、默认静音和旁白 ducking。视频使用可编辑 `VideoNode`，其声音进入 `video` 声道。媒体事件可以直接触发元素入场/退场或其他动作步骤，运行时不应绕过该模型重建背景音乐、静音按钮或视频 DOM。

若运行时确实自行创建音频或媒体流，它不受内置声道、画布教师控制器和声音映射自动管理，作者必须显式同步静音状态并在 `destroy()` 中暂停、解绑并释放资源。大视频不要转成源码字符串；登记为工程视频素材，交付时优先选择网页包。

## 9. 状态

```ts
interface CourseStateStore {
  get<T>(key: string): T | undefined
  set(key: string, value: unknown): void
  delete(key: string): void
  clear(): void
  snapshot(): Record<string, unknown>
}
```

- `localState` 属于当前运行时挂载；场景离开、重播或重进后清空；
- `courseState` 普通翻页和重播时保留，重开课件时清空；
- 状态读写会克隆数据，不能保存函数、DOM、Phaser 对象、平台对象或循环引用；
- 不要把视图对象塞进状态；状态保存业务事实，视图在 `create()` 中从状态重建。

```js
const attempts = (ctx.localState.get('attempts') || 0) + 1
ctx.localState.set('attempts', attempts)
ctx.courseState.set('challengePassed', true)
```

## 10. 事件

事件 API：

```ts
ctx.events.on(eventName, listener) // 返回解除函数
ctx.events.off(eventName, listener)
ctx.events.emit(eventName, payload)
ctx.events.listenerCount(eventName?)
```

宿主事件与当前 payload：

| 事件 | payload |
| --- | --- |
| `course:start` | `{ sceneCount }` |
| `course:restart` | `undefined` |
| `course:destroy` | `undefined` |
| `scene:before-leave` / `scene:leave` | `{ sceneId, toSceneId? }` |
| `scene:before-enter` / `scene:enter` | `{ sceneId }` |
| `presentation:change` | `{ sceneId, fromStateId, stateId }` |
| `component:event` | `{ scope, componentId, instanceId, eventName, payload }` |
| `runtime:event` | `{ scope, sceneId?, eventName, payload }` |
| `state:change` | `{ scope, sceneId?, type, key?, value? }`，具体变更字段按操作而定 |
| `navigation:blocked` | `{ fromSceneId?, toSceneId, reason }` |

`ctx.emit('completed', data)` 会发出带当前 `scope/sceneId` 的 `runtime:event`。场景的声明式规则可按 `scope: 'scene' | 'global'` 和 `eventName` 接收：`scene` 来源还会校验当前场景 ID，`global` 来源则允许当前场景规则响应常驻全局运行时。组件的 `ctx.emit()` 会进入 `component:event`。因此复杂运行时可只计算“是否完成”并发出语义事件，把状态切换、声音、视频和导航继续留在可视化规则中。

宿主会在运行时销毁时解除通过当前 `ctx.events` 建立的订阅；仍建议保存 disposer 并在 `destroy()` 中显式调用，使责任清楚。

## 11. 导航与守卫

所有跳转必须使用 `ctx.actions`。`goToScene(sceneId, targetStateId?)` 使用稳定场景 ID，可选原子进入目标场景的指定命名状态，不能用可变页码。省略目标状态或引用失效时进入目标场景 `initialStateId`；同场景调用可直接切换状态。Player 在创建目标节点、组件和运行时前完成状态物化，不会先闪现初始状态。导航守卫若重定向到另一个场景，原请求的 `targetStateId` 不会被套用到重定向场景。

画布内 `TeacherControllerNode` 也走同一宿主动作路径。默认 `scene.open-picker` 按钮展开全部场景，选择后调用不带状态的 `goToScene(sceneId)`；目录展开、当前项高亮与焦点只是 Player 临时 UI，不写入工程、命名状态或 `courseState`。固定 `scene.go(sceneId, targetStateId?)` 仅作为确有固定分支需求时的高级按钮动作。运行时不应另建一套不可编辑导航栏。

全局或场景运行时可以注册同步导航守卫：

```js
const removeGuard = ctx.navigation.guard(({ fromSceneId, toSceneId }) => {
  if (toSceneId === 'scene_summary' && !ctx.courseState.get('passed')) {
    return false
  }
  return true
})
```

守卫返回：

- `false`：阻止；
- 字符串：重定向到该场景 ID；
- `true` 或 `undefined`：允许。

守卫是同步的。需要确认框时，先由运行时完成异步 UI 交互，再调用动作；不要在守卫中返回 Promise。销毁时应调用 disposer。

## 12. 重播与重开

`replayScene()` 只重建当前场景运行时、场景组件和场景原生节点；统一全局层、全局运行时和 `courseState` 保留。

`restartCourse()` 会：

1. 离开并销毁当前场景；
2. 销毁全局运行时和统一全局层；
3. 清空导航守卫与 `courseState`；
4. 重建全局作用域；
5. 从第一场景开始。

因此“再做一次本题”通常使用重播和 `localState`；“从头开始整门课”使用重开。

## 13. 捕获与静态后备

异步字体、图片、GLB、纹理或初始化会影响 PDF/PPTX 捕获时，登记 Promise：

```js
ctx.capture.waitUntil(document.fonts?.ready ?? Promise.resolve())
```

每个 Promise 必须可确定结束，不能登记无限动画或永不 resolve 的任务。

如果画面需要在捕获请求到来时主动刷新，生命周期实现 `prepareCapture()`：

```js
return {
  async prepareCapture() {
    await assetsReady
    renderDeterministicFrame()
  },
  destroy() {}
}
```

宿主按实例先排空此前通过 `capture.waitUntil()` 登记的资源任务，再调用 `prepareCapture()` 产生最终画面；hook 内同步登记的有限任务也会被等待，然后立即复制该实例 DOM 内的 Canvas/WebGL 帧，再继续准备下一个实例。Three.js/WebGL 不应只依赖循环 RAF 碰巧留下可读缓冲；在 `prepareCapture()` 中显式渲染当前确定帧。若 hook 登记额外异步任务，该 Promise 必须在异步最终绘制完成后才 resolve。即时副本用于保证默认 `preserveDrawingBuffer: false` 时仍能稳定合成。

捕获失败按最小单元传播，不能用空画面伪装成功：Player 已成功启动后，PDF 某一场景失败时只让该页使用静态后备；PPTX 某一运行时条目或 underlay/overlay 图层失败时只回退该项，已经成功的场景和图层快照继续保留。只有 Player/捕获宿主本身无法初始化时，才允许批次级后备，并必须报告原因。

PDF/PPTX 不执行互动、声音或元素入场/退场，也不应用 `playbackInitialVisibility: 'hidden'`；静态结果按作者稳定可见性显示。PDF 使用视频海报；PPTX 为视频生成标明文件名的静态占位。画布教师控制器默认不进入静态成品，只有节点的 `includeInStaticExports` 为 `true` 时保留；即使保留也不展开场景目录。

`staticFallback` 同时服务编辑器缩略图和静态导出：缩略图直接合成已启用场景/全局运行时登记的后备，不执行源码；PPTX 导出器则先在透明隐藏 Player 中运行当前工程并分别捕获实际 underlay/overlay 运行时层，只有实际快照失败或未产生可见结果时才使用作者后备。普通文字、图形和图片仍保持原生 PowerPoint 对象。后备静态化方式如下：

- `coverage: 'runtime-layer'`：叠加一张透明运行时层，保留原生节点可编辑；
- `coverage: 'full-scene'`：在该运行时自身层级先清除已经合成的下方内容，再以整页后备铺满画布；
- `layer` 指定后备图位于 underlay 或 overlay；
- 后备图应由相同内容数据生成，避免文案分叉。

实际快照与 `staticFallback` 都不可用时，导出器会写入可见警告占位，不能静默省略运行时视觉。`capture.waitUntil()` 只等待确定能结束的初始化任务；循环动画不会被“等到结束”。

DOM 捕获覆盖常规背景、边框、文字、图片、表单值和 Canvas/WebGL 快照，但不等价于完整浏览器截图引擎。复杂伪元素、滤镜、混合模式、遮罩或特殊 CSS 必须实测 PDF/PPTX；不稳定时改用可捕获 Canvas 表达，或提供由同一内容数据生成的 `staticFallback`。

导出前“工程检查”会检查运行时素材绑定、节点绑定、静态后备、交互引用和跨场景目标。错误会阻断所有成品导出；提醒和建议不阻断。运行时、预览或组件异常还会写入本地轮转诊断日志，可导出不含课件素材内容的文本报告。工程检查是结构问题清单，诊断报告是异常日志，两者不能互相替代。

## 14. 错误隔离与清理

`create()` 必须返回含 `destroy()` 的生命周期对象；API 2 可按需实现：

```ts
interface RuntimeInstanceLifecycle {
  resize?(width: number, height: number): void
  setVisible?(visible: boolean): void
  suspend?(): void
  resume?(): void
  prepareCapture?(): void | Promise<void>
  destroy(): void
}
```

`setVisible(false)` 表示暂时不可见但实例仍存活；`suspend()` / `resume()` 用于暂停和恢复昂贵的动画、RAF、媒体或物理更新；`prepareCapture()` 负责产生可确定捕获帧。方法必须可重复调用，且不能把隐藏误当销毁。`destroy()` 至少清理：

- `window`、`document`、媒体查询和第三方对象监听；
- 自行注册但不属于 Phaser 根的监听；
- Timer、Tween、RAF、Interval、音频和媒体流；
- 运行时自行持有的纹理、Canvas、Worker 和对象 URL；
- 导航守卫和显式事件订阅。

挂在已声明的 `ctx.phaser.underlay/overlay` 或 `ctx.dom.underlay/overlay` 内的对象会由宿主兜底销毁，但不能依赖兜底掩盖泄漏。单个运行时启动或生命周期方法失败时，宿主记录该实例的首个失败、销毁其挂载并保留其他内容可翻页；该实例后续捕获会继续拒绝，不能在隐藏/恢复或第二次捕获时被误判为成功。导出器只回退受影响的页面、运行时条目或图层，不静默生成空白，也不丢弃其他成功结果。

## 15. 安全边界

运行时是可信本地代码。预览和捕获环境禁用 Node.js、Electron API、外部导航、下载、权限和网络，但这不是恶意 JavaScript 的绝对沙箱。

不要存放密钥、账号、隐私数据或远程控制逻辑；不要尝试访问本机文件系统；只分发经审查的工程。

## 16. 发布检查清单

- [ ] 选择 scene/global 作用域有明确理由，没有为形式而组件化。
- [ ] 新 `source` 同步且只注册一个 API 2 定义；API 1 仅用于旧内容兼容；无模块语法和远程依赖。
- [ ] 所有人工可见文字都来自 `content.values`，metadata 标签清楚。
- [ ] 所有素材通过稳定绑定访问，静态后备引用存在。
- [ ] `renderMode` 是最小且真实的能力声明；源码没有访问未声明的 DOM/Phaser 能力，也没有误以为切换字段会自动转换代码。
- [ ] Phaser/DOM/WebGL 对象放入正确粗粒度 underlay/Canvas/overlay 平面，没有依赖跨渲染器逐对象交错。
- [ ] 新内容使用语义 `nodeBindings`；复制场景后绑定重写正确，且不销毁宿主管理节点。
- [ ] 稳定结果使用命名呈现状态；状态 ID 存在，编辑状态、当前位置试运行和缩略图状态切换一致。
- [ ] 能由点击、状态/场景切换、声音或视频动作表达的逻辑已优先使用场景 `interactions` 或 `globalInteractions`；全局规则的 `scene.in` 正确，运行时未重复处理同一触发。
- [ ] 跨场景指定状态使用 `goToScene(sceneId, targetStateId)` 或 `scene.go.targetStateId`，无效引用回退语义已验证。
- [ ] 可枚举入场/退场使用 Project V7 `node.enter` / `node.exit`，有明确业务触发、顺序/并行/延迟与完成事件；运行时未重复同一宿主动画。
- [ ] `playbackInitialVisibility` 只影响互动 Player；编辑、缩略图和静态导出保持作者稳定画面。
- [ ] 常规声音和视频使用 Project V7 媒体管理；运行时自建媒体已同步静音并完整清理。
- [ ] local/course 状态边界符合重播和重开语义。
- [ ] `resize/setVisible/suspend/resume` 与场景/全局生命周期相符；事件、守卫、监听、RAF、Tween、Timer、音频、WebGL 和 GPU 资源在销毁时清理。
- [ ] `capture.waitUntil()` 不会永久阻塞；`prepareCapture()` 能为 Canvas/WebGL 主动渲染确定帧。
- [ ] Three.js 如有使用，仅打包在该运行时内，GLB/纹理/loader 均离线，编辑器核心不承担 Three.js 依赖。
- [ ] 工程检查没有阻断导出的错误；需要排障时已导出诊断报告。
- [ ] 预览、单 HTML、网页包、PDF 和 PPTX 的结果均已检查。

API 1 兼容参考见 [`examples/runtime-v3-complete/`](../examples/runtime-v3-complete/README.md)。API 2 的原生、Phaser 与内联 Three.js 对照基准见 [`examples/render-host-benchmark/`](../examples/render-host-benchmark/README.md)。后者的规则压力段执行 25 轮、共 100 次定制场景切换与 25 次末页重播，并检查挂载点、Canvas/WebGL、活动 RAF、控制台异常和外部请求；前者保留旧协议夹具。两者都不替代真实课件的命名呈现状态设计。
