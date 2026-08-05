# Editor 1.7.0 / Project V7 开发与发布验收基线

> 状态：Editor 1.7.0 / Project V7 的“场景 + 命名呈现状态 + 场景/全局声明式交互”、事件驱动入场/退场编排、媒体管理、默认场景目录控制器、统一 1280×720 编辑/试运行画布、Runtime API 2、Runtime Authoring V1 和组件 API 4 构成当前基线；Runtime API 1 与组件 API 1–3 保留兼容。文件名保留 V3 仅为历史兼容。本文记录当前实现边界及完整发布验收要求。
>
> 文档同步基线：2026-08-05。当前源码包版本为 1.7.0；本文已按简洁/专业模式、统一“元素”入口、统一画布 authoring、“互动与动画”、受控“开发”工作台、文字显示改进和 PublishedLesson V1 重新核对。
>
> 类型真值：`src/shared/runtimeTypes.ts`、`componentTypes.ts`、`projectTypes.ts`。若本文示例与类型不一致，以类型和 Schema 为准。

## 1. 目标结果

编辑器是统一工程容器、轻量编辑宿主和导出入口，不是创作能力上限。Editor 1.7.0 / Project V7 必须同时满足：

1. 不因编辑器没有时间轴、节点图或粒子面板而降低课件成品效果；
2. 所有人工创作的可见文字都能在编辑器中修改；
3. 一次性场景互动和课程级规则不强制组件化；
4. 全局组件是真正跨场景持久的单实例；
5. 预览、单 HTML 和网页包使用同一运行时语义；
6. PDF/PPTX 对运行时视觉有明确静态化结果；
7. 题目、反馈、完成等稳定画面在画布、状态条和缩略图中可查看、可修改。
8. 常用点击、状态、导航、声音和视频行为能通过声明式规则查看和修改，复杂逻辑仍可交给运行时或组件。
9. 局部验收从当前场景/状态直接试运行，完整验收从课程起点整课预览，二者名称和启动位置没有歧义。
10. 元素入场/退场由业务事件触发，可顺序、并行、延迟和以完成事件接力；复杂路径/关键帧动画保持在组件/运行时，不引入通用时间轴架构。
11. 默认全局控制器通过 `scene.open-picker` 展开全部场景，选择后只进入目标初始状态；目录 UI 不是工程状态。
12. 工程打开/保存/恢复、组件包生命周期、预览 Blob 资源和成品导出具有可诊断、可阻断、可恢复的稳定路径。
13. Project V7 JSON 是业务真相；DOM、Phaser、Canvas/WebGL 只按内容职责接入，改变 `renderMode` 不会伪装成自动代码转换。
14. Three.js 等真 3D 能力按运行时/组件离线打包，编辑器核心和 Player 不直接依赖，且具有可暂停、可捕获、可释放的生命周期。
15. 捕获按实例准备并立即冻结 Canvas/WebGL；PDF 单页与 PPTX 组件实例/运行时条目分别隔离失败，已成功结果不因后续错误被整批清空。
16. Windows 源码交付使用根目录双击入口，按锁文件补齐依赖、构建 Player/Renderer/Electron 并直接启动；不隐式生成 Portable、目录版或安装包。
17. 简洁/专业模式只改变编辑密度、不改变 Project V7；“元素”统一添加入口并以“常用 / 媒体”分开快捷添加和既有媒体管理，简洁出现动画原子维护规则和初始可见性，专业规则以“当 / 如果 / 就”解释。
18. 编辑状态和当前位置试运行占用同一 1280×720 Stage，Player 是唯一视觉源；透明 Phaser 层只负责原生节点交互，authoring 宿主冻结互动、音视频、导航和课程状态。
19. 组件与场景运行时通过显式、可校验的文字/素材目标开放画布编辑；未声明目标的旧内容仍真实显示并保留属性面板入口。
20. Blueprint、AI 局部 patch 及全部编辑器内 AI 接入延后到 2.0 以后；1.x 只保留版本化 authoring 边界。

优先级：成品效果 → 逻辑与生命周期 → 全部文字可编辑 → 其他轻编辑项 → 组件化与代码复用。

## 2. 当前承载模型

