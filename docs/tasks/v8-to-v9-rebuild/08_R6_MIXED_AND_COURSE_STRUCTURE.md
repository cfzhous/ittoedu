# R6 — 工程内统一新增、课程树、Pure/Mixed 与跨 Surface 状态

> 状态：`engineering candidate for this stage`；壳层热点锁已释放；见 [`handoffs/R6-GATE.md`](handoffs/R6-GATE.md)
> 默认工程真相：V9
> 执行加速手册（文件名、禁止重做、验证预算）：[`artifacts/R6_R8_EXECUTION_PLAYBOOK.md`](artifacts/R6_R8_EXECUTION_PLAYBOOK.md)
> 阶段原则：不保存 `projectMode`；不创建第四种 Mixed 数据类型；**不再等新的 Mixed UI 图**（主按钮+下拉已由根计划 §5.1 + 本文件冻结）

## 1. 阶段可见结果

工程**内**用一个主按钮 + 下拉，在同一课程里新增、复制、重命名、排序、删除和切换 Slide / Flow / Spatial location。纯态、双态、三态从真实 `locations` / `surfaces` 推导。

**不是本阶段的工作：**

- 顶栏三类**空白工程**（R5-Z / R4-Z 已做或正在做：`new-spatial-project` / `new-flow-project` / 主按钮空白演示）。不要再发明一套新建工程菜单。
- 不要回退 Spatial `SpatialLocationWorkspace` / Flow `FlowWorkspace`。
- 不要为七种 surface 组合各开一次 Electron。七组合 = R6-A 表驱动单测；窗口 = R6-Z **一次** Mixed 纵切。完整七组合窗口属 R8 场景 13。

任何新增命令都不得让已有 scene/surface/location 从课程树消失。

## 2. 任务与依赖

| ID | 任务 | 独占写入 | 可并行 | 依赖 |
|---|---|---|---|---|
| R6-A | location/surface/scene 新增命令与 Pure/Mixed 推导 | 下列两个 ts + 两个测试 | R6-B/C | R4-Z、R5-Z |
| R6-B | 课程树投影 | `courseTreeView.ts` + 一个测试 | R6-A/C | R4-Z、R5-Z |
| R6-C | 跨 surface selection / 快捷键路由 | routing + session 文件 + 两个测试 | R6-A/B | R4-Z、R5-Z |
| R6-Z | 中央接线 + **一次** Mixed 冒烟 | 下列壳层热点 | 否 | R6-A/B/C |

领取后先 `rg` 产品 worktree：确认 R4-Z 是否已改 ScenePanel 的 `add-flow-page` / 树结构，再按事实接线。不要按本文件历史想象改已经不存在的按钮。

## 3. R6-A — 新增命令与模式推导

### 3.1 独占路径

- `src/renderer/course/courseLocationCommands.ts`
- `src/renderer/course/courseEditorLayout.ts`
- `tests/unit/courseLocationCommands.test.ts`
- `tests/unit/courseEditorLayout.test.ts`

**不要改** App / store / ScenePanel / R4 Flow 命令 / R5 Spatial 命令。树投影留给 R6-B，不要在 layout 文件里再写一套 `buildCourseTreeView`。

### 3.2 冻结导出

供体：`git show 4755034:src/renderer/course/courseLocationCommands.ts` 与 `courseEditorLayout.ts`。丢掉持久化四模式；丢掉「新增 scene 导致旧内容消失」。内部复用已有 `addSlideScene`、`createBlankFlowSurface`、R5 建 spatial page 的工厂，不要复制文档模型。

```ts
deriveCourseEditorLayout(project, activeLocationId) -> {
  kind: 'slide' | 'flow' | 'spatial' | 'mixed'
  primary: { action: 'scene' | 'slide-page' | 'flow-page' | 'spatial-page'; surfaceId?: string }
  dropdown: Array<'slide-page' | 'flow-page' | 'spatial-page'>  // 不含 primary 已占用的类型
  activeSurfaceId: string | null
}

addCourseScene(project, { surfaceId, expectedRevision })
addCourseSlidePage(project, { title?, expectedRevision })   // 可见新 Slide surface + 首 scene
addCourseFlowPage(project, { title?, expectedRevision })
addCourseSpatialPage(project, { title?, expectedRevision }) // 新 spatial-2d + home camera；不是 add camera
duplicate / rename / reorder / delete location 或 surface
```

一次成功动作一次 `revision` / history。删到只剩最后一个可达 location 必须拒绝并给中文原因。

主按钮语义：

