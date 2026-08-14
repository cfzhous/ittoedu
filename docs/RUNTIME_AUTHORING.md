# Runtime 作者边界

Runtime 用于一个课件中的复杂动态机制。新项目把 Runtime 作为 V9 `RuntimeLayerItem` 放进统一图层；旧 V8 整画布 runtime 只通过 `legacy-runtime-v2` / `legacy-whole-canvas` 显式迁移。

## 何时使用

先判断 Native 节点、声明式互动、课程状态和已有低层能力块能否完成。只有连续模拟、复杂拖拽判定、自定义绘制或强耦合动态机制确实超出这些能力时才使用 Runtime。需要跨课例复用、参数化和独立版本治理时再评估 Component。

Runtime 源码应是普通模块，经 Agent Kit 构建图装配。不要在 `build.ts`、JSON 或提示词中手写巨型源码字符串。

## Surface Runtime V1 / API 3

新建 V9 Runtime 使用 `protocol: "surface-v1"`、`runtimeApiVersion: 3` 和 DOM render mode。源码同步调用 `CoursewareSurfaceRuntime.define({ runtimeApiVersion: 3, create(ctx) { ... } })`。这是一个刻意很小的正式合约：宿主提供唯一 `ctx.dom.root`、只读 content/assets、课程状态、呈现与导航动作、事件、capture barrier 和 authoring bridge；生命周期提供 mode、resize、visible、suspend/resume、capture 与 destroy。当前没有发布 Phaser/Hybrid API 3，Schema 会拒绝这两种声明。

文字和图片可以显式调用 `ctx.authoring.registerText/registerAsset`，也可在 DOM 上分别标记 `data-courseware-content-key` 或 `data-courseware-asset-key`。key 必须存在于 `runtime.content.values` 或 `runtime.assets`。宿主把命中转换为与派生 Inventory 完全一致的字段路径；运行时自己生成的 DOM ID 或会话 target ID 不能充当作者地址。

`legacy-runtime-v2` 只为显式迁移的 V8 整画布 Runtime 保留。它仍可在发布 Player 中兼容执行，但不作为新 Runtime 起点，也不会把旧 underlay/overlay 暴露回 V9 作者模型。

## V9 数据

`CourseRuntimeDefinition` 声明 protocol、runtime API、render mode、source、content、assets、可选 node bindings 与 static fallback。`RuntimeLayerItem` 自身声明 frame、order、可见性、旋转、透明度和命中策略。正式类型见 [`surfaceRuntimeTypes.ts`](../src/shared/surfaceRuntimeTypes.ts)，注册器见 [`SurfaceRuntimeRegistry.ts`](../src/player/SurfaceRuntimeRegistry.ts)。

V9 不给 Runtime 一个绕过图层的公开 underlay/overlay 平面。宿主只能在该 layer item 的 frame 和堆叠上下文中渲染；需要前后拆分时创建多个明确 layer item。

## 可编辑内容

- 当前可见文字必须登记稳定 text target。
- 普通可替换图片应登记 asset target。
- 教师会调整的关键数值、开关和颜色应登记 property target。
- target 的稳定 binding ID 映射到 `authoringAddress`；会话 `hitId` 不能持久化或交给 AI 当地址。
- `updateContent` / `updateAssets` 应尽量热更新当前视图，不为一次文字修改重建整课。

纯装饰粒子、内部网格、命中代理和不可独立替换的绘制片段可以不公开，但不能因此把实际教学文字藏成不可编辑像素。

## 检查模式与生命周期

Runtime 必须支持宿主挂载、更新、隐藏/显示、暂停/恢复、确定帧捕获和销毁。切到 inspection 时停止计时器、动画推进和业务写入，同时保留当前可见状态和目标；返回 playback 时恢复同一实例。销毁时清理事件、RAF、计时器、媒体、对象 URL、Canvas/WebGL 和外部资源。

运行时错误按 layer item 隔离；一个实例失败不能清空其它 Native、Component、控制器或整个 surface。静态导出捕获失败时只对受影响项使用明确 fallback 并报告差异。

## 素材、媒体和离线

使用项目素材引用，不依赖绝对路径、相邻仓库或运行时网络。常规音频和视频优先使用产品媒体模型；Runtime 自建媒体必须响应暂停、静音、隐藏和销毁。单 HTML 与网页包必须包含执行所需资源。

## 验证清单

- 在统一图层中能放到任意两个 Native 项之间，控制器不会被私有顶层 DOM 压住。
- 文字、普通图片和关键属性在初始态与交互后的检查态可命中、可保存、可重开。
- Patch 使用稳定地址与 revision，只修改目标字段。
- 播放、暂停、恢复、重播、切换 location 与销毁没有重复监听或泄漏。
- 静态捕获稳定；失败有局部 fallback 和差异报告。
- 离线 HTML 不发外部请求。

具体可用状态与源码入口从 [能力卡](../agent-kit/capabilities/index.json) 查询。
