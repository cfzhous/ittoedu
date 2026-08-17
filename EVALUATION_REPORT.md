# M5/M6 收口轮评估报告

> 日期：2026-08-16
> 分支：`codex/v9-editor-v8-base`（评估时 HEAD `e2e34aa`，本报告不入主线历史）
> 性质：评估报告（PR 复核 + 真实体验复核 + UI 评估 + 验收判定），不修改产品代码与既有计划文档
> 关联：[`COURSEWARE_DEVELOPMENT_PLAN.md`](COURSEWARE_DEVELOPMENT_PLAN.md)、[`docs/plans/M5_M6_FLOW_SPATIAL_PLAN.md`](docs/plans/M5_M6_FLOW_SPATIAL_PLAN.md)、[`UIUX_ASSESSMENT_AND_FOUR_MODE_DESIGN.md`](UIUX_ASSESSMENT_AND_FOUR_MODE_DESIGN.md)

---

## 0. 结论摘要

- **PR 复核**：红线全部守住（禁区零触碰、无 donor 重引入、无新增依赖），机器证据全绿（typecheck、205 文件/1325 测试、player/renderer 构建、Electron E2E 9/9）。**但发现 2 个 P1 级"只交付能力与单测、生产 Player 未接线"的过度声称，另有一批 P2 与 UI/UX 结构问题——决定：暂不合并/不判定 Gate。**
- **真实体验复核**：Flow 25/25 全过；Spatial 全过；Mixed 编辑器侧正常、Player 场景目录只列幻灯片（P1 实机证实）。
- **UI 评估**：你的观察成立，且拆成三件事——①"画布级编辑没开放"是**部分误判**（Slide 画布编辑真实存在，简洁模式隐藏坐标造成印象）+ **部分真实**（Flow 画布不能就地打字）；②"UI 完全不对"是**信息架构问题**（工程没有"形态"概念）；③视觉系统**没有系统**（字阶/圆角/色值无约束）。
- **停走建议**：**停**。不是停整个开发，而是停在当前阶段——M7/M8 不动工，先做一个明确的小批次（2 个 P1 接线 + 3 个 P2 + 术语清理），再做产品决策（四模式信息架构是否立项）。
- **验收判定**：engineering candidate（机器证据层面）达标；art candidate **不成立**；accepted **否**。

---

## 1. PR 复核

> 注：GitHub 上该分支**没有对应 PR 实体**（`gh pr list` 为空），本复核按本地分支 diff 进行。远程 `origin/codex/v9-editor-v8-base` 与本地一致（`e2e34aa`）。

### 1.1 红线检查（全部通过）

| 检查项 | 结果 |
|---|---|
| `tests/contracts/**` | 收口轮零改动（最近改动仅 2026-08-15 经授权的金基线重捕获 `31f9f64`） |
| `scripts/verify-editor-preservation.ts` | 收口轮零改动 |
| `package.json` / `package-lock.json` | 零改动，无新增依赖 |
| `src/main/ipc.ts` / IPC | 零改动 |
| donor（CourseStudioApp / CourseSurfaceCanvas / V9EditorShell） | 未重引入正式 import graph（`main.tsx`/`ProductApp.tsx`/`App.tsx` 均无引用） |
| 第二 App/Shell/Store | 未新建；Flow/Spatial 工作区挂在原 `Workspace.tsx` 中央编辑区（计划允许的内容工作区形态） |

### 1.2 机器证据（复跑确认）

| 证据 | 结果 |
|---|---|
| `npm run typecheck`（renderer/electron/e2e 三配置） | 绿 |
| 全量 Vitest | **205 文件 / 1325 测试全过** |
| `build:player` / `build:renderer` / `build:electron` | 通过 |
| 全量 Electron E2E | **9/9 通过**（v9DefaultBoundary×3、v9GlobalControllerAndHealth、v9SlideVerticalSlice×2、v9SpatialAuthoring、v9SurfaceScope、v9TrialRun） |
| `verify:course-cases` | valid（三例确定性可复现） |
| preservation visual 门禁 | PASS（三档视口 mismatch=0） |

### 1.3 深审发现（两路 diff 审查 + 复核证实）

**P1（生产行为未变，过度声称"已修复"）：**

