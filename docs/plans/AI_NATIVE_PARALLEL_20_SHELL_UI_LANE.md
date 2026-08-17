# SHELL Lane：P3 轻量壳层集成

> TASK_ID: `B1-B3-SHELL-UI`
> STATUS: `DONE`（本 lane 最小验证通过，`engineering candidate`；P3 整体完成取决于 I1/Z1）
> OWNER: 未领取（Wave 2 SHELL 执行者已完成，见 §10 交付记录）
> DEPENDS_ON: `A1-A3-LAYOUT-POLICY = DONE`
> PARALLEL_WAVE: `Wave 2`
> PIPELINE_TARGET: `engineering candidate`
> FULL_TEST: 禁止；全量验证统一留给 `Z1`

本文件是一份可直接领取的集成合同。执行 AI 必须先读
[并行执行索引](AI_NATIVE_PARALLEL_00_INDEX.md)、
[共享合同](AI_NATIVE_PARALLEL_05_SHARED_CONTRACT.md)和
[LAYOUT handoff](AI_NATIVE_PARALLEL_10_LAYOUT_POLICY_LANE.md)。只有 LAYOUT lane 交付 `LAYOUT_HANDOFF / 状态：DONE` 后，才可把本任务改为 `READY` 并开始。

本 lane 独占 P3 壳层冲突文件，内部按 B1 → B2 → B3 串行。即使协调者并行派发其他 lane，也不得把下面五个核心文件再拆给第二个 AI。

## 1. 可见目标

1. 纯 Slide、纯 Flow、纯 Spatial 只显示自己的主要左侧导航；Mixed 始终显示按 `project.locations` 排序的“课程流程”。
2. 简洁模式右栏稳定为“元素、图层、属性”，无能力时显示教师可读原因，不挂载错误模型控件。
3. 普通教师界面不显示 `Flow`、`Spatial`、`Surface`、`Scope`、`V9`、`Runtime API` 等协议词。
4. 左右栏可独立收起；状态只活在当前 React UI session，不写工程、不进 history/revision/dirty。
5. 1366×768 下中央内容是主体；本 lane 只做最小 CSS 收敛，真实截图与全量视觉复核留给最终 Gate。

## 2. 文件所有权

### 独占核心生产文件

- `src/renderer/App.tsx`
- `src/renderer/ui/ScenePanel.tsx`
- `src/renderer/ui/RightSidebar.tsx`
- `src/renderer/ui/TopToolbar.tsx`
- `src/renderer/styles/globals.css`

### 允许修改的测试

- `tests/unit/scenePanelSurfaceNav.test.tsx`
- `tests/unit/editorShellMultiSurface.test.tsx`
- `tests/unit/topToolbarDocumentControl.test.tsx`
- 新建 `tests/unit/editorShellCollapse.test.tsx`
- 本 lane 文档，仅可更新状态和末尾交付记录

### 只读依赖

- `src/renderer/course/courseEditorLayout.ts`（只能消费 LAYOUT handoff，禁止改写）
- `src/shared/courseProjectTypes.ts`
- `src/renderer/store/editorStore.ts`
- `src/renderer/ui/ElementsTab.tsx`
- `src/renderer/ui/NodesTab.tsx`
- `src/renderer/ui/PropertiesTab.tsx`
- Flow/Spatial workspace 与面板文件

### 禁止修改

- LAYOUT lane 的两个代码文件
- Store、Schema、IPC、Workspace、Flow/Spatial 内容编辑、导出与 Player
- Elements/Nodes/Properties/Flow/Spatial 子面板；若术语只存在于这些文件，记录精确位置交给协调者，不跨 lane 修补
- package/锁文件、fixture、迁移、AI 接口、文档声明

## 3. 输入与输出合同

### 固定输入

- `v9CourseProject = v9SlideVerticalSlice?.history.present ?? null`
- LAYOUT lane 导出的 `deriveCourseEditorShellPolicy(v9CourseProject)`
- 当前 location、既有 Slide/Flow/Spatial document controls
- 既有 `editorMode`、`activeTab`、选择与保存状态

V8/legacy 没有 `v9CourseProject` 时不得伪造策略；继续走现有 legacy adapter 与壳层行为。

### Shell 输出