| `kind` | 主按钮 |
|---|---|
| `slide` | 当前 Slide surface 的 `addCourseScene` |
| `flow` | `addCourseFlowPage` |
| `spatial` | `addCourseSpatialPage` |
| `mixed` 且已有 Slide surface | `addCourseScene` |
| `mixed` 且没有 Slide surface | `addCourseSlidePage`（可见新页，禁止隐藏 surface） |

### 3.3 七组合（同一测试文件表驱动）

| # | 被 location 引用的 surface types | `kind` | 主按钮 |
|---|---|---|---|
| 1 | slide | `slide` | scene |
| 2 | flow | `flow` | flow-page |
| 3 | spatial-2d | `spatial` | spatial-page |
| 4 | slide+flow | `mixed` | scene |
| 5 | slide+spatial-2d | `mixed` | scene |
| 6 | flow+spatial-2d | `mixed` | slide-page |
| 7 | 三类 | `mixed` | scene |

**必须另有一条：** 同一 Slide surface 连续 `addCourseScene` 两次，旧 scene location 仍在且可 `activate`。

### 3.4 最轻量验证

```powershell
npx vitest run tests/unit/courseLocationCommands.test.ts tests/unit/courseEditorLayout.test.ts
git diff --check -- src/renderer/course/courseLocationCommands.ts src/renderer/course/courseEditorLayout.ts tests/unit/courseLocationCommands.test.ts tests/unit/courseEditorLayout.test.ts
```

HANDOFF 必须列出 `INTEGRATION_REQUEST R6A-R6Z-01`。

## 4. R6-B — 课程树投影

### 4.1 独占路径

- `src/renderer/course/courseTreeView.ts`
- `tests/unit/courseTreeView.test.ts`

不得修改 ScenePanel。不要为凑数写第二个测试文件。不要把 `git diff` 扫整个 `src/renderer/course`。

### 4.2 冻结

`buildCourseTreeView(project)`：

- 固定入口：共享内容 → 全局层（全课）。不参与页面排序、不参与 `kind` 推导。
- `pages[]`：每个 surface 一个父节点，稳定 id = `surfaceId`
  - slide → children = scene locations
  - flow → children = heading/section；调用已有 `listFlowCourseTreePages` / `view.courseTree`，不要自己扫 paragraph
  - spatial-2d → children =「本页镜头」分组 + camera frames（复用 R5 镜头列表）
- paragraph / 普通 Flow block / Spatial world item **不上树**
- 多套 Slide surface **全部**出现，不能只投影 active surface
- 20+ location：只断言数组长度与 id 稳定，不测像素滚动

### 4.3 最轻量验证

```powershell
npx vitest run tests/unit/courseTreeView.test.ts
git diff --check -- src/renderer/course/courseTreeView.ts tests/unit/courseTreeView.test.ts
```

HANDOFF：`R6B-R6Z-01`。

## 5. R6-C — 跨 Surface 会话与动作

### 5.1 独占路径

- `src/renderer/course/editorActionRouting.ts`
- `src/renderer/course/editorActionTypes.ts`（若产品已有等价表则扩展，禁止第二套 action ID 宇宙）
- `src/renderer/authoring/courseAuthoringSession.ts`
- `tests/unit/editorActionRouting.test.ts`
- `tests/unit/courseAuthoringSession.test.ts`

不得修改 App/store/Workspace/RightSidebar。`git diff` 不要扫整个 `src/renderer/authoring`（Spatial world authoring 在那里）。

### 5.2 必须闭合

```
routeEditorAction(project, selection, action)
  slide   -> 现有 Slide/V9 candidate 命令
  flow    -> executeFlowDelete / executeFlowEditorCommand / executeFlowSharedDelete
  spatial -> 现有 spatial session 命令
  global  -> R3 effective/global 命令
```

- 切 location：清掉上一页 item id；text composing 未提交则先拒绝或先 commit（复用 R4-B `resolveFlowTextHistoryAction` 同类语义，不要新草稿结构）
- Delete / copy / undo / 快捷键 / 右键按 `active surface + focus + scope` 路由
- 三类 surface 都能进 global authoring scope
- 异步回调带 session/location/revision，陈旧 token 拒绝

**不要**在 R6 实现 Player 上一/下一或 `MixedCourseNavigator`。那是 R7-B。本任务最多把「当前编辑会话该听哪个 surface」说清楚，用 `R6Z-R7B-01` 交给 R7。

### 5.3 最轻量验证

```powershell
npx vitest run tests/unit/editorActionRouting.test.ts tests/unit/courseAuthoringSession.test.ts
git diff --check -- src/renderer/course/editorActionRouting.ts src/renderer/course/editorActionTypes.ts src/renderer/authoring/courseAuthoringSession.ts tests/unit/editorActionRouting.test.ts tests/unit/courseAuthoringSession.test.ts
```

