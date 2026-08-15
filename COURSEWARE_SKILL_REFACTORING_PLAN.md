# V8 前端原地升级为 V9：经只读审计的最终执行计划

> `PLAN_VERSION: 3.3-fast-track`
> `DATE: 2026-08-15`
> `EXECUTION_CLASS: production-system`
> `BASE_COMMIT: 3e41ec058627d38c4b9f5439b454cc72331e1485`
> `V9_DONOR_COMMIT: f77ba9e477f9cb496e3219eb58babdb4f4becf7d`
> `UI_BASE: 3e41ec0 中真实存在的 V8 App / UI / Workspace / Phaser / CSS`
> `CANONICAL_PRODUCT_PROTOCOL: Course Project V9 / Published Course V2 / Runtime API 2/3 compatibility / Component API 4`
> `ACTIVE_WAVE: W12 [V05F fast Gate recovery]`
> `ACTIVE_WAVE_OWNER: strong-coordinator`
> `MAX_PARALLEL_WRITE_CARDS: 2`
> `MAX_PARALLEL_READ_ONLY_AUDITS: 1`
> `INTEGRATION_CURSOR: V04 accepted / V05F in_progress`
> `PRIMARY_COORDINATOR: 当前根代理；GPT-5.6 Sol / xhigh，只有 Gate 与重大架构裁决临时 max`
> `ATOMIC_EXECUTOR: GPT-5.6 Terra / max`
> `ULTRA_WORKFLOW: 仅由主协调者按需用于只读审计、独立验证或已通过隔离预检的执行波`
> `PLAN_STATUS: implementation-active / fast-track`
> `CURRENT_PRODUCT_STATUS: unusable`
> `DEFAULT_REASONING: xhigh；仅 Gate、Schema/架构裁决和重大集成冲突临时 max；不常态使用 ultra`
> `STANDING_AUTHORIZATION: 主协调者可在本仓库、本目标和既有依赖内自行修订计划、白名单与实现接缝并持续推进；不再因普通架构调整逐次询问用户`

本文件是仓库根目录唯一长期开发计划。它不是把当前失败的 V9 前端改得“像 V8”，而是从真正包含成熟 V8 前端的 `3e41ec0` 出发，在原文件、原 DOM、原画布和原交互链中逐步换入 V9 数据与运行内核。

本计划由三个独立只读子审计和主协调者交叉核查后形成：

- V8 前端基线与 Store/Workspace 耦合审计；
- V9 Schema、Player、Surface Host、Runtime/Component、发布和导出 donor 审计；
- 对弱模型执行风险、测试退化和“再次重写”风险的对抗审计。

审计没有修改产品代码。任何后续实现都必须服从本文件的冻结裁决和机械门禁。开发采用“依赖图并行、主线串行集成”：共享工作区永远只有一个写入者；只有满足第 5.8 节全部条件的任务，才可在独立 Git worktree/分支中并行。

仓库中的 `.workflow/` 是未启用的编排脚手架，不计算 ready set、不授予写入或 accepted 权限，也不得覆盖本文件与第 5.8 节；本轮执行不使用它派发任务。

---

## 0. 一句话裁决

```text
Git 与前端实现基线 = 3e41ec0
唯一可写工程协议     = Course Project V9
可选择的逻辑 donor   = f77ba9e

原 App.tsx + 原 ui/** + 原 Workspace + 原 Phaser + 原 globals.css
                            ↓ 原地解耦数据依赖
                 薄 Editor Port + 只读 Editor View
                            ↓
             CourseProjectDocument V9 唯一真相源
```

这里的“基于 V8”指的是前端代码、信息架构、交互行为、布局、画布和测试合同；“升级到 V9”指唯一数据协议、运行内核、发布协议和新多表面能力。二者不是二选一，也不得再互换含义。

### 0.1 快速开发覆盖条款（优先于后文冲突条款）

本节是 2026-08-15 的执行授权与收敛规则。后文旧任务编号继续作为能力验收清单，但不再要求逐编号拆卡、逐卡全量验证或逐次请求授权。

1. 以可运行的端到端纵切为最小交付，不为单个 helper、Adapter、测试夹具或文件边界单独建卡；同一用户行为需要的相邻文件一次完成。
2. 不新建第二套 App、Store、Workspace 或协议；优先直接扩展已 accepted 的窄接缝。只有当前纵切真实需要且至少有两个立即消费者时才抽象公共层。
3. 主协调者默认 `xhigh`；只有 Gate、Schema/架构裁决和重大集成冲突临时使用 `max`。Terra 原子执行仍可用 `max`，但不得把额外推理转化为额外文档或重复验证。
4. 用户已授权主协调者在既有目标、仓库和依赖内自行修改计划、任务白名单、Workspace/Player 接缝与内部架构；普通 NO-GO 先转为一个最短恢复纵切继续推进，不再停下等待。只有权限、付费、新依赖、不可恢复的数据破坏、仓库外操作或目标本身不可调和时才询问用户。
5. 自动验证采用第 6.3 节分层策略：单卡定向、Gate 汇总、M8 全量。同一 accepted SHA 的绿色证据可复用；无代码变化不得重复跑同一命令来“增加信心”。
6. UI 纵切只保留一个主视口、一个真实指针路径和一个可见结果；三尺寸、像素 golden、系统级 SendInput 仅在布局变化或最终收敛需要时运行，不再与 Playwright 重复证明同一事实。
7. 发现局部缺口时先修最短根因，不建设通用平台、未来插件层、并行协议或完整迁移框架；尚无当前消费者的能力保持未实现。

---

## 1. 为什么这是唯一可行路线

### 1.1 四个“基线”必须分开

| 名称 | 冻结选择 | 含义 |
|---|---|---|
| Git 起点 | `3e41ec0` | 新开发分支必须从该提交创建 |
| 前端实现基线 | `3e41ec0` 的 V8 `App/ui/Workspace/Phaser/CSS` | 原地修改，不从别处重新移植 |
| 产品数据内核 | Course Project V9 | 最终只有 V9 可写、可保存、可发布 |
| 逻辑 donor | `f77ba9e` | 只按函数或纯模块摘取已验证逻辑，绝不作为前端基线 |

### 1.2 被否决的三条路线

| 路线 | 裁决 | 原因 |
|---|---|---|
| 从 `f77ba9e` 新建壳，再移植 V8 UI | 永久否决 | 这正是再次重写前端；该提交已删除成熟 V8 壳层 |
| 保留当前 `CourseStudioApp`，逐步仿 V8 | 永久否决 | UI、Store、Host、Player、导出生命周期仍绑在失败架构上 |
| 最终继续使用 Project V8 | 永久否决 | 当前没有旧成品工程；无需迁移和双协议维护 |
| 从 `3e41ec0` 原 V8 前端原地接入 V9 | 唯一采用 | 既保留成熟教师交互，又能得到 V9 唯一内核 |

### 1.3 代码证据

`3e41ec0 → f77ba9e` 不是普通改版，而是约 316 个文件、增加约 27,783 行、删除约 62,479 行的替换：

- 删除 `src/renderer/App.tsx`；
- 删除约 4,200 行的 `src/renderer/store/editorStore.ts`；
- 删除约 2,700 行的 `src/renderer/ui/Workspace.tsx`；
- 删除 `TopToolbar`、`ScenePanel`、`SceneStateStrip`、`RightSidebar`、`PropertiesTab`、`DeveloperTab` 等整套 UI；
- 删除 Phaser 编辑链和 `stageViewportTransform`；
- 删除 84 个既有测试，其中约 60 个是高价值编辑行为测试；
- 新建 `V9EditorShell`、`CourseStudioApp` 和另一套 Canvas/CSS。

所以，以 `f77ba9e` 为起点再“移植 V8”，无论文件名叫什么，本质都是第三次写前端。

### 1.4 `3e41ec0` 已经具备的 V9 内核

不需要从 `f77ba9e` 整体搬运：

- Course Project V9 types/schema/model；
- Published Course V2 types/schema/build；
- V9 history 与 archive 保存/打开；
- CoursePlayer；
- Slide、Flow、Spatial Surface Host；
- Surface Runtime API 3；
- Component API 4；
- 独立 Preview Window 的 main/preload/IPC 链；
- `buildPublishedCourseStandaloneHtml → desktopAPI.openPreview → previewWindow`。

UI 纵切前唯一明确需要的 donor 行为是：新工程直接构造成 V9，不再先构造 Project V8 再迁移。其他差异都必须等对应功能任务到来时再判断。

---

## 2. 不可变产品合同

### 2.1 原文件、原壳层、原位置

以下文件必须在 `3e41ec0` 的原路径原地演进，不得删除、重命名或用替代壳取代：

- `src/renderer/App.tsx`
- `src/renderer/ui/TopToolbar.tsx`
- `src/renderer/ui/ScenePanel.tsx`
- `src/renderer/ui/SceneThumbnail.tsx`
- `src/renderer/ui/Workspace.tsx`
- `src/renderer/ui/SceneStateStrip.tsx`
- `src/renderer/ui/RightSidebar.tsx`
- `src/renderer/ui/ElementsTab.tsx`
- `src/renderer/ui/NodesTab.tsx`
- `src/renderer/ui/PropertiesTab.tsx`
- `src/renderer/ui/ComponentsTab.tsx`
- `src/renderer/ui/AutomationTab.tsx`
- `src/renderer/ui/DeveloperTab.tsx`
- `src/renderer/ui/PresenterSettingsEditor.tsx`
- `src/renderer/authoring/stageViewportTransform.ts`
- `src/renderer/phaser/**`
- `src/renderer/styles/globals.css`

最终 `ProductApp.tsx` 只渲染同一个原 `App`。它不得转接到新的 App、Shell 或 Slide Workspace。

