# AI 互动课件创作与接入规范（Editor 1.0.0 / Project V8 断代中）

> 读者：把已经批准的教学设计、教学内容规格、教学呈现脚本和视觉方向实现为课件的 AI。
>
> 前置规范：开始实现前必须完整执行 [AI 互动课件通用创作编排规范](AI_COURSEWARE_ORCHESTRATION.md)，取得文件路径、版本和哈希均有效的 `implementation-ready` 交接记录。当前主干已只接受 Project V8，而仓库中的 `build-project-v7-courseware` 仅适用于归档标签 `internal-prototype-1.7.0`；新的 V8 实现 Skill 尚未完成，因此新课例必须暂停在实现门禁，不能用旧 Skill 生成后再伪改版本号。
>
> 目标：依据已经批准的体验合同，一次产出可由本编辑器打开、轻改、预览和导出的完整 `.h5lesson`，不因编辑器面板能力而牺牲成品效果。

> 文档同步基线：2026-08-07。当前源码包版本为 Editor 1.0.0 收敛分支；Project V8 打开/保存/Player Payload 边界和 `playback.presenter` 已进入实现，Runtime API 1、Component API 1–3、历史夹具及 V8 实现 Skill 清理仍未完成。

> 版本术语必须严格区分：新工程使用 Project `schemaVersion: 8`；新场景/全局自由运行时只面向 `RuntimeDocument.runtimeApiVersion: 2`；新组件只面向组件 `schemaVersion: 4` 与 `runtimeApiVersion: 4`。旧 Project V1–V7 已由产品入口拒绝；旧运行时和组件兼容代码处于待删除状态，不能作为新内容合同。文件名中的 “runtime-v3” 只表示历史播放器代际，不代表自由运行时 API 版本。

> 当前生成边界：本文只适用于已实现的固定 1280×720、可导出 PPTX 的课件模式。不得按未来规划伪造长文、无限画布、混合表面或其他未发布 Project 字段。

## 1. 不可颠倒的优先级

创作决策必须按以下顺序处理：

1. 完整实现已批准教学设计、教学内容规格与教学呈现脚本要求的内容、视觉、动画、声音、状态、分支和互动体验；
2. 保证互动逻辑、跨场景行为、生命周期和离线播放可靠；
3. 保证所有人工创作、最终会被人看见的文字可在编辑器中修改；
4. 按实际维护需要开放图片、颜色、数值、模式等轻编辑项；
5. 只有在复用、配置或独立维护确有价值时才组件化；
6. 最后考虑抽象、复用和代码形式是否“整齐”。

第一优先级永远是忠实达到已批准的教学与成品效果。不得为了组件化、可编辑比例、已有模板或编辑器面板齐全而降低已批准要求；实现中若发现方案不可行，必须返回编排层说明可感知取舍，不能自行改写体验合同。

## 2. 编辑器是什么，不是什么

本编辑器不是通用网页 IDE，也不试图可视化任意 JavaScript。它是：

- Project V8 的统一工程容器；
- 对场景、场景状态、文字、图片、图形、视频、组件公开参数、全局控制器和交互映射进行直接修改的宿主；
- 预览及单 HTML、网页包、PDF、PPTX 的统一导出入口。

Project V8 JSON 是唯一业务真相：它描述场景、命名状态、声明式交互、素材绑定、运行时文档、组件实例及公开参数。DOM、Phaser、Canvas、WebGL 和 Three.js 都只是执行这些数据的呈现/交互能力。架构不以 DOM 或 Phaser 为业务核心，也不承诺修改 `renderMode` 后自动转换实现代码。

中央工作区只有一个固定 1280×720 画布，不再分别维护编辑画面和运行画面。Player 是“编辑状态”和“当前位置试运行”的唯一视觉源：编辑状态使用隔离 authoring Player 合成原生节点、组件、场景/全局运行时，并在上方叠加透明 Phaser 原生交互层；该层只负责选择和几何变换。authoring Player 冻结学生输入、声明式互动、音视频、导航、状态推进和课程状态写入；切换到“当前位置试运行”后，同一画布位置才启用完整 playback 行为。

编辑器提供“场景 + 场景状态 + 场景/全局声明式交互”创作模型。简洁模式右侧只保留“元素 / 图层 / 属性”，并提供原子化“出现动画”；专业模式追加“互动与动画 / 开发”，开放组件、运行时、完整规则和受控工程代码编辑。两种模式只改变工作入口和信息密度，不改变或降级 Project V8。简单的按钮点击、状态切换、场景跳转、声音播放和静音控制应优先写成 `SceneDocument.interactions` 或课程级 `globalInteractions`：专业模式在“属性”中维护节点基础点击，在“互动与动画”维护非点击触发；全局规则用 `scene.in` 限定生效场景。复杂判定、连续拖拽、粒子、时间轴式动画和算法行为仍由运行时或组件承担。AI 仍可在场景运行时、全局运行时和组件代码中使用 Phaser、DOM、SVG、Canvas、WebGL、Tween、程序音效和本地素材。

编辑器提供事件驱动的元素入场/退场编排。动画不是从场景开始后独立计时，而是作为 `interactions` / `globalInteractions` 的动作，由点击、场景/状态进入、组件事件、运行时事件、音视频事件、节点激活或前一动画完成触发。动作步骤可顺序等待或与前一步同时开始，并可设置相对触发点的局部延迟。它仍不是关键帧、路径或通用时间轴；复杂连续运动继续由组件/运行时承担。

节点的 `playbackInitialVisibility` 只决定互动 Player 初始使用作者可见性还是先隐藏等待入场动作。入场/退场只修改播放器瞬态可见性，不写回节点 `visible`，也不切换 `scene.presentation`。编辑画布、缩略图与 PDF/PPTX 始终使用作者设定的稳定画面。

普通教师主要修改登记后的文案和公开属性。专业“开发”面板采用加宽的单任务工作台，通过“运行时 / 对象 JSON / 规则 JSON / 组件代码”切换并一次只呈现一类内容；可校验并修改当前工程承载的场景/全局运行时源码、所选对象 JSON、规则 JSON，以及用户创建的工程内可编辑组件副本。它不是通用网页 IDE，不提供文件系统、Shell、远程依赖、Node/Electron API 或编辑器自身源码。AI 或可复现生成脚本仍是批量生成和复杂实现的首选。

Editor 1.x 不包含 Blueprint、AI 局部 patch 或任何编辑器内模型调用。全部 AI 接入统一延后到 2.0 以后；当前只保留带协议版本、会话、revision、上下文和能力声明的 authoring 边界，使未来能力可以显式接入而不改变 Project V8 真相。AI 目前应在编辑器外按本文生成完整工程或可复现脚本，不得把现有手工 authoring 协议描述成已经接入的 AI 功能。

稳定、可命名、会反复到达的视觉情况（例如题目、答错、答对、完成）必须优先由场景原生节点和 `scene.presentation.states` 表达。运行时负责判定、事件、过渡、临时粒子/拖拽轨迹、程序动画和无法合理声明为元素的效果，并通过 `ctx.presentation.setState()` 或 `transitionTo()` 切换稳定状态。不得把整页稳定 UI 全部重建在运行时中，仅留下一个无法在画布中查看和修改的空场景。

一次性且无需结构化编辑的瞬态视觉仍可直接写入 `scene.runtime` 或 `globalRuntime`；会复用、需独立配置或具有自身复杂生命周期的互动区域使用组件。成品效果仍是第一优先级，但“高效果”不能再被当作放弃稳定视觉可编辑性的理由。

统一“元素”面板用搜索和分类替代重复的元素/素材入口。简洁模式只保留“常用 / 媒体”：文本、图片、视频、声音和全部图形快捷入口归入“常用”；“媒体”只管理已进入工程的声音、视频和图片，不重复放置快捷入口或导入按钮；专业模式再增加“互动组件 / 控制与全局”。已有图片和视频继续复用同一 Asset ID，不得为了再次添加到画布而重复写入二进制素材。

## 3. 实现阶段从一开始直接生成统一工程

取得 `implementation-ready` 交接记录后，不要先制作一份脱离工程规范的网页，再进行第二次接入。正确路径是：