- App 只在 render/memo 阶段推导 `CourseEditorShellPolicy`，不得写回 project。
- `ScenePanel` 接受一个窄的可选策略/导航 prop，呈现纯课主导航或 Mixed 课程流程。
- `RightSidebar` 保持现有三类 controlled document control；不增加第二套数据入口。
- `TopToolbar` 接受一个可选 session-only shell layout control，用于左右栏展开/收起。
- CSS 只由 App 根 class/数据属性控制列宽；不得复制三套 surface CSS。

建议的窄 UI 合同如下，允许在不改变语义的前提下微调命名：

```ts
interface ShellLayoutControl {
  readonly leftExpanded: boolean
  readonly rightExpanded: boolean
  onToggleLeft(): void
  onToggleRight(): void
}
```

折叠状态必须在 `App` 内以两个 boolean React state 保存；不得进入 Zustand、localStorage、Course Project 或 IPC。

## 4. B1 — 左栏接入（先完成）

### 实施步骤

1. 先更新 `scenePanelSurfaceNav.test.tsx`，覆盖四种 shell policy，再接实现。
2. App 对 V9 project 调用一次 `deriveCourseEditorShellPolicy`；不得保存结果，也不得根据当前 active location 把 Mixed 误判成纯课。
3. 将策略传入 `ScenePanel`。Mixed 的 `course-location-nav` 按 `project.locations` 顺序渲染，切换 location 时必须复用同一导航 DOM 骨架，只改变 active 项和内容区。
4. 纯 Slide 显示幻灯片主导航；纯 Flow 显示讲义大纲；纯 Spatial 显示镜头列表。不要同时叠加一个“课程内容/课程流程”区。
5. 多个同类型 surface 仍是纯课，但所有 location 必须可达；不得因为隐藏 Mixed 列表而让第二个同类型 surface 失去导航入口。允许在对应主导航内按 location 顺序展平/分组，禁止恢复协议词标签。
6. 纯 Flow/Spatial 不显示跨类型“添加讲义/添加空间”重复按钮。既有同类型窄新增命令可以保留；Mixed 仍沿用现有窄新增入口。
7. 教师标签固定为“幻灯片、讲义大纲、镜头列表、课程流程”；普通 UI 不出现英文 surface kind。

### B1 验收

- 单一类型与多个同类型 surface 均走纯课骨架。
- Mixed 当前 location 在三类 surface 间切换，`course-location-nav` 的 HTMLElement identity 不变。
- 所有 location 仍可点击，回调仍发送稳定 `locationId`。
- V8 `LegacyScenePanelAdapter` 行为和既有入口不变。

### B1 最小测试

```powershell
npx vitest run tests/unit/scenePanelSurfaceNav.test.tsx
```

该命令未通过时不得进入 B2。

## 5. B2 — 右栏、术语与状态收敛

### 实施步骤

1. 简洁模式只渲染“元素、图层、属性”；专业模式现有入口继续留在显式模式内。
2. 保持 Slide、Flow、Spatial 三种现有 controlled props 路由。缺能力的 tab 显示教师可读禁用原因，不能 fallback 到 legacy 编辑器。
3. 保留当前选择、x/y/宽高或 Flow 块位置、Spatial zoom、保存状态和错误反馈；可以折叠复杂内容，不得隐藏当前反馈。
4. 只清理本 lane 独占文件中的普通可见协议词：
   - `Flow 讲义` → `讲义`
   - `Spatial 空间` → `空间画布` 或上下文中的 `镜头列表`
   - `Surface` / `location` / `Scope` → 对应教师词
   - `V9` / `Runtime API` 不得出现在普通模式文案
5. `data-testid`、内部类型名和专业诊断数据可以保持稳定；不要为了中文化重命名协议或测试选择器。
6. 不增加 AI、批量处理、模板向导或新的专业面板。

### B2 验收

- 三种 surface 在简洁模式都只有三入口，顺序一致。
- 不可用入口只显示原因，不发生 Store 写入。
- 保存/dirty、选择信息和属性反馈仍可见。
- 本 lane 五个生产文件的普通可见字符串无协议词泄漏。

### B2 最小测试

```powershell
npx vitest run tests/unit/editorShellMultiSurface.test.tsx tests/unit/topToolbarDocumentControl.test.tsx
```

只修复与本 lane 改动直接相关的断言；若失败指向被禁止文件，按停止条件回报。

## 6. B3 — 左右栏收起与最小 CSS