### 2.2 永久禁止的前端结构

- `ConvergedEditorApp`；
- 新的 `*EditorApp` 或 `*EditorShell`；
- 新 Slide Workspace；
- `src/renderer/converged/**`；
- 用 `src/renderer/studio/**` 替代原 UI；
- 以 `CourseStudioApp`、`CourseSurfaceCanvas` 或 `V9EditorShell` 为母体；
- 把 `course-studio.css` 覆盖到原 V8 壳；
- 新建六个 slice、Context Provider、service/plugin/command 框架来替代现成前端；
- 为新壳另建 `converged*.test` 自证成功。

Flow 和 Spatial 后期可以有各自的内容工作区，但它们必须挂在原 `App` 的中央编辑区内，不能成为新的产品壳，也不能反向改写 Slide 的成熟交互。

### 2.3 教师必须看到的 V8 交互合同

| 区域 | 必须保留的行为 |
|---|---|
| 顶部 | 新建、打开、保存、撤销、重做、当前位置试运行、整课预览、导出；顺序和密度不随意改变 |
| 左侧 | 固定一级“全局层”；幻灯片缩略图；拖动排序、重命名、复制、删除 |
| 中央 | 1280×720 Slide 逻辑画布；缩放、平移、点选、框选、Shift 多选、移动、八向缩放、旋转、方向键微调、双击编辑、吸附 |
| 状态条 | 基础画面与命名状态始终在画布下方；新增、复制、重命名、设初始、设缩略图、删除 |
| 右侧 | 简洁/专业模式；元素、图层、属性；专业模式中的互动、开发；不得把协议分层暴露给普通教师 |
| 字体与样式 | 字体搜索、完整字体列表、系统字体检测、自定义字体、文字颜色、文字高亮、文本框背景色/透明度/圆角、完整排版 |
| 开发 | Runtime 源码/内容/素材，Component manifest/runtime/props，Object/Rules JSON，校验、错误和预览；不能只剩 AI 地址 |
| 教师控制器 | 全局层中的真实作者对象；可编辑、可恢复；编辑态按钮不执行；试运行中正确展开/收起和导航 |
| 底部状态 | 状态、选择、缩放、脏状态与错误可见；普通错误不得暴露内部 ID/API 方法名 |

### 2.4 V9 数据怎样映射到教师概念

- 一个 Slide scene 在教师 UI 中就是一张“幻灯片”；不显示 Surface/Scene 协议词。
- `project.globalLayerItems` 映射为左侧固定一级“全局层”。
- Slide `surfaceLayerItems` 映射为“当前内容共用”，只在需要时作为图层作用域出现，不能取代全局层。
- Slide scene `layerItems` 映射为当前幻灯片内容。
- `presentation.states` 和 overrides 映射为画布下方状态条。
- 所有 Native、Runtime、Component 和教师控制器都参加同一图层顺序与选择链。
- `CourseLocation` 是内部导航事实；教师只看幻灯片、讲义位置、镜头或目录名称。

### 2.5 普通教师界面不得出现

- V8、V9；
- Surface、Native、Runtime、Component（专业开发区可按需显示 Runtime/Component）；
- API、Manifest、Package ID、Layer Item ID；
- authoringAddress、targetId、revision、JSON Pointer；
- AI Patch、“复制 AI 引用”或其它尚未接入的 AI 入口。

稳定地址和命中事实保留在内核，等真实 AI 接入后再设计入口。现阶段应从普通 UI 删除 AI 专属按钮，而不是把“预留接口”当教师功能。

---

## 3. 冻结技术架构

### 3.1 单一真相源

最终可写状态只能包含：

- `CourseProjectDocument` V9；
- asset/component package 字节；
- V9 history/revision/dirty；
- 当前 location/surface/scene/presentation state；
- 当前 scope、selection、viewport 和 UI tab；
- 与工程分离的试运行会话状态。

不得包含：

- 可写 Project V8；
- 两个需要同步的 V8/V9 Store；
- 可写 `SceneDocument` 镜像；
- 进入 history 或 archive 的兼容 View；
- 从 Player DOM 反序列化出来的第二份工程。

### 3.2 唯一推荐迁移机制

采用“影子构建、单次切换”，不采用大爆炸改型，也不采用 Context：

1. 原 V8 Store 和 UI 在切换前继续完整工作。
2. 新 V9 Store 先不挂载，只测试 V9 文档、history、location、selection、archive 和纯只读 View。
3. 兼容 View 只把 V9 Slide 数据机械投影成旧 UI 暂时可读的形状；它可以按 V9 document reference 缓存，但不可持久化、不可写、不可进入 history。
4. 所有旧 action 必须先有等价 V9 command，才能让对应原组件切换。
5. 迁移期开机参数只能在启动时选择一个 backend；同一进程、同一操作中绝不能双写。
6. Slide 合同全部通过后，一次把原 `useEditorStore` 导出切为 V9 backend。
7. 再逐组件删除兼容 View 依赖，最后删除旧 V8 backend。

保留现有 `useEditorStore` 导入路径是为了避免一次修改约 18 个直接消费者和大量 `getState/setState` 调用。不得为此新增 Provider 生命周期。

### 3.3 只读编辑视图

允许新增一个薄的 Slide 编辑投影，其职责仅是：

- 根据当前 V9 surface/scene/state materialize Native 内容；
- 合并 global/surface/scene 的有效图层顺序；
- 提供原 UI 所需的教师名称、可见性、锁定、frame、rotation、opacity；
- 把 `layerItemId` 保持为稳定选择 ID；
- 将状态 overrides 表达为只读有效值。

它不得：

- 生成替代 ID；
- 把多个 Runtime 压成旧 scene/global 单例；
- 把 Flow/Spatial 伪装成 V8 scene；
- 接受写操作；
- 被 archive 或 export 使用。

### 3.4 画布编辑目标

Phaser 编辑层不再要求完整 `SceneDocument`，最终收窄为统一编辑目标，例如：

```ts
type EditorTransformTarget = {
  id: string
  label: string
  itemKind: 'native' | 'component' | 'runtime' | 'controller'
  nativeType?: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  visible: boolean
  locked: boolean
}
```

这不是新画布，而是让原 `Workspace → EditorScene → Phaser bridge` 继续承担成熟的选择和变换手感。任何 V9 写入都通过稳定 `layerItemId` 回到纯 command。

### 3.5 试运行与预览

作者检查实例和试运行 Player 必须分离：

```text
AuthoringInspectHost
  - 常驻编辑画布
  - 只负责作者渲染、命中和稳定地址
  - 不承担真实课程会话

TrialRunSession
  - 点击“当前位置试运行”时新建
  - 由当前 V9 snapshot 构建 Published Course V2
  - 从当前 CourseLocation / state 启动
  - 停止时销毁
  - 不修改 Project、history、revision、selection、editor viewport

FullPreviewWindow
  - 复用 3e 已存在的 standalone HTML → openPreview → previewWindow
```

禁止：

- 编辑 Host 原地 `inspect ↔ playback`；
- 复用上一次运行实例来“保留当前帧”；
- Player 普通事件直接改编辑器；
- 读取 Player DOM/Canvas 后写回工程。

以后如需“将当前运行画面保存为命名状态”，必须是教师显式动作，只接收结构化、可作者化 snapshot，一次操作只产生一次 history/revision；不支持的动态状态要用中文列明。

---

## 4. Donor 使用边界

### 4.1 UI 纵切前只摘这一项

从 `f77ba9e:src/renderer/course/courseStudioModel.ts` 参考并重新落到小模块：

- 直接 V9 `createCourseProject`；
- 初始 Slide presentation；
- 默认 global teacher controller。

推荐新增职责单一的 `src/renderer/course/courseProjectFactory.ts`，只依赖 `nanoid`、Course Project types/schema。原 `courseStudioModel.createCourseProject` 委托它。不得复制整个 `courseStudioModel.ts`。

### 4.2 现阶段不需要搬

- V9 history：`3e41ec0` 与 donor 等价；
- V9 archive save/open：基础行为已经存在；
- Runtime API3、Component API4 registry；
- Slide/Flow/Spatial 基础 Host；
- standalone package、main/preload/preview IPC；
- Mixed navigator。

### 4.3 后续只按功能摘取

| 功能 | 允许参考/摘取 | 禁止做法 |
|---|---|---|
| V9 协议收敛 | frame/runtime 收窄、Flow level、Spatial relations/zoom、Published label | 整体覆盖 types/schema/model |
| Native factory | text → formula/shape → image → video → controller，逐项 | 整体覆盖 2,000+ 行 model |
| Slide Host | unified order、hit、capture、controller、interaction、media 的单项差异 | 复制 CourseSurfaceCanvas |
| Runtime/Component | mount、hit field、checkpoint、hot update 算法 | 整体复制强耦合的 editor dynamic host |
| Flow | `flowListStructure`、纯 move model、Host/export 增量 | 复制失败前端的 FlowBlockEditor UI |
| Spatial | viewport/zoom/relations 纯模型、Host/export 增量 | 复制 SpatialAuthoringPanels UI |
| 互动/声音 | 纯 model、Player controller/audio 增量 | 复制整套 V9 Course Studio 面板 |
| 发布 | producer/consumer/schema 同一任务原子更新 | 只改一端或整文件替换 Published App |

### 4.4 永久禁止作为前端 donor