1. **Spatial 控制器三件套未接生产 Player**。宿主已实现 `audioChangeSource`/`courseProgressSource` 且有真实单测，但 `PublishedCourseApp.ts:404-417` 构造 `SpatialSurfaceHost` 时未传入。交付课件中静音标签仍钉初始值、progress 仍显示"场景 — / 0 · 等待开始"（本报告 §2.3 试运行截图证实）。
2. **Player 场景目录 locations 模式未接线**。`ScenePickerOverlay` 的 locations 能力与单测真实，但 `PublishedCourseApp.ts:444` 仍只传 `scenes:`（`#pickerScenes()` 显式过滤非 slide-scene）。混合工程场景目录只列 2 个幻灯片场景（§2.3 截图证实）。

**P2：**

3. App 壳会话相机 effect 时序：镜头切换后 `spatialSessionCamera` 被重置回退 home，"从当前画面添加/设为首页镜头"在该时序捕获错误位姿；且无 App 级接线测试。
4. relation `label` / path `name` 仍零渲染（数据保留但无 `<text>` 消费方）。
5. `workspaceFlowSpatialTrial.test.tsx` fallback 用例是假测试（从不点击按钮、store mock 成抛错、无"退出后工程不变"断言）。
6. SpatialLayerInspector 重复值吞提交（外部变化后再次键入相同值被静默吞掉）。

**合并决定**：**暂不合并判定**。两个 P1 属窄接线（`PublishedCourseApp` 传参各一处），修复成本小，但必须在 Gate 判定前闭合；UI/UX 见 §3。

---

## 2. 真实体验复核（Gate 核心，机器替代不了）

方法：真实 Electron 应用实机启动，用 `output/manual-test/flow-start.h5lesson`、`output/manual-test/spatial-start.h5lesson`、`examples/course-project-v9/ecosystem-mixed/project.h5lesson` 三个工程走完整路径，全程截图与行为断言（证据图在 `output/audit-visual/` 与 `output/audit-manual/`）。

### 2.1 Flow 代表性路径 —— 25/25 全过

| 检查项 | 结果 |
|---|---|
| 插入标题/段落/列表/表格/公式/代码/提示块 | 全过（七类块真实插入并渲染） |
| 媒体/互动组件插入 | 无素材/组件包时按钮禁用并显示原因（不再是必败抛 Zod） |
| 列表项/表格行列结构编辑 | 全过（属性页添加/删除列表项、添加列，画布同步） |
| 删除/复制/上移/下移/层级提升/降低 | 全过（画布工具条六键 + 大纲工具条） |
| Delete / Ctrl+D 键盘操作 | 全过 |
| 右栏属性编辑，一次编辑一次撤销 | 全过（blur 提交，Ctrl+Z 精确回退到编辑前文本） |
| 统一图层在画布与右栏"图层"页可见 | 过（画布图层叠加 + 图层页显示全局控制器层） |
| 当前位置试运行启动/退出、退出后工程不变 | 过 |
| 保存 → 完全关闭 → 重开 → 继续编辑 | 过（另存为 2553 字节，重开后 Flow 位置可达、可继续编辑） |
| 导出单 HTML / 网页包 / PDF | 全过（1.9MB / 542KB / 41KB 真实文件） |
| 当前 Flow 位置导出 DOCX 为真实语义文档 | 过（`word/document.xml` 含真实文本与 `w:tbl` 表格结构，**零图片资源**——非截图伪装） |

### 2.2 Spatial 代表性路径 —— 全过（除控制器 progress，见 P1）

| 检查项 | 结果 |
|---|---|
| 0.5x/1x/2x 缩放 | 过（实测 51% → 100% → 195%） |
| 平移、小地图 | 过 |
| 缩放/平移时右侧属性区与底部控件不随世界缩放 | 过（控件尺寸 100% 与 195% 下逐位一致） |
| 添加文字/图形/公式 | 全过 |
| 移动、八向缩放、旋转 | 过（选择 chrome 出现、拖动 Δx=40 生效；旋转手柄存在） |
| 属性面板 blur/Enter 提交、负坐标可输入 | 过（X 输入 -50、Enter 提交、Ctrl+Z 一次撤销回 -300） |
| 镜头：从当前画面添加/重命名/排序/切换/设首页 | 过（"从当前画面添加"实测捕获真实会话位姿 125%·x-256·y-144） |
| 路径/关系在画布和 Player 中都可见 | 过（编辑画布连线/折线、试运行 Player 节点数=3） |
| 试运行、保存重开、HTML/网页包/PDF 导出 | 全过 |
| 教师控制器 progress/静音标签 | **不过**——试运行中 progress 显示"场景 — / 0 · 等待开始"（即 §1.3 P1-1，生产未接线） |

