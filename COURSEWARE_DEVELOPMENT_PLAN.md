# Course Project V9 编辑器长期开放方案：V8 表面无降级与 V9 完整化

> 计划版本：10.0
> 更新日期：2026-08-17
> 适用协议：Course Project V9、Published Course V2、Runtime API 2/3、Component API 4
> 状态：唯一长期产品与开发总纲
> 执行入口：仓库根目录；任务索引 [`docs/tasks/v9-editor/00_INDEX.md`](docs/tasks/v9-editor/00_INDEX.md)

本方案汇总此前多轮代码评估、真实体验复核、Git 供体分析和 UI 定稿。它取代以删除、隐藏或禁用既有能力为手段的“轻量界面收敛”路线。这里的“轻量”只表示低学习成本、默认界面克制和渐进披露，不表示减少 V8 已经可用的编辑能力。

本文件负责长期方向、产品决策、阶段 Gate 和完成定义；执行级任务包只负责某一纵切的文件所有权、最小验证和交付格式，不得另立相互竞争的产品方案。

## 1. 目标结果

最终交付必须同时成立：

1. **工程真相是 V9**：新建、编辑、保存、重开、试运行、Player、导出均以 Course Project V9 为唯一工程真相；V8 只保留显式导入迁移与兼容测试。
2. **表面能力不低于 V8**：把成熟的 V8 壳层、工作流、快捷键、属性、图层、媒体和高级编辑入口完整接到 V9 命令与数据上，不保留双工程状态，也不以“暂不可用”代替迁移。
3. **完整提供 V9 新能力**：Slide、Flow、Spatial 三类 location 可直接新建、编辑和发布；Mixed 由实际 locations/surfaces 自动形成。
4. **修复已知回归并建立防线**：控制器、文字就地编辑、图层、声音、剪贴板、Delete、右键、纯课程入口等必须有端到端回归验证。
5. **真实体验达标**：自动化只能证明 `engineering candidate`；视觉、交互和教师工作流必须经过真实运行复核，教师明确验收后才可称 `accepted`。

这不是把 V9 降级回 V8，也不是重新启用 V8 工程作为生产后端；准确表述是：

> **以 V9 为唯一引擎和文档模型，以 V8 已验证的产品表面作为最低交互基线，再补齐 V9 的 Flow、Spatial、Mixed 与统一图层能力。**

### 1.1 已确认结论总表

| 主题 | 长期结论 |
|---|---|
| V8 与 V9 | V9 是唯一生产工程真相；V8 是表面能力底线、显式导入来源和兼容证据，不是第二套编辑器。 |
| “轻量” | 只减少默认信息密度，不删除或长期禁用 V8 已有能力；低频功能采用渐进披露。 |
| UI 先行 | 根目录五张 `V9_EDITOR_UI_*` 图片和 [`V9_EDITOR_UI_DESIGN_SPEC.md`](V9_EDITOR_UI_DESIGN_SPEC.md) 是四态实现基准；若图片中教师控制台与文字合同冲突，以文字合同为准。 |
| 页面形态 | 纯 Slide、纯 Flow、纯 Spatial 与 Mixed 从被 locations 引用的 surfaces 推导；不保存 `projectMode`。 |
| 主动与自适应 | 教师可直接新建三类空白工程或三类页面；添加、删除、选择 location 后编辑器自动适配，不依赖外部导入。 |
| 全局层 | **保留且可见。** 四态左栏固定提供“共享内容 → 全局层（全课）”作者入口；它与页面形态正交，不是课程顺序中的页面，也不参与四态推导。 |
| Flow 层级 | 流式页面是父节点，只有可导航标题/章节作为子节点；普通文本和媒体块不与页面同级。运行态目录使用贴边三角按钮展开/收起。 |
| 教师控制台 | 使用统一动作集：上一场景、下一场景、场景目录、重播、声音、全屏、收起；作者框、属性、试运行和 Player 共用同一配置和坐标合同。 |
| 基础编辑 | 右键、Delete/Backspace、剪贴板、就地文字、紧凑图层、排序、锁定、隐藏、声音和媒体管理均为完成门槛。 |
| 远期扩张 | Focusky 级镜头化演示和大规模 AI 结构编辑暂不作为本轮门槛，只保留长期开放方向，不提前扩建可见 AI 或重型手工面板。 |

## 2. 不可妥协的产品与工程约束