- `src/renderer/course/CourseStudioApp.tsx`
- `src/renderer/course/CourseSurfaceCanvas.tsx`
- `src/renderer/course/editor-shell/V9EditorShell.tsx`
- `src/renderer/course/course-studio.css`
- `CourseElementPalette.tsx`
- `CourseLayerPanel.tsx`
- `CourseSceneThumbnail.tsx`
- `CourseSoundLibrary.tsx`
- `SpatialAuthoringPanels.tsx`
- `V9CourseLogicEditor.tsx`
- `V9InteractionEditor.tsx`
- `FlowBlockEditor.tsx`
- 整个 `CourseTransformOverlay.tsx` UI
- `CourseStudioPlaybackSession` 试运行架构

纯几何或纯模型函数如确有缺口，可由协调者在对应任务中单独批准。

---

## 5. 角色、任务和弱模型执行协议

### 5.1 强协调者负责

- 由当前根代理担任持续主脑；复杂架构决策优先使用 GPT-5.6 Sol / max，不把总协调权交给执行子智能体；
- Git 基线、分支和 accepted SHA；
- 从 DAG 计算当前 ready set，把它编译为 1～2 张互不冲突的 ACTIVE_WAVE 精确任务卡；
- 创建、核验和回收独立 worktree/分支；任何隔离条件不成立时自动退回单写入串行；
- 反重写 verifier、golden screenshots、行为测试映射；
- 从 donor 选择精确函数；
- 在上一 accepted SHA 上把下一 DAG 节点编译为精确任务卡；
- Schema、IPC、新依赖和架构裁决；
- 审查 UI diff、真实鼠标、截图和视觉结果；
- `go/no-go`、`accepted`、回退和 push；
- 对并行结果逐个审查、逐个集成、逐个重跑门禁；并行实现不等于并行合并；
- 把技术判断转换成教师可见验收，不能让用户判断 Store/Adapter。

### 5.2 Terra Max 原子执行器负责

- 使用 `gpt-5.6-terra` 且推理强度设为 `max`；
- 一次只执行 ACTIVE_WAVE 中分配给自己的一个 Owner 为 `Terra Max`、状态为 `ready` 的 ACTIVE_CARD；
- 只在任务卡指定的工作目录和分支工作，不读取或修改另一个执行器的工作树；
- 开放读取直接依赖，但只改任务白名单；
- 优先运行和保留既有行为测试；
- 完成一个可见行为或一个纯模型闭环；
- 运行任务卡全部门禁；
- 通过后提交一个 commit，报告 `done-awaiting-review`；
- 不更新本计划、不 push、不自行变更 `accepted`；
- 不再生成子智能体、不启动 Ultra 工作流、不规划下一任务。

### 5.3 Ultra 工作流边界

Ultra 是多智能体编排工作流，不是普通任务执行者，也不是 Terra 的推理强度名称。只有强协调者可以决定是否启用，适用范围仅限：

术语依据：官方 OpenAI 文档将 Terra 的 `reasoning.effort` 列为最高 `max`，并把 Codex Ultra 描述为类似 multi-agent 的编排模式；参见 [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra) 与 [GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model)。

- 多路只读架构或风险审计；
- 互不依赖、互不写同一文件的测试分片；
- 完成实现后的独立对抗复核；
- 可以清楚拆成独立工作流、且最终由主协调者统一综合的调查。
- 第 5.8 节全部成立后，编排独立 worktree 中互不依赖的 ACTIVE_CARD；实际写入者仍各自遵守 Terra Max 原子卡约束。

Ultra 不得用于：

- 执行一张普通原子修改卡；
- 让多个子智能体同时修改相同或相邻产品文件；
- 在共享工作区中启动第二个写入者，或把“不同分支”误当作“不同工作目录”；
- 自行拆分 DAG、变更白名单、接受提交或继续下一任务；
- 取代主协调者对 diff、测试、截图和教师体验的最终责任。

### 5.4 普通 Terra Max 任务上限

- 产品文件：通常 2–5 个；同一端到端行为不得仅因多一个相邻 helper 被机械拆卡；
- 产品净改：通常不超过 600 行；
- 测试文件：1–3 个，优先修改既有测试；确无覆盖才新建；
- 用户可见行为：1 个完整纵切，而不是一个内部函数；
- commit：1 个；
- 禁止附带格式化、重命名、依赖、Schema、IPC 或清理。

数值上限是审查信号，不是自动 `blocked`。若扩展仍属于同一可见纵切且白名单无冲突，协调者可在派发前一次性放宽；只有出现第二个独立结果才拆卡。主协调者的高冲突集成卡不受数值硬限制，但仍禁止整文件重写 `Workspace.tsx`、`PropertiesTab.tsx` 或 `editorStore.ts`。

### 5.5 Terra Max 遇到这些事实必须停止

- 需要白名单外产品文件；
- 需要改 Schema、IPC、package、tsconfig、AGENTS；
- 需要新增依赖；
- 任务卡中的接口或路径与 accepted parent 不符；
- 需要新 App/Shell/Slide Workspace；
- 需要同时写 V8/V9；
- 既有行为测试与需求冲突；
- 变更已明显形成第二个独立结果；
- 基线 guard 失败。

停止时只报告证据，不扩大范围，不制造 placeholder，不弱化测试。

### 5.6 任务状态

```text
pending → ready → in_progress → done-awaiting-review → accepted
                          └──────→ blocked
```

- 同一 worktree 同时只能有一个写入 ACTIVE_CARD；
- 一个 ACTIVE_WAVE 默认只有 1 张写入卡，满足第 5.8 节时最多 2 张；另可并行 1 个只读审计；
- 并行卡分别验收，不能以“整波测试通过”替代单卡 diff、测试和视觉审查；
- Terra Max 只做到 `done-awaiting-review`；
- UI 任务必须经强协调者复核一个代表性可见路径才能 `accepted`；同一路径不再追加第二套鼠标工具证明；
- 自动化最多证明 `engineering candidate`；
- 失败的 accepted 任务用 `git revert <task-sha>`，禁止 reset。

### 5.7 为什么不预写几十张未来白名单

未来第 20 张卡的接口和文件位置取决于前 19 张 accepted 结果。现在伪造精确白名单，只会迫使弱模型猜测或频繁越权。

因此本计划保存：

```text
冻结裁决 + 完整 DAG + 唯一 ACTIVE_WAVE
```

强协调者只能从依赖均已 accepted 的 ready set 中，根据真实 SHA 物化当前波次。Terra Max 每轮只读第 0、2、3、5、6 节和分配给自己的 ACTIVE_CARD，不需要把完整 DAG 或同波其他任务装入上下文。

### 5.8 受限并行与串行集成协议

并行的目标是减少互不依赖工作的墙钟时间，不是占满智能体。官方 Codex worktree 机制允许同一仓库的独立任务在不同检出目录中互不干扰；但 worktree 也会增加依赖和构建缓存的磁盘占用，参见 [Codex worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees) 与 [GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model)。

#### 允许形成双写入波的全部条件

两张卡只有同时满足以下条件才可并行：

1. 所有依赖均已 `accepted`，且两张卡基于同一个完整 accepted parent SHA；
2. 两张卡互相没有数据、接口、测试或验收依赖；任一张的 After 不能成为另一张的 Before；
3. 产品白名单、测试白名单、生成物和截图输出目录完全不重叠；
4. 不修改共享高冲突区：本计划、`AGENTS.md`、package/tsconfig、Schema/IPC、反重写 guard、behavior map、golden、`App.tsx`、`Workspace.tsx`、`editorStore.ts`、`globals.css`；协调者可在审计后为某一波明确放宽其中一个区域，但同波只能由一张卡拥有；
5. 每张卡有独立 worktree、独立 `codex/` 分支、独立日志和一个 commit；只创建不同分支但仍共享目录不算隔离；
6. 协调者已经做过一次并行环境预检，且 worktree、依赖解析和定向测试路径自上次预检后没有变化；环境未变化时复用该证据，不重复测磁盘、缓存或清理路径。工具调用必须稳定落在指定 worktree，否则退回串行；禁止复制主工作区 `node_modules`，未经审计不得建立 junction/symlink；
7. 两张卡都能独立运行各自门禁；若 worktree 无法安全运行测试，则该波退回串行；
8. 预计冲突、接口漂移或额外文件需求一旦出现，执行器立即 `blocked`，不得自行 merge/rebase 或扩大白名单。

#### 固定并行宽度

- 主协调者占 1 个槽位；
- 最多 2 个 Terra Max 写入执行器，各在独立 worktree；
- 最多 1 个只读审计/测试复核执行器；
- `G00`、`G01`、`G04`、`G05`、所有 Gate 裁决、主入口切换、Mixed 汇合与最终清理默认串行；
- `G02` 与 `G03` 可以并行收集证据，但其产物仍由协调者串行审查和提交；
- `V01→V05` 是高耦合纵切，默认串行；`GATE-V` 通过后才常态启用双写入波。

#### 主线集成永远串行

1. 调度前，协调者先把完整 ACTIVE_WAVE 写入本计划并提交；卡内 `Accepted parent SHA` 始终指上一产品 accepted SHA，纯计划提交只作为编排记录，不扩大产品 diff 基线；
2. 执行器把单卡提交交给协调者，状态仅为 `done-awaiting-review`；
3. 协调者从 accepted parent 核对精确 diff、测试和 UI 证据；
4. 一次只集成一个提交；每次集成后只运行该卡定向测试和真正受影响的共享测试；verifier 与全量测试按第 6.3 节分层执行；
5. 第一张卡 accepted 后，第二张卡若仍能无冲突应用，才继续审查；否则废弃旧结果并基于新 accepted SHA 重新物化，不做临场冲突拼接；
6. 只有协调者更新本计划中的 accepted SHA、波次状态和下一 ACTIVE_WAVE；
7. worktree 仅在对应提交 accepted 或明确 rejected 后按核验路径回收。

---

## 6. 机械门禁和测试合同

