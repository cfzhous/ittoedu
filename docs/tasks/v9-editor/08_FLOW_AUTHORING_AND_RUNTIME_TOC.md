# T07 — Flow 作者能力与运行态目录

> Wave：2，可与 T05/T06/T08/T09 并行
> 依赖：T02/T03/T04
> 关键 UI：页面是父节点，标题是子节点；运行态目录用贴边三角按钮

## 1. 可见结果

教师可从空白 Flow 工程或新增流式页面开始，在连续长文中直接编辑标题与正文，完成 block 新增、选择、多选、复制、Delete、排序、层级、媒体、属性、图层和试运行。运行态目录可完全收起，只留下贴视口边缘的三角唤起按钮。

## 2. 独占文件

- `src/renderer/course/flowEditorCommands.ts`
- `src/renderer/course/flowEditorSlice.ts`
- `src/renderer/course/flowEditorView.ts`
- `src/renderer/ui/FlowWorkspace.tsx`
- `src/renderer/ui/FlowOutlinePanel.tsx`
- `src/renderer/ui/FlowElementsTab.tsx`
- `src/renderer/ui/FlowPropertiesTab.tsx`
- `src/player/surfaces/flow/**`
- 对应 `flow*` 单测

不修改 ScenePanel、App/store/Workspace/RightSidebar/global CSS、PublishedCourseApp 或导出模块。

## 3. 作者态合同

### 3.1 页面与目录层级

- Flow surface/page 是左栏强父节点。
- 只有 heading/section anchor 出现在“本页目录”；paragraph、quote、list item、table、formula、media 等普通 block 不成为课程级同层节点。
- block 排序和缩进只改变页面内部结构，不移动整个页面。
- 选择全局层时不改变这棵树；global 只是正交 authoring scope。

### 3.2 就地编辑

- heading、paragraph、quote、list item 支持直接点选/双击编辑。
- composition、草稿、blur/Enter/Ctrl+Enter、Escape 和外部 selection 变化有明确事务。
- 画布与属性栏写同一 V9 字段；一次编辑只产生一个 history step。
- 保存投影重建不能丢弃已提交文本。

### 3.3 结构动作

- 插入标题/段落/列表/表格/公式/代码/提示/媒体。
- copy/duplicate/delete/move up/down/indent/outdent 走 T02 adapter。
- 删除维护父子、顺序、目录锚点和互动引用；多选原子提交。
- 有效图层显示 global/surface/flow block 来源，并支持语义允许的锁定、隐藏和排序。

## 4. 运行态目录

- 展开态：目录抽屉在视口左侧；三角按钮贴抽屉右边缘并指向左。
- 收起态：抽屉完全离场；只保留贴视口最左边的窄三角按钮并指向右。
- 按钮使用 viewport 坐标，不随长文滚动或缩放离场。
- 目录只列可导航标题，点击使用稳定 anchor，支持键盘与 aria-label。
- 目录开合是运行会话状态，不写回工程/history。

## 5. 不做

- 不把 Flow 做成多个 1280×720 Slide。
- 不新增第二套“讲义大纲”或把所有 block 平铺到左栏。
- 不改跨 surface Player 导航/导出；交给 T09。
- 不扩张重型文档编辑器功能。

## 6. 最小验证

```powershell
npx vitest run tests/unit/flowEditorCommands.test.ts tests/unit/flowEditorSlice.test.ts
npx vitest run tests/unit/flowWorkspace.test.tsx tests/unit/flowAuthoringTargets.test.tsx
npx vitest run tests/unit/flowUnifiedLayers.test.tsx tests/unit/flowStructuralEntry.test.tsx
npx vitest run tests/unit/flowSurfaceHost.test.ts tests/unit/flowRuntimeToc.test.ts
git diff --check -- src/renderer/course/flowEditorCommands.ts src/renderer/course/flowEditorSlice.ts src/renderer/course/flowEditorView.ts src/renderer/ui/FlowWorkspace.tsx src/renderer/ui/FlowOutlinePanel.tsx src/renderer/ui/FlowElementsTab.tsx src/renderer/ui/FlowPropertiesTab.tsx src/player/surfaces/flow
```

不存在的 host/TOC 测试应由本任务新增；每次只跑触及组。禁止 typecheck、build、全量 test/E2E/visual。

## 7. 验收

- 页面和标题目录层级无扁平回归。
- 画布就地文字提交后重新渲染仍有效。
- Delete/右键/结构动作有统一 history 和引用维护。
- 运行态展开/收起完全符合参考图，且不写项目。
- ScenePanel、store、PublishedCourseApp 和导出接线以请求交付 T10/T09。