| 载体 | 用途 | 生命周期 |
| --- | --- | --- |
| 原生节点 | 高频修改文字、图片、图形、视频和静态排版 | 随场景 |
| `scene.presentation` | 同一场景中可命名、可编辑、可缩略预览的稳定视觉状态 | 切换时原位更新节点与组件实例 |
| `scene.interactions` | 场景节点点击与场景/状态/声音/视频/组件/运行时事件自动化的可视映射 | 随场景；可触发跨场景动作 |
| `globalInteractions` | 全局元素点击与课程级自动化；以 `scene.in` 限定生效场景 | 随课程；普通翻页保留 |
| 全局原生节点 | 母版式标题、Logo、背景装饰、视频、教师控制器和跨场景可编辑内容 | 启动创建，普通翻页保留 |
| `scene.runtime` | 当前场景一次性自由互动 | 随场景创建/销毁 |
| `globalRuntime` | 跨场景一次性规则、状态、事件、守卫和常驻效果 | 播放器启动创建，重开重建 |
| 场景组件 | 可复用、可配置的场景能力 | 随场景 |
| 全局组件 | 可复用、可配置的常驻 UI 或能力 | 启动创建，普通翻页保留 |

组件化不是完成标准。只在复用、配置、版本化或独立维护具有实际价值时使用组件。

## 3. 工程格式

```ts
interface ProjectDocument {
  schemaVersion: 7
  id: string
  title: string
  createdAt: string
  updatedAt: string
  canvas: { width: 1280; height: 720 }
  scenes: SceneDocument[]
  assets: Record<string, AssetMeta>
  componentPackages: Record<string, EmbeddedComponentPackageMeta>
  globalRuntime?: RuntimeDocument
  globalLayer: GlobalLayerItem[]
  globalInteractions: InteractionRule[]
  media: ProjectMediaSettings
  playback: {
    controls: 'canvas' | 'none'
    keyboardNavigation: boolean
  }
}

interface BaseNode {
  playbackInitialVisibility: 'inherit' | 'hidden'
}

interface InteractionActionStep {
  id: string
  start: 'after-previous' | 'with-previous'
  delayMs: number
  action: InteractionAction
}

interface SceneDocument {
  id: string
  name: string
  backgroundColor: string
  backgroundAssetId?: string | null
  nodes: SceneNode[]
  presentation?: {
    initialStateId: string
    thumbnailStateId?: string
    states: Array<{
      id: string
      name: string
      backgroundColor?: string
      backgroundAssetId?: string | null
      nodeOverrides: Record<string, SceneNodeOverride>
      nodeOrder?: string[]
    }>
  }
  runtime?: RuntimeDocument
  interactions: InteractionRule[]
}

interface GlobalLayerItem {
  node: SceneNode
  layer: 'underlay' | 'overlay'
  visibility: {
    mode: 'all' | 'include' | 'exclude'
    sceneIds: string[]
  }
}
```

新建及规范化后的场景都会拥有默认 presentation；类型保持可选是为了兼容未规范化的旧内存对象。兼容要求：

- V1–V5 仍按历史链路逐级迁移到 V6；V6→V7 把原始动作数组包装为带稳定 ID 的顺序步骤，并将旧节点 `animation` 转成 `node.activated → node.enter` 规则；
- V6 对节点或命名状态覆盖的不同入场设置按实际生效状态迁移；无动画不生成规则，迁移 ID 必须确定性稳定；
- 新建工程默认写 Project V7，使用 `playback.controls: 'canvas'` 并在 `globalLayer` 创建可编辑的 `TeacherControllerNode`；其默认按钮包含 `scene.open-picker`；
- 新保存和新导出统一写 Project V7；
- 未来版本由旧编辑器明确拒绝，不能静默丢字段。

Project V7 当前一等数据与行为：

- `SceneDocument.interactions` 与 `ProjectDocument.globalInteractions` 保存“触发器—条件—有序动作步骤”的声明式规则。触发器在 V6 基础上新增 `node.activated` 和 `animation.completed`；每步含稳定 ID、`delayMs`、`after-previous` / `with-previous` 及动作载荷。连续 `with-previous` 形成并行组，下一个 `after-previous` 等待整组完成；
- `media.audio` 保存声音库、默认静音、主音量、`music/narration/sfx/ui/video` 声道音量和旁白压低音乐策略。声音定义引用登记过的音频资产，交互规则引用稳定声音 ID；播放/恢复的 `fadeInMs`、暂停/停止的 `fadeOutMs` 和 ducking 的 `fadeMs` 都必须由 Player 真实执行，后续动作、停止和销毁会取消旧渐变；
- `node.enter` / `node.exit` 使用立即、淡化、四方向滑动或缩放，并配置时长与缓动。正常完成会按步骤 ID 发出 `animation.completed`；取消不发。`playbackInitialVisibility` 只设置互动 Player 初始瞬态可见性，不改工程 `visible` 或命名状态；
- 同一规则在上一次未完成时再次触发，Player 取消旧运行并从新触发点重启；这是固定重入语义，不另存状态机字段；
- `TeacherControllerNode` 是 `globalLayer` 中可编辑的原生节点，支持 1–12 个结构化按钮。默认 `scene.open-picker` 展开全部场景，选择后调用 `goToScene(sceneId)` 进入目标初始状态；目录展开与焦点仅是 Player 临时 UI。固定 `scene.go` 仅为高级动作；