```text
已批准教学设计 + 教学内容规格 + 教学呈现脚本 + 视觉方向 + 决策记录
        ↓
内部技术映射：承载方式、状态、生命周期、编辑入口和验收路径
        ↓
  直接生成 Project V8 .h5lesson
  ├─ 场景原生节点（文字、图片、图形、视频、组件）
  ├─ scene.presentation（同场景的命名视觉状态）
  ├─ scene.interactions（点击、状态、导航、声音等声明式映射）
  ├─ globalInteractions（全局元素与课程级声明式映射）
  ├─ media.audio（声音库、声道与默认播放策略）
  ├─ playback（成品控制器模式和显示策略）
  ├─ globalLayer（母版式全局元素、视频、组件和教师控制器）
  ├─ scene.runtime（场景一次性互动）
  ├─ globalRuntime（跨场景一次性规则）
  ├─ 场景组件（可复用场景能力）
  └─ 全局组件（可复用跨场景常驻能力）
        ↓
编辑器轻改 / 预览 / 四种格式导出 / 真实互动验收
```

统一规范不等于一切都必须可视化编辑。稳定画面中的元素、文字、几何、显隐、样式、组件参数和层级应进入状态模型；瞬态程序图形、动画曲线、判定逻辑和一次性互动规则可以保留在代码中。

## 4. 八种承载方式

| 承载方式 | 适合内容 | 是否跨场景保持 | 何时优先选用 |
| --- | --- | --- | --- |
| 场景原生节点 | 当前场景的文字、图片、图形、视频和静态排版 | 否 | 教师需要直接选择、替换、移动或排版，且内容只属于当前场景 |
| 场景状态覆盖 | 同一场景在题目、反馈、完成等稳定阶段中的元素差异 | 否 | 同一批元素需要切换文字、几何、显隐、样式、组件 props、层级或背景 |
| 声明式交互规则 | 点击、状态切换、场景跳转、声音播放/停止、静音等可枚举映射 | 可跨场景跳转 | 逻辑能明确表达为“触发—条件—动作”，需要在编辑器中查看和修改 |
| 全局原生节点 | 母版式标题、页眉页脚、Logo、背景装饰、视频、教师控制器和通用提示 | 是 | 同一元素需跨场景复用并保持可直接编辑，无需写成组件 |
| `scene.runtime` | 当前场景独有的点击、拖拽、动效、DOM 界面和判定 | 否 | 一次性互动，无复用或独立配置价值 |
| `globalRuntime` | 跨场景状态、事件协调、导航守卫、常驻 DOM/Phaser/WebGL 效果 | 是 | 一次性课程级规则，不值得做成组件 |
| 场景组件 | 可复用、可配置的题型、实验、动画或场景内工具 | 否 | 会重复使用、需要版本化或供多人配置 |
| 全局组件 | 跨场景持续存在的控制条、计时、音乐、积分或教师工具 | 是 | 可复用、可配置且需要一个持久实例 |

关键判断：

- 同一场景中的稳定阶段先做成状态覆盖，再由 `scene.runtime` 或组件触发切换；
- 可由节点事件直接表达的状态、场景、声音和控制动作优先写成 `interactions`，不要为一个按钮跳转专门写运行时源码；
- 只在一个场景使用的复杂判定、瞬态效果和事件协调可以直接写入 `scene.runtime`，不强制包装成组件；
- 只服务当前课程的跨场景规则可以直接写入 `globalRuntime`；
- 跨场景复用的文字、图片、图形、视频和教师控制器直接放入 `globalLayer`，不必包装成组件或复制到每个场景；
- 全局组件不是复制到每个场景的组件，而是播放器启动时创建一次、普通翻页不销毁的实例；
- V1/V2 组件保留兼容，但只能作为场景组件；V3 组件继续按既有作用域运行；新组件应使用 V4。

## 5. Project V8 最小结构

```ts
interface ProjectDocument {
  schemaVersion: 8
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
  media: {
    audio: {
      defaultMuted: boolean
      masterVolume: number
      channelVolumes: Record<'music' | 'narration' | 'sfx' | 'ui' | 'video', number>
      sounds: Record<string, SoundDefinition>
      narrationDucking: { enabled: boolean; musicVolume: number; fadeMs: number }
    }
  }
  playback: {
    controls: 'canvas' | 'none'
    keyboardNavigation: boolean
    presenter: {
      enabled: boolean
      strategy: 'scene-navigation' | 'authored-command'
      additionalBindings: Array<{
        id: string
        command: 'next' | 'previous'
        key: string
        altKey: boolean
        ctrlKey: boolean
        shiftKey: boolean
        metaKey: boolean
      }>
    }
  }
}

interface GlobalLayerItem {
  node: SceneNode // text | image | video | shape | teacher-controller | external-component
  layer: 'underlay' | 'overlay'
  visibility: {
    mode: 'all' | 'include' | 'exclude'
    sceneIds: string[]
  }
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
      description?: string
      backgroundColor?: string
      backgroundAssetId?: string | null
      nodeOverrides: Record<string, DeepPartial<SceneNode>>
      nodeOrder?: string[]
    }>
  }
  runtime?: RuntimeDocument
  interactions: InteractionRule[]
}

interface BaseNode {
  // geometry, visibility and common fields omitted
  playbackInitialVisibility: 'inherit' | 'hidden'
}

interface TeacherControllerNode extends BaseNode {
  type: 'teacher-controller'
  title: string
  collapsible: boolean
  defaultCollapsed: boolean
  buttons: Array<{
    id: string
    label: string
    visible: boolean
    action:
      | { type: 'scene.previous' }
      | { type: 'scene.next' }
      | { type: 'scene.replay' }
      | { type: 'course.restart' }
      | { type: 'scene.open-picker' }
      | { type: 'scene.go'; sceneId: string; targetStateId?: string }
      | { type: 'audio.toggle-mute' }
      | { type: 'player.fullscreen.toggle' }
  }> // 1–12
}
```

`.h5lesson` 是 ZIP。根目录是 `project.json`；工程素材位于登记过的 `assets/...`；嵌入组件位于 `components/<packageId>@<version>/...`。运行时源码内联在 `project.json` 的 `RuntimeDocument.source` 中，不要另造未登记代码目录。

新创作必须直接写入 `schemaVersion: 8`，并显式包含 `globalLayer`、`globalInteractions`、每个场景的 `interactions`、`media.audio`、`playback` 和 `playback.presenter`。即使暂时没有规则、全局元素或附加按键，也要保留空数组/空对象及有效默认值。旧 Project V1–V7 会被明确拒绝，不再是加载迁移输入；AI 不得在新工程或生成脚本中继续产出旧字段，也不得通过只改版本号来规避 Project V8 校验。

当前边界切片只实现 `playback.presenter` 和 `presenter.command` 的 Schema、保存与发布承载。演示输入监听、PageUp/PageDown、附加按键检测/配置及规则分发仍属于里程碑 3；实现 Skill 恢复前不得把这些字段解释为当前成品已经支持翻页笔。

### 5.1 场景状态的基线与覆盖

- `SceneDocument.nodes` 是规范基础，状态不复制整张场景，只保存相对基础的最小覆盖；
- `initialStateId` 是 Player 进入场景时显示的状态；`thumbnailStateId` 决定左侧场景缩略图；
- 缩略图状态应是确定、可读的稳定画面，不依赖悬停、随机数或延迟动画；自由运行时的瞬态对象不会被反向写入工程，但已启用运行时登记的 `staticFallback` 会按层级合成到缩略图，未登记后备时显示“运行时”提示角标；
- 基础画布中的修改会被未覆盖该字段的所有状态继承；状态画布中的修改只写入当前状态；
- 在某个状态中新建的元素会获得稳定节点 ID，基础中默认隐藏、当前状态中显示，因此仍可在图层和属性面板中编辑；
- 在状态中删除元素表示“当前状态隐藏”，在基础中删除才会删除节点及全部状态覆盖；
- 状态切换不销毁组件实例。Player 原位调用组件 `resize()`、`updateProps()` 并更新同一根对象，组件内部临时状态因此可以按设计保留；
- `playbackInitialVisibility: hidden` 只隐藏互动 Player 中等待事件的元素；编辑画布、缩略图和静态导出仍按节点/状态的作者可见性显示，保证元素可选择、可修改；
- 状态切换会取消受影响节点未完成的瞬态动画并恢复新状态基线；随后发布 `presentation.enter`，由自动化决定是否继续播放入场或退场。动画不能替代命名稳定状态；
- 基础不是运行时状态。运行端只切换 `states` 中的命名状态。