### 6.1 反重写 verifier

在任何产品开发前，由协调者新增并冻结：

- `scripts/verify-editor-preservation.ts`
- `tests/contracts/v8-behavior-map.json`
- V8 壳层三尺寸 golden screenshots
- verifier 自身负向测试

verifier 必须机械断言：

1. 第 2.1 节核心文件相对 `3e41ec0` 不得 `D` 或 `R`；
2. 禁止 `src/renderer/converged/**`、替代 `studio/**`、新 `*EditorApp/*EditorShell`；
3. `ProductApp → 原 App → TopToolbar/ScenePanel/Workspace/SceneStateStrip/RightSidebar` 可达；
4. 正式切换后 `CourseStudioApp/V9EditorShell/CourseSurfaceCanvas` 不可达；
5. `.app-shell`、顶部、左栏、中央、`.canvas-viewport`、`[data-testid=canvas-stage]`、状态条、右栏、底部状态栏同时存在；
6. 1280×720、1366×768、1920×1080 三档无互相遮挡或页面级溢出；
7. 壳层 golden 对比通过；动态画布区可以 mask；
8. 不存在 `.skip`、`.todo`、`.only`；
9. `v8-behavior-map.json` 中无未映射删除。

verifier 必须有三个必失败负例：删除 `Workspace`、新增 `ConvergedEditorApp`、让 `ProductApp` 重新导入 `CourseStudioApp`。guard、golden 和行为映射只允许协调者修改。

### 6.2 既有测试优先，不建平行自证体系

| 既有测试 | 继续保护的合同 |
|---|---|
| `tests/unit/editorStore.test.ts` | scene/layer/state/history/native CRUD、一次变换一次历史、剪贴板 |
| `globalEditorStore.test.ts` | 全局层、控制器、作用范围、全局互动 |
| `globalLayerUi.test.tsx` | 固定全局入口、场景切换、全局组件/属性 |
| `sceneStateUi.test.tsx` | 状态条、状态角色、覆盖、缩略图状态 |
| `stageViewportTransform.test.ts` | 1280×720、50%–200%、fit、pan、坐标换算 |
| `editorFormattingUi.test.tsx` | 字体、文字背景、富文本、IME、缩放下编辑 |
| `simpleEditorMode.test.tsx` | 简洁/专业模式与渐进显示 |
| `developerMode.test.tsx` | Runtime/Component 开发工作区与历史 |
| `mediaTab.test.tsx` | 素材、声音、视频与音频设置 |
| `componentPropertiesEditor.test.tsx` | 组件 props、preset、嵌套内容 |
| `presenterSettingsUi.test.tsx` | 教师控制器、快捷键、修复入口 |
| `interactionEditor.test.tsx` | 互动、动作、规则、场景/状态/媒体 |

规则：

- 保留原 `describe/it` 的行为含义；只替换 V9 fixture、Store 或 Adapter；
- 删除或弱化断言必须由协调者批准；
- 只有已被当前产品协议明确退休的路径才可 retire；Runtime API 2/3 兼容必须保留，Project V8 只保留显式导入迁移与必要兼容测试；
- retire 前必须在行为映射中写出原因和 V9 replacement test；
- Flow/Spatial/Mixed 是 V8 从未有的新能力，可以新增专属测试。

### 6.3 分层验证：单卡定向、Gate 汇总、M8 全量

验证的目标是尽快发现会阻断当前纵切的问题，不是重复证明已经 accepted 的事实。每条命令只在其覆盖面与本次 diff 相交时运行。

#### A. 实现循环

- 完成一个连贯 diff 后运行 1–3 个最相关的既有测试；失败先修根因，不在代码未变时反复重跑。
- 只在类型边界变化时运行 `npm run typecheck`；同一波后续纯样式/测试修补复用该结果。
- 开发中不跑全量 `npm test`、全量 E2E、三尺寸 golden、clean-Windows 或系统级 SendInput。

#### B. 单卡提交门禁

```powershell
git status --short
<1–3 个定向测试命令>
<仅在相关时：typecheck 或对应 renderer/player/electron build>
git diff --check
git diff --name-only <accepted-parent-sha>
```

- UI 行为：一个 1366×768 Electron/Playwright 主路径和一张结果截图；只有 CSS/DOM/viewport 变化才跑 preservation verifier 或额外尺寸。
- Player/Runtime/Component：只跑受影响的 build 与协议测试。
- archive/export：只跑一次真实文件 roundtrip 或对应导出，不同时复制多套等价 fixture。
- Playwright `page.mouse` 已从原 canvas 坐标进入真实 Phaser bridge 并由保存结果证明写入时，不再追加 SendInput。

#### C. Gate 与里程碑

- `GATE-V`、`GATE-S`、`GATE-FEATURES`：定向套件、typecheck、受影响 build，加一条代表性真实 Electron 纵切；仅在 Gate 汇总时跑一次 `npm test`。
- 三尺寸 golden：仅在壳层/CSS/viewport 改动后、`GATE-S` 和 M8 运行。
- 五类真实导出：M7 首次汇合和 M8 最终各运行一次；中间卡只测自己新增的格式。
- clean-Windows、完整 E2E 与仓库卫生只在 M8 最终收敛运行；`npm test` 在三道 Gate 各一次，并在 M8 最终再跑一次。

#### D. 证据复用与停止浪费

- 绿色结果绑定 accepted SHA 与受影响文件集合；集合未变化即可复用。
- 同一失败命令允许在修复后复验一次；再次失败才继续诊断，不做无变化重试。
- 单卡验证目标控制在 10 分钟内，Gate 汇总目标控制在 30 分钟内；天然更慢的全量命令只按 C 层运行一次，不为了凑时限拆成重复证据。
- 不为“更有把握”新增平行测试、截图、日志或审计；只有现有证据不能二元判断合同才补一项最短证据。
- 自动化通过即记 `engineering candidate` 并继续下一 ready set；只有最终教师验收才使用 `accepted` 的产品质量含义，代码任务的 Git `accepted` 不等待教师逐卡确认。

### 6.4 最小纵切 Go/No-Go

正式迁移前必须由同一个原 `App/Workspace` 完成：

1. 直接创建 Course Project V9；
2. 通过纯只读 View 显示一个 V9 Native text；
3. 真实鼠标选择和拖动；
4. 写入对应 `LayerItem.frame`；
5. 一次拖动只产生一次 history/revision；
6. Undo/Redo；
7. 保存 archive 必为 schemaVersion 9；
8. 完全关闭进程后重开，文字、frame、`layerItemId` 不变；
9. 1366×768 壳层截图与 V8 baseline 一致；
10. 无新 App/Shell/Workspace，无可写兼容 View，无双 Store 同步。

任一失败即本次 `GATE-V = NO-GO`，当前实现不得 accepted。主协调者按第 0.1 节自动物化一个最短恢复纵切并重跑 Gate；只有证明目标本身不可调和或触发外部授权边界时才阻塞后续。用户只看原界面是否仍熟悉、移动是否自然、重开是否一致。

---

## 7. 快速里程碑 DAG 与能力验收清单

### 7.0 实际执行图

实际执行只按下面 8 个纵切批次推进。后续 7.1–7.10 的旧 ID 是能力验收清单，不再是必须逐一物化、逐一提交、逐一跑全量门禁的微任务；协调者应把同一用户路径所需的旧 ID 合并进一张可运行纵切卡。

| Fast Track | 依赖 | 一次收敛的结果 | 允许执行形态 |
|---|---|---|---|
| FT1 / M1 | V04 | 原 App/Workspace 可见 V9 text，真实拖动、Undo/Redo、V9 archive 完全重开，`GATE-V=GO` | 主协调者串行；当前 `V05F` |
| FT2 / M2 | FT1 | 直接 V9 factories/commands、窄 EditorPort、文件生命周期与原顶栏/左栏/状态条/右栏切到单写 V9 | 高冲突 UI 串行；纯模型卡仅在 §5.8 全部成立时并行 |
| FT3 / M3 | FT2 | Slide Native/Runtime/Component 可见、可选、变换、文字/媒体/图层/状态/全局层/控制器/互动完整，`GATE-S=GO` | 以 3–5 个用户纵切完成，不按 S01–S28 逐卡 |
| FT4 / M4 | FT3 | 隔离 Player、Runtime 2/3、Component 4、开发区、课程逻辑和 checkpoint 形成一条真实闭环 | Player 与纯开发模型可在文件完全隔离时双卡 |
| FT5 / M5 | FT4 | Flow 语义编辑、层级/表格/公式/媒体、真实拖动、统一层、Player、HTML/PDF/DOCX | 可与 FT6 双 worktree 并行 |
| FT6 / M6 | FT4 | Spatial pan/zoom、选择/变换、关系、镜头/路径/小地图、统一层、Player、导出 | 可与 FT5 双 worktree 并行 |
| FT7 / M7 | FT5,FT6 | Mixed 导航/state/guard/controller、完全重开、整课 Player、HTML/网页包/PDF/PPTX/DOCX | 主线串行汇合 |
| FT8 / M8 | FT7 | 原 App 唯一入口、显式 V8 导入兼容、旧失败前端清理、docs/Builder skill/能力卡与可达产品事实对齐、行为/视觉/导出最终门禁 | 主协调者串行清理与最终审计 |

执行规则：

- 一个 Fast Track 通常物化 1–5 张端到端卡；只有白名单或可见结果真正独立才拆分。
- 不为接口定义、Adapter、fixture、测试迁移、文档更新单独建卡；它们随第一个真实消费者进入同一提交。
- 同一 Fast Track 内定向测试随卡运行，全量只按第 6.3 节在 Gate/M8 运行。
- 只有 §5.8 的全部隔离条件成立才启用最多两个 Terra Max；否则主工作区单写入持续推进。