`VideoNode` 与文字、图片、图形一样属于 `SceneNode`：可添加、删除、拖拽、缩放、排序，公开素材、海报、裁切区间、播放速率、控件、循环、静音和背景音乐处理属性，并可成为视频触发器或动作目标。视频表面点击保留给播放控制，不再提供快速状态连接；状态/场景变化通过视频生命周期自动化或独立按钮/透明图形热点表达。历史视频 `node.click` 规则仅在内置点击播放与原生 controls 均关闭时可命中；编辑器诊断该冲突，并诊断循环视频依赖 `video.ended` 的不可达规则。

## 4. 自由运行时协议（API 2）

```ts
interface RuntimeDocument {
  runtimeApiVersion: 2
  enabled: boolean
  renderMode: 'phaser' | 'dom' | 'hybrid'
  source: string
  content: EditableTextContent
  assets: Record<string, { assetId: string }>
  nodeBindings?: Record<string, string>
  staticFallback?: {
    assetId: string
    coverage: 'runtime-layer' | 'full-scene'
    layer: 'underlay' | 'overlay'
  }
}
```

源码通过 `CoursewareRuntime.define({ runtimeApiVersion: 2, create(ctx) {} })` 同步注册，定义版本必须与文档一致。单份源码上限 2 MiB，不允许模块语法；第三方依赖必须在构建阶段打进源码。运行时是可信离线浏览器代码，不是安全沙箱。API 1 旧内容继续兼容，同时取得 DOM 与 Phaser 两组历史能力。

运行时定义可另行声明 `authoringApiVersion: 1`。它与 Runtime API 1/2 独立，仅在隔离 authoring Player 中可选提供 `ctx.authoring.register()` / `invalidate()`；text key 必须存在于 `content.values`，asset key 必须存在于 `assets`。DOM 运行时也可使用 `data-courseware-edit-key` / `data-courseware-asset-key`。目标只发布会话局部的 1280×720 命中快照，不授予 Project 写权限；当前场景的内容/素材修改由全部命名状态共享。未声明 authoring 的旧运行时仍由 Player 显示，只从属性/开发面板编辑。

API 2 公共上下文提供文案、素材、状态、事件、动作、捕获与导航；渲染上下文按 `renderMode` 严格分配：

- `phaser`：`Phaser`、`phaser.scene/root/underlay/overlay` 和 `nodes.get`；
- `dom`：`domRoot` 及 `dom.root/underlay/overlay`，不提供 Phaser 或节点句柄；
- `hybrid`：同时提供上述两组能力；
- 文案：`content.get/all`；
- 素材：`assets.url/projectUrl`；
- 节点：`nodes.get`；
- 呈现状态：`presentation.current/states/setState/transitionTo`；
- 导航：`actions` 和同步 `navigation.guard`；
- 协作：`events`、`emit`；
- 状态：`localState`、`courseState`；
- 静态捕获：`capture.waitUntil`。

`renderMode` 是能力契约，不是摘要或自动转换按钮。源码访问未声明能力必须失败；改字段不能把 DOM、Phaser、Canvas、WebGL 或 Three.js 实现转换成另一种代码。

详细接口与清理规则见 [场景与全局自由运行时开发指南](RUNTIME_V3_AUTHORING.md)。

新运行时应在 `nodeBindings` 中使用语义键映射节点 ID，再调用 `ctx.nodes.get(bindingKey)`；场景复制会重写映射。直接传节点 ID 仅用于兼容旧内容。

## 5. V4 组件

```ts
interface ComponentManifestV4 {
  schemaVersion: 4
  runtimeApiVersion: 4
  renderMode: 'dom' | 'phaser' | 'hybrid'
  supportedScopes: Array<'scene' | 'global'>
  // 其他字段兼容 V3。
}
```

- V1/V2 继续兼容为场景组件；
- V3 继续兼容历史顶层 `Phaser/scene/root` 上下文；
- 只有显式支持 `global` 的 V3/V4 组件能进入全局层；
- 同一包可声明一种或两种作用域；
- 全局实例隐藏时只关闭显示和输入，不销毁状态；
- V4 按 `renderMode` 只提供 `dom.root` 和/或 `phaser.{Phaser,scene,root}`，并提供 `capture.waitUntil`；
- V4 生命周期增加 `setVisible`、`suspend/resume`、`prepareCapture`，保留 `setMode/resize/updateProps/setEditorState/destroy`；
- Player 向组件提供 `scope`、生命周期作用域 `events`、共享 `courseState` 和场景 `presentation`；组件可直接订阅场景事件、共享进度、切换稳定状态，也可用 `emit()` 产生 `component:event`。复杂导航守卫仍由运行时承担。
- 统一画布的隔离 authoring Player 可向 V1–V4 组件提供可选 `ctx.editor.registerTextRegion()`，并收集 DOM `data-courseware-edit-key`；目标 key 必须对应公开文字字段或有效 `props.content`。普通 preview/capture/成品不提供该桥。

