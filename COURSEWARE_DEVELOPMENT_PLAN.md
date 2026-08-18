# Course Project V9 编辑器长期开发方案：以成熟 V8 为主干逐步演进至 V9

> 计划版本：11.4
> 更新日期：2026-08-17
> 11.4 变更：教师要求把编辑态黑屏复核、课树拖排恢复与 R8 同时拆成可并行子任务；Electron 窗口类仍互斥，机器命令可与产品补丁并行。
> 最终协议目标：Course Project V9、Published Course V2、Runtime API 2/3、Component API 4
> 路线状态：已确认，取代此前“从 V9 集成态重建 V8 表面”的路线
> 唯一长期计划：本文件
> 已整合输入：Cursor `v8_product_first_d23d3077.plan.md`；该文件自本版起只作来源记录，不再作为并行执行计划

本计划记录经过真实体验复核后确认的新路线：停止在当前 V9 集成态上继续补丁式恢复 V8 能力，改为以真正成熟、可运行的 V8 编辑器作为产品主干，把现有 V9 的协议、运行时、多表面模型和命令逐项作为供体迁入 V8。迁移期间不关闭 V8 已有功能；只有某个完整纵切达到功能等价并通过真实 UI 验证后，才允许替换对应旧实现。

此前 T01–T12 和当前 `codex/v9-editor-v8-base` 的结果继续保留为代码、测试、失败案例和 Git 供体，但不再代表正确产品主线，也不得继续作为修修补补的默认开发基线。

## 0. 路线纠正与事实结论

### 0.1 为什么必须换路线

此前路线实际使用的是 `e2e34aa`：它是“V9 数据与 Player 已集成、原 App 壳仍在”的状态，不是一版完整 V8 编辑器。随后通过 controlled adapter 把部分 V8 UI 接到 V9 数据上，形成了两组并存但能力不等价的路径：

- 默认 V9 路径进入不完整的 controlled 分支；
- 完整媒体、动画、富文本、全局属性等 V8 实现仍留在 Legacy 分支，但默认产品不可达；
- 自动化大量验证遗留 V8 store、辅助函数或被蒙版的壳层，而没有验证默认 V9 真实工作流；
- 最终体验清单中大量项目未执行或受阻，仍被当作集成完成。

这导致新增内容、声音与媒体、全局层、教师控制器、文字、图层、动画、Flow 和 Spatial 同时出现回退。继续在该结构上逐点修复，会反复触碰 App、store、Workspace、右栏、Player 和坐标系统，风险已经高于从成熟产品主干渐进升级。

### 0.2 新路线的准确表述

> **以 `f272756` 的成熟 V8 编辑器作为候选产品基线，保持它的完整 App、Workspace、store API、属性、图层、媒体、组件和真实 E2E；把当前 V9 全部作为能力供体，逐纵切迁入。最终在 V8 表面能力完整保留的前提下，将工程真相原子切换为 Course Project V9，再增加 Flow、Spatial、Mixed 与 V9 交付能力。**

这不是把最终产品降级为 V8，也不是废弃现有 V9 工作，而是改变开发方向：

```text
成熟 V8（持续可用的产品主干）
  ├─ 冻结并保护全部既有编辑能力
  ├─ 引入 V9 协议、保存、Player 与稳定作者地址
  ├─ 在同一套 V8 UI 下完成 V9-backed Slide 等价实现
  ├─ 达标后原子切换工程真相，不做双写
  ├─ 复用同一元素编辑内核增加 Flow / Spatial
  └─ 完成 Mixed、发布、导出与 V8 显式迁移
最终 V9
```

### 0.3 两版方案的整合裁决

根目录 11.0 方案与 Cursor “V8 Product First” 的目标一致：停止修补当前受控 V9 表面，以成熟 V8 产品体验为主干，在 store/command/persistence 边界迁入 V9。两版存在差异的部分统一如下：

| 议题 | Cursor 方案 | 统一后的决定 |
|---|---|---|
| V8 代码基线 | 从 `14890bb` 开工 | 从 `f272756` 开工；`14890bb` 位于 `3e41ec0` 的 V9 重建之后，当时 `ProductApp` 默认进入 Course Studio V9，因此只作为 V8 行为地图，不是纯 V8 代码基线 |
| 视觉参考 | `378c195` | 保留为经 legacy route 采集的视觉合同参考；必须在真实 `f272756` 产品路径重新确认，不能直接继承“通过”结论 |
| 产品入口 | `ProductApp` 只挂 V8 `App` | 用户可见入口始终只呈现成熟 V8 App 表面；V9 candidate 只能通过测试/开发注入替换 backend，不得重新出现 `CourseStudioApp` 与 V8 App 的产品级双路由 |
| V9 存盘切换 | V8 Slide 稳定后在 store 边界切换 | 保留“只在 store 边界切换”，但先在 R2–R3 独立完成 V9 candidate；Slide、global、surface、媒体声音和控制器未全部等价前，不切默认真相 |
| 全局控制器 | 不作为场景图层项，只在全局层调整 | 控制器不伪装成 scene-owned item；在统一有效图层中以 `global` 来源可见，进入全局作者范围后编辑，既不污染场景 owner，也不靠隐藏规避统一图层能力 |
| Flow / Spatial | 强文本 Flow；Spatial 复用 Slide 并增加无限世界与镜头 | 全量吸收，分别落实到第 5.4、5.5 节和 R4、R5；不复用当前弱化的 Flow/Spatial UI |
| 执行计划 | Cursor 文件与根计划同时存在 | 本文件是唯一长期计划；Cursor 文件中的需求和禁令由本版承接，不再独立领取其 todo |

因此，本次整合采用 Cursor 版更直接的产品优先要求，同时采用根计划更严格的 Git 事实、原子切换 Gate、ownership 语义和分阶段验证。

### 0.4 教师原始六点问题的保留矩阵

下表是对教师原始反馈的逐项硬约束，不是背景说明。任一行未通过，都不得称对应阶段完成或切换默认 backend。

