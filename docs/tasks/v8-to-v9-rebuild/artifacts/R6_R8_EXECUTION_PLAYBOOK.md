# R6–R8 执行加速手册

> 冻结级别：coordinator-proposed（2026-08-17）
> 目的：R4-Z 完成后，领取 R6/R7 的人**不必再发明范围、文件名或验证矩阵**
> 原则：**补缺口，不重做已交付能力；不增加 R8 才该跑的验证**
> 产品 worktree：`C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild`
> 计划包：`docs/tasks/v8-to-v9-rebuild/`

本手册覆盖任务卡。与 `08`/`09`/`10` 冲突时：产品不变量以根计划为准；**文件所有权、禁止重做、验证预算以本手册为准**。

---

## 0. 速度规则（所有 R6/R7 任务）

1. 默认仍是：最多 **两个** Vitest 文件 + `git diff --check -- <本任务列出的路径>`。禁止 typecheck / 全量 test / build / E2E。
2. `git diff --check` **禁止**写成整个 `src/renderer/ui`、`src/renderer/course`、`src/player`、`src/shared`。只列本任务新建或授权改的文件。
3. 阶段 `*-Z` **只做一次**真实窗口冒烟（一个工程、一条路径）。禁止为「七组合 / 四种导出 / 三视口」各开一套 Electron。
4. 发现已有函数能用，就 import，不要为了任务卡上的历史文件名再写第二套。
5. 不改 Schema、不新增 `projectMode`、不建第四种 Mixed 数据类型、不建第二 App。
6. 不 commit，除非用户明确要求。

冒烟若需要 Electron：复用 R5-Z 打法（产品 worktree Vite + `_electron.launch`，独立 `--user-data-dir=output/r6-z-smoke/` 或 `r7-z-smoke/`）。不要设 `VITE_V9_CANDIDATE_SMOKE`。

---

## 1. 领取前已经是真的（不要再实现一遍）

以 2026-08-17 产品 worktree 为准。R4-Z 还在改壳层；R6 开工前再 `rg` 一次确认。

| 能力 | 现状 | 后续任务 |
|---|---|---|
| 默认工程 Course Project V9 | R3-CUT | 保持 |
| 顶栏新建：空白演示 / 空白无限画布 / 空白流式讲义 | `createBlankCourseProject`、`createSpatialCourseProject`、`createFlowCourseProject`；`data-testid=new-spatial-project` / `new-flow-project` | R6 **不要**再做三类空白工程。R6 只做**工程内**主按钮+下拉 |
| V9 打开/保存；V8 zip 显式导入 | `courseProjectIo.ts`、CUT | R7-A 只补 recovery/recent/损坏拒绝 **若仍缺口** |
| Slide 当前位置试运行 | Workspace 仍可能走 `buildStandaloneHtml` 派生 V8 | **R7-B/Z**（`R3CUT-R7B-01`） |
| Spatial 当前位置试运行 | `spatialLocationTryRun.ts` → `SpatialSurfaceHost` | R7-B **只组装**，禁止改 host 源码 |
| Flow 当前位置试运行 | `flowLocationTryRun.ts` → `FlowSurfaceHost`（R4-Z） | 同上 |
| Flow print/DOCX helper | `export/course/flowDocx.ts`、`flowPrintPlan.ts` | R7-D **只调用**，禁止重写 |
| Published V2 producer | `buildPublishedCourseV2Payload` | R7-C 用它产 HTML/包，不要第二套 payload |
| V8 导出菜单/预检/PPTX/网页包 | `exportPreflight.ts`、`buildPptx.ts`、`buildWebPackage.ts`、`buildStandaloneHtml.ts` | R7 把它们接到 V2，不要另做一套菜单 |
| 左栏纯态树 | Slide `add-scene`；Flow `add-flow-page` + heading 树；Spatial「本页镜头」`add-spatial-camera` | R6-Z **统一**工程内新增；Spatial 主按钮是 **新 Spatial 页**，不是新镜头（镜头仍用现有 +） |
| 教师控制器 / MediaTab / 有效图层 | R3 已接 | R6/R7 不重做 |

---

## 2. R6 — Mixed 与工程内新增

R6 的用户可见缺口只有三句：

1. 工程内用 **一个主按钮 + 下拉** 新增另一类页面/场景，且 **旧 location 全部还在**。
2. 左栏一张课树能同时显示 Slide 场景、Flow 页+标题、Spatial 页+镜头。
3. 切页时 selection / Delete / 快捷键 / 全局层不串到上一页。

没有 `projectMode`。没有七套窗口。没有新壳层。