## 6. 全部文字可编辑

强制映射：

- 原生文字 → `TextNode.text`；
- 场景/全局运行时文字 → `RuntimeDocument.content.values`；
- V3/V4 组件文字 → `props.content`。

V3/V4 编辑器递归自动暴露合并后 `props.content` 中的每个字符串；显式 Editor Schema 只改善顺序、标签、说明、多行和长度。组件可进一步显式登记画布文字目标。运行时内容表由属性栏统一编辑；场景与全局运行时只有显式 Runtime Authoring V1 text/asset 目标可在对应画布作用域原位修改，场景值由该场景全部命名状态共享，全局值由整课共享。

必须覆盖标题、正文、按钮、题干、选项、步骤、成功/失败、重试、全局 HUD 及所有页面/状态。动态结果可计算，但人工模板必须登记。静态扫描不是完整证明，最终需逐状态视觉检查。

## 7. 呈现状态、运行状态、事件与导航

`scene.presentation.states` 描述教师能在画布、属性栏、状态条和缩略图中直接检查的稳定视觉情况。每个状态只保存相对基础场景的最小覆盖；Player 切换时在同一批根对象上更新文字、图片、图形、视频、教师控制器、组件 props、背景、显隐和层级，不销毁组件实例。`initialStateId` 决定进入场景时的状态，`thumbnailStateId` 决定左侧缩略图。

缩略图不执行 JavaScript 运行时、元素入场/退场，也不应用 `playbackInitialVisibility`；它按作者稳定可见性显示节点，并合成已启用的场景/全局 `staticFallback`。固定顺序为：背景 → 全局 underlay 元素 → 全局运行时 underlay → 场景运行时 underlay → 场景节点 → 场景运行时 overlay → 全局 overlay 元素 → 全局运行时 overlay。真实事件、动画和互动只在“当前位置试运行”、“整课预览”或成品 Player 中执行。

自由运行时负责判定、事件、过渡与瞬态效果，并通过 `ctx.presentation` 驱动这些已创作状态；不得为了方便把题目、答错、答对、完成等稳定整页 UI 全部重新绘制在运行时里。

声明式交互负责可枚举、可检查的常用映射。动画也是该规则中的动作：`node.enter` 建立瞬态可见性后入场，`node.exit` 立即禁用输入并在完成后瞬态隐藏。二者均不写回工程节点 `visible` 或命名状态。同一规则的未完成运行重触发时从动作规范起点重播；不同规则的同节点新动画从当前帧接管并取消旧动画。取消不发 `animation.completed`。

编辑界面按复杂度与职责分流。简洁模式选中场景节点时提供“出现动画”，在一个撤销步骤中同时维护当前场景/状态的 `node.activated → node.enter` 与 `playbackInitialVisibility`，且不覆盖可能重叠的专业规则。专业模式中，“属性/交互”只管理该节点的 `node.click`；右侧“互动与动画”管理 `scene.enter`、`presentation.enter`、`node.activated`、`animation.completed`、音视频事件、`component.event` 和 `runtime.event`，并按“当 / 如果 / 就”解释。两处共用条件、步骤启动方式、局部延迟和完整动作编辑器。复杂逻辑由运行时/组件完成判定并发出语义事件，规则层负责编排可枚举结果。

所有宿主入口统一支持 `goToScene(sceneId, targetStateId?)`。带目标状态时，Player 在创建目标场景节点、运行时和组件之前先物化该状态，避免初始状态闪现；同场景调用可直接切换状态。导航守卫若重定向到另一个场景，会丢弃原请求的目标状态并使用重定向场景的初始状态。

课程内核持有并向运行时及 V3/V4 播放器组件提供：

- `courseState`：普通翻页和重播保留，重开清空；
- 每个运行时的 `localState`：该挂载销毁时清空；
- 课程事件总线：作用域销毁后自动解除订阅；
- 同步导航守卫：允许、阻止或重定向；
- 统一动作：所有按钮、组件和运行时走相同导航路径。

固定事件包括课程、场景、组件、运行时、状态变化和导航阻止事件。组件 `emit()` 被包装为 `component:event`；运行时 `emit()` 被包装为 `runtime:event`。

## 8. 实际分层架构