### 实施顺序

1. 先新建 `editorShellCollapse.test.tsx`，验证两个独立按钮、回调与可访问属性。
2. App 新增 `leftSidebarExpanded` / `rightSidebarExpanded`（或语义等价命名）的 session state，默认展开。
3. TopToolbar 始终提供两个可键盘聚焦的切换按钮，使用明确中文 `aria-label`，并令 `aria-expanded` 等于真实状态。收起后按钮仍可操作。
4. ScenePanel 与 RightSidebar 组件保持挂载，仅在对应状态下 `hidden`/`inert` 并退出布局与焦点序列；重新展开后依赖 Store/App 的选择与 session camera 不变。
5. App 根布局使用组合 class 或 data attribute 表示左收起、右收起、双侧收起。专业 developer 右栏宽度规则只在右栏展开时生效。
6. CSS 只修改壳层列宽、折叠按钮和当前可见区的必要间距/边框/圆角。不得改 1280×720 内容逻辑坐标，不做 token 迁移或全量 CSS 格式化。

### 状态不变量

点击任何折叠按钮前后，以下值不得因折叠动作改变：

- `courseSession.history.present.revision`
- history past/future 长度
- dirty / 保存路径
- 当前 location 与 selection IDs
- Spatial session camera
- Trial frame 与 controller persisted frame

### B3 验收

- 左右栏可以分别和同时收起；四种组合的 App class/属性正确。
- 切换按钮有 `aria-expanded`、明确名称、键盘可达。
- 被收起面板不可聚焦，展开后之前的选择仍在。
- 1366px 宽时双栏展开不小于现有中央区域；收起任一栏会真实释放其 grid 列宽。
- 不新增三套 surface-specific shell CSS。

### B3 最小测试

```powershell
npx vitest run tests/unit/editorShellCollapse.test.tsx
```

本 lane 不启动浏览器截图；1366×768 的真实视觉判断统一留给 `Z2`，避免每个 AI 重复跑环境。

## 7. Lane 收尾最小验证

三个子包各自命令通过后，只再运行 diff 检查：

```powershell
git diff --check -- src/renderer/App.tsx src/renderer/ui/ScenePanel.tsx src/renderer/ui/RightSidebar.tsx src/renderer/ui/TopToolbar.tsx src/renderer/styles/globals.css tests/unit/scenePanelSurfaceNav.test.tsx tests/unit/editorShellMultiSurface.test.tsx tests/unit/topToolbarDocumentControl.test.tsx tests/unit/editorShellCollapse.test.tsx docs/plans/AI_NATIVE_PARALLEL_20_SHELL_UI_LANE.md
```

本 lane 明确禁止：

- `npm run typecheck`
- `npm test` / `npm run test:compat`
- 任意 build / desktop build
- `npm run prepare:e2e`
- Playwright / Electron E2E
- `npm run verify` / `npm run verify:full`

这些只由 `I1`/`Z1` 集中运行一次。

## 8. 交付格式

```text
TASK_ID：B1-B3-SHELL-UI
状态：DONE / BLOCKED
LAYOUT_HANDOFF：已消费的导出合同/commit 或工作树标识
修改文件：逐行列出
可见结果：纯 Slide / 纯 Flow / 纯 Spatial / Mixed 分别一句
关键不变量：history、revision、dirty、selection、camera
最小验证：B1/B2/B3 命令 + 各自通过数
协议词审计：无泄漏 / 剩余位置与原因
Integration request：无 / 按共享合同
Pipeline status：engineering candidate / unusable
已知风险：全量测试留给 Z1；真实 1366×768 视觉留给 Z2
```

完成时只将本 lane 标记为 `engineering candidate`；没有真实截图和最终 Gate，不得称 P3 为 art candidate 或 accepted。

## 9. 停止条件

出现任一情况立即停止，`STATUS` 改为 `BLOCKED` 并交协调者：

- LAYOUT handoff 缺失、失败或导出合同与其 lane §3 不一致。
- 任一独占核心文件已有无法确认归属的并行修改。
- 实现必须修改 Store、Schema、IPC、Workspace、Flow/Spatial 子面板或其他 lane 文件。
- 多同类型 surface 无法在不丢 location 可达性的前提下实现纯课导航。
- 折叠必须持久化才能工作，或会改变 history/revision/dirty/selection/camera。
- 最小测试连续三次因同一跨模块原因失败。
- 需求会引入可见 AI、第二壳层、第二 Store、依赖或大规模 CSS 重写。