### 2.1 工程内新增 UI（coordinator freeze）

位置：**左栏课程结构标题旁**，替换/合并现在分散的「+ 新建场景 / 新增页面」。不要做进顶栏「新建工程」菜单。

| `deriveCourseEditorLayout().kind` | 主按钮文案 | 主按钮 testid | 主按钮命令 | 下拉 |
|---|---|---|---|---|
| `slide` | 新建场景 | `add-content-primary`（可同时保留 `add-scene`） | `addCourseScene`（当前 Slide surface） | 新增流式讲义；新增无限画布 |
| `flow` | 新增页面 | `add-content-primary`（可保留 `add-flow-page`） | `addCourseFlowPage` | 新增演示页面；新增无限画布 |
| `spatial` | 新增页面 | `add-content-primary` | `addCourseSpatialPage`（新 spatial-2d + home camera） | 新增演示页面；新增流式讲义 |
| `mixed` | 跟随**当前激活 surface**（与纯态同文案） | `add-content-primary` | 当前 flow → `addCourseFlowPage`；当前 spatial → `addCourseSpatialPage`；否则同 slide（`addCourseScene` / 无 Slide 时 `addCourseSlidePage`） | 其余未占用类型（`add-slide-page` / `add-flow-page` / `add-spatial-page`） |

下拉 testid：`add-content-menu`。项：`add-slide-page` / `add-flow-page` / `add-spatial-page`（主按钮已占用的类型不要在下拉里重复）。

避让：菜单按视口向上/下翻，键盘可达。不要用会被滚动裁切的绝对底边浮层。

**禁止：** 主按钮新建一个不可见 Slide surface；新增后旧 scene/page/camera 从树消失；把 Spatial「+ 镜头」当成主按钮。

### 2.2 七组合（只在 R6-A **一个**测试文件里用表驱动）

`deriveCourseEditorLayout` 输入 = 工程里实际出现的 `surface.type` 集合（被 location 引用的）：

| # | surface kinds | `kind` | 主按钮 |
|---|---|---|---|
| 1 | slide | `slide` | scene |
| 2 | flow | `flow` | flow page |
| 3 | spatial-2d | `spatial` | spatial page |
| 4 | slide+flow | `mixed` | scene |
| 5 | slide+spatial-2d | `mixed` | scene |
| 6 | flow+spatial-2d | `mixed` | **slide page**（没有 Slide surface） |
| 7 | 三类都有 | `mixed` | scene |

同一测试再加一条：**同一 Slide surface 连续 `addCourseScene` 两次，旧 scene location 仍在且可激活**。不要为七组合开七个 Electron。

### 2.3 R6-A — 命令

**只写：**

- `src/renderer/course/courseLocationCommands.ts`
- `src/renderer/course/courseEditorLayout.ts`
- `tests/unit/courseLocationCommands.test.ts`
- `tests/unit/courseEditorLayout.test.ts`

**冻结导出（名称可多别名，但 HANDOFF 必须列出实名）：**

```ts
deriveCourseEditorLayout(project, activeLocationId)
  -> { kind, primary, dropdown, activeSurfaceId }

addCourseScene(project, { surfaceId, expectedRevision })
addCourseSlidePage(project, { title?, expectedRevision })
addCourseFlowPage(project, { title?, expectedRevision })  // 内部可调 createBlankFlowSurface
addCourseSpatialPage(project, { title?, expectedRevision })
duplicate / rename / reorder / delete  location 或 surface
```

一次成功动作一次 `revision` / history。删到只剩最后一个可达 location 必须拒绝并给中文原因。

**只读复用：** `addSlideScene`、`createBlankFlowSurface`、R5-A 建 spatial surface/camera 的现有工厂。不要复制一份 Slide/Flow/Spatial 文档模型。

**供体：** `git show 4755034:src/renderer/course/courseLocationCommands.ts` 与 `courseEditorLayout.ts`。丢掉持久化四模式、丢掉「新增 scene 导致旧内容消失」的实现。

**不要改：** App / store / ScenePanel / 任何 R4/R5 命令文件。

### 2.4 R6-B — 课树投影

**只写：**

- `src/renderer/course/courseTreeView.ts`
- `tests/unit/courseTreeView.test.ts`
- 第二测试文件可省；不要为了凑数再写一个。

**冻结：** `buildCourseTreeView(project)` 返回：

- `shared.globalEntry`（固定，不参与排序/模式）
- `pages[]`：每个 surface 一个父节点
  - slide → children = scene locations
  - flow → children = heading/section（用 `listFlowCourseTreePages`，**不要**自己遍历 paragraph）
  - spatial-2d → children =「本页镜头」分组 + camera frames（用 R5 已有镜头列表）