左侧面板切换场景；画布下方状态条切换同一场景的基础和命名状态。中央工作区的“编辑状态”和“当前位置试运行”共用同一 1280×720 画布与 Player 视觉语义：编辑状态从当前基础或命名状态启动 authoring Player，执行组件与自由运行时的稳定视觉创建，但冻结互动、媒体、导航、呈现状态推进和课程状态写入，并由透明 Phaser 层选择/变换原生元素；当前位置试运行在原位置启用完整 playback Player，从当前场景和当前命名状态真实运行，基础场景则使用该场景 `initialStateId`。预览文档使用父窗口临时 Blob URL；工程和组件素材以可转移二进制缓冲区进入 sandbox，再由 iframe 在自身不透明源内创建 Blob URL。实例替换、关闭、重试或失败时必须分别回收文档与素材 URL。顶部“整课预览”在独立窗口中从第一场景初始状态开始，适合检查完整课程流程。任何中央 Player 载入或启动失败都必须显示可读原因和重试入口，不能只留下空白画布。

### 5.2 声明式交互规则

`SceneDocument.interactions` 与课程级 `ProjectDocument.globalInteractions` 是可视化映射的工程真相，不是运行时源码的镜像。场景规则管理当前场景节点和事件；全局规则管理只创建一次的全局元素与课程级自动化。每条规则由稳定 ID、启用状态、一个触发器、若干 AND 条件和有序动作步骤组成。每个动作步骤拥有稳定 ID、相对延迟、`after-previous`（等待上一组完成）或 `with-previous`（与上一动作同时开始）的启动方式，以及实际动作：

- 触发器包括节点点击、进入场景、进入状态、节点被稳定画面激活、组件事件、带 `scene/global` 来源的运行时事件、声音结束、视频开始/暂停/结束/时间点，以及指定动画动作正常完成；
- `presentation.in` 条件限制当前命名状态；`scene.in` 条件限制当前场景，主要用于全局规则。同一条件内多个 ID 为 OR，不同条件之间为 AND；
- 动作包括元素入场/退场、切换状态、场景跳转、重播/重开、声音播放/暂停/继续/停止/静音，以及视频播放、暂停、重播、停止和跳转时间；
- 元素入场/退场可使用立即、淡化、四方向滑动或缩放，支持时长与缓动。动作延迟只相对触发事件或上一动作组，不表示“场景播放到第几秒”；
- 入场会先建立 Player 瞬态可见性再播放，退场会立即禁止输入并在完成后瞬态隐藏；二者都不修改节点 `visible` 或命名状态。同一规则未完成时再次触发会取消旧运行并从该动作规范起点重播；不同规则争用同一节点时由新动画从当前帧接管。取消不发 `animation.completed`；
- `scene.go` 可选携带 `targetStateId`，表示原子进入目标场景的指定命名状态；省略时进入目标初始状态，引用无效时也回退到目标初始状态；
- 连续 `with-previous` 步骤组成并行动作组；下一项 `after-previous` 必须等整组完成。场景跳转、重播或重开会销毁当前作用域，必须作为最后一个独立动作组；
- 映射必须引用稳定的场景、状态、节点和声音 ID。复制或删除对象后要通过编辑器校验映射，不能依赖显示名称或数组序号。

Editor 1.0.0 的简洁模式选中场景节点后提供“出现动画”：选择效果时必须在同一次历史提交中写入当前场景/状态的 `node.activated → node.enter` 规则并设置 `playbackInitialVisibility: 'hidden'`；选择“无”时成对移除。已有重叠专业入场规则时不得静默覆盖。专业模式将完整规则分成两个职责入口：选中节点时，“属性”中的“交互”只维护该节点的 `node.click` 规则；右侧“互动与动画”维护进入场景/状态、节点激活、动画完成、声音结束、视频生命周期/时间点、组件事件和 `runtime.event` 等非点击规则，并以“当 / 如果 / 就”解释机制，提供自然语言摘要、搜索/筛选、常用模板和可读动作序列。`presenter.command` 选项在演示输入层完成前保持禁用。进入全局层后，两处改为读写 `globalInteractions`，并提供“生效场景”编辑。运行时事件必须显式选择 `scene` 或 `global` 来源：场景来源校验当前场景 ID，全局来源可由当前场景或全局规则接收。两处共用 `scene.in` / `presentation.in` 条件及元素动画、状态、场景、声音、视频动作编辑器，不得让同一条点击规则同时出现在两个入口。

能在该模型中清楚表达的行为必须优先使用声明式规则，以便教师查看“点击哪个按钮会发生什么”。只有复杂算法、连续手势、程序动画、导航守卫或无法枚举的条件才进入运行时；运行时与声明式规则可协作，但不得让两者为同一触发器重复执行同一动作。

### 5.3 声音、视频和成品控制器

- 音频文件先登记为 `AssetMeta.kind: 'audio'`，再在 `media.audio.sounds` 中建立稳定的声音 ID、名称、素材引用、默认声道、音量和循环配置。交互规则引用声音 ID，不直接引用文件路径；删除素材前必须清理声音定义及其规则引用。
- 声道分为 `music`、`narration`、`sfx`、`ui` 和视频声道 `video`。声音定义使用前四类；视频节点的音量由 `video` 声道统一管理。主音量、声道音量、默认静音和旁白压低背景音乐策略由 `media.audio` 统一设置；播放/继续可声明淡入，暂停/停止可声明淡出，ducking 使用工程配置的淡变时长。
- `VideoNode` 是可选择、删除、拖拽、缩放和设置层级的原生节点。它引用登记过的视频素材，并公开适配方式、自动播放、循环、静音、音量、播放速度、控制条、表面点击切换播放、起止时间、海报帧和播放时如何处理背景音乐等属性；视频事件和控制动作可进入声明式交互规则。视频表面点击应保留给播放控制，编辑器不再为视频提供“连接到状态”快捷入口。需要切换状态或场景时，优先在专业模式使用视频开始/暂停/结束/时间点规则，或在视频上方放置独立按钮/透明图形热点。历史 `node.click` 规则只有在视频内置点击播放和原生 controls 都关闭时才可命中；启用任一项会产生冲突诊断。循环视频依赖 `video.ended` 的规则通常不可达，也会收到诊断提示。
- 新工程默认使用 `playback.controls: 'canvas'`，并在 `globalLayer` 中放置一个可编辑的 `TeacherControllerNode`。控制器可编辑 1–12 个按钮的稳定 ID、文案、显隐、顺序和结构化动作；默认包含“场景目录”，运行时点击后展开全部场景，选择后调用 `goToScene(sceneId)` 并进入目标初始状态，不提供状态选择。上一/下一、重播、重开、静音和全屏仍是标准动作；固定 `scene.go` 只作为高级动作保留给确需固定目标的按钮。
- 场景目录的展开、滚动、当前项高亮和焦点只是控制器临时 UI 状态，不写入工程、命名状态或 `courseState`；点击外部、Esc、选择场景、折叠、导航或销毁时关闭。
- 控制器可设置 `collapsible` 与 `defaultCollapsed`。运行时折叠/展开是播放器临时状态，不写回工程；全局实例普通翻页和场景重播时保持当前折叠状态，重开课程时重建并恢复 `defaultCollapsed`。成品控制完全在画布内，不依赖播放器外壳导航栏；只有策划明确要求完全无控制器时才使用 `none`。

## 6. 所有人工可见文字必须可编辑

这是 Project V8 工程的强制要求，不是建议。

### 6.1 登记位置

- 原生文本：放在 `TextNode.text`；
- 场景/全局运行时文字：放在 `RuntimeDocument.content.values`；
- V3/V4 组件文字：放在 `defaultProps.content`、变体/预设的 `props.content` 或组件实例 `props.content`；
- 动态数值可由程序计算，但其人工模板必须登记，例如 `得分：{score}`、`剩余 {seconds} 秒`。