Project V7 JSON 和课程内核独立于具体渲染器。当前播放器在同一 `PlayerScene` 中维护五个持久/场景 Phaser 根，并在 Player Stage 中维护四个 DOM 根；它们组成固定粗粒度平面，而不是一个允许 DOM 与 Canvas 对象任意穿插的显示列表：

```text
global DOM underlay
  → scene DOM underlay
    → Phaser Canvas
       ├─ global Phaser underlay
       ├─ scene Phaser underlay
       ├─ scene nodes / Phaser components
       ├─ scene Phaser overlay
       └─ global Phaser overlay
      → V4 component DOM plane
        → scene DOM overlay
        → global DOM overlay
```

普通场景清理只销毁场景根中的对象，不影响全局根。运行时 DOM underlay 永远在整个 Canvas 下；V4 DOM/hybrid 组件通过 Phaser DOM 宿主跟随节点框，但 DOM 部分整体在 Canvas 上；运行时 DOM overlay 再位于组件 DOM 之上。若对象需要逐项精确交错，应放入同一渲染器，或拆成明确的前后景。

DOM 层按 1280×720 设计坐标与 Canvas 对齐；每个运行时使用 Shadow Root。Phaser 适合高频动画、碰撞和程序视觉，DOM 适合复杂排版、表格、表单和 HUD，确需协作时使用 hybrid。

编辑器中央 Stage 在上述 Player 平面之外只叠加一个透明的 Phaser EditorScene 和显式 authoring target 层：

```text
统一 StageViewport（1280×720）
  ├─ sandbox Player iframe（唯一视觉源）
  ├─ 透明 Phaser 原生交互层（仅 authoring）
  └─ 显式 component/runtime target 命中层（仅 authoring）
```

编辑状态与当前位置试运行不会切换到另一套坐标系或另一张视觉画布。authoring Player 接收完整原生节点/背景/层级 patch；透明 Phaser 层只产生选择和几何预览，拖动完成后 Store 仍只提交一个历史步骤。playback 状态关闭编辑层并把输入交回 Player。

Three.js/WebGL 不进入编辑器核心依赖。具体运行时或 V4 组件在构建时把 Three.js 与 loader 打进自己的普通浏览器脚本，使用 DOM 能力挂载 WebGL Canvas；模型默认使用离线 GLB，较大/可复用模型作为组件包 manifest asset，一次性小模型可在 Runtime 2 MiB 上限内离线嵌入。Project V7 当前没有一等 `model` 素材类型，不能伪装为 image；若要模型库和教师独立替换，需另行扩展 Schema、归档、迁移、媒体管理和导出。宿主不提供全局 `THREE`，没有 3D 的课件不承担该体积。3D 实例必须响应 resize、显隐、suspend/resume、prepareCapture 和 destroy，并释放全部 GPU 资源。

## 9. 生命周期

| 作用域 | 普通场景切换 | 重播本场景 | 重开课件 |
| --- | --- | --- | --- |
| 全局运行时 | 保留 | 保留 | 销毁并重建 |
| 全局原生节点 | 保留，仅更新可见性 | 保留 | 销毁并重建 |
| 全局组件 | 保留，仅更新可见性 | 保留 | 销毁并重建 |
| 场景运行时 | 销毁 | 销毁并重建 | 销毁并随首场景重建 |
| 场景组件/节点 | 销毁 | 销毁并重建 | 销毁并随首场景重建 |

同一场景内切换命名呈现状态不属于上述“场景切换”：场景运行时、组件实例和节点根对象均保留，只原位应用覆盖。

离开场景时，运行时先解除交互和清理，再销毁场景组件、DOM、额外 Phaser 对象和原生节点。重复切换不能线性累积监听器、Timer、Tween、音频、纹理或 DOM。

API 2 运行时和 V4 组件使用同一生命周期语义：`setVisible(false)` 关闭显示与输入但保留实例；`suspend/resume` 停止并恢复 RAF、物理、媒体和昂贵更新；`prepareCapture` 在导出前产生确定帧；`destroy` 最终清理监听、对象 URL、Canvas/WebGL、纹理和 GPU 资源。生命周期方法必须可重入并隔离单实例异常。

## 10. 编辑器边界

编辑器保持轻量：