多套 Slide surface **全部**出现。稳定 id = locationId / surfaceId。20+ location 只测数组长度与 id，不测像素滚动。

**不要改 ScenePanel。** 不要把 world item / paragraph 挂到树上。

### 2.5 R6-C — 跨 surface 路由

**只写：**

- `src/renderer/course/editorActionRouting.ts`
- `src/renderer/course/editorActionTypes.ts`（若产品已有等价表则扩展，不要第二份 ID 宇宙）
- `src/renderer/authoring/courseAuthoringSession.ts`（可极薄：记录 `surfaceType + locationId + revision`，切页时作废旧 token）
- `tests/unit/editorActionRouting.test.ts`
- `tests/unit/courseAuthoringSession.test.ts`

**冻结行为：**

```
routeEditorAction(project, selection, action)
  slide     -> 现有 Slide/V9 candidate 命令
  flow      -> executeFlowDelete / executeFlowEditorCommand / executeFlowSharedDelete
  spatial   -> spatial session 命令
  global    -> R3 effective/global 命令
```

切 location：清掉上一页 item id；text composing 未提交则先拒绝或先 commit（与 R4-B `resolveFlowTextHistoryAction` 同类，不要新草稿结构）。

上一/下一、目录、声音：**只路由到现有课程会话**，不要在 R6 实现第二套 Player。

**不要改** App/store/Workspace/RightSidebar。

### 2.6 R6-Z — 接线 + **一次**冒烟

**可改热点：** `App.tsx`、`editorStore.ts`、`ScenePanel.tsx`、`TopToolbar.tsx`（仅当必须，默认不动新建工程菜单）、`Workspace.tsx`（只加切页后刷新，不要拆掉 SpatialLocationWorkspace / FlowWorkspace）、`globals.css`。优先不改 `RightSidebar.tsx`。

**测试（最多两个，建议复用 lane 文件而不是新写大套）：**

```
npx vitest run tests/unit/courseLocationCommands.test.ts tests/unit/courseTreeView.test.ts
```

若必须证明 UI 接线，用 `tests/unit/courseAddContentMenu.test.tsx` **替换**其中一个，不要变成三个文件。

**`git diff --check` 只列实际改过的壳层文件**，不要 `-- src/renderer/ui`。

**一次冒烟（同一课程）：** 纯 Slide 主按钮加两 scene（旧的仍在）→ 下拉加 Flow 与 Spatial → 在 Flow/Spatial 用主按钮再加本态一页 → 三类各点一下并改一个字/元素 → 三类都进一次全局层 → 保存重开。试运行上一/下一若已接 Mixed 就点一下；没接就记给 R7-B，**不要**因此改 PlayerApp。

证据：`output/r6-z-smoke/`。不要跑七组合窗口。

关闭 R6-A/B/C 的 INTEGRATION_REQUEST 后即可 Gate。然后 R7 并行 READY。

---

## 3. R7 — 只补交付缺口

R7 不是「把生命周期和导出再做一遍」。CUT/R4/R5 已经覆盖大半。下表是唯一工作集。

| 缺口 | 账本 | Owner | 不要做什么 |
|---|---|---|---|
| recovery / recent / 损坏与未来版本拒绝，若 CUT 后仍缺 | `R1B-R7A-01` 已 implemented，只补洞 | R7-A | 不要重写 `openCourseProjectArchive` / 默认保存 |
| 整课预览 + Slide 试运行改吃 Published V2；组装三类 host | `R3CUT-R7B-01` | R7-B、R7-Z | 不要改 `FlowSurfaceHost` / `SpatialSurfaceHost` 内部；不要再用 `buildStandaloneHtml` 冒充 Spatial/Flow |
| HTML / 网页包走同一 V2，离线资源 | V8-EXPORT | R7-C | 不要第二套 producer；不要恢复 `.course-nav` |
| PPTX / 打印/PDF 接 V2；DOCX 调 R4-D helper | `R4D-R7-01` | R7-D | 不要重写 `flowDocx.ts` |
| Runtime DOM 桥；发布包 sidecar | `R1D-R7E-01` | R7-E | 不要第二套组件库/开发面板；不要用 Runtime 代替 Native 文字 |
| 导出菜单真实写到用户选的路径 | V8-EXPORT 写文件曾受阻 | R7-Z | 不要为每种格式各做一次冒烟 |

### 3.1 R7-A

**先 `rg` 现有** `courseProjectArchive.ts`、`courseProjectIo.ts`、`courseProjectLifecycle.ts`、`recoveryWriteCoordinator.ts`、`projectPersistence.ts`。只改缺口文件。