- 不新增持久化 `projectMode`、`courseMode` 或“四模式”字段。纯 Slide、纯 Flow、纯 Spatial 与 Mixed 从 `locations` / `surfaces` 推导。
- 全局层、surface 共享层、scene/location 层、状态 override、Runtime、Component 与教师控制器继续进入统一图层系统。
- 全局层编辑范围与 Slide/Flow/Spatial 页面类型是两个正交概念。为了 Mixed 而取消全局作者入口没有数据或交互上的必然性。
- `authoringAddress` 是跨保存稳定的作者目标；临时 DOM、Canvas 或 Runtime `hitId` 只能用于一次命中，不得成为保存后的身份。
- 不双写 V8/V9 两套 store，不让旧工程模型继续成为隐藏生产真相。
- 不以禁用控件、隐藏入口、删除面板或改写测试期望来完成迁移。一个功能只有在“V8 表面 → V9 命令 → history → 保存重开 → Player/导出”纵切闭合后才能合入默认产品路径。
- 不因本轮问题启动 V10 Schema 大迁移；确需 Schema 变化时，必须先证明 V9 无法表达目标并单独评审。
- 当前没有可见 AI 编辑工作流，不把 reserved 接口宣传为现有功能。本计划只处理编辑器本体与可验证的外部接口边界。

## 3. Git 取证与恢复基线决策

### 3.1 可复用里程碑

| 提交 | 已有价值 | 在本计划中的用途 |
|---|---|---|
| `3e41ec0` | 首次围绕 Project V9 重建，同时保留成熟 V8 `App` | V8 表面、旧能力实现和早期 V9 代码供体；**不作为恢复基线** |
| `378c195` | V8 视觉基线 | 壳层几何与视觉对照 |
| `14890bb` | 受保护的 V8 行为图，12 个 suite、172 个展开用例 | 功能不降级的最低合同 |
| `6361641` | V9 Slide M3 Gate：完整 Slide 作者闭环、属性到画布、单手势单历史 | Slide 纵切参考与二级回退证据 |
| `7f04a8a` | M4：原 App 壳、V9 默认工程、Player/控制器/恢复闭合 | **条件回退基线** |
| `e2e34aa` | Flow/Spatial、原 App 壳、store、Player 及收口修复已集成，且早于本轮轻量化脏改动 | **首选恢复基线** |
| 当前工作区 | 在 `e2e34aa` 后同时改动约 60 个 tracked 文件、测试合同和视觉基线 | 仅作问题取证与局部代码供体；不在原地硬修、不重置 |

### 3.2 为什么不整体回到“刚写出 V9”的 `3e41ec0`

`3e41ec0` 的默认入口是独立 `CourseStudioApp`，成熟 V8 `App` 只通过 `legacy-v8` 路由存在。直接以它为基线会再次形成“两套编辑器表面”，正是本计划要消除的偏离。它适合提供 V8 表面和具体能力实现，不适合成为新的产品主干。

### 3.3 三条路线比较

| 路线 | 优点 | 主要风险 | 结论 |
|---|---|---|---|
| 在当前脏工作区继续前修 | 保留所有最新试验 | UI、实现、测试合同与截图基线一起变化，错误假设已进入测试；定位成本和漏回归风险最高 | 不采用为主路线 |
| 回到 `3e41ec0` 从头再做 | V8 表面代码完整、早期 V9 较简单 | 默认是独立 V9 Studio；会丢失大量已闭合的 Slide、Player、Flow、Spatial 工作 | 不采用为基线 |
| 从 `e2e34aa` 建干净恢复分支，必要时回退至 `7f04a8a` | 保留原 App 壳与完整多表面工程；避开当前轻量化污染；Git 供体清晰 | `e2e34aa` 仍有早期迁移缺口，如复制、专属属性、Delete 限制和无右键 | **推荐** |

### 3.4 安全执行方式

1. 保留当前 `codex/v9-editor-v8-base` 工作区和所有未提交内容，不执行 hard reset、checkout 覆盖或批量删除。
2. 从 `e2e34aa` 创建独立恢复 branch/worktree，例如 `codex/v9-parity-reconstruction`。
3. 在恢复 worktree 中运行 M4/M5/M6 原有测试、启动真实 Electron/浏览器应用，并按第 10 节做基线资格检查。
4. 默认继续使用 `e2e34aa`。只有在它违反“V9 单一工程真相”、核心保存/重开链断裂，或多个相互独立子系统均需推倒重写时，才转到 `7f04a8a`。
5. 若使用 `7f04a8a`，后续 Flow/Spatial 提交只作为纵切供体选择性重放，不盲目整串 cherry-pick，不带回过期计划和被放宽的测试。

### 3.5 合回仓库根目录

T01–T12 已在 `codex/v9-parity-reconstruction` 完成。该分支已合回仓库根目录当前主工作分支；根目录 `npm run dev` / `npm run start` 打开的就是这一版。合回前，根目录 `codex/v9-editor-v8-base` 上未提交的轻量化试验已归档到 `archive/v9-editor-v8-base-dirty-pre-parity`，只作取证，不进入默认产品路径。`output/worktrees/v9-parity-reconstruction` 可以保留为历史检出，不再作为日常启动目录。