## 10. 交付记录

### Wave 2 交付（2026-08-16）

- 状态：`DONE`（本 lane 最小验证全部通过，标记 `engineering candidate`；P3 是否 art candidate 取决于 I1/Z1 与真实视觉复核）。
- 消费的 LAYOUT handoff：`deriveCourseEditorShellPolicy` / `deriveCourseEditorLayout` / `CourseEditorShellPolicy`（导出合同与 LAYOUT lane §3 逐项一致；只读，未改写 `courseEditorLayout.ts`）。
- 修改文件（逐项）：
  - `src/renderer/App.tsx`：新增 `v9ShellPolicy`（render/memo 阶段一次推导，try/catch 兜底不崩溃，绝不写回 project）；ScenePanel 传入 `shellPolicy` 并按课型门控 `onAddFlowSurface`/`onAddSpatialSurface`；新增 `leftSidebarExpanded`/`rightSidebarExpanded` session state；`app-main` 组合折叠 class；ScenePanel/RightSidebar 各包一层 `hidden`/`inert` shell；TopToolbar 传 `shellLayoutControl`；清理全部普通可见协议词（`Flow 内容块`→`内容块`、`Flow 讲义`→`讲义`、`Spatial 空间`→`空间画布`、V9/M4-COMP 专业提示语改写）。
  - `src/renderer/ui/ScenePanel.tsx`：aside 统一由 ScenePanel 渲染（Mixed 切 location 时 `course-location-nav` DOM identity 不变）；`CourseLocationNav` 支持标题/aria-label；纯课单 surface 不显示 location 列表，多同类型 surface 在主导航内按 kind 展平；`ScenePanelContent` 拆为 `ScenePanelContentBody`；LegacyScenePanelAdapter 保持原 aside 结构与行为；协议词清理（`讲义大纲`/`空间画布`/`添加讲义`/`添加空间`）。
  - `src/renderer/ui/RightSidebar.tsx`：`Spatial 内容`→`空间画布内容`、`Flow 讲义暂不提供…`→`讲义暂不提供…`。
  - `src/renderer/ui/TopToolbar.tsx`：新增 `ShellLayoutControl` 接口与两个可键盘聚焦切换按钮（中文 `aria-label`、`aria-expanded` 等于真实状态）；`Flow 内容导出…`→`讲义内容导出…`、`请先切换到 Flow 讲义位置`→`请先切换到讲义位置`。
  - `src/renderer/styles/globals.css`：折叠 grid 组合（含 developer 右栏宽度只在右栏展开时生效）、`scene-panel-shell`/`right-sidebar-shell`、`toolbar__shell-toggle`；未改 1280×720 内容逻辑坐标。
  - 测试：`tests/unit/scenePanelSurfaceNav.test.tsx`（+7 例：四策略、Mixed identity、多 surface 纯课展平、Legacy 不变）、新建 `tests/unit/editorShellCollapse.test.tsx`（4 例：按钮/aria、左栏折叠、右栏独立折叠、状态不变量）。
- 最小验证：
  - `npx vitest run tests/unit/scenePanelSurfaceNav.test.tsx` → 12 passed。
  - `npx vitest run tests/unit/editorShellMultiSurface.test.tsx tests/unit/topToolbarDocumentControl.test.tsx` → 9 passed。
  - `npx vitest run tests/unit/editorShellCollapse.test.tsx` → 4 passed。
  - `git diff --check -- <本 lane 文件>` → clean（App.tsx 曾因工具写回转为 CRLF，已还原 LF）。
- 已知风险：
  - `tests/unit/flowUnifiedLayerEntry.test.tsx:578`（FLOW lane 独占测试）断言旧文案 `Flow 讲义暂不提供此面板…`；RightSidebar 已改为 `讲义暂不提供此面板…`，该测试需 FLOW lane/协调者一行同步，属跨 lane 依赖（见 §8 Integration request 说明）。
  - 全量测试、typecheck 与真实 1366×768 视觉判断统一留给 I1/Z1/Z2。
- 关键不变量：折叠只动 App session state；revision、history past/future、dirty、location/selection、Spatial session camera、project 对象同一性均不变（collapse 测试逐项断言）。