测试沿用（不要新发明文件名除非不存在）：

```
npx vitest run tests/unit/projectPersistence.test.ts tests/unit/projectFormatIsolation.test.ts
```

`git diff --check` 只列你改过的 persistence/IPC 文件。

### 3.2 R7-B

产品 **没有** `PublishedCourseApp.ts`。不要为了供体文件名新建一套 Player App。

**只写新组装文件**（名称可微调，HANDOFF 写实名）：

- `src/player/surfaces/CoursePlayer.ts`（或 `publishedCourseSession.ts`）
- `src/player/surfaces/mixed/MixedCourseNavigator.ts`（供体可摘）
- 如需：`src/player/surfaces/publishedDynamicHosts.ts`（**薄工厂**：`slide | flow | spatial` → 已有 host）。禁止整文件搬供体 899 行版本（依赖产品没有的 `SlideSurfaceHost` / `SurfaceRuntimeAuthoring`）。不要 import 正在由 R7-E 新建的 `SurfaceRuntimeAuthoring.ts`。

Slide 宿主：复用现有 Player 场景路径或最小 V2 adapter；**禁止**把三类都投影成 `buildStandaloneHtml`。禁止整文件覆盖 `PlayerApp.ts`，禁止把供体 `PublishedCourseApp.ts` 当第二播放器搬进来。

测试：

```
npx vitest run tests/unit/publishedCourseNavigation.test.ts tests/unit/playerHostActions.test.ts
```

证明：location 顺序上一/下一；切 surface 调用旧 host destroy；global 显隐按 location；运行会话不回写工程。不证明顶栏按钮（R7-Z）。

### 3.3 R7-C

与 R6-Z 重叠时 **只新建** `export/course/buildCoursePackages.ts`：吃 `buildPublishedCourseV2Payload`，产出 HTML/网页包文件清单。不要改 `buildStandaloneHtml.ts` / `buildWebPackage.ts` / `index.ts`，不要 import `CoursePlayer`。

测试最多两个：`coursePackageExport.test.ts`、`exportPreflight.test.ts`（后者若已存在就补 V2 用例，不要复制文件）。

### 3.4 R7-D

- PPTX：**新建** `buildCoursePptx.ts`，按 V2 页列表（Slide 页 + Spatial **每个 camera frame 一页** + Flow 按 print plan 分页）。可 import 现有 `buildPptx` 辅助，**不要改** `buildPptx.ts`。禁止把无限 world 裁成一张 1280×720。
- 打印/PDF：新建 `buildCoursePrintArtifacts.ts`。
- DOCX：`import { buildFlowDocx, buildFlowPrintPlan }`（产品实名）。不要改 `flowDocx.ts` / `index.ts`。

**不要改** `flowDocx.ts` 除非发现 bug；发现则写 INTEGRATION_REQUEST 而不是顺手大改。

global/controller **默认不进** PPTX/PDF/DOCX（与「视口 HUD」一致）。HANDOFF 写死这条，避免 R7-Z 再争论。

### 3.5 R7-E

**只补** `src/player/SurfaceRuntimeAuthoring.ts`（或现有 Player Runtime 窄文件）以关闭 `R1D-R7E-01`。测试：`runtimeHostV2.test.ts`、`componentProtocolV4.test.ts` 若已存在就跑它们，不要新建第三套协议测试。

`git diff --check` 只列那 1–2 个新/改文件。禁止 `-- src/shared src/player`。

### 3.6 R7-Z

接线：顶栏整课预览与（若仍缺的）Slide 试运行改走 R7-B 组装；导出菜单「继续导出」走真实 `showSaveDialog` 写文件。

**一次冒烟：** 打开已有三类 surface 的 V9 工程（R6-Z 留下的 zip 或当场下拉加两类）→ 另存副本 → 当前位置试运行切一页 → 导出 **一个** HTML 到 `output/r7-z-smoke/` → 确认文件非空。不要 HTML+包+PPTX+PDF+DOCX 全跑。

测试最多两个：可复用 `exportMenuUi.test.tsx`（若无则新建）+ `projectPersistence.test.ts`。

---

## 4. R8 — 拆成可并行子任务（11.4）

范围仍是 `10_R8` 全文。**不要**一个 AI 从头跑 `npm run verify`。

Wave 8a 现在就开：R8-A（Electron 冒烟）、R8-B（课树拖排）、R8-C（typecheck）、R8-D（`npm test`）。