```json
{
  "content": {
    "values": {
      "title": "观察光合作用",
      "retryLabel": "再试一次",
      "scoreTemplate": "得分：{score}"
    },
    "metadata": {
      "title": { "label": "互动标题", "maxLength": 80 },
      "retryLabel": { "label": "重试按钮" },
      "scoreTemplate": { "label": "得分格式" }
    }
  }
}
```

运行时必须通过 `ctx.content.get('title')` 取文字，不能在 `source` 中另写一份最终显示文案。V3/V4 组件必须从 `ctx.props.content` 取文字；编辑器会递归发现其中所有字符串，即使 manifest 没有逐项声明 `editor.properties`。

### 6.2 什么不必登记

- 实时计算的分数、倒计时数值、坐标和随机结果；
- 不会显示给人的内部 ID、事件名、状态键和调试信息；
- Logo、照片原有文字和明确不可拆分的艺术字素材。此类例外必须在交付说明中列出。

普通标题、按钮、题干、选项、反馈、标签和提示不得烘焙进图片。静态后备画面若包含文字，应由同一内容表生成，不得形成第二套不可编辑文案。

### 6.3 验收方法

对每一种可达状态逐屏检查：初始、悬停、成功、失败、重试、禁用、多步骤页面、分支、全局 HUD 和错误提示。静态扫描无法可靠识别 Canvas/WebGL 像素中的所有文字，必须结合内容清单和真实播放验收。

### 6.4 组件画布文字的显式协议

属性栏编辑 `props.content` 是强制基线；画布双击是组件可选增强，宿主不得根据 DOM 文本或 Canvas 像素猜测 Props。

- DOM 组件把 `data-courseware-edit-key="content.title"` 标在真实文字元素上；可选补充 `data-courseware-edit-label` 与 `data-courseware-edit-multiline="true"`；
- Phaser/hybrid 组件在 `ctx.editor` 存在时调用 `registerTextRegion({ key, getBounds })`，`getBounds()` 返回组件本地坐标；登记函数返回注销函数；
- `ctx.editor` 是隔离 authoring Player 在编辑状态可能提供的可选兼容扩展，兼容上下文类型 V1–V4 都必须判空；当前位置试运行、整课预览、普通 preview/capture 和成品 Player 不提供；
- `key` 必须对应已公开的 `text` / `textarea` 字段或有效 `props.content` 字符串。V1 通常没有公开字段，因此仍按整体组件编辑；
- 未登记区域、旧组件和试运行模式继续整体选择或通过属性栏编辑，不得因未实现协议而报错；
- 状态覆盖中的修改必须写到当前状态，组件在 `updateProps()` 中即时刷新。

### 6.5 原生文字、字体与透明度

AI 直接生成 `TextNode` 时必须使用当前 Project V8 字段语义，不能照搬旧界面名称：

- 新文本的 `style.writingMode` 使用 `horizontal`、`vertical-rl` 或 `vertical-lr`；旧值 `vertical` 只作为载入迁移输入并映射为 `vertical-rl`，新工程不得继续生成；
- 横排自动尺寸以宽度为作者可调轴并自动增高；竖排自动尺寸以高度为作者可调轴并自动增宽，因此竖排文本框可以纵向拉长；
- `style.fontFamily` 保存真实 CSS family 或回退字体串。编辑器字体选择器会显示中文名称和本机可用状态，但成品不会自动携带系统字体；跨设备交付必须选择目标环境可用字体或明确提供授权字体方案；
- 工程内部 `node.opacity`、填充和边框透明相关字段继续保存**不透明度**（`1` 完全不透明、`0` 完全透明）；编辑器所有标为“透明度”的控件按用户语义显示（`0%` 完全不透明、`100%` 完全透明）。生成工程时不得把界面百分比直接写入内部字段；
- 左起竖排在 PPTX 中会按稳定画面转为图片，避免 Office 原生东亚竖排颠倒列序；需要对象级可编辑文字时应说明此终端差异。

### 6.6 公式、符号与专业排版

教学内容规格中登记的公式、符号、单位、图表和几何标注必须使用稳定 Formula ID 或等价内容引用，并在实现追踪记录中说明承载方式和证据。公式视觉不能由字体捷径代替语义结构：

- 展示分数不得使用 `½`、`⅓`、`¼` 等斜线 Unicode 分数字符，也不得用普通 `1/2` 文本冒充竖式分数；应使用可追踪的分子、分数线和分母结构；
- 上标、下标、根式、向量、分段函数、矩阵、单位和变量样式必须按学科语义确定，不得只凭普通字符串近似；
- DOM 公式优先使用固定渲染器绑定结构化内容键，不能把可编辑字符串直接当作不受控 HTML 注入；原生画布可使用成组文字与图形表达，但必须登记编辑边界；
- 运行时或组件静态后备必须由同一公式内容源生成，不能保存第二套易失真的公式文案；
- 源码扫描只能发现已知危险写法。HTML、PDF 和 PPTX 都必须检查实际基线、分数线、字号、裁切和清晰度，并保留截图证据。

## 7. 场景/全局运行时

运行时文档使用当前公开协议：

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

`source` 必须同步注册一个定义：

```js
CoursewareRuntime.define({
  runtimeApiVersion: 2,
  create(ctx) {
    const title = ctx.content.get('title')
    // 稳定视觉由已创作状态承载；运行时负责逻辑和切换。
    ctx.presentation.transitionTo('state_question', {
      duration: 240,
      ease: 'Sine.easeInOut'
    })
    return {
      destroy() {
        // 解除外部监听、停止音频和释放自行持有的资源。
      }
    }
  }
})
```

### 7.1 Runtime Authoring V1：显式画布目标

Runtime Authoring 是独立于 `runtimeApiVersion: 1 | 2` 的可选扩展。需要让场景或全局运行时的文字、图片在对应画布作用域中原位修改时，定义显式声明 `authoringApiVersion: 1`，并仅在 `ctx.authoring` 存在时登记目标：

```js
CoursewareRuntime.define({
  runtimeApiVersion: 2,
  authoringApiVersion: 1,
  create(ctx) {
    const removeTitleTarget = ctx.authoring?.register({
      kind: 'text',
      key: 'title',
      label: '实验标题',
      multiline: false,
      maxLength: 80,
      layer: 'overlay',
      getBounds: () => ({ x: 72, y: 48, width: 420, height: 58 })
    })

    const removePhotoTarget = ctx.authoring?.register({
      kind: 'asset',
      key: 'apparatusImage',
      label: '实验装置图',
      getBounds: () => ({ x: 80, y: 132, width: 560, height: 410 })
    })

    return {
      destroy() {
        removeTitleTarget?.()
        removePhotoTarget?.()
      }
    }
  }
})
```

DOM / hybrid 运行时也可在真实元素上使用 `data-courseware-edit-key="title"` 或 `data-courseware-asset-key="apparatusImage"`；可选补充 `data-courseware-edit-label` 和 `data-courseware-edit-multiline`。规则如下：

- text key 必须已存在于 `RuntimeDocument.content.values`，asset key 必须已存在于 `RuntimeDocument.assets`；未知键被忽略，运行时代码不能借目标直接写 Project；
- `getBounds()` 返回当前运行时逻辑坐标中的有限、正宽高矩形，宿主统一归一化到 1280×720；布局变化后可调用 `ctx.authoring.invalidate()`；
- `ctx.authoring` 只在隔离 authoring Player 且定义显式选择 V1 时存在；试运行、整课预览、捕获和成品必须在该字段缺失时正常工作；
- 修改 `scene.runtime` 的 `content.values` 或 `assets` 由该场景基础与全部命名状态共享，不写入某个 `presentation` 状态覆盖；修改 `globalRuntime` 则由整课共享。界面必须按作用域明确提示；
- 未声明 `authoringApiVersion`、未登记目标或来自旧协议的运行时仍由 Player 完整显示，只继续通过属性/开发面板编辑，不得生成不可见占位或尝试从像素反推数据。