## 4. 页面创建、纯课程与自动适配

“自动适配”是编辑器根据工程中真实页面内容和当前 location 自动呈现合适工作区，不是只识别外部导入，也不是让用户先选择一个永久工程模式。

四态 UI、页面分组、主动入口、转换副本和自适应事务的实现规范见 [`V9_EDITOR_UI_DESIGN_SPEC.md`](V9_EDITOR_UI_DESIGN_SPEC.md)，视觉基准为根目录 `V9_EDITOR_UI_*_REFERENCE.png` 与 `V9_EDITOR_UI_SWITCHING_LOGIC.png`。

四态左栏都先显示固定的“共享内容 → 全局层（全课）”入口，再显示各自页面树。选择该入口只改变 authoring scope，当前 active location 继续提供预览上下文；它不创建 location、不写 history、不改变课程顺序或四态推导结果。

### 4.1 必须提供的显式入口

- 新建工程菜单提供：
  - 空白演示课件：创建一个 Slide location/surface；
  - 空白流式课件：创建一个 Flow location/surface；
  - 空白无限画布：创建一个 Spatial location/surface。
- 左侧课程结构中始终提供“新增内容”菜单：
  - 新增演示页面；
  - 新增流式页面；
  - 新增无限画布。
- 页面/location 必须支持重命名、复制、删除、排序和切换；不可删除工程最后一个 location。
- 纯类型工程添加另一类型 location 后自动成为 Mixed；删除其他类型后自动回到纯类型界面。
- 选中不同 location 时，中央工作区、元素面板、图层面板、属性面板和试运行入口自动切换到该 surface 的能力，不要求用户手工切“模式”。

### 4.2 推导规则

- locations 中只有 `slide-scene`：纯 Slide。
- locations 中只有 `flow-block`：纯 Flow。
- locations 中只有 `spatial-camera`：纯 Spatial。
- 同时存在两种或三种：Mixed。
- 当前工作区由 active location 的 kind 决定；工程级导航由全部 locations 的组合决定。
- “转换页面类型”不得静默丢数据。若后续提供转换，应实现为有预览的内容迁移/复制命令，而不是修改一个 mode 字段。

## 5. V8 表面能力最低清单

下面的能力是迁移底线，不因默认界面简洁而取消。低频能力可以渐进披露，但必须可发现、可操作、可保存、可撤销。

| 领域 | 必须保留或恢复的能力 |
|---|---|
| 工程生命周期 | 新建、打开、最近工程、保存、另存、脏状态、防误关、恢复、V8 显式导入、V9 导出 |
| 壳层与导航 | 原 App 顶栏、左侧课程结构、中央工作区、右侧元素/图层/属性、底部状态/场景或状态区、面板折叠与尺寸稳定 |
| 场景/location/state | 新增、复制、重命名、着色、排序、删除；命名状态新增/复制/重命名/删除；基础状态与 override 语义 |
| 画布视口 | 1280×720 设计坐标、50%–200% 缩放、适配、平移、缩放中心稳定、坐标转换一致 |
| 选择与变换 | 单选、多选、框选、跨入口同步选择、拖动、八方向缩放、旋转、方向键微调、Shift 加速、锁定约束、单手势单 history |
| 剪贴板与删除 | 全选、复制、剪切、粘贴、重复、Delete/Backspace、批量原子删除/状态隐藏、Undo/Redo |
| 文字与公式 | 画布双击就地编辑、属性编辑、IME、富文本局部格式、竖排/自适应宽度、缩放下编辑、公式双击编辑 |
| 图形与媒体 | 图形、图片、视频的添加/替换/裁剪或适配/播放设置；拖放和批量导入 |
| 声音 | 声音导入、试听、重命名、删除、声音库、全局音量/静音/声道/ducking、互动动作引用校验 |
| 图层 | 统一显示所有有效层；名称、来源、选择、拖拽排序、上/下移、置顶/置底、显示/隐藏、锁定/解锁、复制、删除/状态隐藏 |
| 属性与格式 | 位置尺寸旋转、文本、填充描边、透明度、层级、可见/锁定、媒体专属属性、组件属性、背景和状态 override |
| 互动与自动化 | 触发器、动作、规则排序/复制/删除、场景/状态/媒体/声音目标、动画完成依赖清理 |
| 组件与开发 | Runtime/Component 作者目标、组件 props/variant/preset/nested content、设计 token、开发工作区和 history |
| 教师控制器 | 添加/恢复、选择、拖缩、属性、主题、折叠、运行时展开/折叠、重播/重置、声音和全屏等既有功能 |
| 试运行与交付 | 当前 location 试运行、整课 Player、重播/重置、场景目录、Flow/Spatial 运行时、HTML/包/打印或 PDF 导出 |