- 场景列表顶部有固定“全局层”；
- 左侧场景缩略图展示指定 `thumbnailStateId`，画布下方状态条切换基础与多个命名状态；
- 中央只有一个固定 1280×720 Stage。“编辑状态”由隔离 authoring Player 显示完整合成画面，透明 Phaser 层直接选择和修改物化后的原生元素；authoring 冻结输入、声明式互动、音视频、导航、呈现状态推进和课程状态写入。“当前位置试运行”在原位置切换为 playback Player，从当前场景/当前命名状态启动（基础场景回退初始状态）；载入或启动失败显示原因和重试入口；顶部“整课预览”在独立窗口从第一场景初始状态开始；
- 预览文档使用父窗口可撤销 Blob URL；工程与组件素材以可转移缓冲区进入 sandbox，再由 iframe 在自身不透明源内创建 Blob URL。切换、重试、关闭或失败时两侧资源均不泄漏，且不以放宽同源隔离或 Base64 大媒体为代价；
- 顶部切换简洁/专业模式；偏好只存本机，不进入工程。简洁模式右栏为“元素 / 图层 / 属性”，专业模式追加“互动与动画 / 开发”；
- “元素”只保留“常用 / 媒体”两个基础分类：常用容纳文本、图片、视频、声音和全部图形快捷入口；媒体只管理已进入工程的声音、视频和图片，不重复放置快捷入口或导入按钮，专业模式在媒体管理中追加声音定义、声道音量和默认静音；
- 简洁“出现动画”提供淡入、滑入、缩放、方向、速度、延迟和预览；专业模式开放 `playbackInitialVisibility`、点击映射、组件包、运行时与完整顺序/并行动作步骤；
- 视频是可在画布和缩略图中显示海报、可直接选择与修改的原生节点；
- 全局层可放入文字、图片、图形、视频、教师控制器和支持 global 的 V3/V4 组件，并编辑位置、尺寸、层级和可见范围；
- 教师控制器允许 1–12 个按钮；默认 `scene.open-picker` 展开全部场景且不选状态，固定 `scene.go` 只作为高级动作；
- 场景与全局运行时可启停，并从属性面板编辑全部 `content.values`；显式 Runtime Authoring V1 目标可在场景或全局画布作用域原位编辑 text/asset，场景值由全部命名状态共享，全局值由整课共享；旧运行时无目标时仍显示；
- V3/V4 组件属性栏自动显示全部 `props.content`；V4 `renderMode` 是包能力声明，不是编辑器转换器；
- 组件包管理显示使用数量，引用中禁止删除，同 ID 替换/升级校验作用域并可失败回滚，单实例异常隔离；
- 编辑画布支持 50%–200% 缩放、Ctrl/Command+滚轮、空格/中键平移和视图复位；视图不写入工程；
- 顶部工程检查可定位结构问题，错误阻断导出；本地轮转异常日志可导出诊断报告；
- 工程归档与恢复异步执行，恢复单通道去重并取消过期压缩；保存期间的新编辑保持未保存；关闭窗口提供保存/不保存/取消；
- 专业“开发”提供加宽的单任务工作台，可受控修改工程内运行时、对象/规则 JSON 和可编辑组件副本；不提供任意文件系统、Shell、通用时间轴或节点图，声明式交互映射也不等于任意 JavaScript 可视化；
- 原生文字支持稳定双击编辑；组件显式文字目标和场景运行时显式 text/asset 目标可在同一画布命中，未登记内容至少保证属性栏编辑。

## 11. 规模

- 推荐不超过 200 个场景，防御性上限 1000；
- 推荐单场景不超过 250 个节点，防御性上限 1000；
- 单场景命名呈现状态防御性上限 100；
- 上限用于防止损坏和滥用，不是正常创作限制；
- 几小时的大课宜按章节拆分，复杂视觉可用运行时或组件承载。

## 12. 导出

### 单 HTML

在导出边界把 Project V7 单向编译为 PublishedLesson V1，再内联发布数据、运行素材和 Player。保留场景/全局声明式交互、事件驱动入场/退场、声音、视频、场景目录控制器、运行时、组件和状态切换；不主动交付工程时间、历史、编辑器字段、组件 manifest 或独立原始源码文件。音视频会转为内联数据；超过 50 MiB 警告，超过 256 MiB 阻止并建议网页包。

### 网页包

分离 `index.html`、播放器、唯一的 `course-data.js` PublishedLesson 数据、工程运行素材和组件运行素材。运行语义与单 HTML 相同；资源解析统一适配相对 URL。网页包不再重复保存 `course.json`，也不生成组件 `manifest.json` 或独立 `runtime.js`。含大视频的工程应优先选择网页包，避免单 HTML 的体积、加载和内存压力。完整解压后可 `file://` 打开，部署时建议静态服务器。完整边界见 [PublishedLesson V1](PUBLISHED_LESSON_V1.md)。

### PDF