| 原始问题 | 不可弱化的产品要求 | 实施与 Gate |
|---|---|---|
| 1. 无法新增 Flow/Spatial；新增演示使旧演示消失 | 新建工程和工程内新增都直接提供三类 surface；Slide 主按钮只给当前 Slide surface 新增 scene，不能创建不可见 surface、替换导航或使旧内容失联 | 第 5.1 节、R6、最终场景 13 |
| 2. 声音与媒体管理消失；图片不可继续编辑 | 完整保留 V8 MediaTab、声音库与媒体库；图片/视频导入后必须能加入画布、命中、选中、替换并修改属性，声音必须可试听、改名、引用、保护删除和发布播放 | 第 6 节、R2–R3、最终场景 7–8 |
| 3. 全局控制器图层、逐场景显隐和几何失效 | 本计划选择“补齐功能”：控制器保留在统一有效图层，标明 global owner，支持 owner 内排序和逐 location 显隐；scene-only 列表不伪装场景行。作者框、八向缩放、运行态和 Player 共用几何且拖动跟手 | 第 5.3、5.6 节、R3、最终场景 5–6 |
| 4. Flow/Spatial 退化 | Flow 必须能直接点选、双击就地编辑和做选区级富文本；普通 paragraph 不进课程树或 z-order 图层，也不以图层双击改正文；媒体、组件、属性和全局层可用。Spatial 复用 Slide 元素内核，只增加无限世界与镜头；双击、属性、媒体、组件、控制器和缩放样式不得退化 | 第 5.4、5.5 节、R4–R6、最终场景 11–12、14 |
| 5. Slide 插入、双击和局部格式回归 | 连续插入自动错开；画布双击进入文字编辑；属性/画布选区的局部格式真实生效，并通过保存重开与 Player 对比 | 第 6、7 节、R2、最终场景 1、3 |
| 6. 动画及未发现能力消失 | 简单出现动画和专业动画/互动都保留；`f272756` 真实可达但尚未列出的 V8 能力同样受保护，发现遗漏只能扩充清单，不能解释为范围外 | 第 6 节、R0–R3、最终场景 9 及 R8 全量复核 |

## 1. 目标结果

最终交付必须同时满足：

1. **V8 产品能力零降级**：成熟 V8 的选择、拖缩、文字、属性、图层、媒体、声音、动画、组件、互动、控制器、快捷键、保存和发布能力全部保留。
2. **只有一套产品表面**：始终使用成熟 V8 的 App 壳与组件作为唯一产品 UI，不再维护可见的 V8/V9 双编辑器，也不再建立能力残缺的 `ControlledXxx` 平行表面。
3. **最终工程真相是 V9**：完成切换后，新建、编辑、保存、重开、试运行、Player 和导出只写 Course Project V9；V8 只作为显式导入来源和兼容证据。
4. **V9 新能力完整**：Slide、Flow、Spatial 可直接新建、编辑和发布；Mixed 从真实 locations/surfaces 自动推导。
5. **开发过程持续可用**：在 V9-backed 纵切未达标前，成熟 V8 默认路径保持完整可用，不通过禁用或隐藏功能制造“迁移完成”。
6. **真实体验是 Gate**：自动化最多证明 `engineering candidate`；真实 UI 操作、视觉和 Player 复核通过后才可进入产品主线，教师明确验收后才可称 `accepted`。

## 2. 不可妥协的迁移原则

- **不在当前 HEAD 上继续补丁式修复。** 当前分支保持为供体和失败取证现场。
- **不破坏成熟 V8。** 新开发从独立 branch/worktree 进行，不 hard reset、不覆盖或删除现有分支。
- **不整批重放 V9。** 禁止整体 cherry-pick `3e41ec0`、`bffbf95` 或后续大集成提交；只按能力读取 diff、源码和测试，重新接入成熟 V8 主干。
- **不双写。** 任一产品运行路径在任一阶段只能有一个工程写入真相。内部开发开关可以选择 V8 backend 或 V9 candidate backend，但一次会话不得同时写两套文档。
- **不双 UI。** 不新增第二个 App、第二套 RightSidebar、第二套 PropertiesTab 或长期 Legacy/Controlled 分叉；V9 适配发生在成熟 V8 组件下方。
- **不以 no-op 完成接线。** 已显示的输入、按钮和菜单必须有真实命令；不得用空回调、假成功或“现有内容不会改变”作为完成态。
- **不以隐藏功能换绿灯。** V8 已有入口不能因 V9 尚未迁移而被隐藏、禁用或删除；未迁完时继续走 V8 产品路径。
- **不让测试替代体验。** 辅助函数单测不能证明真实 Workspace；Legacy store 测试不能证明 V9；蒙版画布不能证明控制器或选择框一致。
- **不新增持久化模式字段。** 纯 Slide、纯 Flow、纯 Spatial 与 Mixed 最终仍从 locations/surfaces 推导，不保存 `projectMode`。
- **全局层必须保留。** `globalLayerItems`、`surfaceLayerItems` 和逐 location 可见性是 V9 能力，不因 Mixed 或轻量 UI 被取消。
- **只有一个当前产品入口。** 每一阶段必须指定唯一的活动产品 worktree；从该 worktree 根目录运行 `npm run dev` / `npm run start` 必须打开当前稳定产品路径。供体分支、归档 worktree 和 candidate backend 不得同时被称为“当前版”。
- **迁移期格式严格隔离。** 默认真相仍为 V8 时，V8 产品路径不得把 V9 `.h5lesson`、V9 recovery 或共享 AppData 中的 V9 数据误当作 V8 工程打开；应明确识别并给出可行动的错误或引导至独立迁移入口。
- **中间最小验证，最终全量验证。** 中间阶段只跑相关定向测试与一个真实 UI 冒烟；最终整合阶段才跑全量测试。

## 3. Git 基线与供体决策

### 3.1 提交定位