## 8. 交付记录

HANDOFF
- task: T07
- baseline SHA / worktree: `e2e34aa` / `output/worktrees/v9-parity-reconstruction`
- outcome: Flow 作者态就地编辑、T02 `actionId` 结构动作、页面父/标题子目录、运行态贴边三角 TOC、以及命令侧有效图层来源均已在独占文件内闭合。未改 ScenePanel / store / Workspace / RightSidebar / globals.css / PublishedCourseApp / 导出 / T02–T05 / T08。未把普通 block 升级为课程级节点，未做第二套讲义大纲，未把 Flow 做成 1280×720 Slide。
- files changed:
  - `src/renderer/course/flowEditorCommands.ts` — `appendFlowLocations` 只给 heading/section 建锚点；`deleteFlowEditorBlocks` 多选一次 history 并修 locations / startLocationId / navigationGuards / scene.go / node.click / 图层可见性 / 教师控制器；`duplicateFlowEditorBlocks`、`indentFlowEditorBlock`、`outdentFlowEditorBlock`；导出 `executeFlowEditorAction`、`createFlowEditorActionAdapter`、`describeFlowEditorConstraints`
  - `src/renderer/course/flowEditorSlice.ts` — `selectedBlockIds`；`selectFlowEditorBlocks` 允许同 surface 任意 block，不要求 `location.blockId === selectedBlockId`
  - `src/renderer/course/flowEditorView.ts` — `FlowEffectiveLayerView` / `buildFlowEffectiveLayers`；`view.effectiveLayers` 含 flow-block / surface / global
  - `src/renderer/ui/FlowWorkspace.tsx` — heading/paragraph/quote/list 点选双击就地编辑；composition / 草稿 / blur / Enter / Ctrl+Enter / Escape / 外部 selection 事务；画布与属性写同一 `text` / `list.editItem`
  - `src/renderer/ui/FlowOutlinePanel.tsx` — 页面为父（`data-flow-outline-kind="page"`），仅 heading/section 为子；`aria-label="课程结构"`
  - `src/player/surfaces/flow/flowRuntimeToc.ts`（新增）— `buildFlowRuntimeToc`、`flowRuntimeTocAnchorId`、`FlowRuntimeTocChrome`
  - `src/player/surfaces/flow/FlowSurfaceHost.ts` — mount 挂 TOC chrome；heading/section 写稳定 `id=flow-toc-{blockId}`；`tocOpen` / `setTocOpen` 仅会话；capture 走 `buildFlowStandaloneHtml`，不把 TOC 写入导出
  - `src/renderer/ui/FlowElementsTab.tsx`、`src/renderer/ui/FlowPropertiesTab.tsx` — 未改；属性栏本已写同一 V9 `text` / list item 字段
  - 单测：`tests/unit/flowEditorCommands.test.ts`、`flowEditorSlice.test.ts`、`flowEditorView.test.ts`、`flowWorkspace.test.tsx`、`flowAuthoringTargets.test.tsx`、`flowUnifiedLayers.test.tsx`、`flowStructuralEntry.test.tsx`、`flowUnifiedLayerEntry.test.tsx`；新增 `flowRuntimeToc.test.ts`、`flowSurfaceHost.test.ts`
  - 本文件交付记录
- focused validation commands:
  - `npx vitest run tests/unit/flowEditorCommands.test.ts tests/unit/flowEditorSlice.test.ts`
  - `npx vitest run tests/unit/flowWorkspace.test.tsx tests/unit/flowAuthoringTargets.test.tsx`
  - `npx vitest run tests/unit/flowUnifiedLayers.test.tsx tests/unit/flowStructuralEntry.test.tsx`
  - `npx vitest run tests/unit/flowSurfaceHost.test.ts tests/unit/flowRuntimeToc.test.ts`
  - `git diff --check -- src/renderer/course/flowEditorCommands.ts src/renderer/course/flowEditorSlice.ts src/renderer/course/flowEditorView.ts src/renderer/ui/FlowWorkspace.tsx src/renderer/ui/FlowOutlinePanel.tsx src/renderer/ui/FlowElementsTab.tsx src/renderer/ui/FlowPropertiesTab.tsx src/player/surfaces/flow`
- results: 8 files / 48 tests passed（18 + 11 + 15 + 4）；`git diff --check` 无输出。未跑 typecheck / build / 全量 test / E2E。
- INTEGRATION_REQUESTS:

INTEGRATION_REQUEST
- requester: T07
- target owner: T10
- target file: `src/renderer/store/editorStore.ts`
- exported symbol / callback: `executeFlowEditorAction`、`createFlowEditorActionAdapter`、`describeFlowEditorConstraints`、`selectFlowEditorBlocks`、`updateFlowEditorBlock`
- required behavior: Flow surface adapter 转调 `createFlowEditorActionAdapter({ getHistory, setHistory })` 或直接 `executeFlowEditorAction(actionId, snapshot, history)`，返回 `{ ok, reason }`。snapshot.targets 的 `owner` 必须是 `'flow-block'`，`layerItemId` 必须是 blockId；`owner === 'global'` 时结构动作拒绝（「全局层选择不能改动 Flow 页面目录」）。constraints 用 `describeFlowEditorConstraints(project, surfaceId, blockIds)`；`clipboardAvailable` 由 store 在 copy 成功后置位——`describeFlowEditorConstraints` 恒为 false，`createFlowEditorActionAdapter` 会丢掉 `clipboard`，copy 请直接读 `executeFlowEditorAction` 的 `clipboard`。画布/属性提交走 `updateFlowEditorBlock`（heading/paragraph/quote 的 `text`；list 走 `list.editItem`），一次编辑一个 history。选择用 `selectFlowEditorBlocks`，location 保持页面/标题锚点。
- focused test that proves the lane side: `tests/unit/flowEditorCommands.test.ts`（actionId 路由、多选删除修引用、indent/outdent）；`tests/unit/flowEditorSlice.test.ts`（同 surface 可选非锚点 block）
- risk if omitted: 键盘/右键仍到不了 Flow 结构动作；copy 后粘贴会一直「剪贴板为空」；就地编辑与属性栏会写成两套字段或两次 history。

INTEGRATION_REQUEST
- requester: T07
- target owner: T10
- target file: `src/renderer/ui/Workspace.tsx`
- exported symbol / callback: `FlowWorkspace` 的 `onPatchBlock`、`onStructuralCommand`、`onSelectBlock`、`onSelectLayer(layerItemId)`、`onDeleteBlock` / `onDuplicateBlock` / `onMoveBlock`
- required behavior: 把上述回调接到 store 的 `updateFlowEditorBlock` / `executeFlowEditorAction` / `selectFlowEditorBlocks`。就地编辑进行中把 focus 标成 `text-edit-session`，避免 T02 把 Delete/复制当成元素动作。`onSelectLayer` 只改 authoring scope / 图层选择，不得改课程树或 active location。不要把 Flow 画布做成 1280×720 Slide 舞台（现有 overlay mount 仅服务 global/surface 图层投射）。
- focused test that proves the lane side: `tests/unit/flowWorkspace.test.tsx`（双击编辑、blur/Enter/Escape、outline 页面父节点）
- risk if omitted: 画布文字无法提交；试运行/图层选择会打乱页面—标题树。

INTEGRATION_REQUEST
- requester: T07
- target owner: T10
- target file: `src/renderer/ui/ScenePanel.tsx`
- exported symbol / callback: T03 `buildCourseStructureViewModel`（`flow-page` 父，`flow-heading` / `flow-section` 子）。`FlowOutlinePanel` 是同一层级的 Flow 原语，不是第二套大纲。
- required behavior: 左栏只用 T03 课程结构树。不要再挂 `FlowOutlinePanel` 当「讲义大纲」。普通 paragraph/quote/list/table/media 不得进课程级树。选择全局层只切换 authoring scope，不重建、不改这棵树。
- focused test that proves the lane side: `tests/unit/flowWorkspace.test.tsx`（`data-flow-outline-kind="page"` + 仅 heading/section 子节点）；T03 课程结构单测
- risk if omitted: 左栏出现两套大纲，或把所有 block 平铺成课程节点。

INTEGRATION_REQUEST
- requester: T07
- target owner: T10
- target file: `src/renderer/ui/RightSidebar.tsx`
- exported symbol / callback: `buildFlowEditorView(...).effectiveLayers` → T04 `EffectiveLayerList`
- required behavior: 映射 `source: 'flow-block' | 'surface' | 'global'` 到 T04 `sourceKind: 'flow' | 'surface' | 'global'`。flow-block 的 `canLock` / `canHide` 为 false，`canReorder` 为 true；锁定/隐藏按钮应对 flow-block 禁用。图层多选/排序走 T02 actionId，不要另写一套 Flow 图层命令。
- focused test that proves the lane side: `tests/unit/flowEditorView.test.ts`（effectiveLayers 来源与权限）
- risk if omitted: 右栏图层无法区分 global / surface / flow block，或错误开放 lock/hide。