以同一 Player 捕获固定 DOM underlay、Phaser Canvas、组件 DOM/WebGL、DOM overlay、全局层和场景层的合成画面；每个实例先排空既有 `capture.waitUntil()` 任务，再调用 `prepareCapture()` 生成最终画面，等待 hook 内同步登记且包含最终绘制的有限任务，并立即复制该实例 Canvas/WebGL 帧后再继续，以兼容 `preserveDrawingBuffer: false`。Player 成功启动后，某一场景失败只让该页改用带诊断信息的静态后备，其他页面继续使用真实捕获；捕获宿主无法初始化时才整批后备。静态捕获不执行入场/退场，不应用 `playbackInitialVisibility: 'hidden'`，而是使用作者稳定可见性。声音不输出；视频使用配置的海报画面。教师控制器默认省略，只有 `includeInStaticExports` 为 `true` 时保留。

### PPTX

- 原生文字/图形/图片保持对象级导出，声音不输出；
- 视频导出为标明文件名的静态占位；教师控制器仅在 `includeInStaticExports` 为 `true` 时保留；
- 场景组件和可见全局组件静态化；
- 组件按实例依次创建隔离捕获 Player；单实例失败只生成该实例占位，已成功组件快照继续保留；
- 场景/全局运行时优先由透明隐藏 Player 捕获实际 underlay/overlay 快照；
- 运行时按场景/全局条目和图层记录失败，只回退对应条目，不清空其他成功快照；
- 实际快照失败或未产生可见结果时使用 `staticFallback`；
- `runtime-layer` 后备保留原生对象，`full-scene` 后备以整页图片覆盖显示；
- 实际快照和后备均不可用时显示占位并报告。

## 13. 安全

- 编辑器 React 主窗口不直接执行自由运行时；统一画布的 authoring / playback 都使用 Blob URL 中、不授予同源权限的隔离 Player iframe；authoring 额外冻结输入、媒体、导航、状态推进与课程状态写入；
- 主进程仅允许编辑器主窗口的同源派生 Blob 子框架，拒绝主框架、独立预览窗口、外部/data/file 和非同源 Blob 导航；Player↔编辑器 authoring 消息携带协议版本、会话、revision 和场景/状态上下文，旧实例延迟事件不得覆盖新实例状态；
- 预览和捕获禁用 Node 集成并隔离上下文；
- 阻止外部网络、新窗口、下载和系统权限；
- 网页导出 CSP 禁止网络连接；
- 运行时和组件只能由可信来源提供；
- 这些边界不能宣传为对任意恶意脚本的绝对安全沙箱。

## 14. 完整验收矩阵