### 2.3 Mixed 路径 —— 编辑器侧过，Player 目录不过

| 检查项 | 结果 |
|---|---|
| 左栏"课程内容"跨 Slide/Flow/Spatial 导航 | 过（导航列出三类、教师术语"幻灯片/讲义/空间"正确，三种工作区切换正常） |
| 场景目录按 location 列举三类内容 | **不过**——试运行"场景目录"只列 2 个幻灯片场景，无讲义/空间条目（即 §1.3 P1-2，生产未接线） |

---

## 3. UI 设计评估与停走决策

### 3.1 你的两个观察的核查结论

**"画布级编辑似乎没开放，只能在属性栏编辑"——部分误判、部分真实。**

- 误判部分：Slide 画布级编辑真实存在（拖动/八向缩放/方向键/双击就地文字编辑，E2E 与实机双重证实）。产生印象的真实诱因：**简洁模式隐藏坐标字段**（几何字段只在专业模式显示，看不到坐标变化容易以为拖动没生效）。
- 真实部分：**Flow 画布不支持就地编辑文字**（`FlowWorkspace` 中无 onDoubleClick/contentEditable），块内容只能走属性栏——这对讲义类内容是明显的设计缺口。

**"UI 设计完全不对"——成立，且根因是信息架构而非视觉细节。**

实机截图证据（`output/audit-manual/f02-flow-workspace.png`、`s01-spatial-workspace.png`、`m05-mixed-picker.png`）：

1. **Flow 编辑画布把文档渲染成暗色舞台上的漂浮块**，外加一条突兀的六键工具条浮在选中块下方；而试运行视图是正确的文档式呈现——**编辑态与运行态呈现严重不一致**。
2. **左面板层级混乱**：纯 slide 工程也挂与场景列表内容重复的"课程内容"导航；"添加讲义/添加空间"入口在导航头与表面区各重复一次；课程内容、表面标题、大纲三层混排。
3. **Spatial 左面板是密排工程表单**（镜头列表/首页镜头/语义缩放/世界图层/最小最大缩放逐字段平铺），非教师向布局。
4. **术语残留**：右栏"FLOW 内容块"/"SPATIAL 内容"、状态栏"Flow 讲义 · N 个内容块"/"Spatial 空间·总览"、错误文案"无法新建 Flow 讲义"（与按钮"添加讲义"自相矛盾）；Flow/Spatial 路由底部状态条仍显示 Slide 语义（"场景画面/基础场景"）。
5. **视觉系统没有系统**（opus遗留文档的量化，复核确认属实）：`variables.css` 仅 24 行 3 个圆角令牌，`globals.css` 5418 行，裸写十六进制色 150 处，字号 11 种、圆角 13 种；1366×768 下画布仅占屏 32.4%。

### 3.2 停走决策

**建议：停——但停的是"M7/M8 不动工"，不是停开发。**

理由：§1.3 的两个 P1 与 §3.1 的 UI 问题都**不会随后续开发自愈**。M7（Mixed）要在跨表面导航与统一 Player 上叠加，M8 要过教师验收；在现在这些信息架构与生产接线的缺口上继续叠加，只会把修复成本放大。

具体建议分两层：

**A. 立即做的小批次（Gate 前置，工作量小、口径明确）：**

| 任务 | 内容 |
|---|---|
| T-WIRE-SPAT-CTRL | `PublishedCourseApp` 构造 SpatialSurfaceHost 时传 `audioChangeSource`（events）与 `courseProgressSource`（课程 locations）；补试运行 progress/静音真实断言 |
| T-WIRE-PICKER | `#pickerScenes()` 改为按 location 列举三类，onSelect 走统一 navigate；混合工程目录真实断言 |
| T-FIX-CAM-TIMING | 修会话相机 effect 时序（镜头切换后不回退 home）+ App 级接线断言 |
| T-FIX-TRIAL-TEST | 重做试运行 fallback 假测试；补 relation label/path name 渲染 |
| T-FIX-UI-TERMS | 术语清理 + 状态条按路由切换语义 + 错误文案与按钮一致 |

**B. 产品决策点（需你裁决，裁决前不动工）：**