| 提交 | 事实 | 新路线用途 |
|---|---|---|
| `79c821f` | V8 课件工作流基础收口 | `f272756` 资格不通过时的二级 V8 对照点 |
| `f272756` | `3e41ec0` 的直接父提交；`main.tsx` 直接渲染完整 `App`，仍有原 MediaTab、动画、全局属性、组件与 `editor.spec.ts` | **成熟 V8 候选产品基线** |
| `3e41ec0` | 首次以 Project V9 大规模重建；一次改动 312 个文件并删除多项 V8 合同 | V9 协议与早期实现供体，绝不作为 V8 基线 |
| `378c195` | 通过后来的 legacy 路由采集的 V8 视觉合同 | 视觉参考，不是代码基线 |
| `14890bb` | V8 行为地图 | 清单参考；必须回到真实 V8/V9 产品路径重建验证，不能原样视为通过 |
| `6361641` | V9 Slide 手势、属性同步、history 等纵切 | 选择性代码与测试供体 |
| `e2e34aa` | V9 单一工程真相、原壳、Flow/Spatial/Player 已有大量集成 | V9 功能供体；旧“首选恢复基线”决定废止 |
| `bffbf95` / `4755034`（当前供体 HEAD） | 当前失败实现及其根目录合入，含大量新命令、UI 接线、测试和失败模式 | 只作逐文件供体与反例，不继续原地修复，不整体重放 |

### 3.2 基线资格决策