HANDOFF：`R6C-R6Z-01`。

## 6. R6-Z — 中央接线与一次 Mixed 冒烟

### 6.1 独占热点（只改实际需要的）

默认要改：

- `src/renderer/ui/ScenePanel.tsx`（统一工程内新增 + 一棵课树）
- `src/renderer/store/editorStore.ts`
- `src/renderer/App.tsx`（Delete / 快捷键改走 `routeEditorAction`）
- `src/renderer/ui/Workspace.tsx`（切页刷新；**保留** SpatialLocationWorkspace / FlowWorkspace 分支）

按需才改：

- `src/renderer/ui/TopToolbar.tsx`（默认**不动**三类新建工程）
- `src/renderer/styles/globals.css`（菜单避让）
- `src/renderer/ui/RightSidebar.tsx`（默认不改）

可新建一个极薄菜单组件（例如 `AddCourseContentMenu.tsx`），不要第二套壳。

### 6.2 工程内新增 UI（coordinator freeze）

位置：左栏课程结构标题旁，合并现在分散的「+ 新建场景 / 新增页面」。Spatial「本页镜头 +」`add-spatial-camera` **保留**，它不是主按钮。

| `kind` | 主按钮文案 | 主按钮 testid | 下拉 testid `add-content-menu` |
|---|---|---|---|
| slide | 新建场景 | `add-content-primary`（可兼留 `add-scene`） | `add-flow-page`、`add-spatial-page` |
| flow | 新增页面 | `add-content-primary`（可兼留 `add-flow-page` 若语义仍是加本态页） | `add-slide-page`、`add-spatial-page` |
| spatial | 新增页面 | `add-content-primary` | `add-slide-page`、`add-flow-page` |
| mixed | 新建场景 | `add-content-primary` | `add-flow-page`、`add-spatial-page` |

主按钮已占用的类型不要在下拉里重复。菜单按视口向上/下避让，键盘可达，不被滚动裁切。不要为避让单独开视觉任务。

### 6.3 接线步骤

1. 关闭 R6-A/B/C blocking 请求（`implemented` → 本任务接到 UI 后 `integrated`）。
2. ScenePanel 用 `buildCourseTreeView` 合成一棵树；不要长期保留三套互不通信的纯态树。
3. 主按钮/下拉调用 `deriveCourseEditorLayout` + 四条 add 命令。
4. 切页时换 `courseAuthoringSession` token；Delete 走 `routeEditorAction`。
5. 不改变 R4 Flow / R5 Spatial 专属语义，不复制壳层，不拆顶栏新建工程。

### 6.4 最轻量验证

```powershell
npx vitest run tests/unit/courseLocationCommands.test.ts tests/unit/courseTreeView.test.ts
git diff --check -- src/renderer/App.tsx src/renderer/store/editorStore.ts src/renderer/ui/ScenePanel.tsx src/renderer/ui/Workspace.tsx
```

若还改了 TopToolbar / globals.css / 新菜单文件，把**实际改过的路径**追加到 `git diff --check`，禁止 `-- src/renderer/ui` 或 `-- src/renderer/course`。

若必须用 UI 测试证明菜单接线，用 `tests/unit/courseAddContentMenu.test.tsx` **替换**上面两个文件之一，不要变成三个 Vitest 文件。

**一次**真实窗口冒烟（同一课程，证据 `output/r6-z-smoke/`）：

1. 纯 Slide 主按钮新增两个 scene，旧 scene 仍可回到；
2. 下拉新增 Flow 和 Spatial；
3. 在 Flow / Spatial 用主按钮再加本态一页；
4. 三类各点一下并各改一次；
5. 三类都进一次全局层；
6. 保存重开。试运行上一/下一若已能切 Mixed 就点一下；不能就记 `R6Z-R7B-01`，**不要**因此改 `PlayerApp`。

不要跑七套 E2E、三视口、导出矩阵。

## 7. R6 Gate

- 三类空白工程入口仍在（不回退 R4-Z/R5-Z）；工程内主按钮+下拉可达；
- 新增 Slide 不会隐藏任何旧 scene/surface；
- 七组合推导单测通过；
- 课树层级、跨页 selection/shortcut/global 不串（单测 + 一次冒烟）；
- 一次 Mixed 保存重开冒烟通过；
- 无 `projectMode`、无第四种 Mixed 数据类型；
- 未运行全量 typecheck/build/E2E/visual。

完成后 R7-A/B/C/D/E 可并行 `READY`。