下面的旧 DAG 仅用于防止能力遗漏和定位依赖，不控制提交粒度。

### 7.1 基线与守卫：协调者专属

| ID | 依赖 | 唯一结果 |
|---|---|---|
| G00 | 无 | 从 `3e41ec0` 建目标分支，只带入本计划 |
| G01 | G00 | 记录 typecheck/unit/build/player/archive/publish 的真实基线 |
| G02 | G01 | 启动 `3e` 原 App，冻结三尺寸截图、DOM 几何和真实鼠标证据 |
| G03 | G01 | 建立 V8 行为测试映射，所有高价值测试有 keep/adapt/retire 结论 |
| G04 | G02,G03 | 建立反重写 verifier、负例和固定脚本；验收后冻结 |
| G05 | G04 | 开发分支唯一可见入口切到原 `App`；CourseStudio 不可达但暂不删除 |
| K00 | G05 | 直接 V9 新工程 factory、初始状态、默认全局教师控制器 |

G05 到 V9 backend 切换前是不可发布的开发中间态。它只能运行一个 backend，不提供教师版本，也不打开旧工程。

### 7.2 最小纵切

| ID | 依赖 | 唯一结果 |
|---|---|---|
| V01 | K00 | V9 LayerItem/状态/作用域 → 只读 SlideEditorView 纯投影 |
| V02 | V01 | V9 Native text 的稳定选择与 move command，一次 revision/history |
| V03 | V02 | 原 Workspace 建立最窄数据注入边界；默认 V8 行为不变 |
| V04 | V03 | 同一个原 App/Workspace 在测试启动参数下读取 V9 fixture；只启用一个 backend |
| V05 | V04 | 真实鼠标、Undo/Redo、V9 archive、完全关闭重开和壳层截图闭环 |
| GATE-V | V05 | 强协调者做 Go/No-Go；No-Go 时自动物化一个最短恢复纵切，只有触发第 0.1 节授权边界才停止 |

### 7.3 GATE-V 后的公共 V9 内核

这些节点可按依赖并行，但每个仍是原子任务：

| ID | 依赖 | 唯一结果 |
|---|---|---|
| K01 | GATE-V | fixture/producer 不再通过 V8 migration 创建 V9 |
| K02 | K01 | text → formula/shape → image → video → controller 逐类直接 V9 factory |
| K03 | K01 | global/surface/scene/world 的统一 scope/order 命令与引用安全 |
| K04 | K01 | Slide scene CRUD、排序、复制、位置和引用原子修复 |
| K05 | K04 | Slide state CRUD、initial/thumbnail、override/order 和引用原子修复 |
| K06 | K01 | Flow block/list/location 的纯模型和引用修复 |
| K07 | K01 | Spatial world/relations/camera/path 的纯模型和统一 viewport 常量 |
| K08 | K04,K06,K07 | Mixed location、course state、guard 与跨表面动作模型 |
| K09 | K01 | V9 history、dirty、archive save/open/move/reopen 闭环；移除 V8 import |
| K10 | K03,K09 | Published Course V2 producer/schema/label/assets 闭包 |

协议或 producer/consumer 需要同步时由协调者拆成同一原子卡，不允许弱模型只改一端。

### 7.4 原 UI 的数据解耦，不是移植

| ID | 依赖 | 唯一结果 |
|---|---|---|
| A01 | GATE-V | 定义窄 EditorPort；先由原 V8 Store 实现，视觉零变化 |
| A02 | A01,K09 | 原 TopToolbar 改走 Port；位置、快捷键和测试不变 |
| A03 | A01,K03,K04 | 原 ScenePanel/Thumbnail 改走 Port；全局层仍为一级入口 |
| A04 | A01,K05 | 原 SceneStateStrip 改走 Port；基础/命名状态合同不变 |
| A05 | A01 | 原 RightSidebar、简洁/专业和 tabs 改走 Port |
| A06 | A05 | 原 Properties 公共选择/提交边界改走 Port，不改控件设计 |
| A07 | V05 | 原 Workspace 通用读取/选择/命中入口改走 Port |
| A08 | A02,A03,A04,A05,A07,K09 | 原 App 文件生命周期、dirty、恢复与当前定位改走 V9 |
| A09 | GATE-S,A08 | 启动时原子切换 `useEditorStore` backend 为 V9；移除运行时切换 |
| A10 | A09 | 删除临时 V8 backend/兼容 facade 中已无消费者的部分 |

### 7.5 Slide 成熟交互链

| ID | 依赖 | 唯一结果 |
|---|---|---|
| S01 | V05 | 原 Workspace + `stageViewportTransform` 承载 V9 inspect target；1280×720 不变 |
| S02 | S01,K02 | Native text/shape/formula/image/video 在原画布真实渲染 |
| S03 | S02 | 点选、稳定 `layerItemId`、内部 field 命中 |
| S04 | S03 | 鼠标移动和方向键微调，一次操作一次历史 |
| S05 | S04 | 八向 resize |
| S06 | S04 | rotate 与角度吸附 |
| S07 | S04 | 框选、Shift 多选、锁定语义 |
| S08 | S04,S05 | 8px/中心/边缘吸附与 Alt 临时关闭 |
| S09 | S03 | 双击文字、富文本、IME、Ctrl+Enter/失焦提交 |
| S10 | S03,K02 | 图片命中、替换、裁切与素材闭包 |
| S11 | S03,K02 | 公式原位/属性编辑与导出一致性 |
| S12 | S02,K02 | 文字/图形/公式连续插入 |
| S13 | S10 | 图片/视频/Component 导入和当前画布插入 |
| S14 | S07,K03 | 原 Nodes/图层面板与画布选择双向同步 |
| S15 | S14,K03 | 显隐、锁定、order、scope 移动和多选操作 |
| S16 | A03,K04 | 幻灯片新增/复制/排序/删除/重命名 |
| S17 | S16,K05 | 原 SceneThumbnail 使用 initial/thumbnail state 与有效共用图层 |
| S18 | A04,K05 | 原状态条 CRUD、设初始、设缩略图 |
| S19 | S18 | state override/order/background 与 base 的可预测编辑 |
| S20 | A03,S15 | 固定一级全局层；切场景后稳定；场景灰化上下文不可误选 |
| S21 | S20 | “当前内容共用”层；不取代全局层 |
| S22 | A06,S09 | 原字体搜索、系统检测、完整列表、预览、自定义字体 |
| S23 | S22 | 文字颜色、高亮、文本框背景/透明度/圆角、排版 |
| S24 | A06,S02 | 图形、公式、图片、视频和场景背景属性 |
| S25 | S14,K03 | 剪贴板、复制、删除和所有 interaction/state/order 引用修复 |
| S26 | S03 | 原 InteractionEditor 的基本点击/场景/状态入口接 V9 |
| S27 | S20 | 原 PresenterSettings 的教师控制器作者属性与恢复入口 |
| S28 | S27 | 编辑态控制器选中/变换/收展几何；按钮绝不执行导航 |
| GATE-S | S01–S28 全部 accepted | 强协调者复核完整 Slide 合同、原壳截图和真实鼠标；缺一项即 No-Go |

### 7.6 隔离 Player 与试运行

| ID | 依赖 | 唯一结果 |
|---|---|---|
| P01 | K10,S02 | 在原 Workspace 的试运行区域创建第二个隔离 Published Player |
| P02 | P01,K08 | 从当前 CourseLocation/state 启动，编辑实例不切 playback |
| P03 | P02 | 停止/restart/连续 20 次无泄漏；Project/history/selection/viewport 不变 |
| P04 | P02,S28 | Player 中教师控制器导航、收展、目录、静音、全屏 |
| P05 | P02,D08 | Runtime/Component/互动在真实 Player 执行 |
| P06 | P03 | 协调者冻结结构化 snapshot 协议；默认仍不回写 |
| P07 | P06,S19 | 显式保存 Native frame/visibility/order 为命名状态，一次事务 |
| P08 | P07 | dynamic checkpoint 可保存部分和不支持部分用中文列明 |

### 7.7 专业开发与课程逻辑

| ID | 依赖 | 唯一结果 |
|---|---|---|
| D01 | A05,S13 | 原 DeveloperTab 接 V9 selection；恢复 Runtime/Object/Rules/Component 任务区 |
| D02 | D01 | Runtime API3 source 校验、编辑、撤销 |
| D03 | D02 | Runtime content 字段编辑 |
| D04 | D02 | Runtime assets、fallback、错误与作者预览 |
| D05 | D03,S03 | Runtime 内文字/普通图片命中与稳定 authoringAddress |
| D06 | D01 | Component API4 manifest/runtime 编辑与包校验 |
| D07 | D06 | Component props/assets/static preview |
| D08 | D07,S03 | Component 内部命中、稳定地址、hot update/checkpoint |
| D09 | A05,K10 | 原媒体区课程声音库与试听/用途/删除引用保护 |
| D10 | S26 | 原 InteractionEditor 接完整 V9 rule/trigger/action |
| D11 | D10,K08 | 课程变量、conditions、navigation guards、global interactions |
| D12 | D04,D08,D11 | 教师化诊断、发布差异和折叠内部详情 |

AI 入口在整个 D 链中仍为 0。

### 7.8 Flow，可与开发/Spatial 分支并行