`14890bb` 的 12 组 V8 合同继续作为最低证据，但必须让合同直接验证默认 V9 路径；不得只在 `legacy-v8` 测试入口通过后就宣称 V9 无回退。

## 6. 已知 P0 问题与明确设计决策

### 6.1 右键：历史中从未实现，必须作为 V9 完整能力新增

Git 全历史没有 `onContextMenu` / `contextmenu` 编辑实现，因此任何回退都不会自动恢复右键。实现时只增加一个窄的编辑动作路由，让顶栏、图层按钮、右键菜单和键盘调用同一批 V9 命令；不建立泛化插件或大型命令框架。

右键目标与最低动作：

| 目标 | 动作 |
|---|---|
| Slide/Spatial 元素 | 剪切、复制、粘贴、重复、删除/状态隐藏、置顶/置底、上移/下移、显示/隐藏、锁定/解锁、编辑文字/公式、替换媒体 |
| 多选 | 剪切、复制、重复、批量删除/隐藏、层级移动、锁定/可见性；不支持的组合给出具体原因 |
| 空白画布 | 粘贴、全选、新增内容、适配视图、重置视图 |
| 图层行 | 与画布元素相同的核心动作，另含重命名和来源说明 |
| location/场景/state | 重命名、复制、删除、前移/后移、新增状态或相邻内容 |
| Flow block | 在前/后插入、复制、删除、上/下移、缩进/取消缩进、编辑属性 |
| Spatial frame/path/relation | 聚焦、复制、删除、重命名及相应关系维护 |

交互规则：

- 右键未选目标时先选中目标；右键已在多选集合内时保持多选。
- 菜单针对打开瞬间的稳定 selection 快照执行，不能因 hover 或重新渲染改目标。
- `Escape` 关闭并恢复焦点；`Shift+F10` 和 Menu 键打开同一菜单。
- 禁用项必须说明原因；不能显示会静默失败的动作。
- 所有变更走同一 history/revision，Undo/Redo 与保存重开可复现。

### 6.2 Delete：不是数据层不能删，而是入口路由退化

从 `6361641`、`7f04a8a`、`e2e34aa` 到当前代码，V9 全局 keydown 一直存在以下限制：只处理 active Slide、禁止 global、只允许恰好一个 selection；Flow/Spatial 和多选会被挡住。旧 V8 的多选删除并没有迁移完整。

必须实现单一 `deleteCurrentSelection` 语义：

- 输入框、textarea、contenteditable、文字/公式编辑态中，Delete/Backspace 只编辑文本，不删元素。
- 画布、图层、右键关闭后、缩放/平移后均能稳定接收删除命令。
- Slide 基础场景删除真实 owned item；命名状态对继承项执行“当前状态隐藏”；本状态新建项执行删除。
- global/surface 共享项按真实 owner 删除并提示影响范围；默认教师控制器删除后必须有显式“恢复教师控制器”入口。
- 多选一次性原子删除或隐藏，只产生一个 history step。
- Flow 删除 block 时维护父子、顺序和引用；Spatial 删除 world item/frame/path/relation 时维护相机、路径和关系引用。
- 命令失败必须给出可理解原因，不能吞掉返回值后无反馈。
- Delete 和 Backspace 在 Windows/macOS 键盘语义一致，并有 Electron 级 E2E。

### 6.3 全局层作者入口：保留，取消决定不成立

全局层取消不是 Mixed 的必要条件。Mixed 解决“有哪些 location/surface”，全局层解决“哪些内容跨 location 共享”。当前扁平有效图层又缺少 ownership-aware 排序、锁定、隐藏、复制和删除，直接隐藏全局入口导致功能不可达。

因此：

- 四态左栏固定显示“共享内容 → 全局层（全课）”，接到 V9 `globalLayerItems`；它与页面树分区，不能伪造成 location 或 scene。
- surface 共享项继续接到 `surfaceLayerItems`，通过当前内容的共享入口或统一有效图层中的明确来源进入；低频入口可以渐进披露，但不能不可达。
- 当前页面的统一有效图层继续存在，用于跨来源查看和直接操作；selection、属性目标、history 和 owner 必须一致。
- 统一有效图层是合成视图，不是删除显式全局作者入口的理由。未来若要调整入口层级，必须先通过完整功能等价与教师可发现性验证，并单独确认。

### 6.4 教师控制器