Runtime Authoring V1 是确定性的人工编辑协议，不是 Blueprint 或 AI patch。未来 AI 只能通过新的版本化边界接入，1.x 不把模型调用塞进 `ctx.authoring`。

### 7.2 运行时能力与开发入口

API 2 的 `renderMode` 是严格能力声明：`phaser` 只获得 Phaser 根与节点句柄，`dom` 只获得 Shadow DOM 根，`hybrid` 才同时获得两者。API 1 旧运行时仍同时取得两组能力。修改字段不会自动把 DOM、Phaser、Canvas、WebGL 或 Three.js 源码转换为另一种实现；必须同步修改代码并重新验收。

单个运行时源码不得超过 2 MiB；不能使用 `import`、`export` 或 `require`，依赖必须预打包为普通浏览器 JavaScript。异步素材用 `capture.waitUntil()` 登记；Canvas/WebGL 在 `prepareCapture()` 中主动渲染确定帧。完整上下文与示例见 [自由运行时开发指南](RUNTIME_V3_AUTHORING.md)。

专业“开发”面板允许对当前场景或全局 `RuntimeDocument.source` 创建最小模板、校验并应用修改；进入该面板时右侧栏会加宽，四类任务通过工作区标签切换，代码区不自动折行。应用进入正常撤销历史，源码只在隔离 Player 内执行：编辑状态使用冻结的 authoring 宿主，试运行/预览使用 playback 宿主。面板还可受控修改所选对象 JSON 和当前规则 JSON：对象 ID/类型及规则 ID 不可更改，应用前必须通过 Project/Interaction Schema。此入口不自动生成实现，也不因更改 `renderMode` 改写源码。

## 8. 跨场景动作、事件和状态

### 8.1 宿主动作

运行时和组件都可调用：

- `goToScene(sceneId, targetStateId?)`：按稳定场景 ID 跳转，可选原子进入目标场景的指定命名状态；省略或目标状态无效时进入目标场景 `initialStateId`；
- `nextScene()`、`previousScene()`；
- `replayScene()`：仅重建当前场景作用域；
- `restartCourse()`：重建全局和场景作用域并清空课程状态。

动作返回同步 `boolean`。不得用场景序号替代稳定 ID，也不得在导出 HTML 外再写一套导航规则。

带 `targetStateId` 的跳转会在目标节点、组件和运行时创建前物化指定状态，避免先闪现初始状态再二次切换；目标等于当前场景时只切换该场景状态。若导航守卫把请求重定向到另一个场景，原请求的目标状态不会被套用到重定向场景，而是使用重定向场景自己的初始状态。

### 8.2 事件总线

场景/全局运行时可以通过 `ctx.events` 订阅和发布课程事件。播放器提供 `course:start`、`course:restart`、`course:destroy`、`scene:before-leave`、`scene:leave`、`scene:before-enter`、`scene:enter`、`presentation:change`、`component:event`、`runtime:event`、`state:change` 和 `navigation:blocked`。

运行时调用 `ctx.emit(eventName, payload)` 时，宿主会附加 `scope` 与场景 ID 并包装为 `runtime:event`。优先让运行时只做复杂判定并发出语义事件，再由专业模式右侧“互动与动画”按 `scene/global` 来源和事件名执行可编辑的状态、声音、视频或导航动作；不要在运行时里重复硬编码这些稳定结果。组件同样应优先 `emit()` 语义事件，再让 `component.event` 规则承担可编辑结果映射。

当前 Player 继续向 V3 组件提供原有顶层 Phaser 上下文和向后兼容的可选 `ctx.scope`、`ctx.events`、`ctx.courseState`、`ctx.presentation`。V4 则按 manifest `renderMode` 只暴露 `ctx.dom` 和/或 `ctx.phaser`，并增加 `ctx.capture`。全局组件可订阅 `scene:enter` 更新 HUD，并可与运行时共享课程状态；场景组件可直接切换当前场景的命名状态。通过 `ctx.events.on()` 建立的订阅归属组件生命周期，销毁时由宿主自动解除。可选字段仍须判空。`ctx.emit(eventName, payload)` 会被宿主包装为 `component:event`，适合上报语义化组件事件。

### 8.3 状态

- `ctx.presentation.current()` / `states()`：读取当前场景的命名视觉状态；
- `ctx.presentation.setState(id)`：立即切换稳定状态；
- `ctx.presentation.transitionTo(id, { duration, ease })`：以 Phaser Tween 过渡几何、旋转和透明度，同时原位更新内容与组件参数；
- `ctx.localState`：属于当前运行时实例；场景重播、离开或重进时清空；
- `ctx.courseState`：普通场景跳转和重播时保留；`restartCourse()` 时清空；
- 只存纯数据，不存 Phaser 对象、DOM 节点、函数、平台对象或循环引用。

跨场景一次性规则优先放在 `globalRuntime`，由它监听事件、读写 `courseState` 和注册同步导航守卫。

## 9. 固定 DOM / Canvas 平面

当前 Player 使用固定粗粒度平面，不把 DOM 与 Phaser 对象合并成可任意交错的显示列表：

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

API 2 运行时只可使用 `renderMode` 声明的能力：

- `phaser` / `hybrid`：`ctx.phaser.underlay`、`ctx.phaser.overlay`；`ctx.phaser.root` 是 overlay 的兼容别名；
- `dom` / `hybrid`：`ctx.dom.underlay`、`ctx.dom.overlay`；`ctx.dom.root` 和 `ctx.domRoot` 是 overlay 的兼容别名；
- DOM 根按 1280×720 设计坐标随播放器缩放，每个运行时由 Shadow Root 隔离样式；
- `ctx.nodes` 只在 `phaser` / `hybrid` 中存在。场景运行时优先在 `RuntimeDocument.nodeBindings` 中声明“语义绑定键 → 节点 ID”，再用 `ctx.nodes.get(bindingKey)` 取得受控节点句柄。复制场景时编辑器会重写绑定中的节点 ID，源码无需改动；直接传节点 ID 仍兼容旧内容。运行时可为句柄绑定输入或 Tween，但不得销毁宿主管理的节点。

选择 Phaser 还是 DOM 取决于效果：粒子、碰撞、拖拽和程序视觉偏 Phaser；复杂排版、表格、表单和 HUD 偏 DOM；确需协作时使用 hybrid。运行时 DOM underlay 永远位于整个 Canvas 下，V4 DOM/hybrid 组件的 DOM 部分整体位于 Canvas 上，运行时 DOM overlay 再位于其上；要求逐对象精确交错时应使用同一渲染器，或拆成明确前后景。不要因为某种内容无法被编辑器拆解而删除效果。

需要地球、太阳系、立体几何等真 3D 时，可在具体运行时或 V4 组件中把 Three.js 与 loader 预打包，并把 WebGL Canvas 挂到 DOM 能力根。编辑器核心和 Player 不导入、不全局提供 Three.js；没有 3D 的课件不承担其代码与资源成本。3D 模型默认使用离线 GLB：较大或可复用模型放入组件包 manifest asset，一次性小模型只能在 Runtime 2 MiB 上限内随构建产物嵌入。当前 Project V8 没有一等 `model` 素材类型，不得把 GLB 伪装成图片；需要教师从工程“媒体”管理中独立替换模型时，必须先扩展 Schema、归档、媒体管理和导出链路。实现必须支持 resize、显隐、suspend/resume、`prepareCapture()` 和完整 GPU 资源释放。

## 10. 全局层、场景组件和全局组件

`globalLayer` 类似 PPT 母版，但比母版多一层按场景显隐能力：它可以直接容纳文字、图片、图形、视频、教师控制器和组件。所有全局元素都可在编辑器中选择、移动、缩放、旋转、排序，并设置 `underlay/overlay` 与 `all/include/exclude`；原生文字仍可双击编辑，图片和视频仍可替换，图形与控制器仍可修改样式和公开属性。不要为了进入全局层而把普通元素伪装成组件。

`globalLayer` 是母版式可编辑元素层，不是“只接收全局组件”的专用区域。跨场景但无需编辑的课程级 HTML/Canvas 效果或互动规则仍可放在 `globalRuntime`；是否进入全局层，应由“教师是否需要直接选中和修改”决定，而不是由它是否跨场景决定。