Wave 8b 以后：R8-E build → R8-F E2E → R8-G 三视口 → R8-H 17 项 → R8-Z 报告。

Electron 窗口任务互斥。C/D 不写源码，可与 A/B 并行。B 不得改 Workspace。A 不得改产品源码。

---

## 5. 给协调者的领取顺序（R4-Z HANDOFF 后）

并行（文件不重叠）：**R6-A、R6-B、R6-C**。  
然后 **R6-Z**（热点锁）。  
**R6-Z 持壳层锁时即可并行** **R7-A、R7-B、R7-C、R7-D、R7-E**（纯模块 / 新文件）。  
然后 **R7-Z**（等 R6-Z 释锁）。  
**Wave 8a（教师 2026-08-17）**：并行 **R8-A、R8-B、R8-C、R8-D**。  
然后 **R8-E → R8-F → R8-G → R8-H → R8-Z**。F/G/H 互斥 Electron。

R6-Z 与 **R7-Z** 不得并行占壳层。R7-A–E **禁止**改 App / store / Workspace / ScenePanel / TopToolbar / `globals.css` / `PlayerApp.ts` / `FlowSurfaceHost.ts` / `SpatialSurfaceHost.ts`。重叠期也禁止改 `buildStandaloneHtml.ts` / `buildWebPackage.ts` / `buildPptx.ts` / `export/course/index.ts`（R6-Z 冒烟与 App 导出仍引用它们）。R7-A 可碰 `ipc.ts`，R7-Z 也可；**不要**让 R7-A 与 R7-Z 同时改 `ipc.ts`——R7-A 先做完再 Z。

---

## 6. 预期 INTEGRATION_REQUEST（预先编号，避免现场发明）

| ID | 从 | 到 | 行为 |
|---|---|---|---|
| R6A-R6Z-01 | R6-A | R6-Z | 左栏主按钮/下拉调用 `deriveCourseEditorLayout` + 四条 add 命令 |
| R6B-R6Z-01 | R6-B | R6-Z | ScenePanel 改用 `buildCourseTreeView`；三套纯态树合成一棵，Spatial 镜头分组保留 |
| R6C-R6Z-01 | R6-C | R6-Z | App Delete/复制/快捷键走 `routeEditorAction`；切页换 session token |
| R6Z-R7B-01 | R6-Z | R7-B | Mixed 上一/下一若试运行未接好，记给 CoursePlayer，不在 R6 改 PlayerApp |
| R7A-R7Z-01 | R7-A | R7-Z | App recovery 调用 `shouldOfferCourseProjectRecovery`；非 offer 静默清除 |
| R7C-R7Z-01 | R7-C | R7-Z | V9 导出 HTML/网页包改调 `buildCoursePackages` |
| R7D-R7Z-01 | R7-D | R7-Z | PPTX/PDF/DOCX 调 V2 页列表；HUD 默认不进文件 |
| R7E-R7Z-01 | R7-E | R7-Z | host 挂 `SurfaceRuntimeAuthoringBridge`（不要塞进进行中的 R7-B） |
| R7B-R7Z-01 | R7-B | R7-Z | 整课预览与 Slide 试运行挂 CoursePlayer |
| PRE-R8-01 | 教师 | R8-A | 编辑态单击/双击不重挂隔离 Player |
| PRE-R8-02 | 教师 | R8-B | 左栏课树恢复拖排 |
| R4D-R7-01 | （已在账本） | R7-D/Z | 导出 DOCX 调 helper |
| R3CUT-R7B-01 | （已在账本） | R7-B/Z | 停止 `buildStandaloneHtml` 冒充 V2 Player |
| R1D-R7E-01 | （已在账本） | R7-E | DOM 命中桥 |

---

## 7. 明确删掉的旧口径

| 旧任务卡容易读成 | 现在 |
|---|---|
| R6-Z「七组合冒烟」 | 七组合 = R6-A 表驱动单测；窗口只有一次 Mixed 纵切 |
| R6-B `git diff -- src/renderer/course` | 只 check `courseTreeView.ts` + 它的测试 |
| R7 再实现新建/打开/保存 | 已是 CUT 事实 |
| R7-D 重写 `flowDocx.ts` | 禁止 |
| R7-B 新建 `PublishedCourseApp` 第二播放器 | 禁止；组装现有 host |
| R7-E `git diff -- src/shared src/player` | 禁止 |
| R6/R7 预跑完整 `npm run verify` | 禁止；R8-C/D/E/F 各跑自己那一条 |
| 并行两个 Electron | 禁止 |
| Spatial 主按钮 = 加镜头 | 禁止；加镜头已有「本页镜头 +」 |