- 选择框、控制器渲染和八方向 resize 必须共享同一个规范坐标、zoom/pan 变换与 commit 边界。
- 控制点拖动方向必须与视觉边缘移动方向一致，pointermove 期间实时跟手，pointerup 只提交一次 history。
- 删除无产品意义的“定位控制器”动作；选择图层应直接选择并在必要时最小滚动到可见区域。
- 属性面板中的折叠状态、画布编辑预览、当前 location 试运行和真实 Player 使用同一 V9 控制器配置；不能依赖只在试运行重建时更新的缓存。
- 控制器在 global owner 中编辑，但在每个适用 surface 上以同一稳定 `authoringAddress` 命中。

### 6.5 画布文字与公式编辑

- 双击编辑事务以稳定的 `authoringAddress`、location/state/scope 和 revision 为键，不以临时投影对象引用是否相同判断有效性。
- composition、实时草稿、blur/Enter/Ctrl+Enter、取消、外部 selection 变化有明确事务边界。
- 画布编辑和属性栏编辑写入同一个 V9 内容字段；重新投影不能丢弃已提交内容。
- 富文本、竖排、自适应宽度、缩放下编辑和公式编辑恢复 V8 合同。
- 必测：双击输入 → 点击空白 → 保存 → 关闭重开 → Player 显示一致。

### 6.6 图层面板

- 恢复紧凑单行布局，名称不再被挤成竖排；来源、名称和操作按钮有确定宽度与溢出规则。
- 统一有效图层不是只读检查器。每个来源必须支持它语义上允许的重命名、排序、显示、锁定、复制和删除/状态隐藏。
- 跨 owner 不做假排序；拖拽跨来源时要么执行明确的“移动到 scope”，要么禁止并解释。owner 内排序必须正常工作。
- 画布选择、图层选择、属性目标三者始终一致；共享项不能只进入临时 inspected 状态而不成为真实 selection。

### 6.7 声音、媒体与剪贴板

- 恢复元素面板声音导入、MediaTab 声音库、试听、重命名、删除和全局声音设置。
- 恢复图片/视频专属属性、替换和画布拖放；Flow/Spatial 的媒体块/世界元素使用同一 asset 真相。
- 在默认 V9 路径恢复 Ctrl/Cmd+C、X、V、D；跨页面粘贴生成新稳定 ID 并清理或重写引用。
- 不保留“复制暂不可用”“声音暂不能从此面板管理”作为产品完成状态。

## 7. V9 新增能力的完成定义

### 7.1 Flow

- 可从新建工程和“新增内容”直接创建，不依赖导入样例。
- block 新增、选择、多选、删除、复制、排序、层级/缩进、属性、媒体、互动目标和统一图层完整。
- 键盘、右键、左侧 outline、中央工作区和属性面板走同一命令。
- 编辑器左侧只把页面和可导航标题做成父子树，普通文本/媒体块不升级为课程级节点；运行态目录可由贴视口边缘的三角按钮唤起或完全收起。
- 保存重开、Undo/Redo、当前 location 试运行、整课 Player、发布和打印/PDF 行为一致。

### 7.2 Spatial 无限画布

- 可从新建工程和“新增内容”直接创建；中央为真正可平移、缩放和放置世界元素的无限画布。
- 文字、图形、公式、图片、Component/Runtime 等 world item 可选择、拖缩、排序、锁定、隐藏、复制、删除。
- camera frame、active frame、路径、关系、semantic zoom、教师控制器和会话 hydration 完整。
- 选择框与世界/屏幕坐标一致；缩放时 UI chrome 尺寸稳定。
- 保存重开、Undo/Redo、试运行和 Published Player 完整。

### 7.3 Mixed

- 一个课程结构中可任意混排 Slide、Flow、Spatial location。
- 切换 location 自动切工作区和右侧能力；不遗留上一个 surface 的 selection、属性或快捷键路由。
- 全局层与控制器按适用范围投射，surface 共享层只影响对应 surface。
- 课程目录、上一页/下一页、重播/重置、进度、声音和导出按统一 location 顺序工作。

## 8. 实施阶段与 Gate

每个功能按同一纵切模板完成：**表面入口 → V9 命令 → selection/history → 保存重开 → Player/导出（适用时）→ 自动化与真实体验复核**。不得先替换表面再把能力留成禁用状态。

### M0 — 恢复基线资格检查

产出：

- 从 `e2e34aa` 建独立恢复 worktree；当前工作区保持原样。
- 以 Git diff、入口链和每个候选点各一组代表性定向测试完成资格检查；此阶段不跑全量 build/typecheck/unit/E2E。
- 记录候选点的已有历史证据，并对原 App 壳、V9 单一真相、Slide 保存重开、Flow/Spatial 可达性和 Player 接线做最小人工抽查。
- 形成缺口矩阵：V8 已有且 V9 缺失、V9 已有但表面不可达、V9 新功能未闭合、当前脏改动新增回归。