| 范围 | 必测内容 |
| --- | --- |
| Schema | V1→V2→V3→V4→V5→V6→V7、V6 `animation` 确定性迁移、动作步骤、`playbackInitialVisibility`、`scene.open-picker`、未来版本拒绝 |
| 持久化 | 异步保存/打开、恢复单通道去重与取消、保存并发编辑、关闭三选项、复制/删除场景、ID 重写、撤销/重做 |
| 文字 | 原生双击、运行时内容表、组件递归 content、组件显式 DOM/`ctx.editor` 目标、Runtime Authoring V1 text 目标、保存重开 |
| 场景状态 | 基础继承、增加/复制/重命名/删除、initial/thumbnail、统一画布编辑/试运行切换、原位组件更新、runtime 内容跨状态共享 |
| 统一画布 | 同一 1280×720 Stage、Player 唯一视觉源、透明 Phaser 原生交互层、fit/zoom/pan 下像素对齐、authoring 冻结互动/媒体/导航/courseState、完整节点 patch 与单步历史 |
| 预览入口 | 当前位置试运行在同一画布从当前场景/状态启动、基础回退初始状态、Blob sandbox、启动失败反馈/重试；整课预览从课程起点独立启动 |
| 声明式交互 | 场景 `interactions` / `globalInteractions` 分流、`scene.in` / `presentation.in`、`node.activated` / `animation.completed`、`after-previous` / `with-previous`、步骤 ID/延迟、导航最后独立组、复制/删除引用处理、编辑/Player 一致 |
| 元素动画 | 简洁出现动画原子创建/更新/移除/撤销及高级冲突保护；专业 `node.enter` / `node.exit`、立即/淡化/四向滑动/缩放、时长/缓动、顺序/并行/延迟、完成事件、中断接管、输入禁用、Player 瞬态可见性与静态稳定帧 |
| 声音 | 导入/删除、声音 ID、声道和主音量、静音、旁白 ducking、场景/课程生命周期、阻止自动播放后的恢复 |
| 视频 | 画布与缩略图海报、拖拽缩放、播放动作/事件、表面点击归属、旧点击冲突诊断、循环-ended 诊断、起止时间、循环、声道、资源清理 |
| 成品控制器 | canvas 默认、none、1–12 按钮、`scene.open-picker` 全场景目录/当前项/键盘/关闭生命周期、不选状态、高级固定 `scene.go`、折叠保持/重开复位 |
| 组件包管理 | 使用统计、引用中禁止删除、无引用删除、同 ID 替换/升级、作用域不兼容回滚、异常隔离 |
| 协议能力 | Runtime API 2 / Component API 4 版本匹配、`dom/phaser/hybrid` 最小能力隔离、Runtime Authoring V1 key/target/会话/revision 校验、组件 target 桥、未声明能力不可访问、旧 runtime/组件回归 |
| 编辑易用性 | 简洁/专业切换无工程差异；右栏无重复“素材”一级 Tab；“元素”中的“常用”集中快捷添加，“媒体”只管理既有图片/视频/声音；图片/视频复用同一 Asset ID；画布 50%–200% 缩放、Ctrl/Command+滚轮、空格/中键平移、复位且不改坐标 |
| 工程检查 | 错误/提醒/建议、定位、错误导出阻断、提醒不阻断、诊断日志轮转与报告导出 |
| 场景运行时 | API 2 Phaser/DOM/hybrid、节点绑定、素材、跳转、重播、显隐/暂停、捕获准备、销毁、失败隔离 |
| 全局运行时 | 跨场景状态、事件、守卫、重开重置 |
| 全局组件 | V4 DOM/Phaser/hybrid、单实例、可见性、隐藏输入、暂停/恢复、动作、文字编辑、捕获、重开重建 |
| Three/GLB | Three 只存在于运行时/组件包；GLB/loader/纹理离线；resize、确定帧捕获、WebGL/GPU 释放及无 3D 核心依赖 |
| 资源清理 | 五路径基准执行 25 轮：每轮切换四个定制场景并重播末页，合计 100 次切页 + 25 次重播；监听、Timer、Tween、RAF、纹理、DOM、Canvas、WebGL/GPU 与外部请求不增长 |
| 单 HTML | 离线、无外部请求、交互/声音/视频/控制器、体积警告 |
| 网页包 | 完整解压、file/HTTP、音视频相对资源、无外部请求 |
| PDF | 固定 DOM underlay/Canvas/DOM overlay、组件 DOM/WebGL、全局层、视频海报、无声音、控制器静态开关、prepareCapture、捕获等待/超时与单页失败隔离 |
| PPTX | 原生对象、视频文件名占位、无声音、控制器静态开关、组件/运行时快照与 fallback、组件实例/运行时条目失败隔离 |
| 源码启动 | 类型、测试、E2E、三个生产目录构建与根目录双击入口冒烟；不调用 electron-builder，不生成安装包 |

## 15. 非目标

当前基线不提供：

- Blueprint、AI 局部 patch 或任何编辑器内模型调用；全部 AI 接入延后到 2.0 以后，1.x 只保留版本化 authoring 边界；
- 通用 Web IDE 或可任意编辑独立 HTML/CSS 文件的工作台；专业“开发”面板仅保留受版本化 Schema 约束的 `RuntimeDocument.source` JavaScript 入口；
- 时间轴、通用可视化状态图或任意事件节点图（常用映射由声明式交互属性支持）；
- 任意 HTML 反向拆分成原生节点；
- 任意程序图形的自动编辑；
- 仅修改 `renderMode` 即可完成的 DOM/Phaser/Three 自动转换；
- 编辑器核心内置或全局暴露的 Three.js；
- PDF/PPTX 中的真实互动；
- Node.js、本机文件、远程 API、账号或后端服务；
- 对第三方代码的绝对安全承诺。

## 16. 文档和示例入口

- [AI 互动课件创作与接入规范](AI_COURSEWARE_AUTHORING.md)
- [场景与全局自由运行时开发指南](RUNTIME_V3_AUTHORING.md)
- [互动组件开发指南](COMPONENT_AUTHORING.md)
- [Project V7 + Runtime API 1 / 组件 API 3 兼容示例](../examples/runtime-v3-complete/README.md)

Editor 1.7.0 当前采用根目录 `启动课件编辑器.cmd` 直接运行源码，不构建 Portable、目录版或安装包。提交前必须重新执行 `npm run typecheck`、全量 Vitest、Playwright Electron E2E、Player/Renderer/Electron 生产构建，并对双击入口做真实启动冒烟；入口只能补齐锁定依赖、运行 `build:desktop` 并启动 Electron，不能隐式调用 `electron-builder`。最近一次 1.6.0 Windows x64 制品只是历史记录，不代表当前 1.7.0 源码；当前源码回归为 Vitest **96 个文件 / 615 项**、Playwright **26/26**。

完整发布仍须同时报告“管线状态”和“成品效果状态”；测试通过不等于视觉与教学体验已验收。