需要由全局元素在多个场景响应点击或事件时，规则写入 `globalInteractions`，并用 `scene.in` 限定场景；不要给每个场景复制一份等价规则。素材也应按稳定 ID 复用：工程中已有图片/视频可从媒体库重复添加为新节点，不要为同一二进制内容反复生成素材记录。

新组件使用：

```json
{
  "schemaVersion": 4,
  "runtimeApiVersion": 4,
  "renderMode": "dom",
  "supportedScopes": ["scene", "global"]
}
```

- `supportedScopes` 必须明确声明；只有包含 `global` 的 V3/V4 组件能作为组件进入全局层；原生文字、图片和图形不受组件协议限制；
- V4 `renderMode` 必须准确声明 `dom`、`phaser` 或 `hybrid`，宿主只提供声明能力；改字段不会转换组件源码；
- V1–V3 组件属于断代清理中的历史实现，不能用于新课件；正式版只接受 V4；
- 全局组件普通翻页时保留实例，只更新显示和输入；隐藏不等于销毁；
- `visibility.mode` 可为 `all`、`include` 或 `exclude`，`sceneIds` 使用稳定 ID；
- 全局组件可调用宿主动作、订阅课程事件、共享 `courseState`，并通过 `emit()` 上报语义化事件；复杂课程规则和导航守卫仍优先放在 `globalRuntime`；
- 所有 V3/V4 组件可见文案必须位于 `props.content`，其他可编辑参数按需在 `editor.properties` 声明。
- 需要画布双击文字编辑时，DOM 使用 `data-courseware-edit-key`，Phaser/hybrid 使用可选、仅编辑态的 `ctx.editor.registerTextRegion()`；该能力是兼容扩展而不是 Component API 4 的运行必需字段，未登记时继续使用属性栏。
- 可视组件应在 manifest 中提供离线 `thumbnail`。编辑器会在场景缩略图中绘制它；缺失或解码失败时虽然会显示带名称的后备框，但后备框不能替代正式视觉验收。
- 组件包是一等工程资源。替换/升级只接受同 ID 包并必须覆盖现有实例所在作用域；失败时保留旧包和所有实例。只有场景/全局实例数均为 0 的包才能删除。单个组件异常必须隔离并进入诊断，不能拖垮整页。
- 专业“开发”面板中的导入第三方组件默认只读。需要修改时先确认许可证允许，再为所选实例创建新 ID/版本的工程内可编辑副本，原包保留；副本 manifest/runtime 修改仍须通过注册、作用域、素材引用和 Schema 校验，并进入撤销历史。只读不等于源码隐藏。

组件协议详见 [组件开发指南](COMPONENT_AUTHORING.md)。

## 11. 生命周期、重播和重开

| 作用域 | 普通场景切换 | `replayScene()` | `restartCourse()` |
| --- | --- | --- | --- |
| 全局运行时 | 保留 | 保留 | 销毁并重建 |
| 全局原生节点 | 保留，仅更新可见性 | 保留 | 销毁并重建 |
| 全局组件 | 保留，仅更新可见性 | 保留 | 销毁并重建 |
| 场景运行时 | 销毁并随目标场景创建 | 销毁并重建当前场景 | 销毁并随首场景创建 |
| 场景组件/原生节点 | 销毁并随目标场景创建 | 销毁并重建当前场景 | 销毁并随首场景创建 |

因此：

- “重播本页”不能被实现成“重开课件”；
- 场景局部尝试次数放 `localState`；跨页进度放 `courseState`；
- 所有外部事件、DOM 监听、Timer、Tween、音频和自行持有引用必须在 `destroy()` 中清理；
- API 2/V4 的 `setVisible()` 只改变可见性和输入，`suspend()` / `resume()` 暂停与恢复昂贵更新，不能当作销毁；`resize()` 必须同步 DOM/Canvas/WebGL 尺寸；
- 异步字体、图片、GLB 和纹理通过 `capture.waitUntil()` 登记；宿主先排空既有任务，再由 `prepareCapture()` 主动渲染 Canvas/WebGL 确定帧，hook 内任务须在异步最终绘制后 resolve，宿主会在每个实例准备完成后立即复制该帧，以兼容 `preserveDrawingBuffer: false`；Three.js 组件还必须释放 geometry、material、texture、render target 与 renderer；
- 生命周期任一步骤失败都必须保留为该实例的可诊断失败，后续捕获不能吞错后输出空白。静态导出按最小单元回退：PDF 在 Player 已启动后仅回退失败场景页；PPTX 仅回退失败的组件实例、运行时条目或图层，已成功页面/条目不得因后续失败被整批清空。捕获宿主本身无法初始化时才允许批次级后备，并必须给出明确警告；
- 全局组件不要在普通翻页时自行重置；需要响应场景变化时可直接订阅 `scene:enter`，需要复杂协调时再与全局运行时共享状态和事件。
- 全局教师控制器的运行时折叠状态与全局实例同寿命：普通翻页和场景重播保持，课程重开按 `defaultCollapsed` 重置；
- 场景重播会取消场景作用域内未完成的动画规则并按 `playbackInitialVisibility` 恢复；离开场景会销毁场景动画。全局动画与全局实例同寿命，普通翻页保持瞬态结果，课程重开时取消并恢复初始可见性。

## 12. 可信代码边界

运行时和 `.h5component` 都是可信本地 JavaScript，不是普通素材。

- 编辑器 React 主窗口不直接执行场景/全局运行时；中央统一画布在无同源权限的 sandbox iframe 中执行隔离 Player。编辑状态使用冻结互动、媒体、导航和课程状态的 authoring 宿主，当前位置试运行使用完整 playback 宿主，静态捕获使用 capture 宿主；
- 中央 Player 用父窗口临时 Blob URL 承载预览文档，并把工程与组件素材作为可转移二进制缓冲区交给 sandbox，由 iframe 在自身不透明源内创建 Blob URL；主进程只对编辑器主窗口的同源派生 Blob 子框架放行，主框架、独立预览窗口及外部/data/file 导航仍被拒绝。编辑器用当前会话令牌过滤被替换实例的延迟消息，切换、重试、关闭或失败时分别回收文档与素材 URL；这是实例隔离、资源释放与一致性机制，不是恶意代码安全证明；
- 不允许 Node.js、Electron API、远程模块、CDN、远程 API、下载、新窗口或系统权限；
- 单 HTML 和网页包使用 CSP 限制网络；所有依赖和素材必须离线；
- 格式校验、CSP 和 Electron 隔离不是针对恶意 JavaScript 的绝对安全沙箱；
- 专业开发面板的“受控”指应用范围和校验，不表示源码加密。`.h5lesson` 是完整作者态；PublishedLesson 只是不主动交付作者态结构，浏览器中的运行时代码和组件代码仍可恢复和分析；
- 只打开和分发可信来源工程，交付时说明工程包含可执行内容。

## 13. 规模建议不是正常创作限制

- 推荐每个工程不超过 200 个场景；防御性上限为 1000；
- 推荐每个场景不超过 250 个节点；防御性上限为 1000；
- 统一全局层受 1000 个元素的防御性保护；
- 200/250 是性能和维护建议，1000/1000 是损坏与滥用保护，不是鼓励值，也不是日常创作目标；
- 几小时的大课即使未达到上限，也宜按章节拆成多个工程，方便审核、版本管理和故障隔离。

复杂视觉不一定要拆成大量节点；可以由职责明确的场景运行时或组件一次完成。

## 14. 四种导出策略

| 格式 | 互动 | 资源方式 | Project V8 行为 | 推荐用途 |
| --- | --- | --- | --- | --- |
| 单 HTML | 保留 | 全部内联 | 使用同一 Player Runtime；事件驱动入场/退场、场景/全局交互、声音、视频、场景目录控制器、运行时和组件正常执行 | 小中型、单文件传递 |
| 网页包 | 保留 | ZIP 内分离播放器、数据和素材 | 运行语义与单 HTML 相同；音视频资源改为相对 URL | 大型课件、含大视频或长期部署 |
| PDF | 不保留 | 捕获 Player 合成画面 | 入场/退场与声音不输出；按作者稳定可见性显示节点；视频使用海报画面；默认省略仅交付用教师控制器 | 审阅、打印、归档 |
| PPTX | 不保留 | 原生节点对象 + 透明静态快照/后备 | 入场/退场与声音不输出；按作者稳定可见性显示节点；视频以文件名占位；控制器仅在允许静态导出时保留 | 素材提取和二次排版 |