Gate：明确选择 `e2e34aa` 或有证据地转用 `7f04a8a`；不得凭提交名或测试绿灯直接决定。

### M1 — 回归防火墙与原 App 壳

产出：

- 恢复 `14890bb` 行为合同与 `378c195` 视觉基线的权威性。
- 将 V8 合同逐项移植为默认 V9 路径测试；V8 importer 测试单独保留。
- 删除或改写那些把“功能不可用、入口隐藏、只读图层”当成功标准的错误测试。
- 固定原 App 壳层、面板折叠、滚动、响应式断点和三种基准视口。

Gate：默认 V9 入口能运行原 App 壳；任何基线更新都有明确产品变更说明，而不是为了让 diff 变绿。

### M2 — 统一选择与编辑动作

产出：

- 稳定 selection/authoring target 路由，覆盖 canvas、layer、properties、Flow outline、Spatial inspector。
- Delete/Backspace、多选删除/隐藏、复制/剪切/粘贴/重复、Undo/Redo 完整。
- 右键菜单与 Shift+F10/Menu 键完整，和工具栏/图层按钮共用窄动作路由。
- 焦点、文字编辑态、iframe/runtime 命中和错误反馈完整。

Gate：同一动作从键盘、右键、图层和画布入口得到同一结果、同一 history、同一持久化结果。

### M3 — Slide 表面完整对齐 V8

产出：

- 场景/state CRUD、画布选择、多选、框选、拖缩旋转、方向键、zoom/pan 完整。
- 文字/公式双击编辑、富文本、IME、竖排、自适应宽度完整。
- 图形、图片、视频、组件/Runtime 的添加、替换和专属属性完整。
- 图层紧凑布局、owner 内排序、显示/锁定/复制/删除完整。
- 所有属性到画布实时同步，一个手势一个 history。

Gate：V8 Slide 核心工作流在默认 V9 工程中无功能降级；保存重开和真实 Player 一致。

### M4 — Global / Surface / 控制器 / 声音

产出：

- 恢复 global 和 surface 共享作者入口，并与当前页面统一有效图层双向同步。
- 修复控制器选择框、拖动、resize、折叠、声音、全屏、重播/重置和 Player 投射。
- 恢复声音导入与 MediaTab 管理、全局声音设置和互动引用。
- 跨 owner 操作、状态 override、默认控制器恢复和影响范围提示完整。

Gate：global/surface/scene/state 四种 ownership 语义分别通过编辑、撤销、保存重开、跨 location 和 Player 验证。

### M5 — Flow 完整化

产出：

- 直接创建入口、outline、工作区、block/层级/属性/媒体/互动/统一图层完整。
- Delete、右键、快捷键、拖放排序、多选和无障碍焦点完整。
- Player、试运行、导出和保存重开完整。

Gate：从空白 Flow 工程开始，教师可不借助导入或代码完成一份可发布流式课件。

### M6 — Spatial 完整化

产出：

- 直接创建入口、无限画布、世界元素、相机帧、路径、关系、semantic zoom 和 inspector 完整。
- 坐标、zoom/pan、选择框、拖缩、图层、Delete、右键和控制器完整。
- Player、试运行、导出和保存重开完整。

Gate：从空白 Spatial 工程开始，教师可完成并发布一个多相机帧无限画布课件。

### M7 — Pure/Mixed 自动适配与课程结构

产出：

- 三种空白工程入口和三种新增 location 入口。
- 课程结构跨 surface 的新增、复制、重命名、排序、删除与导航。
- 纯类型和 Mixed 自动推导；切 location 时工作区、selection、属性和快捷键正确切换。
- 全局控制器、课程目录、上一页/下一页和进度跨 surface 一致。

Gate：纯 Slide、纯 Flow、纯 Spatial、Slide+Flow、Slide+Spatial、Flow+Spatial、三者 Mixed 七种组合全部通过保存重开、试运行与 Player。

### M8 — 交付链与兼容

产出：

- V9 新建/打开/保存/另存/恢复/最近工程完整。
- V8 显式导入迁移有清晰报告，不让 V8 成为新工程默认格式。
- Published Course V2、HTML/课程包、打印/PDF、资源寻址、Runtime API 2/3、Component API 4 完整。
- 项目健康检查只报告真实问题，不以隐藏功能规避错误。

Gate：编辑器、保存文件、Published Player 和各导出物对相同课程结构给出一致结果。

### M9 — 发布候选与教师验收

产出：