| ID | 依赖 | 唯一结果 |
|---|---|---|
| F01 | A05,K06,K09 | 在原壳的左侧大纲和中央区挂 Flow 专属工作区 |
| F02 | F01 | 段落、标题、引用、提示的中文直接编辑 |
| F03 | F02 | 列表、0–5 层级、嵌套与树级缩进/减少缩进 |
| F04 | F02 | 表格与公式 |
| F05 | F02,S13 | 图片/音频/视频/Component/分节 |
| F06 | F02,F03,F04,F05 | 画布内直接编辑、属性面板同步 |
| F07 | F06 | 真实鼠标跨节拖动，一次 history；失焦不取消手势 |
| F08 | F01,K03 | global/surface 浮动层、教师控制器和 scope |
| F09 | F08,K10 | 隔离 Flow Player 与当前位置导航 |
| F10 | F09 | HTML/PDF，跨位置图层有明确静态语义 |
| F11 | F03,F04,F05 | DOCX 语义列表、表格、公式、媒体/组件后备 |

### 7.9 Spatial，可与 Flow 并行

| ID | 依赖 | 唯一结果 |
|---|---|---|
| X01 | A05,K07 | 原壳中央区的 world↔screen 唯一变换、pan/zoom/fit |
| X02 | X01 | 点选、框选、多选和移动 |
| X03 | X02 | resize/rotate/text 编辑 |
| X04 | X02,K07 | 关系、标签、普通/箭头连线 |
| X05 | X01,K07 | 首页、镜头新增/定位/重命名/排序/删除 |
| X06 | X05 | 教学路径、小地图、语义缩放 |
| X07 | X02,K03 | global/surface/world 统一层与教师控制器 |
| X08 | X06,X07,K10 | 隔离 Spatial Player 与 location/camera 一致性 |
| X09 | X08 | HTML/PDF/PPTX，effective layers 与静态排除规则一致 |

### 7.10 Mixed、质量和清理

| ID | 依赖 | 唯一结果 |
|---|---|---|
| M01 | P04,F09,X08,K08 | Slide→Flow→Spatial 的 CourseLocation 导航 |
| M02 | M01 | 全局层/控制器 visibility 与 current location 一致 |
| M03 | M01,D11 | course state/guard/action 跨表面一致 |
| M04 | M03 | 保存、完全关闭、重开后位置/状态/镜头一致 |
| M05 | M04 | 整课隔离 Player 与 restart |
| M06 | M05,F10,F11,X09 | HTML、网页包、PDF、PPTX、DOCX；capture 不污染运行会话 |
| GATE-FEATURES | A09,GATE-S,P08,D12,F10,F11,X09,M06 | 强协调者确认 Slide、Player、开发、Flow、Spatial、Mixed 全部分支已汇合，无缺失能力 |
| Q01 | GATE-FEATURES | 行为映射无遗漏；高价值测试在原文件全部通过 |
| Q02 | Q01 | Slide/Flow/Spatial/Mixed 真实鼠标 E2E |
| Q03 | Q02 | 三尺寸 golden、无重叠、字体/状态/控制器可达 |
| Q04 | Q03 | 三份真实课例构建、保存重开、Player、五类导出 |
| Q05 | Q04 | 强模型完整教师体验审计，结果至少 `art candidate` |
| Q06 | Q05 | 用户只按教师可见任务验收，不判断技术架构 |
| Z01 | Q06 | 原 App 成为唯一正式 V9 入口；开发 backend flag 删除 |
| Z02 | Z01 | 按可达性簇删除 CourseStudio 失败前端和替代测试 |
| Z03 | Z02,A10 | 删除不可达的 V8 默认编辑真相源与 PublishedV1 临时路径；保留显式 V8 导入迁移、必要兼容测试和 Runtime API 2/3 兼容 |
| Z04 | Z03 | full、clean-Windows、真实 Preview/导出；仓库生成物卫生 |

`projectTypes.ts`、`projectSchema.ts` 中被 V9 Native 内容真实复用的中性类型不能按文件名误删。Component 包的内容完整性 hash 属于内部包校验，不是教师审批流程，也不能误删。

### 7.11 旧 ID 的并行提示（不控制拆卡粒度）

以下只帮助协调者识别高冲突区；实际执行优先服从 7.0 的 Fast Track，并根据当前 accepted SHA 核对文件所有权：

| 阶段 | 推荐执行形态 | 原因 |
|---|---|---|
| `G00→G01` | 单通道 | 建分支和基线不能同时变化 |
| `G02 ‖ G03` | 两路证据并行、串行提交 | 截图/几何与行为映射输出可隔离 |
| `G04→G05→K00→V01→V05→GATE-V` | 单通道 | guard、入口、Store/Workspace 纵切高度耦合 |
| `GATE-V` 后公共内核 | 最多两路 | 只并行白名单不重叠的纯模型或 producer/consumer 完整闭环 |
| `A01→A10` 与 `S01→S28` | 主 UI/Workspace 通道串行，旁路纯模型可并行 | 原 UI 文件和 Store 是高冲突区，不能按编号机械并行 |
| `GATE-S` 后的 `P`、`D`、`F`、`X` | 可组成多波双通道 | 四条能力链相对独立，是主要加速区；仍受各自 DAG 依赖限制 |
| `M01→M06`、`Q01→Q06`、`Z01→Z04` | 串行汇合 | 跨表面、全量质量和删除旧路径必须基于唯一集成事实 |

Goal 长程运行不得在每个里程碑等待用户确认；里程碑是自动检查点。只要 Gate 为 GO、没有权限/依赖/架构阻塞，协调者应自动计算下一 ready set 并继续。

---

## 8. 里程碑和二元门槛

| 里程碑 | 必须全部成立 |
|---|---|
| M0 基线 | 目标分支从 `3e41ec0`；计划、golden、behavior map、verifier 冻结 |
| M1 纵切 | 原 App/Workspace 中 V9 text 选择/移动/Undo/保存重开；GATE-V=GO |
| M2 Slide 外壳 | 顶栏、左栏、状态条、右栏、Workspace 均为原 V8 交互，V9 backend 单写 |
| M3 Slide 成熟 | 变换、文字、字体/背景、图层、状态、全局层、控制器全部通过 |
| M4 运行/开发 | 隔离 Player、Runtime3、Component4、互动和开发工作台真实闭环 |
| M5 Flow | 语义编辑、真实拖动、统一层、Player、HTML/PDF/DOCX |
| M6 Spatial | 世界编辑、关系、镜头/路径/小地图、统一层、Player、导出 |
| M7 Mixed | 跨表面 location/state/guard/controller、重开、五类导出 |
| M8 收敛 | 原 App 唯一入口；失败前端和旧顶层协议清理；全门禁通过 |

每个里程碑只复核一条代表性教师路径；若可见结果明显不可用，先修该路径再前进，不扩展成全功能体验审计。自动化通过记为 `engineering candidate`，无需等待用户逐里程碑确认。

里程碑完成后主协调者只记录结果、SHA 和未覆盖风险，不暂停 Goal。普通 Gate 失败自动物化最短恢复卡；只有权限、付费、新依赖、不可恢复的破坏性操作、仓库外授权或目标本身不可调和时才停止长程运行。

---

## 9. 每张动态任务卡与执行波的固定结构

任务卡只保留执行与审查真正需要的信息。不得为填写模板而重复源码事实、实现步骤或测试背景：

````markdown
### ACTIVE_CARD｜<ID> <名称>

- Owner: Terra Max | strong-coordinator
- Status: ready
- Wave: <Wxx>
- Accepted parent SHA: <完整 SHA>
- Dependencies: <全部 accepted 节点>
- Assigned worktree: <绝对路径；协调者串行卡写“主工作区”>
- Assigned branch: <codex/...；只读卡写“不适用”>
- Parallel eligibility: serial | isolated-write
- Integration order: <协调者指定序号；执行器不得自行集成>
- Outcome: <一句话、可二元判断的端到端结果>
- Product whitelist: <精确文件列表>
- Test whitelist: <精确测试列表>
- Targeted checks: <第 6.3 节 A/B 层的最短命令>
- Stop only if: <权限/依赖/不可恢复破坏，或需要第二个独立结果>
- Visual evidence: <UI 卡写一个主路径；非 UI 省略>

Commit: `<type(scope): result>`
Rollback: `git revert <task-sha>`
````

ACTIVE_WAVE 只列 wave ID、共同 accepted parent、卡列表、并行结论和串行集成次序。串行单卡无需重复写文件重叠证明；双卡仍必须完整满足第 5.8 节。局部相邻缺口由协调者直接补入当前端到端卡，只有形成第二个独立结果才拆卡。

---

## 10. 当前唯一 ACTIVE_WAVE

### 已完成检查点