单 HTML 会把音视频转为内联数据，预计超过 50 MiB 时会警告并建议网页包；超过 256 MiB 时必须改用网页包。包含大视频时应优先交付网页包，以避免浏览器加载和内存压力。网页包必须完整解压和整体移动，不能只发送入口 HTML。

单 HTML 与网页包在导出边界把 Project V8 单向编译为 [PublishedLesson V1](PUBLISHED_LESSON_V1.md)：保留 Player 执行所需场景、状态、互动、媒体、运行时和组件能力，但不主动交付工程时间、历史、编辑器字段、组件 manifest 或独立原始 `runtime.js`。网页包只保存一份 `course-data.js` 发布数据。可执行逻辑仍必须到达浏览器，因此该裁剪不构成加密或 DRM，成品也不得作为 `.h5lesson` 重新导入。

静态导出只保留稳定视觉，不执行元素入场/退场、不应用 `playbackInitialVisibility: hidden`，也不尝试模拟播放中的媒体时间线：PDF 使用视频海报图（无法取得时显示带播放标记的黑色后备）；PPTX 使用标明视频文件名的占位对象。声音不会嵌入 PDF/PPTX。`TeacherControllerNode.includeInStaticExports` 默认为 `false`，只有静态文档确实需要展示该控制条时才设为 `true`；即使保留控制器，也不会展开场景目录。

编辑器场景缩略图也会按层直接合成已启用场景/全局运行时登记的 `staticFallback`，但绝不执行运行时源码；未登记后备时显示“运行时”提示角标。该缩略图用途与下述 PPTX 的“先捕获、失败后回退”流程不同。

PDF 使用同一隐藏 Player 逐场景捕获。Player 已成功初始化后，单页的运行时、组件或合成准备失败只让该页转入静态渲染与诊断后备，其余页继续捕获；若 Player 宿主本身无法启动，才对全部页面使用静态后备并显示警告。

PPTX 中：

- 正常情况下先用隐藏 Player 捕获全局/场景运行时的实际 underlay、overlay 透明快照，原生节点仍可编辑；
- 组件按实例依次使用隔离 Player 捕获，运行时按场景/全局条目和 underlay/overlay 图层记录结果；某一实例或条目失败时只回退该项，并保留此前已成功的快照；
- 全局层中的原生文字、图片和图形会按场景可见范围复制到对应幻灯片，并继续作为独立可编辑对象；全局组件仍静态化为独立图片；
- `staticFallback` 是实际捕获失败或未产生可见结果时的作者后备；
- `coverage: runtime-layer` 只透明叠加运行时后备图，`coverage: full-scene` 会在该运行时自身层级清除下方合成后用整页后备铺满画布；
- 实际捕获和后备画面都不可用时必须报告并显示占位，不能静默丢失运行时视觉；
- 后备画面中的文案应由 `content.values` 或 `props.content` 派生。

### 14.1 工程检查、持久化与编辑视图

- 打开、保存、恢复副本压缩、组件包导入和网页包生成使用异步归档路径。自动恢复在编辑空闲约 1.8 秒后启动、单通道运行、取消过期压缩并跳过重复修订；AI 生成的大工程也不得假定保存是瞬时操作。
- 手动保存以启动保存时的工程/素材/组件快照为准；若保存期间继续编辑，新修改必须继续标记为未保存。关闭窗口的三种结果是“保存 / 不保存 / 取消”，不得用无保存选项的二元确认替代。
- “工程检查”是交付前的结构化门禁：检查素材、场景/状态/节点引用、`scene.interactions`、`globalInteractions`、控制器、运行时、组件包和静态兜底。错误阻断所有成品导出；提醒和建议不阻断。每项应能定位到可处理位置。
- “导出诊断报告”导出本地异常日志与版本/平台信息，不包含课件素材；它用于崩溃、预览或组件问题排查，不等于工程内容检查。
- 编辑画布支持 50%–200% 缩放、Ctrl/Command+滚轮、空格或鼠标中键平移与一键复位。视图变换不修改节点坐标，也不进入工程或成品；验收截图必须区分编辑视图与实际 1280×720 Player 结果。
- 编辑状态与当前位置试运行必须保持同一 1280×720 Stage 边界、Player 粗粒度平面和状态物化语义；透明 Phaser 编辑层只能处理原生节点命中与几何，不得重新绘制一套视觉。

## 15. 实现阶段的强制工作流

1. 使用 `build-project-v7-courseware` 的交接校验器核对 `implementation-ready`：批准的教学设计、教学内容规格、教学呈现脚本、视觉方向、决策记录、权威内容、素材要求、可编辑要求、交付格式和验收证据必须齐全，文件路径、版本和 SHA-256 必须与批准记录一致。缺少必需项、哈希失效或仍有阻断项时返回编排层，不得自行补成最终方案。
2. 在课例档案的 `06-traceability.json` 中，把教学呈现脚本逐项双向映射成场景/状态、操作、反馈、分支、可见文案、公式、结束状态和验收证据；每个学生可见实现对象必须能反查脚本依据或记录非教学排除理由。追踪记录属于外部创作制品，不得为此向 Project V8 伪造字段。
3. 先确定达到已批准成品效果的最短充分方案，再选择八种承载方式；逐项区分稳定视觉状态、声明式交互与瞬态运行效果，并为每个运行时和组件记录充分理由。仅“代码复杂”“视觉重要”或“以后可能复用”不能证明需要组件化。
4. 建立“人工可见文字与公式清单”，为每项指定 `TextNode.text`、运行时 `content.values`、组件 `props.content` 或结构化公式绑定，并标出权威文案、Formula ID、专业排版和允许轻改的内容。
5. 为跨场景行为定义稳定场景 ID、事件、`courseState` 键和重播/重开语义。
6. 为每个场景列出基础、初始、缩略图及所有可达稳定状态；把差异写成元素覆盖，而不是运行时重建画面，并与呈现脚本中的静态审阅帧对应。
7. 优先把场景节点和全局元素点击、状态/场景跳转、声音和视频控制写成 `scene.interactions` / `globalInteractions`；为全局规则设置准确的 `scene.in`；再为每个确有必要的运行时和组件选择最小 `renderMode`，定义创建、更新、resize、显隐、暂停/恢复、捕获准备和销毁责任。
8. 常见的单元素入场优先使用简洁模式“出现动画”；更复杂、可枚举的入场/退场写成专业规则动作，明确触发事件、目标元素、顺序/并行关系、局部延迟和完成后的下一步；只有连续路径、关键帧或算法运动进入组件/运行时。
9. 在 V8 实现 Skill 恢复后直接生成 Project V8、嵌入组件、素材和可复现脚本；确认新工程含 `globalLayer`、`globalInteractions`、`interactions`、`media.audio`、`playback.presenter`，且不产出历史结构。
10. 先完成高风险核心互动或代表性场景并与批准脚本、关键帧/样片对照；实际结果未达到 `art candidate` 或尚未取得要求的人类视觉/互动批准时停止批量扩展。需要改变教学内容规格、呈现脚本、授权、成本、性能或兼容导出预期时返回编排层请求批准。
11. 在统一画布中逐个切换基础和命名状态，实际修改原生文字、组件显式文字目标、运行时显式 text/asset 目标、动画与几何；确认运行时内容提示“所有状态共享”，保存、重开，再用“当前位置试运行”从当前场景/状态核查局部行为，用“整课预览”从课程起点核查完整流程，并检查网页导出同步。
12. 为可视组件提供缩略图，并验证组件包使用计数、安全替换/删除、场景缩略图状态、组件缩略图/名称后备、背景、全局元素、固定 DOM/Canvas 平面、持久化和静态导出结果；Three.js/GLB 如有使用，还要验证离线加载、低配设备、显存释放与确定帧捕获。
13. 运行工程检查、脚本追踪校验和公式危险写法扫描并修复全部错误，再真实操作所有核心互动；对公式、图表和专业排版实际检查 HTML、PDF 与 PPTX 画面。按编排层要求提交截图、录屏、兼容导出和差异说明，分别报告管线状态和成品效果状态。
14. 首次完整生成后先冻结制品路径与哈希并评分，不得先通过人工事后补题或改脚本再把结果当作工作流首轮成功。未经批准人确认不得标记 `accepted`。