- 全量 build/typecheck/unit/component/Electron E2E。
- 三视口视觉对比、长图层列表、复杂 Mixed、低性能设备和键盘工作流复核。
- 真实课程样例覆盖 Slide、Flow、Spatial、Mixed 和 global/controller/audio。
- 已知限制列表只允许真正超出 V9 目标范围的问题，不得包含 V8 已有功能缺失。

Gate：工程状态达到 `engineering candidate`，视觉/互动复核达到 `art candidate`；教师明确验收后标记 `accepted`。

## 9. Git 供体使用清单

若首选 `e2e34aa` 通过 M0，直接在其上修复，不重新实现已经闭合的 Flow/Spatial。若必须回到 `7f04a8a`，按功能纵切参考以下提交：

- Flow：`fc02e04`、`b3be117`、`e75c394`、`c46b996`、`3b073c4`。
- Spatial：`8fc6e36`、`9c1b81d`、`9d92f00`、`6ee0bc6`、`6ddefed`、`2f77876`。
- Store 与原壳接线：`82dbd39`、`01a8141`。
- 收口修复：`91221e4`、`2e015e3`、`b9a6061`、`c9c3a94`、`6c9fac5`、`2903bba`、`ad3d8db`、`11ef31e`、`8344987`。

使用规则：

- 先读 diff 和测试，再选择性应用；集成提交不是天然正确答案。
- 不从供体带回“暂不可用”产品决策、过期计划、放宽后的基线或双 editor route。
- 一次提交只闭合一个可验证纵切；大规模机械格式变更与功能变更分开。
- 每个里程碑留下可二分的稳定提交和结果证据。

## 10. 验证矩阵

### 10.1 分层验证政策

- 中间任务只运行任务文档列出的最小定向验证：通常为 1–4 个相关 Vitest 文件、纯函数/组件断言、`git diff --check` 和必要的单场景人工抽查。
- 中间任务不得运行 `npm test`、`npm run build`、`npm run verify`、`npm run verify:full`、全量 typecheck、全量 Electron E2E 或三视口 preservation visual；不得自行重捕视觉基线。
- 跨 lane 的 App/store/shell 接线由中央集成任务串行完成，仍只运行组合定向测试，不提前跑全量。
- 只有最终全量 Gate 允许统一运行全量 typecheck、unit/component、build、全部 V9 Electron E2E、V8 preservation visual、课程样例和导出验证。失败项按文件所有权回派，修复者仍只跑对应最小测试，再由最终 Gate 复跑。
- 单包通过只称该纵切 `engineering candidate`；全量绿灯只证明项目级 `engineering candidate`，真实视觉/互动复核后才可称 `art candidate`。

### 10.2 最终自动化覆盖

- Schema/type：V9 工程、Published V2、Runtime/Component 协议。
- Store/command：每种 owner、surface、state、history、引用清理和错误路径。
- React/component：表面入口、图层、属性、右键、焦点和面板折叠。
- Electron E2E：真实键盘、pointer、拖放、resize、右键、保存对话、重开和窗口尺寸。
- Player/export：真实 PublishedCourseApp、Flow/Spatial host、控制器、音频和导出物。
- Contract：V8 172 个展开用例的 V9 等价合同，不得只打在 legacy route。

### 10.3 最终必跑交互场景

1. Slide 多选 → 右键复制 → 粘贴 → Delete → Undo/Redo → 保存重开。
2. 画布双击文字 → IME 输入 → 点击空白 → 保存重开 → Player 对比。
3. 图层拖拽排序、上/下移、锁定、隐藏、重命名、长名称和长列表。
4. global/surface/scene/state 四种来源的选择、属性、删除/隐藏和跨页影响。
5. 控制器八方向 resize、zoom/pan 后选择框、属性折叠与真实 Player 折叠。
6. 声音导入、试听、改名、互动引用、被引用删除保护、发布播放。
7. 从空白分别创建纯 Flow 和纯 Spatial，不使用导入完成编辑与发布。
8. Mixed 中连续切换三类 location，确认 selection、快捷键和属性不串页。
9. Spatial 相机帧、路径、关系删除后的引用与 Player。
10. Flow block 层级、排序、Delete、右键和打印/PDF。

### 10.4 最终视觉视口

- 1280×720
- 1366×768
- 1920×1080

每个视口至少检查：壳层几何、右侧三标签、长图层列表、控制器选择框、Flow 长文、Spatial zoom chrome 和所有浮层菜单不越界。

## 11. 完成定义

以下条件全部满足，才可称“V9 编辑器完整迁移到 V8 表面并完成 V9 新功能”：