- `G00 accepted`：`8c7a530492e553f8bd1b560a3de598f4da24497c`
- `G01 accepted`：`05bdee521de2fe3de9de166333aa22b012058b7b`
- `G02 accepted`：`378c195f74e562f3ad5e47c494b94e709ccb57dd`
- `G03 accepted`：`14890bb76d5743189114f0ff2d42c85a5aa8a4a2`
- `G04 accepted`：`95fbb13934a17594a7a556f7b2627372d0732d89`
- `G05 accepted`：`dc190edb6a0d1b7b696e7308effd401d343134a2`
- `K00 accepted`：`eb00ed257dd6a12adf92914e89252063a6bad654`
- `V01 accepted`：`cf01dda082c14356f10853c89cc52aa9ded5d4af`
- `V02 accepted`：`49faf2366671b121558142c67a66364aaba6f138`
- `V03 accepted`：`f00c01b1e870dea4db46a3434cbd99daa89deb82`
- `V04 accepted`：`62cd1a4255f3f2d82fd98b1978fce3392bbc16e6`
- 当前分支：`codex/v9-editor-v8-base`
- 工程基线：typecheck、142 个 Vitest 文件 / 899 个测试、8 个 Agent Kit 测试、Player/Renderer/Electron build、3 个 archive/publish 文件 / 24 个测试全绿；构建告警已冻结在基线记录中。
- 原壳基线：三档 golden 和 DOM 几何全绿；Windows 系统级真实鼠标完成 `(440,320) → (540.9,387.3) → Undo → (440,320)`；高分辨率下原壳固定 720 px 高及底部留空已作为基线事实冻结。
- 行为基线：12 个原高价值测试文件、151 个源码定义、7 个参数化定义、172 个实际用例全部映射为 `keep` 并全绿。
- 守卫基线：静态门、三项必失败内存负例、三档 live geometry/masked golden 全绿；画布区外逐像素差异为 0；全量 143 个 Vitest 文件 / 903 个测试和 8 个 Agent Kit 测试全绿。
- 唯一入口：`ProductApp` 的产品 import graph 只到原 `App`；CourseStudio 源码保留但不可达；默认 `test:e2e` 已绑定 `v8-only` 真实 Electron preservation visual，三档壳层 mask 外像素差异为 0。
- V9 新工程：`createCourseProject` 已直接生成含初始 Slide/state/location 与全局教师控制器的 schema-valid V9 文档，不再调用 V8 factory/migration；全量 143 个 Vitest 文件 / 904 个测试和 8 个 Agent Kit 测试全绿。
- Slide 只读编辑投影：`buildSlideEditorView` 已在不依赖 Store/UI/Player 的前提下保留 global/surface/scene 三作用域、统一稀疏顺序、scope visibility、命名状态有效值和稳定 `layerItemId` 选择；全量 144 个 Vitest 文件 / 907 个测试和 8 个 Agent Kit 测试全绿。
- Slide 最小写命令：稳定 `SlideEditorSelection` 与 scene Native text move 已在 base/命名状态中分别写入 frame/override；一次有效移动恰好 +1 revision/+1 history，零位移无历史，Undo/Redo 后 ID 稳定；全量 145 个 Vitest 文件 / 913 个测试和 8 个 Agent Kit 测试全绿。
- Workspace 注入边界：原 Workspace 已以严格二选一的 `slideAuthoring` 输入承接 document/packages/selection 与 selection/move；缺省仍逐项调用原 V8 Store，App 尚未启用注入；全量 146 个 Vitest 文件 / 915 个测试和 8 个 Agent Kit 测试全绿，三尺寸 mask 外像素差异均为 0。
- 测试 V9 单后端：只有精确 query 才让原 App/Workspace 读取直接 V9 fixture；一个 Native text 以稳定 `layerItemId` 投影、选择并一次性移动，V8 Store project 不变；全量 147 个 Vitest 文件 / 920 个测试和 8 个 Agent Kit 测试全绿，默认三尺寸 mask 外像素差异均为 0。
- `V05 not accepted / GATE-V = NO-GO`：真实 Electron 可以通过 Phaser 几何代理移动 V9 frame，Undo/Redo 与 schemaVersion 9 archive 也已走通到首轮保存，但 V9 Native text 没有进入隔离 Player 的视觉树；当前 accepted cursor 仍为 V04 `62cd1a4255f3f2d82fd98b1978fce3392bbc16e6`。

### W11｜V9 最小纵切真实闭环波（历史记录）

- Status: `archived / superseded by W12`
- Common accepted parent SHA: `62cd1a4255f3f2d82fd98b1978fce3392bbc16e6`
- Write cards: `V05`（主协调者，主工作区，串行）
- Read-only audit cards: 无
- Parallel preflight: V05 修改第 5.8 节列出的高冲突冻结文件 `App.tsx`，且把真实鼠标、history、archive、进程生命周期和视觉证据汇合为 GATE-V 前唯一事实；`V01→V05` 按计划串行，本波不创建执行器 worktree、不并行写入
- Integration order: `V05`
- Stop condition（历史口径，已由第 0.1 节取代）: 若真实 Electron 指针不能通过原 Phaser bridge 只写 V9，Undo/Redo 不能恢复同一稳定 ID，archive 不是 schemaVersion 9，或完全销毁进程后无法从文件恢复相同 text/frame/ID，则当次 `GATE-V = NO-GO`；主协调者自动物化最短恢复纵切。只有触发权限、付费、新依赖、不可恢复的数据破坏、仓库外操作或目标不可调和时才停止。

### GATE-V 二元裁决｜历史 NO-GO（已获授权恢复）

- Decision date: `2026-08-15`
- Accepted cursor: `V04 @ 62cd1a4255f3f2d82fd98b1978fce3392bbc16e6`；V05 未 accepted，后续 DAG 没有 ready set。
- Failed contract: 第 6.4 节第 2 项“通过纯只读 View 显示一个 V9 Native text”。1366×768 真实 Electron 截图中，V9 text 的预期屏幕区域为纯白；`245 × 62 = 15190` 个像素中低于 RGB 248 的像素为 `0`，而原 V8 Player 教师控制器仍可见。
- Root cause: `ProxyNodeAdapter` 按冻结设计只维护几何命中和变换手柄，隔离 Player 才是视觉真相；V03 的 `slideAuthoring` 只替换 Phaser 的 `document/componentPackages/selection/move` 输入。Workspace 的 Player 启动 payload 仍固定读取 V8 `project/assetFiles/componentPackages`，现有完整 authoring snapshot 也固定读取 `useEditorStore`，且未由握手路径调用。因此 V9 节点可被无形命中并写回 V9，却不能被 Player 显示。
- Prohibited escape hatches: 在 App 内同步写一份 V8 scene、伪造同 ID V8 节点、覆盖 Canvas/Player DOM 或增加 test-only visual 都违反“单 backend、只读 View、无双 Store”；让现有 Player 正确显示 V9 则必须修改 Workspace/Player 接缝，直接命中本波停止条件与 V05 白名单禁令。
- Consequence at the time: V05 未 accepted；不得把仅有命中、history/archive 通过的结果称为 Gate 通过。
- Superseding authorization: 用户已于 2026-08-15 授权主协调者修订计划并持续推进。W12 只补足已证明缺失的 Player 只读视觉投影，不引入双 Store，也不提前建设通用 A07/S02。

### ACTIVE_CARD｜V05 闭合 V9 Slide 真实鼠标、历史与 archive 重开

- Owner: `strong-coordinator`
- Status: `superseded by V05F / not accepted`
- Wave: `W11`
- Accepted parent SHA: `62cd1a4255f3f2d82fd98b1978fce3392bbc16e6`
- Dependencies: `V04 accepted @ 62cd1a4255f3f2d82fd98b1978fce3392bbc16e6`
- Assigned worktree: `C:\Users\74755\Documents\HTML课件编辑器`
- Assigned branch: `codex/v9-editor-v8-base`
- Parallel eligibility: `serial`
- File-overlap proof: 不适用
- Integration order: `1`
- 唯一可见/模型结果: 同一个原 App/Workspace 在测试 backend 下用真实 Electron 指针拖动 V9 text，一次拖动只增加一次 revision/history；键盘 Undo/Redo 可逆；保存文件为 schemaVersion 9；彻底关闭 Electron 后重新启动、打开该文件，文字、frame 与 `layerItemId` 不变且可继续拖动。
- Before: V04 已把 V9 fixture、selection/move history 接进原 Workspace，但 V9 测试状态尚无 dirty/saved baseline、Undo/Redo、App 文件生命周期或进程重开证据；原 App 的保存/打开和快捷键仍只调用 V8 Store。
- After: V9 slice 以 project object identity 记录 saved baseline/path，并提供纯 undo/redo/open/save-completion；原 App 只在测试 backend 下把现有新建/打开/最近/保存、窗口 dirty/title 和键盘 Undo/Redo 路由到 V9，默认路径逐行保留 V8；新的真实 Electron E2E 保存 Undo 态、Redo 态，销毁整个进程后重开 archive，并从恢复位置继续拖动和保存。

读取来源：

- BASE3E: `src/renderer/App.tsx` 的 `confirmDiscardIfNeeded`、`handleNew/handleOpen/handleOpenRecent/handleSave`、dirty/title effect、save-and-close IPC listener 和 keyboard handler；原 `TopToolbar` 只通过既有 App callbacks 触发文件动作，本卡不修改它
- DONORF77: 无；不得复制失败前端的 Store、Shell、Canvas 或 E2E
- CURRENT: `src/renderer/course/v9SlideVerticalSlice.ts`；`src/renderer/project/courseProjectArchive.ts` 的正常 V9 create/open；V02 history command；V03 Workspace 单输入；V04 精确启动选择

产品修改白名单：

- `src/renderer/course/v9SlideVerticalSlice.ts`（只增加 saved baseline/path、dirty、undo/redo、open/save-completion 纯状态函数）
- `src/renderer/App.tsx`（只在现有文件动作、dirty/title 和 keyboard 分支增加测试 backend 二选一；默认 V8 分支原样保留）

测试修改白名单：

- `tests/unit/v9SlideVerticalSlice.test.ts`（扩展 dirty/Undo/Redo/save baseline 与 V9 archive roundtrip）
- `tests/e2e/v9SlideVerticalSlice.spec.ts`（新建真实 Electron 指针、保存、完全关闭重启、打开、截图闭环）

明确禁止：