opus遗留的 [`UIUX_ASSESSMENT_AND_FOUR_MODE_DESIGN.md`](UIUX_ASSESSMENT_AND_FOUR_MODE_DESIGN.md) 提出"工程形态为一等概念"的四模式信息架构（纯 PPT/纯讲义/纯画布/混合），并附锁定机制补全与视觉系统收敛两个专项。该方向**诊断是对的**（"纯讲义课也要背跨类型导航，混合课从未被专门设计"与我复核证据一致），但它改变壳层信息架构，会触发 preservation 门禁，且与总纲 §2.1"教师继续使用熟悉的产品"存在张力——**这是产品方向选择题，不是工程修复题**。可选路径：

1. **采纳四模式方向**：立项为独立里程碑（在 M7 之前），按该文档 §5 的顺序（锁定补全 → 形态字段 → 纯模式左栏 → 混合编排 → Flow 就地编辑 → 视觉收敛）推进，preservation 门禁走"登记新基线"路径。
2. **只做收敛不立项**：只做 A 批次 + Flow 就地编辑 + 术语清理 + 视觉令牌收敛，壳层 IA 不动，混合课的编排留给 M7 现设计。
3. **折中**：采纳"纯模式减法"（纯 Flow/Spatial 工程隐藏跨表面导航、左栏只留大纲/镜头）这一低成本高收益子集，混合编排的完整设计留到 M7。

### 3.3 验收判定

| 等级 | 判定 | 依据 |
|---|---|---|
| engineering candidate（机器证据） | **达标** | typecheck、205 文件/1325 测试、player/renderer/electron 构建、Electron E2E 9/9、preservation visual PASS、禁区零触碰 |
| art candidate（真实视觉/互动复核） | **不成立** | §2 真实复核发现 2 个生产 Player P1 + §3.1 的 UI 结构问题 |
| accepted | **否** | art candidate 未过；且按合同 accepted 只能来自教师明确验收 |

---

## 4. Gate 前 P3 项的决策建议

| 项 | 建议 |
|---|---|
| 普通教师界面术语清理（"FLOW/SPATIAL/表面"等） | **做**，并入 T-FIX-UI-TERMS；错误文案与按钮措辞保持一致（"添加讲义"↔"无法新建讲义"） |
| DOCX 只导出当前 Flow 位置 + 文件名规则 | 保持"当前 Flow 位置导出"语义，但**文件名加表面名后缀**避免同名覆盖（`{课件名}-{讲义名}.docx`）；禁用原因从 title 移到菜单项内联可见 |
| schemaVersion 是否 bump | **bump**。spatial paths/relations 已使 strict schema 实际收紧（旧构建打不开含新字段的档案），bump 后旧构建能给出版本错误而非泛化校验失败；与"工程形态字段"（若四模式立项）合并一次 bump |
| helper 去重（flowSurfaceIn/flowBlockLabel/spatialSurfaceIn/valuesEqual 等） | 做，低风险的纯收敛，随任一口子任务顺带 |
| 世界图层删除级联（paths/relations/semanticZoom 引用修复） | **必须在暴露删除入口前完成**（当前不可达属侥幸），按 `deleteSpatialCameraFrame` 的修复模式 |
| capture 队列 + includeInStaticExports | 做窄修复：Spatial capture 入队 + destroyed 拒绝；`includeInStaticExports:true` 输出静态占位或补 omitted warning |
| Flow Player 的 interactions 接线 | 做：`PublishedCourseApp` 给 Flow 宿主照 Slide 传 `interactions`（消除 Flow 控制器静音标签不刷新） |
| Spatial 旋转选择框与控制器视图刚性 | 列入收尾：旋转元素选择 chrome 贴合旋转、控制器 viewport 不再硬编码 1120×760 |

---

## 5. 本报告的验证工件

- 真实复核证据截图：`output/audit-visual/`（壳层三视口、Flow/Spatial 编辑态、试运行、预览）与 `output/audit-manual/`（f01-f08 / s01-s12 / m01-m05 系列）。
- 复核脚本（可重跑）：`output/audit-manual/audit-manual-flow.ts`、`audit-manual-spatial.ts`、`audit-manual-followup.ts`。
- 既有文档中的登记：总纲 §3.6 与 §4.5 收口任务板、M5/M6 阶段计划 §5（收口轮审计结论仅见本报告，不再改动既有文档，后续以新评估为准）。