默认候选为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`，因为它是 V9 大重建前最后一个提交，并包含 `79c821f` 的 V8 工作流以及后续控制器、运行时、证据与稳定性收口。

但提交名不能代替真实体验。正式开发前必须在独立 worktree 对 `f272756` 完成 R0 资格验证。只有出现以下任一情况，才向 `79c821f` 或其附近提交二分：

- App 无法正常启动或保存重开主链断裂；
- 用户已确认的核心 V8 功能在 `f272756` 中已经回退；
- `79c821f..f272756` 的某个编辑器改动引入可复现严重问题；
- 项目文件或 Player 出现不可恢复破坏。

不得因为少数测试过时、构建告警或文档变化就放弃 `f272756`；先区分产品缺陷与工具链年代差异。

### 3.3 安全工作区

1. 保留当前 `codex/v9-editor-v8-base`、`codex/v9-parity-reconstruction` 和归档分支，不删除历史成果。
2. 从 `f272756` 创建新的独立分支/worktree，建议命名 `codex/v8-to-v9-rebuild`。
3. 将该 worktree 明确登记为唯一活动产品工作区；所有启动、构建和验证命令都从它的仓库根目录运行，旧根目录只作供体时必须显式标注，不能形成“两套当前产品”。
4. R0 资格验证前不移植任何 V9 源码。
5. 若旧提交与当前 Electron/Node 工具链不兼容，只允许窄幅前移 `main`、`preload`、启动脚本或等价宿主兼容层；不得借机带回 `CourseStudioApp`、controlled sidebar 或第二套产品路由。
6. 资格通过后建立明确的 V8 基线提交与截图/体验记录。
7. 当前 V9 仅从只读 diff 中摘取能力；不得让旧任务文档自动决定整文件覆盖。

## 4. 迁移架构

### 4.1 唯一 UI：保留成熟 V8 组件

下列 V8 组件及交互首先作为稳定产品表面保留：

- `App`、TopToolbar、ScenePanel、Workspace、SceneStateStrip、RightSidebar；
- ElementsTab、MediaTab、Layers/Nodes、PropertiesTab、Automation、Components、Developer；
- 画布选择、框选、八向拖缩、旋转、文字/公式就地编辑；
- 图片/视频/声音管理、动画、组件属性、互动和教师控制器；
- V8 的 store selector/action 形状以及真实 Electron 工作流。

迁移时优先保持这些组件的 props、事件和用户行为不变，在 store/command/persistence 下方逐步替换实现。`ProductApp` 或等价启动组件不得向用户提供 V8 App / Course Studio V9 双编辑器切换；内部 backend 对照只能由测试夹具或开发注入触发，并且两边复用同一套 V8 UI。确需调整接口时，必须先证明 V9 语义无法通过现有 UI 表达，并为所有旧能力提供完整替代，不能先创建一个功能较少的 controlled 分支。

### 4.2 工程真相分阶段切换

| 阶段 | 默认产品真相 | V9 状态 | 规则 |
|---|---|---|---|
| R0–R1 | V8 `ProjectDocument` | 协议和候选 backend 只在独立测试中存在 | 默认产品不受影响，不双写 |
| R2–R3 开发期 | V8 仍是默认；V9-backed 编辑器通过内部开发入口单独运行 | 在同一 V8 UI 下完成 Slide、global、surface、声音和控制器全部等价能力 | 一个会话只选一个 backend |
| R3 Gate 后 | Course Project V9 | V8 仅保留显式导入/对照 | 只有第 6 节全部 V8 能力通过并获确认后才原子切换 |
| R4–R7 | Course Project V9 | 增加 Flow、Spatial、Mixed 和交付能力 | 不再回落隐藏 V8 store，不出现双真相 |

内部开发入口只用于比较两个 backend，不能成为用户可见的长期“旧版/新版编辑器”切换。切换 Gate 前默认仍是成熟 V8；Gate 后默认只剩 V9。

### 4.3 可复用与禁止复用

优先复用：

- Course Project V9 Schema、类型、校验、迁移和 archive；
- Published Course V2 producer 与 Player host；
- Runtime API 2/3、Component API 4 与稳定 `authoringAddress`；
- V9 Slide 命令中已验证的 history、selection、引用维护和状态 override；
- Flow/Spatial 数据模型、命令、相机、路径、关系和运行时；
- 当前分支中可独立证明正确的纯函数、单元测试与导出实现。

禁止直接复用：

- 当前不完整的 ControlledElements/ControlledProperties 等平行 UI 分支；
- 用 no-op 回调、capability gate 或隐藏入口处理未迁移功能的代码；
- 当前 Flow 把普通 paragraph 当通用图层行的设计；
- 当前 Spatial 独立重造并弱化 V8 元素编辑器的整套面板；
- 当前教师控制器的双几何、代理框和错误坐标换算；
- 只验证 legacy store、辅助函数或蒙版画布的“绿色”结论；
- `bffbf95` 等超大 checkpoint 的整体 cherry-pick。

## 5. 产品与 UI 决策

### 5.1 “新建工程”与“新增内容”

新建工程菜单始终提供：

- 空白演示课件；
- 空白流式讲义；
- 空白无限画布。

进入工程后的新增控件采用“主按钮 + 下拉菜单”，不再把所有动作塞进一个向下越界的浮层，也不把新增场景错误实现为新增不可见 Slide surface：

| 当前界面 | 主按钮默认动作 | 下拉菜单 |
|---|---|---|
| 纯 Slide | 在当前 Slide surface 新增场景 | 新增流式讲义；新增无限画布 |
| 纯 Flow | 新增 Flow 页面 | 新增演示页面；新增无限画布 |
| 纯 Spatial | 新增无限画布页面 | 新增演示页面；新增流式讲义 |
| Mixed | 默认新增演示场景；若尚无 Slide surface，创建一个 Slide 页面 | 新增流式讲义；新增无限画布 |

所有菜单必须根据视口向上或向下避让，不能被窗口、面板或滚动容器裁切。新增后旧内容继续在同一课程结构中可达，任何新建命令不得让既有 surface/location 从导航中消失。

### 5.2 自动适配

- 不保存 `projectMode`。
- 纯 Slide、纯 Flow、纯 Spatial 与 Mixed 从实际 locations/surfaces 推导。
- 添加、删除或选择 location 后，中央工作区和右侧面板自动跟随 active location。
- 自动适配只改变表面呈现，不静默迁移、删除或隐藏内容。

### 5.3 全局层与共享层

- 四态左栏固定显示“共享内容 → 全局层（全课）”。
- 全局层与页面类型正交，不是 location，不参与四态推导。
- `globalLayerItems` 保持唯一全局 owner；`surfaceLayerItems` 保持 surface owner。
- 有效图层中显示来源，并支持 owner 内排序、锁定、隐藏、复制和删除。
- 全局项使用 V9 已有的 `all/include/exclude + locationIds` 实现逐 location 可见性。
- 教师控制器属于 global；允许在当前 location 上调整是否显示，但不能搬成 scene item。
- 若 UI 提供“仅本场景 owner”的局部列表，控制器不作为场景行出现；统一有效图层仍必须以清晰的“全局”来源展示控制器，并能进入全局作者范围编辑。
- 不采用彻底隐藏全局控制器的方式来掩盖缺少的 ownership-aware 编辑能力。

### 5.4 Flow

- 左侧导航只显示 Flow 页面和可导航 heading/section 的父子层级。
- paragraph、quote、list、table、formula、media 等普通 block 不成为课程级节点，也不进入通用 z-order 图层列表。
- 普通 block 必须可直接命中和点选；双击进入就地编辑，选中后在 block 内或其下方显示上下文工具与属性，不通过图层双击执行“改名”或修改正文。
- Flow 采用当前产品最强文字编辑能力：caret/选区、IME、选区级粗体/斜体/颜色等局部格式、段落与标题结构、列表/表格/公式、Undo/Redo 和保存重开均为硬要求，不能退化成少量字符串属性字段。
- 只有真正具备浮层/z-order 语义的媒体、组件、Runtime、surface/global overlay 进入图层系统。
- 导入的媒体和组件必须能从 Flow 作者入口实际插入、命中、选择和编辑属性；不得只显示入口或“面板暂不可用”。
- Flow 中点击“全局层”必须进入真实 global authoring scope，并能选择、编辑和设置逐 location 可见性。
- 文字就地编辑、IME、媒体、组件、属性、互动、右键、Delete、排序和保存重开必须完整。
- 运行态目录可以完全收起，仅保留贴视口边缘的三角按钮；展开/收起采用已确认的方案 1。

### 5.5 Spatial

- Spatial 不复制一套弱化的编辑器；文字、公式、图形、图片、视频、Component、Runtime、选择、图层和属性复用 V8 成熟元素编辑内核。
- Spatial 只替换必要部分：无限世界坐标、world-to-screen 变换、pan/zoom、camera frame、路径、关系、semantic zoom 和镜头运行调度。
- 世界元素使用 world 坐标；教师控制器和课程 UI 属于 viewport/global 层，不随世界 pan/zoom。
- 画布命中、双击、拖缩和右栏属性不得依赖相互冲突的 Pointer/DoubleClick 事件路径。
- Spatial 的缩放条、选择框、八向手柄和真实教师控制器沿用 Slide 的视觉与交互合同；不得换成另一套样式，也不得把控制器降级成占位矩形。
- 导入的媒体和组件必须能实际插入、命中、选择和编辑属性；点击“全局层”必须进入真实 global authoring scope。
- 默认场景属性增加镜头调度，但不删减演示页已有媒体、组件、动画、图层和属性能力。

### 5.6 教师控制器

- 作者内容、选择框、八向手柄、属性预览、试运行和 Published Player 共用同一规范几何。
- 所有 pointer delta 必须相对真实 stage/viewport 换算，不能拿控制器自身边框尺寸换算 1280×720 画布。
- pointermove 实时预览，pointerup 只提交一次 history；方向与手柄一致。
- 删除无产品意义的“定位控制器”。
- 动作集保持：上一场景、下一场景、场景目录、重播、声音、全屏、收起。
- 运行态收起是会话状态；作者配置与实际 Player 折叠行为一致。

### 5.7 UI 设计先行

- V8 Slide 表面默认以成熟 V8 实际运行画面为基准，不再用重生成的简化壳替代。
- Flow、Spatial 在开发前必须有已确认 UI 图；Mixed 工程内新增沿用第 5.1 节已冻结的主按钮+下拉，R6 **不另开 DESIGN、不等新图**。
- 现有 `V9_EDITOR_UI_*` 图片只作参考；凡未体现全局层、正确新增控件、Flow 层级或共享元素编辑内核的图片必须先修订，不能直接作为实现合同。
- UI 图确认后才能进入对应 R4/R5 实现阶段。R6 执行级文件名、testid 与验证预算见 [`docs/tasks/v8-to-v9-rebuild/artifacts/R6_R8_EXECUTION_PLAYBOOK.md`](docs/tasks/v8-to-v9-rebuild/artifacts/R6_R8_EXECUTION_PLAYBOOK.md)。

## 6. V8 能力保护清单

下列能力是最低底线。低频功能可以渐进披露，但不得删除、禁用、假接线或仅留在旧 backend：

| 领域 | 必须保留的能力 |
|---|---|
| 工程生命周期 | 新建、打开、最近工程、保存、另存、脏状态、防误关、恢复、导入、发布 |
| 场景与状态 | 新增、复制、重命名、排序、删除；基础场景、命名状态与 override |
| 选择与视口 | 单选、多选、框选、拖动、八向缩放、旋转、方向键、zoom/pan、适配 |
| 文字与公式 | 画布双击、属性编辑、IME、富文本局部格式、竖排、自适应宽度、公式编辑 |
| 图形与媒体 | 图形、图片、视频添加/替换/裁剪/适配/播放设置、拖放与批量导入 |
| 声音 | 导入、试听、改名、删除保护、声音库、音量/静音/声道/ducking、互动引用 |
| 图层 | 紧凑单行、来源、选择、拖排、上/下移、置顶/置底、锁定、隐藏、复制、删除 |
| 属性与动画 | 几何、颜色、文字、媒体、组件、背景、状态 override、简单动画和专业自动化 |
| 剪贴板与菜单 | 全选、复制、剪切、粘贴、重复、Delete/Backspace、右键、Shift+F10/Menu |
| 组件与 Runtime | 包导入、插入、替换、props/variant/preset/nested content、作者目标和开发入口 |
| 教师控制器 | 添加/恢复、选择、拖缩、主题、折叠、重播/重置、声音、全屏和 Player |
| 交付 | 当前内容试运行、整课 Player、HTML/包/打印/PDF/PPTX 与资源完整性 |

任何纵切若让上表任一能力在默认产品中不可达，直接判定 Gate 失败，不允许写成“已知限制后续补齐”。

本表是最低保护集而不是封闭范围。R0 必须以 `f272756` 的真实 UI、菜单、快捷键、属性和 Player 建立完整可达能力清单；后续发现任何未列出的 V8 回归，都应追加验收场景并阻断切换，而不是以“计划未写”排除。

## 7. 已知回归必须转化为验收场景

| 已知问题 | 新路线要求 |
|---|---|
| 新增菜单只显示“空白演示” | 验证浮层避让、三类入口可见和键盘可达 |
| 新增演示后旧演示消失 | 主按钮新增当前 scene；课程树始终显示全部既有内容 |
| 声音/媒体管理消失 | 直接保留 V8 MediaTab，V9 数据完成前不替换 |
| 图片导入后不能入画布、命中或改属性 | 真实导入后验证画布插入、选择框、图层选择、替换和属性修改，再验证保存重开与 Player |
| 全局项不能逐场景显隐或排序 | 接入 V9 visibility 与 owner-aware reorder 后才切换 |
| 控制器选择框分离、漂移、单边缩放 | 真实八向 pointer 录像与 Player 对比作为 Gate |
| 双击文字失效、属性局部编辑无效 | 画布/属性共用事务，IME、blur、保存重开和 Player 必测 |
| 图层变长、锁定隐藏排序消失 | V8 紧凑图层原样保留，V9 owner 能力逐项接入 |
| 连续新元素重叠 | 保留并验证 V8 默认插入偏移合同 |
| 动画消失 | V8 SimpleEntranceAnimationEditor 与专业自动化均保持可达 |
| Flow paragraph 出现在通用图层并可双击改名 | 改为文档 block 结构与选中态上下文工具，不走通用图层 rename |
| Flow 全局层、媒体、组件不可用 | 复用真实 overlay host、MediaTab 和组件入口，不画占位卡片 |
| Spatial 只有简化属性和矩形控制器 | 复用 V8 元素内核，Spatial 仅增加世界/镜头能力 |
| 右键/Delete 可能仍不完整 | 从真实 Workspace 验证 Slide/Flow/Spatial/global、多选和文字焦点保护 |
| 根目录与工作区启动出两套产品 | 每阶段登记唯一活动产品 worktree；`dev` / `start` 只打开该阶段稳定路径，供体目录不得冒充当前版 |
| V8 误开 V9 工程或 recovery | R0 增加格式识别与共享 AppData 隔离；不得把 V9 数据按 V8 结构恢复或覆盖 |

## 8. 实施阶段与 Gate

每一阶段遵循：**先保留 V8 → 独立构建 V9 candidate → 最小自动化 → 真实 UI 冒烟 → 通过后才替换**。

### R0 — 成熟 V8 基线资格与冻结

产出：

- 从 `f272756` 建独立 worktree；
- 将该 worktree 登记为唯一活动产品工作区，验证其根目录 `npm run dev` / `npm run start` 只打开成熟 V8 App；
- 启动真实 V8 App，确认工程生命周期、Slide 编辑、媒体声音、图层、动画、组件、控制器和 Player；
- 验证 V8 工程、V9 `.h5lesson`、V9 recovery 与共享 AppData 能被可靠区分；迁移入口尚未启用时对 V9 文件明确拒绝，不静默误开；
- 如需宿主兼容修复，仅窄幅前移 Electron `main` / `preload` / 启动脚本，不引入 V9 产品 UI；
- 对用户已指出的回归建立 V8 真实截图/录像与操作记录；
- 记录 `79c821f..f272756` 的差异，只在发现确切回归时二分；
- 建立不可静默更新的 V8 行为清单和关键视觉基线。

最小验证：现有 V8 相关定向单测 + 一次 Electron 启动/保存重开冒烟，不跑全量。

Gate：教师确认该 V8 基线的核心表面和能力可作为开发主干；唯一启动入口与格式隔离同时通过。未确认前不进入 V9 移植。

### R1 — 引入 V9 协议与交付内核，不改变默认编辑器

产出：

- 引入 Course Project V9、Published Course V2、Runtime/Component API 和 `authoringAddress`；
- 在不启动 V10 的前提下，为 Flow heading/paragraph/quote/list/table 等文字内容补齐向后兼容的选区级富文本承载；旧 V9 纯文本仍可读取，R4 不得另起一套不可保存的 UI 草稿结构；
- 引入 V9 校验、archive、V8→V9 显式迁移和 Player producer；
- 所有新代码以库/纯命令形式存在，不改 V8 默认 App、store 或 UI；
- 建立最小 V9 fixture，证明保存重开和 Player 可运行。

Gate：V8 默认产品零 diff；V9 协议可以在独立 fixture 完成 round-trip。

### R2 — 同一 V8 UI 下完成 V9-backed Slide

产出：

- 在内部开发入口使用同一套 V8 App/Workspace/RightSidebar；
- 保持 V8 selector/action 和 UI 行为，内部改由 Course Project V9 Slide 数据与命令驱动；
- 闭合场景/state、选择、多选、框选、拖缩旋转、文字/公式、媒体、动画、组件、互动、图层、属性和 history；
- 完成保存重开、Undo/Redo、Player 和导出；
- 不建立残缺 controlled 分支，不修改默认 V8 产品路径。

Gate：Slide 核心能力在 V9 backend 下达到 V8 等价并通过相关真实场景；默认产品此时仍保持 V8，不在声音、global 和控制器完成前提前切换。

### R3 — Global / Surface / 声音 / 控制器

产出：

- global、surface、scene、state 四种 owner 全链路；
- 全局逐 location 可见性、owner 内排序与影响范围提示；
- V8 MediaTab 写入 V9 media/assets，声音引用与发布播放完整；
- 教师控制器使用统一几何、八向拖缩、折叠、课程动作和 Player 会话；
- default controller 删除与恢复完整。

Gate：跨至少三个 location 验证 global/surface 可见性、控制器、声音、保存重开和 Player；第 6 节全部 V8 能力在 V9 backend 下通过并获确认后，才原子切换默认工程真相为 Course Project V9。

### R4 — Flow UI 设计确认与完整实现

产出：

- 先修订并确认 Flow 编辑态、运行态展开/收起和导航 UI 图；
- 从空白 Flow 新建，建立页面—标题树；
- paragraph 等普通 block 使用文档结构和上下文工具；
- 媒体、组件、Runtime、属性、互动、右键、Delete、剪贴板和目录完整；
- 运行态贴边三角目录、打印/PDF、保存重开与 Player 完整。

Gate：教师可不依赖导入或代码，从空白完成并发布一份长文 Flow 课件。

### R5 — Spatial UI 设计确认与共享元素内核

产出：

- 先修订并确认 Spatial 编辑态、镜头树、控制器与属性 UI 图；
- 复用 V8 元素渲染、命中、选择、图层、媒体、组件和属性内核；
- 加入无限 world、pan/zoom、camera、path、relation、semantic zoom；
- viewport/global 与 world 坐标严格分离；
- 试运行、保存重开、导出与 Player 完整。

Gate：教师可从空白完成并发布一个包含多种元素和多个镜头的无限画布课件；编辑能力不得低于 Slide 对应元素。

### R6 — Mixed 与新增/自动适配

产出：

- 落实第 5.1 节主按钮与下拉逻辑；
- 课程树跨 Slide/Flow/Spatial 的新增、复制、重命名、排序、删除和切换；
- Pure/Mixed 自动推导；
- 切换 location 时 selection、属性、快捷键和 authoring scope 不串页；
- 全局控制器、课程目录、进度、上一项/下一项和声音跨 surface 一致。

Gate：七种组合（3 个纯态、3 个双态、1 个三态）的推导与新增语义必须成立。阶段内用表驱动单测覆盖七组合，并用一次 Mixed 课程窗口冒烟证明工程内主按钮+下拉与保存重开。七组合各自保存重开、试运行和 Player 的完整窗口矩阵属于 R8 场景 13，不在 R6 重复七次 Electron。执行文件名与禁止重做见任务包 playbook。

### R7 — 交付、迁移与兼容

产出：

- 补齐仍缺的 recovery / recent / 损坏与未来版本拒绝；**不重做** R3-CUT 已完成的 V9 新建、打开、保存和 V8 显式导入；
- 整课预览与 Slide 试运行改为组装已有 Slide/Flow/Spatial host 的 Published V2，不再用派生 V8 HTML 冒充三类 Player；
- HTML/网页包走同一 V2 producer；PPTX/打印接 V2 页列表；Flow DOCX **调用**已有 helper，不重写；
- Runtime API 2/3、Component API 4 的发布 sidecar / DOM 桥若仍缺则补上。

Gate：编辑器、保存文件、Published Player 与导出物对同一课程给出一致结果。阶段内只做一次「保存副本 + 一个 HTML 写文件」窗口冒烟；全量产物打开抽查属 R8。

### R8 — 最终整合、全量验证与教师验收

产出不变：全量机器 Gate、三视口、17 项真实体验、教师验收。**执行不再是单一串行任务。** 2026-08-17 教师要求与两件产品补丁并行拆分，任务包见 `docs/tasks/v8-to-v9-rebuild/10_R8_FINAL_FULL_GATE.md` §11。

| ID | 内容 | 并行 |
|---|---|---|
| R8-A | 编辑态单击/双击不再重挂隔离 Player（窗口证明 `PRE-R8-01`） | 占用唯一 Electron 槽；可与 B/C/D 并行 |
| R8-B | 左栏课树恢复拖排页面（`PRE-R8-02`） | 只写 ScenePanel + 薄 store 命令；可与 A/C/D 并行 |
| R8-C | `check:ai-capabilities` + `typecheck` | 不写源码；可与 A/B/D 并行 |
| R8-D | 全量 Vitest（`npm test`） | 不写源码；可与 A/B/C 并行 |
| R8-E | `build:desktop` | 写 `dist-*`；等 C/D 交卷后串行 |
| R8-F | 现有 Playwright E2E | 要 Electron；等 A 释槽且 E 完成后 |
| R8-G | 三视口视觉 | 要 Electron；与 F/H 互斥 |
| R8-H | 17 项真实体验 | 要 Electron；与 F/G 互斥 |
| R8-Z | 汇总 `FINAL_GATE_REPORT` | 等 A–H；不得自称 `accepted` |

硬约束：不得并行启动会争抢端口、Electron 窗口、AppData 或生成目录的命令。产品补丁不得借 R8 重写已交付能力。Gate 口径不变：机器全绿 = 项目级 `engineering candidate`；体验通过 = `art candidate`；教师确认 = `accepted`。

## 9. Git 供体使用矩阵

| 能力 | 首选供体 | 使用方式 |
|---|---|---|
| V8 App/Workspace/右栏/媒体/动画/图层 | `f272756` | 保持为主干，先不改 UI |
| Electron 宿主与启动兼容 | 当前 HEAD 中可独立证明必要的 `main` / `preload` / script 变更 | 仅窄幅前移工具链兼容，不带回 V9 双路由或 controlled UI |
| V8 行为与真实 E2E | `f272756:tests/e2e/editor.spec.ts` 及同期单测 | 清理环境依赖后作为保护合同 |
| V9 Schema/archive/publish | `3e41ec0..e2e34aa` 中对应纯模块 | 按模块移植，禁止整串重放 |
| V9 Slide 命令与状态 override | `6361641`、后续相关纵切 | 保留成熟 V8 UI，重接内部命令 |
| Runtime/Component | 当前 V9 已闭合的 API 2/3、API 4 模块 | 先测协议，再接作者入口 |
| Flow | 当前 Flow model/commands/Player host | 保留模型，重做错误的 block/layer UI |
| Spatial | 当前 Spatial model/camera/path/relation/Player host | 复用模型和运行时，编辑表面改为共享 V8 内核 |
| Mixed/课程目录/导出 | 当前 V9 producer 与 location 模型 | 在三类单态通过后接入 |
| 当前失败 UI 与 controlled adapters | `bffbf95` / HEAD | 只作问题定位和反例，不直接移植 |

每次供体使用必须记录：来源提交、摘取文件/函数、保留理由、舍弃部分、定向测试和真实 UI 结果。

## 10. 验证政策

### 10.1 中间阶段：最小验证

- 每个任务只运行 1–4 个最相关单测或组件测试。
- 必要时增加一条真实 Electron/浏览器 UI 冒烟，只覆盖本纵切。
- 运行 `git diff --check` 和必要的类型局部检查。
- 不运行 `npm test`、完整 build、全量 typecheck、全量 E2E 或三视口视觉套件。
- 不自行重捕全局视觉基线。
- 单测通过只说明命令/组件候选成立；真实 UI 未操作不得声称该功能完成。

### 10.2 每个纵切的真实最小 Gate

每个被迁移能力至少验证：

1. 从用户可见入口触发；
2. 画布、图层和属性选择一致；
3. 修改产生正确且可撤销的单次 history；
4. 保存、关闭、重开后保持；
5. Player/导出适用时与编辑器一致；
6. 原 V8 同类能力没有消失或变弱。

### 10.3 最终必跑交互场景

1. 连续新增多个元素，确认自动错开且全部可选。
2. Slide 多选 → 右键复制 → 粘贴 → Delete → Undo/Redo → 保存重开。
3. 双击文字 → IME 与局部富文本 → 点击空白 → 保存重开 → Player 对比。
4. 图层拖排、上/下移、置顶/置底、锁定、隐藏、重命名和 20+ 长列表。
5. 分别在 Slide、Flow、Spatial 中点击全局层，验证 global/surface/scene/state 四种 owner 的选择、属性、owner 内排序、逐 location 可见性与删除影响。
6. 控制器八方向 resize、慢速/快速及斜向拖动、zoom/pan 后选择框、折叠、试运行与真实 Player；不得出现选框分离、单边缩放或运行态漂移。
7. 声音导入、试听、改名、互动引用、删除保护和发布播放。
8. 图片/视频导入、媒体库管理、加入画布、命中与选择、属性修改、替换、裁剪、保存和发布。
9. 动画创建、修改、预览、保存重开和 Player。
10. 组件包导入、插入、属性修改、替换、保存和发布。
11. 从空白完成 Flow 长文，验证 block 直接点选、双击就地编辑、IME、选区级富文本、页面—标题树、paragraph 不进通用图层、媒体/组件插入、贴边目录和打印/PDF。
12. 从空白完成 Spatial，验证多元素、双击、属性、媒体/组件插入、与 Slide 一致的缩放/选择/控制器样式、镜头、路径和关系。
13. 分别从纯 Slide、纯 Flow、纯 Spatial 使用主按钮新增本态内容并用下拉新增另外两类；Slide 连续新增只增加当前 surface 的 scene，所有既有 scene/surface 始终可从课程树返回。
14. 在 Flow 与 Spatial 分别进入全局层，编辑控制器与普通 global item，设置当前 location 隐藏/显示后切页、保存重开并对比 Player。
15. Mixed 连续切换三类 location，确认新增控件、selection、属性、快捷键和 Player 不串页。

### 10.4 最终自动化与视口

最终 R8 才运行上述集合，但 **按 §8 R8 子任务拆分并行**，不是一个 AI 从头跑到尾：

- 全量 typecheck、unit/integration、component、build（R8-C/D/E）；
- 全部 Electron E2E（R8-F）；
- V8→V9 迁移、V9 保存重开、Published/导出测试（含在 C/D/F 与 H-17）；
- 1280×720、1366×768、1920×1080 三视口（R8-G）；
- 核心画布、控制器和菜单不得通过蒙版逃避比较。
- 编辑态黑屏窗口证明与课树拖排是 R8-A/B，与机器 C/D 同时开工。

## 11. 完成定义

以下条件全部成立，才可称“V8 已安全演进为完整 V9 编辑器”：

- 默认产品仍是成熟 V8 表面，且不存在能力残缺的第二套 UI。
- 唯一活动产品 worktree、启动命令和默认入口清楚，不存在根目录/工作区各自声称“当前版”的分裂状态。
- 默认工程真相已经原子切换为 Course Project V9，不双写、不回落隐藏 V8 store。
- 第 6 节所有 V8 能力在 V9 backend 下可达、可操作、可撤销、可保存和可发布。
- 第 7 节所有已知回归均有真实 UI 验收证据。
- Slide、Flow、Spatial 可从空白直接创建；Pure/Mixed 自动适配。
- 全局层、共享层、逐 location 可见性、控制器和声音完整。
- Flow 普通 block 不再污染课程树或通用图层；Spatial 复用完整元素编辑内核。
- V8 导入只作为显式迁移，迁移报告清楚且无静默数据丢失。
- Player、HTML/包/PPTX/打印/PDF 与编辑器一致。
- 全量自动化、真实视觉、真实互动与教师验收分别记录，没有用“以后由 AI 完成”替代基础能力。

## 12. 明确不做

- 不继续在当前失败集成态上逐 bug 修补。
- 不把 `e2e34aa`、`bffbf95` 或当前 HEAD 重新命名为“成熟 V8 基线”。
- 不整批 cherry-pick V9 大提交。
- 不维护两个可见编辑器或两套长期平行面板。
- 不在同一会话双写 V8/V9。
- 不用 disabled、隐藏、no-op、占位卡片或改测试期望完成迁移。
- 不取消全局层、MediaTab、动画、组件、图层控制或教师控制器。
- 不把 Flow 做成 Slide，也不把普通文档 block 当 z-order 图层。
- 不给 Spatial 重新造一套弱化元素编辑器，也不把有限 Slide 坐标强加给无限世界。
- 不新增持久化四模式字段。
- 不在本轮扩建可见 AI、Provider、聊天或重型 Focusky 手工时间线。
- 不把自动化通过直接写成 `accepted`。

## 13. 旧任务文档与后续拆分

- `docs/tasks/v9-editor/00_INDEX.md` 及 T01–T13 记录的是已失败的旧执行路线，从本计划 11.0 起全部降级为历史取证和供体说明，不得继续领取执行。
- `C:\Users\74755\.cursor\plans\v8_product_first_d23d3077.plan.md` 的产品要求已经吸收到本版；其 todo 不再与 R0–R8 并行派发，发生措辞冲突时以本文件第 0.3 节裁决为准。
- 新执行入口为 [`docs/tasks/v8-to-v9-rebuild/00_INDEX.md`](docs/tasks/v8-to-v9-rebuild/00_INDEX.md)；R6 起的文件所有权、禁止重做与验证预算以 [`docs/tasks/v8-to-v9-rebuild/artifacts/R6_R8_EXECUTION_PLAYBOOK.md`](docs/tasks/v8-to-v9-rebuild/artifacts/R6_R8_EXECUTION_PLAYBOOK.md) 为准。共享合同与 R0–R8 阶段文档已生成。
- 新任务按“保护 V8 主干 → 独立 V9 candidate → 每阶段中央集成 → 真实 UI 冒烟 → 最终全量 Gate”拆分，不允许每个 lane 各自建立平行 UI，也不把所有接线积压给最后一个任务。
- R4 Flow 与 R5 Spatial 的非热点实现可以并行；两者的 App/store/Workspace/RightSidebar 接线必须串行持有热点锁。
- App、store、Workspace、RightSidebar、PropertiesTab、MediaTab 和全局 CSS 属于中央集成热点；并发任务只能提交窄接口或纯模块，不得相互覆盖。
- R0–R7 每个任务最多一条包含不超过两个测试文件的定向 Vitest、一次 diff check，阶段集成者最多再做一个真实 UI 冒烟；全量 typecheck/test/build/E2E/三视口视觉只属于 R8 子任务（C–H），禁止 R0–R7 预跑。
- R8 从 11.4 起按 A–H/Z 领取；A 与 F/G/H 不得同时占 Electron；B 不得改 Workspace。

## 14. 接手与记录规则

- 新 Agent 先读本文件；旧任务状态、README 的 `engineering candidate` 和当前 HEAD 的绿色测试不得覆盖本计划的新路线。
- 接手者首先确认当前工作目录属于 V8 重建 worktree 还是旧 V9 供体分支，禁止在供体分支直接继续开发。
- 每次交付写明：基线提交、供体提交、目标纵切、保留的 V8 行为、修改文件、最小测试、真实 UI 证据、未迁移部分和回退点。
- 一个纵切未通过真实最小 Gate 时，不得改默认 backend，也不得把 V8 入口删掉。
- 长期产品决策只更新本文件；项目认知索引现在只更新任务入口、候选基线与 donor/产品工作区区分，R0 通过后再按真实 worktree 修订源码入口、README 和能力状态，避免把未验证候选写成当前产品事实。

## 15. 远期开放方向

### 15.1 Focusky 级能力

- 当前优先完成稳定 V9 编辑器，不把 Focusky 级时间线和复杂镜头作为切换门槛。
- 远期可通过 Runtime API 3、Component API 4 与 Spatial 镜头能力扩展路径动画、语义缩放、转场和音画同步。
- 只有基础 V9 达到 `accepted` 后才单独立项，先做高风险纵切样例再扩协议或面板。

### 15.2 AI 编辑能力

- 当前 `courseAiHandoff` / `courseAiPatch` 继续是 internal/reserved，不新增可见 AI 调用点。
- 未来 AI 应调用与人工编辑相同的命令、history、revision、锁定和引用检查，不另建隐藏写入通道。
- 轻量编辑器不扩建为重型 IDE；复杂批量编辑优先由未来 AI 调用窄命令完成，但不能成为基础手工功能缺失的借口。