不得只写“有互动”“有动画”或“支持编辑”。必须给出可执行的验收路径；不得把实现阶段重新变成教学设计阶段，也不得用工程文件存在代替结果验收。

## 16. 不允许的降级

以下均视为未完成：

- 交接缺少完整题面、答案、推理、难度或揭示边界时，从旧聊天、压缩摘要、既有实现或模板自行补写；
- 因编辑器没有面板而把复杂互动改成静态页、普通翻页或统一选择题；
- 为了组件化而删除一次性高质量场景效果；
- 删除状态变化、解锁循环、分支、声音或关键动效；
- 把题目、答错、答对、完成等稳定整页视觉全部写进自由运行时，使编辑画布无法选择修改、缩略图只能依赖静态后备而不能呈现真实可编辑状态；
- 在运行时中复制一套与 `SceneDocument.nodes` 无关的稳定 UI，再声称它“可通过源码修改”；
- 只修改 `renderMode` 或协议版本号，却不迁移源码访问路径、生命周期和捕获实现，并声称已经完成渲染器转换；
- 为了一处 3D 效果把 Three.js 变成编辑器核心依赖，或依赖宿主全局 `THREE`、CDN、在线 loader/模型；
- 把人工可见文字只硬编码在运行时/组件源码中；
- 用 `½`、`⅓` 等斜线 Unicode 分数字符或普通 `1/2` 文本冒充应当竖式显示的分数；
- 组件有多页或多状态，却只提供第一页文字编辑入口；
- 只证明文件能生成和打开，不真实验证互动与导出结果；
- 把管线测试通过称作成品效果已验收；
- 未说明缺失项、静态化差异或安全边界便宣布完成。

## 17. 交付验收

### 管线状态

- Project V8 Schema、素材引用、场景/全局交互规则、动画动作步骤、Presenter 和组件包校验通过；新工程含 `globalLayer`、`globalInteractions`、每场景 `interactions`、`media.audio` 和 `playback.presenter`；Project V1–V7 均明确拒绝且不会产生半加载工程；
- 简洁/专业模式切换不改变工程；简洁右栏为“元素 / 图层 / 属性”，专业追加“互动与动画 / 开发”；“元素”只有一个搜索/分类入口；简洁出现动画原子维护规则与初始隐藏、可整体撤销，并在已有重叠专业规则时拒绝覆盖；
- `.h5lesson` 可异步打开、保存、重新打开；旧 Project V1–V7 和未来版本使用不同的可理解错误；保存期间的新修改仍保持未保存，自动恢复去重且可取消过期压缩，关闭窗口三选项正确；
- Runtime API 2 与组件 API 4 的 `renderMode` 能力隔离、生命周期、粗粒度 DOM/Canvas 合成和确定性捕获通过；Runtime API 1 与组件 API 1–3 在导入或解析边界得到明确“不受支持”诊断，主程序中不再保留其适配、样例和专属测试；
- 场景基础/状态覆盖、原生文字、运行时内容表和 V3/V4 `props.content` 修改后能持久化；组件 DOM `data-courseware-edit-key` 与 `ctx.editor.registerTextRegion()` 只在 authoring 编辑态命中，并正确写入基础/状态 Props；
- Runtime Authoring V1 的 registered/DOM text 与 asset 目标只接受已登记键；场景目标修改后由该场景全部状态共享，全局目标由整课共享；未声明目标的旧运行时仍可见并可从属性面板修改；
- 场景缩略图使用指定状态并显示背景、原生元素和组件；编辑状态与当前位置试运行使用同一 1280×720 Player 视觉与状态物化语义，透明 Phaser 层不造成位置偏差；authoring 冻结互动、媒体、导航和课程状态；当前位置试运行从当前场景/状态启动且失败可见、可重试，Blob 资源会释放；整课预览从课程起点启动；
- 预览、单 HTML 和网页包使用同一运行语义，事件驱动入场/退场、顺序/并行等待、动画完成触发、声音、视频和结构化控制器可离线播放；控制器默认场景目录列出全部场景且只进入目标初始状态，固定 `scene.go`、1–12 按钮和折叠保持正确；
- 组件包使用统计、安全删除、同 ID 替换/升级与失败隔离通过；已有图片/视频可从“元素”→“媒体”重复添加且继续复用同一 Asset ID；编辑画布缩放/平移不改工程坐标；
- 专业开发面板可校验并撤销场景/全局 runtime source、对象/规则 JSON 修改；第三方组件不可直接改写，工程内可编辑副本使用新 ID/版本且保留原包；
- 工程检查可定位问题、错误阻断导出、提醒不阻断，诊断报告可导出且不包含素材内容；
- PDF/PPTX 对运行时、声音、视频和教师控制器都有明确静态化结果；
- PDF 单页失败与 PPTX 组件实例/运行时条目失败可独立回退，成功页和成功条目不会被后续错误整批覆盖；
- 五路径离线渲染基准完成 25 轮压力循环，即 100 次定制场景切换与 25 次末页重播；运行时/组件挂载、Canvas/WebGL、RAF、控制台错误和外部请求无累积或异常；
- 类型检查、单元/集成测试和关键端到端流程通过。

### 结果状态

- 每项获批教学内容和呈现要求都有明确场景、操作、反馈、结束状态和证据；脚本与学生可见实现对象可在外部追踪记录中双向核对；
- 所有可达稳定状态都能在状态条中查看；其中的人工文字、元素几何与组件公开参数有编辑入口；
- 场景互动、声音/视频映射、跨场景指定状态跳转、全局规则、统一全局层、画布控制器、全局组件、重播和重开语义符合设计；
- 视觉、动画、声音和互动没有因编辑器能力被降级；
- 列出真实未实现项、终端差异、静态导出差异和剩余风险。

## 18. 示例与边界

新课件工作流恢复后可参考《不是磁场，而是变化》及其生成脚本：它先从误概念诊断和教学证据链出发，再选择承载方式；把题面、反馈和完成画面落实为原生节点与命名状态，只把连续拖动、曲线和装置响应交给 V4 组件，并用 `component.event → presentation.set` 保持结果可查看、可修改。运行 `npm run build:induction` 重建课件，再运行 `npm run validate:induction` 核对 Project V8、组件 API 4、可编辑文字、状态可达性和离线导出。

归档标签中的 Project V7 + Runtime API 1 / 组件 API 3 示例只用于恢复历史原型，不再是当前主干的开发入口。当前 `examples/runtime-v3-complete/` 将按处置清单删除；它不是 Runtime API 2 / 组件 API 4 新上下文范本：

- 原生可编辑文字和图片；
- 直接写入 `scene.runtime` 的一次性互动；
- 使用 `events`、`courseState` 和导航守卫的 `globalRuntime`；
- 跨场景持久的 V3 全局控制组件（兼容验证）；
- 运行时 `content.values` 与组件 `props.content` 的全量文案登记；
- `.h5lesson` 和离线单 HTML 的可复现生成流程。

该示例不是把稳定整页 UI 写入运行时的授权。新课件仍必须按本文要求把题目、反馈、完成等稳定画面放入 `scene.presentation.states`。

新协议与渲染边界应同时运行 [Project V8 五路径渲染宿主过渡基准](../examples/render-host-benchmark/README.md)。当前基准仍包含一条待删除的 Component API 3 Phaser 兼容路径；完成协议断代后只保留 Runtime API 2 与 Component API 4 当前路径。自动化压力段固定执行 25 轮，共 100 次切页和 25 次重播，并核对宿主资源与外部请求没有累积。

最终原则只有六句：Project V8 JSON 是业务真相；效果第一；所有人工可见文字可编辑；简单互动优先使用可视化声明式映射；母版式通用元素和成品控制器优先使用 `globalLayer`；组件化只在高复用、参数化或独立维护真正有价值时使用。