- 默认新工程和生产编辑路径只有 V9 真相，没有可见的 V8/legacy editor 切换。
- V8 显式导入仍可用，但不参与新工程日常编辑。
- 第 5 节所有 V8 表面能力在默认 V9 路径可达；没有用 `暂不能`、disabled 或隐藏入口代替。
- Slide、Flow、Spatial 可从空白直接创建；Pure/Mixed 自动推导并可完整编辑。
- 右键、Delete、剪贴板、图层、文字、控制器、声音和属性均通过自动化与手工场景。
- global/surface/scene/state ownership、稳定 `authoringAddress`、保存重开、Undo/Redo、Player 与导出一致。
- 受保护行为合同和视觉基线没有被为了适配回归而静默放宽。
- 工程证据、视觉证据、互动证据分别记录；教师明确给出最终验收。

## 12. 明确不做

- 不把 V8 工程模型重新设为默认生产格式。
- 不维护两个可见编辑器或两套长期并行 store。
- 不新增持久化四模式字段。
- 不以“AI-native”或“轻量”为理由删掉手工高频能力；AI 可以补充工作流，不能成为基础编辑缺失的借口。
- 不在没有完整替代路径时取消全局层、图层控制、声音、属性或高级作者入口。
- 不重捕截图、改行为地图或删除测试来掩盖回归。
- 不把通过自动化直接写成 `accepted`。

## 13. 远期开放方向

以下方向保留，但不阻塞当前 V9 编辑器完成，也不允许以“未来会有 AI”替代基础手工能力：

### 13.1 Focusky 级镜头化演示

- 可优先通过全视口 Component API 4 或 Runtime API 3 组件实现镜头路径、语义缩放、场景转场、时间线、音画同步和复杂互动，不要求把每个效果都变成原生节点。
- 当前 Runtime/Component 已能承载局部复杂机制，但 viewport ownership、课程导航同步、批量结构编辑和稳定 AI authoring contract 尚不足以宣称 Focusky 级等价。
- 只有在本方案的 V9 表面无降级、Spatial 基础编辑和 Player 交付链达到 `accepted` 后，才单独立项；届时先做一个高风险纵切样例，再决定扩充协议或编辑器入口。

### 13.2 AI 结构编辑能力

- 当前 `courseAiHandoff` / `courseAiPatch` 继续是 internal/reserved 的未挂载纯接口，不新增聊天、模型、Provider、网络、Clipboard 或可见 Patch 入口。
- 长期可扩展批量/结构级命令、相机路径编排、Runtime/Component props 与时间线编辑，但必须复用人工命令的锁定、history、revision、引用检查和保存合同。
- 轻量人工编辑器不扩建成重型 Focusky/PPT/白板面板；复杂批量机制优先由未来 AI 调用窄命令完成。

### 13.3 Schema 与共享层演进

- 当前继续使用 Course Project V9；不因隐藏、移动 UI 或简化心智模型启动 V10 迁移。
- `globalLayerItems` 和 `surfaceLayerItems` 继续是 V9 引擎、作者和发布能力；全局层保持可见作者入口。
- 任何未来 Schema 清理都必须证明 V9 无法表达目标、提供无损迁移与旧版拒绝策略，并另行获得确认。

## 14. 执行任务包

当前可派发任务位于 [`docs/tasks/v9-editor/00_INDEX.md`](docs/tasks/v9-editor/00_INDEX.md)。任务包遵守以下关系：

- 本文件是唯一产品与长期方向；任务文档不得修改产品决策。
- 任务按文件所有权分 lane，先并行实现窄纵切，后由中央集成任务处理 `App.tsx`、store、Workspace、ScenePanel、RightSidebar 和全局 CSS 等热点。
- 中间任务只跑最小定向验证；最终任务 [`13_FINAL_FULL_GATE.md`](docs/tasks/v9-editor/13_FINAL_FULL_GATE.md) 是唯一全量测试入口。
- 旧 `docs/plans/AI_NATIVE_*`、M3–M8 计划和评估报告只作历史取证或代码供体说明，不再用于任务领取或状态判断。

## 15. 接手与记录规则

- 新 Agent 先读本文件，再从 `PROJECT_COGNITION_INDEX.md` 定位源码、Schema、Player 和能力卡。
- 执行者再读任务索引、共享合同和自己领取的单一任务文档；不得顺手承接相邻 lane。
- 长期决策只更新本文件；执行状态更新任务索引和相应任务交付记录，不再创建互相冲突的总计划。
- 每次交付必须写明：基线提交、改动纵切、实际修改文件、最小测试命令与结果、集成请求、视觉/互动证据和剩余风险。
- 恢复工作树完成后已合回根目录。根目录合回前的脏树归档在 `archive/v9-editor-v8-base-dirty-pre-parity`；不要把它重新当成默认产品路径。任何对归档分支或历史 worktree 的清理都需单独确认。