INTEGRATION_REQUEST
- requester: T07
- target owner: T10
- target file: `src/renderer/styles/globals.css`
- exported symbol / callback: `.flow-inline-editor`（可选视觉收敛）
- required behavior: 就地编辑 textarea 已能无样式工作。若要对齐阅读栏，只做最小宽度/字体，不要引入 Slide 画板约束。运行态 TOC 使用 inline style + `position: fixed`，不依赖本文件。
- focused test that proves the lane side: `tests/unit/flowWorkspace.test.tsx`
- risk if omitted: 就地编辑功能仍在；仅视觉密度可能偏素。

INTEGRATION_REQUEST
- requester: T07
- target owner: T09
- target file: `src/player/PublishedCourseApp.ts`
- exported symbol / callback: `FlowSurfaceHost.mount` 已内建 `FlowRuntimeTocChrome`；`tocOpen` / `setTocOpen` 为运行会话状态
- required behavior: 不要再包一层运行态目录，不要把 `tocOpen` 写入工程/history/导出。跨 surface 上一/下一与 Mixed 切换仍归 T09。Player 已按 heading/section 过滤可导航 location，保持该过滤。`capture` 走文档 HTML，不含 TOC DOM。
- focused test that proves the lane side: `tests/unit/flowSurfaceHost.test.ts`、`tests/unit/flowRuntimeToc.test.ts`
- risk if omitted: 双 TOC、目录开合污染工程，或长文滚动把三角带离视口。

- visual/manual evidence: 无编辑器/Player 实机截图；三角开合、viewport `position:fixed`、仅标题锚点由 `flowSurfaceHost` / `flowRuntimeToc` 单测覆盖，未对照 `V9_EDITOR_UI_FLOW_REFERENCE.png` 做人工像素验收。
- remaining risks:
  - T03 `courseStudioModel.addFlowBlock`（只读、非本任务）仍可能给普通段落写 location；T07 insert/duplicate 不再这么做。T03 view model 与 Player 可导航过滤会丢掉非锚点；旧工程/导入数据可能仍带段落 location。
  - `executeFlowEditorAction` 未实现 `paste` / `cut`（不在本任务必须列表）；T10 需自持 clipboard。
  - `workspaceFlowSpatialTrial` / `editorShellMultiSurface` 等非本任务 fixture 可能尚未带 `effectiveLayers`，等 T10 接线时补。
  - 未做真实视觉复核，三角与参考图的像素对齐属 T12 / 教师验收。
- status: engineering candidate

### 8.1 T09 回派修补

HANDOFF
- task: T07（T09 回派）
- baseline SHA / worktree: `e2e34aa` / `output/worktrees/v9-parity-reconstruction`
- outcome: `FlowSurfaceHostOptions` / `FlowScopedLayerHostOptions` 增加可选 `courseProgressSource`（`FlowCourseProgressSource` = Slide/Spatial 同形：`getLocations` / `getCurrentLocationId` / `getStateLabel`），并原样透传给 overlay `SlideSurfaceHost`。未改 PublishedCourseApp / App / store。
- files changed:
  - `src/player/surfaces/flow/FlowSurfaceHost.ts`
  - `tests/unit/flowSurfaceHost.test.ts`
  - 本文件交付记录
- focused validation commands:
  - `npx vitest run tests/unit/flowSurfaceHost.test.ts tests/unit/flowRuntimeToc.test.ts`
- results: 2 files / 5 tests passed。未跑 typecheck / build / 全量 test / E2E。未提交。
- INTEGRATION_REQUESTS:

INTEGRATION_REQUEST
- requester: T07
- target owner: T09
- target file: `src/player/PublishedCourseApp.ts`
- exported symbol / callback: `FlowSurfaceHost` 构造选项 `courseProgressSource`
- required behavior: 创建 Flow host 时传入与 Spatial 相同的课程进度源，不要再用 overlay 假 scene `flow-overlay-*` /「语义长文覆盖图层」当教师控制台进度。
- focused test that proves the lane side: `tests/unit/flowSurfaceHost.test.ts`（`forwards courseProgressSource to the overlay Slide host`）
- risk if omitted: Flow 教师控制台进度仍显示 1/1 假 scene。

- visual/manual evidence: 无。
- remaining risks: T09 未接线前产品进度仍走 overlay 回退。
- status: engineering candidate