- 修改 `ProductApp.tsx`、`main.tsx`、TopToolbar、Workspace、Store、Phaser/bridge、Course Project/V8 Schema/types、V01/V02/V03、其它 UI/CSS、Player/Host、guard、golden、behavior map、package/lockfile、archive/export 实现或 IPC；
- 新建 App/Shell/Workspace、Store、Context、Provider、Adapter、EditorPort、command bus，或把临时 `SceneDocument` 写入 history/archive、从兼容 View 反向构造工程；archive 只能读取 `history.present`；
- 运行时 backend toggle、修改启动 query、默认启用 V9、静默打开/迁移 V8、持久化测试 flag，或让同一次文件/历史/移动动作落到两个 project backend；
- 把 project object identity dirty 判断替换成只比较 revision 数字；不得因撤销分支复用 revision 而误报 clean；
- 为通过 E2E 暴露 test-only DOM/global API、直接调用 reducer、直接改 Canvas/Player DOM，或把 Playwright `dispatchEvent` 当真实拖动；必须从原 canvas 坐标输入并由保存文件证明写入；
- 扩展到 TopToolbar Undo/Redo 按钮、恢复副本、resize/rotate/keyboard nudge、通用 V9 lifecycle/Port；这些分别属于 A02/K09/S04；
- 改动 JSX DOM、className、style、data-testid、画布尺寸或 UI 控件；不得更新 golden；
- 修改本计划以外的白名单外文件、运行 `npm install`/`npm ci`、push。

临时证据路径（Git 忽略，不属于产品变更）：

- `output/v05/` 与 `test-results/v05/`（截图、archive 检查和系统级鼠标证据；不得更新 golden）

实现步骤：

1. 扩展 V9 slice state：`savedProject` 必须保存真实 project object reference，`projectPath` 与工程分离；dirty 为 `history.present !== savedProject`。undo/redo 复用现有 V9 history 并重验稳定 selection；open 以 archive project 建新 history/saved baseline，save-completion 只记录实际写盘的 project reference/path。
2. 原 App 保持一次性 backend 选择；用 ref 镜像当前 V9 slice 以处理异步保存完成，不建立 Store。测试 backend 下，新建生成新 fixture，打开/最近只走 `openCourseProjectArchiveAsync`，保存只把 `history.present` 和空 fixture 文件闭包交给 `createCourseProjectArchiveAsync`，默认分支继续原 V8 archive。
3. active dirty/title 在测试 backend 下来自 V9；现有 main dirty IPC 与 save-and-close callback 因此正确。Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y 只调用 V9 undo/redo；默认仍调用原 Store。TopToolbar 的 Save/Open 继续经 App callback；本卡不迁移其直接 Store history/title 读取。
4. 单测冻结：move 后 dirty、undo 回 saved reference 后 clean、redo dirty、保存后 clean、保存后 undo dirty；同步创建/打开 V9 archive 后 text/frame/ID 和 schemaVersion 9 不变，V8 Store project 不变。
5. E2E 在 1366×768 原 App 中用 canvas 坐标执行真实 click/drag；以窗口 dirty title 和保存 archive 证明一次移动、Undo、Redo。保存后彻底销毁 Electron，启动新进程、打开同一 archive，再从恢复后的 text 坐标继续拖动并保存；检查稳定 ID、frame 增量、无 renderer/console/external 错误，保存截图并逐项比对冻结壳层几何。
6. 另跑默认三尺寸 preservation visual；mask 外像素差异必须仍为 0。主协调者再用可见 Electron 的 Windows 系统级鼠标做一次独立移动/Undo 复核，证据写入忽略目录，不替代自动化。

验证命令：

```powershell
git status --short
git branch --show-current
git merge-base --is-ancestor 3e41ec058627d38c4b9f5439b454cc72331e1485 HEAD
npm run verify:editor-preservation
npx vitest run tests/unit/v9SlideVerticalSlice.test.ts tests/unit/slideEditorView.test.ts tests/unit/slideEditorCommands.test.ts tests/unit/workspaceSlideAuthoring.test.ts tests/unit/editorStore.test.ts
npm run typecheck
npm run build:renderer
npm run build:electron
npm test
npm run prepare:e2e
npx playwright test tests/e2e/v9SlideVerticalSlice.spec.ts --workers=1
npm run test:e2e
$forbidden = rg -n "editorStore|zustand|react|CourseStudio|CourseSurfaceCanvas|V9EditorShell|Player|SlideSurfaceHost|archive|migrate" src/renderer/course/v9SlideVerticalSlice.ts 2>$null
if ($LASTEXITCODE -eq 0) { $forbidden; throw 'V05 pure slice dependency found' }
if ($LASTEXITCODE -ne 1) { exit $LASTEXITCODE }
git diff --check
git diff --cached --check
git diff --name-only
git diff --cached --name-only
git diff --name-only 62cd1a4255f3f2d82fd98b1978fce3392bbc16e6
```

鼠标/截图证据：`tests/e2e/v9SlideVerticalSlice.spec.ts` 必须产生 1366×768 重开截图和两次从真实 canvas 坐标进入 Phaser 的拖动；archive 分别证明 Undo 恢复、Redo 恢复移动以及重开后继续移动。另保留 Windows `SendInput` 可见 Electron 的 move/Undo 坐标、前后 frame 和截图。默认三尺寸 preservation mask 外逐像素差异仍为 0。通过仅可记为 `engineering candidate`；GATE-V 由主协调者另行二元裁决。

Commit: `feat(editor): close V9 Slide gate vertical slice`
Rollback: `git revert <task-sha>`

### W12｜FT1 / V05F 快速恢复可见纵切

- Status: `in_progress`
- Common accepted parent SHA: `62cd1a4255f3f2d82fd98b1978fce3392bbc16e6`
- Write cards: `V05F`（主协调者，主工作区，串行）
- Read-only audit: 只允许一个 Terra 审计槽串行反证 Phaser/生命周期根因；用户另行取得的 Kimi 报告只作为外部意见，由主协调者核实后选择性吸收，不授予写入或 Gate 权限。
- Parallel result: `App.tsx` 与 `Workspace.tsx` 均为高冲突主入口，且当前未 accepted 的 V05 调查 diff 已在主工作区；不创建 Terra worktree。
- Integration order: `V05F → GATE-V`

### ACTIVE_CARD｜V05F 可见 V9 text、真实拖动与 archive 重开

- Owner: `strong-coordinator`
- Status: `in_progress`
- Wave: `W12`
- Accepted parent SHA: `62cd1a4255f3f2d82fd98b1978fce3392bbc16e6`
- Dependencies: `V04 accepted`
- Assigned worktree: `C:\Users\74755\Documents\HTML课件编辑器`
- Assigned branch: `codex/v9-editor-v8-base`
- Parallel eligibility: `serial`
- Integration order: `1`
- Outcome: 原 App/Workspace 的隔离 Player 通过现有 authoring patch 协议显示 V9 只读 `SceneDocument` 投影；同一 text 可被真实 canvas 指针拖动、Undo/Redo、保存 schemaVersion 9、完全关闭重开并继续拖动，且 V8 Store 不写入。
- Product whitelist: `src/renderer/course/v9SlideVerticalSlice.ts`、`src/renderer/App.tsx`、`src/renderer/ui/Workspace.tsx`、`src/renderer/ui/workspaceSlideAuthoring.ts`。
- Test whitelist: `tests/unit/v9SlideVerticalSlice.test.ts`、`tests/unit/workspaceSlideAuthoring.test.ts`、`tests/e2e/v9SlideVerticalSlice.spec.ts`。
- Targeted checks: 两个相关 unit 文件、typecheck、受影响的 Renderer build、一次 `v9SlideVerticalSlice.spec.ts --workers=1`、一次 `verify:editor-preservation` 静态守卫和 `git diff --check`；Electron main 未变化时复用既有 build 证据，不重跑。通过后 GATE-V 只额外汇总一次 `npm test`。
- Preservation scope: 本卡不得修改 JSX DOM、className、style、data-testid、画布尺寸或 golden；若最终 diff 触及这些范围，才升级为对应视觉复核，不因 `Workspace.tsx` 文件名本身重复运行三尺寸或 SendInput。
- Stop only if: 闭环必须引入新依赖、改 Schema/IPC、写入 V8 Store 或建立第二套 Player/Workspace；普通 Workspace/Player 接缝调整由主协调者自行处理。
- Visual evidence: 只保留 1366×768 重开截图和 Playwright `page.mouse` 从原 canvas 坐标进入 Phaser 的一次路径；archive 同时证明 frame/ID 写入。取消三尺寸重复截图与 SendInput。

Commit: `feat(editor): close visible V9 Slide gate`
Rollback: `git revert <task-sha>`

---

## 11. 最终完成定义

只有以下事实全部成立，产品才可称为本轮重构完成：

1. Git 历史基于 `3e41ec0`，而不是 `f77ba9e`；
2. 教师看到的是原 V8 `App/ui/Workspace/CSS` 原地升级后的产品；
3. `ProductApp` 只有原 `App` 一个入口；
4. Course Project V9 是唯一可写、可保存、可发布协议；
5. Project V8 只作为用户显式导入迁移和必要兼容测试存在，不得成为新课件默认生成或编辑真相源；
6. Slide 的全局层、状态条、画布、字体、文字背景、属性、开发、控制器和试运行达到成熟合同；
7. Flow 和 Spatial 使用各自合适的编辑形式，但共享原外壳、文件、历史、作用域、控制器和隔离 Player；
8. Runtime API 2/3 兼容、Component API4、Published V2、五类导出真实闭环；
9. 试运行和导出 capture 不污染编辑 Project 或现场运行会话；
10. 原高价值测试在行为映射中全部保留或有明确 replacement；
11. 反重写 verifier、三尺寸 Electron、一个真实鼠标主路径、保存重开、clean-Windows 在 M8 最终门禁全绿；
12. 普通教师界面没有协议词和未接入 AI 的占位入口；
13. 强模型体验审计至少为 `art candidate`；
14. 最终 `accepted` 来自教师对可见任务的明确验收，而不是自动化或模型自评。

若自动化全绿但教师仍觉得难用，结果仍是 `unusable` 或 `engineering candidate`，不得用“架构正确”覆盖产品失败。
