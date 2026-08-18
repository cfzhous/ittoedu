HANDOFF
- task: R4-A
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 落地 Flow **文档模型与结构命令**。命令吃 V9 `CourseProjectDocument` + selection/`makeAuthoringAddress` + revision，返回 `{ ok, reason, nextDocument, historyEntry }`。空白页默认 H1「无标题」+ 空段落。heading/section 才写 `flow-block` location；paragraph/quote/list/table/formula/文中 media 等不是课程级 location，也不进通用 z-order 图层。Delete 按文本 / block / overlay 三焦点分流。文字只写 R1-A `text` + 可选 `TextRun[]`。未改 App/store/Workspace/ScenePanel/RightSidebar/TopToolbar，未开始 R4-B/C/D/Z，未 commit。本 lane 为 integration candidate，不是 art/accepted，不宣称 Flow 编辑器可用。
- owned files changed (product worktree, new):
  - `src/renderer/course/flowDocumentModel.ts`（必要纯 helper：空白页、锚点 location 同步、rich-text 切分/合并）
  - `src/renderer/course/flowEditorCommands.ts`
  - `src/renderer/course/flowEditorSlice.ts`
  - `src/renderer/course/flowEditorView.ts`
  - `tests/unit/flowEditorCommands.test.ts`
  - `tests/unit/flowEditorView.test.ts`
  计划侧：本 HANDOFF。未改账本 / `00_INDEX.md` / UI 热点。
- donor files/functions consulted:
  - `git show 4755034:src/renderer/course/flowEditorCommands.ts`（insert/move/delete/indent/outdent/duplicate/paste、heading/section 才 `appendFlowLocations`、全局拒绝文案、一次 history）
  - `git show 4755034:src/renderer/course/flowEditorSlice.ts`（block 多选、location 校验）
  - `git show 4755034:src/renderer/course/flowEditorView.ts`（block 遍历、heading/section outline；**丢掉**把 paragraph 当 `flow-block` 图层行的 `buildFlowEffectiveLayers`）
  - 产品 `courseProjectTypes.ts` Flow `text` + `runs?: TextRun[]`、`makeAuthoringAddress`、`commitSlideProjectMutation`、`getEffectiveCourseLayerOrder`、`deleteEffectiveLayerItem`、`applyTextRunStyle` / `remapTextRuns`
  - R4-DESIGN 合同 C1–C12、§6–§11、§13 空白页 H1+空段落
- donor 舍弃部分:
  - `courseStudioModel` / `commitCourseHistory` / `createCourseProject` / T02 `editorActionTypes` / `createFlowEditorActionAdapter`
  - 把每个 paragraph 写成 `flow-block` location 或 `effectiveLayers` 行
  - `stableAddress: surface:…/block:…`（改为 `makeAuthoringAddress`）
  - `FlowElementsTab` / `FlowPropertiesTab` / CourseStudio 弱编辑器整文件
  - 空白页文案「新讲义」（改合同「无标题」）
- focused validation command:
  ```
  npx vitest run tests/unit/flowEditorCommands.test.ts tests/unit/flowEditorView.test.ts
  git diff --check -- src/renderer/course/flowEditorCommands.ts src/renderer/course/flowEditorSlice.ts src/renderer/course/flowEditorView.ts tests/unit/flowEditorCommands.test.ts tests/unit/flowEditorView.test.ts
  ```
- validation result: Vitest 2 files / 15 tests passed，1.72s。`git diff --check` 无输出、exit 0（含 helper `flowDocumentModel.ts`；对新文件先 `git add -N` 再 check，随后 `git reset`，文件仍为 untracked）。
- validation entry / fixture / backend:
  - entry: `executeFlowEditorCommand`、`executeFlowDelete`、`insert/split/merge/move/delete/indent/outdent/format`、`applyFlowCommittedText`、`selectFlowEditorBlocks` / `enterFlowTextEditing` / `selectFlowOverlay`、`buildFlowEditorView`、`listFlowCourseTreePages`、`createBlankFlowPageBlocks`、`makeAuthoringAddress`、`courseProjectDocumentSchema.parse`
  - fixture: 内存纯 Flow V9（H1 + 带 runs 的段落 + 列表 + 文中 media + section/heading + surface 浮层）；空白页 H1+空段落；JSON round-trip
  - backend: 纯 V9 document 命令；未接 App/Workspace/ScenePanel/NodesTab/Player
- validation proves / does not prove:
  - proves: 冻结 selection/command 形状；heading/section 可导航；paragraph 不上树、不进图层；三焦点 Delete；cut/copy/paste/duplicate 保留结构与 `assetId` 引用并重生 id；一次动作一次 revision/history；保存重开 JSON 稳定；文字为 `text` + 可选 `runs`；空白页 H1+空段落；全局 scope 拒绝改目录；地址无 hitId
  - does not prove: 未接真实稿纸/课程树/图层页/MediaTab/Player；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。未开始 R4-B/C/D/Z。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R4-A
  - target stage integrator: R4-B
  - target hotspot file: src/renderer/ui/FlowWorkspace.tsx（或设计确认的单一稿纸组件）、text bridge
  - exported symbol / callback: executeFlowEditorCommand、applyFlowCommittedText、enterFlowTextEditing、selectFlowEditorBlocks、formatFlowEditorBlock
  - required user-visible behavior: 稿纸单击选 block、双击/已选后 Enter 进入就地编辑；caret/选区粗体斜体颜色与属性栏写同一 `text` + `runs` 事务。禁止第二份不可保存草稿，禁止 FlowElementsTab/FlowPropertiesTab。
  - focused test proving lane side: tests/unit/flowEditorCommands.test.ts（dispatcher 选区 format；committed text+runs）
  - exact wiring requested: R4A-R4B-01。双击与选区工具都调用 executeFlowEditorCommand / applyFlowCommittedText；IME 提交后再 apply，不要另起 block 草稿结构。
  - risk if omitted: 稿纸与命令各写各的文字，保存后 runs 丢失，或退化成整段改正文框
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-A
  - target stage integrator: R4-Z
  - target hotspot file: src/renderer/ui/ScenePanel.tsx、src/renderer/store/editorStore.ts
  - exported symbol / callback: listFlowCourseTreePages、buildFlowEditorView().courseTree / outline
  - required user-visible behavior: 课程树 = Flow 页面（surface.title）+ 本页 heading/section。paragraph/quote/list/table/formula/文中 media 不上树。选树节点只改 selection/active location，不写 history。
  - focused test proving lane side: tests/unit/flowEditorView.test.ts（outline/courseTree 不含 paragraph）
  - exact wiring requested: R4A-R4Z-01。用 listFlowCourseTreePages(project) 或 view.courseTree 渲染；不要遍历全部 blocks 挂树。
  - risk if omitted: 左栏再次列出每个段落，合同 C6/C12 回退
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-A
  - target stage integrator: R4-Z
  - target hotspot file: src/renderer/ui/NodesTab.tsx、src/renderer/store/editorStore.ts、src/renderer/App.tsx
  - exported symbol / callback: buildFlowEditorView().overlayLayers、getEffectiveCourseLayerOrder、executeFlowDelete、classifyFlowDeleteIntent
  - required user-visible behavior: 图层只列本页真实浮层（surface/global）。heading/paragraph/文中 media 不是图层行。Delete：文本焦点只删字符，block 焦点删块，overlay 焦点删浮层；全局 scope 下结构命令拒绝「全局层选择不能改动 Flow 页面目录」。
  - focused test proving lane side: tests/unit/flowEditorView.test.ts（overlay 不含 paragraph）；tests/unit/flowEditorCommands.test.ts（三焦点 Delete）
  - exact wiring requested: R4A-R4Z-02。Flow 页 NodesTab 用 overlayLayers 或既有 getEffectiveCourseLayerOrder，禁止把 view.blocks 画成图层。App Delete 走 executeFlowDelete(document, selection)。
  - risk if omitted: 右栏图层再次出现段落行，或文字编辑时 Delete 误删块/浮层
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 未接真实 FlowWorkspace / ScenePanel / NodesTab
  - 列表项/表格单元格选区 format 已留字段（`FlowTextRange.listItemId` / table ids），本定向测试以 heading/paragraph runs 为主
  - 向默认 Slide 工程新增 Flow 页会触发 mixedPrintPlan，属 R4-Z/R6，本任务只提供 `createBlankFlowSurface`
- rollback point: 删除产品 worktree 上述 6 个未跟踪文件。基线仍为 `f272756`。未改热点。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 冻结的 selection / command 形状

```ts
FlowEditorSelection = {
  locationId, surfaceId,
  authoringScope: 'page' | 'global',
  focus: 'idle' | 'text' | 'block' | 'overlay',
  selectedBlockId, selectedBlockIds,
  selectedOverlayIds,
  textRange: { blockId, start, end, listItemId?, tableRowId?, tableColumnId? } | null,
  authoringAddress, // 始终 makeAuthoringAddress，无 hitId
}

FlowEditorCommandName =
  insert | split | merge | move | delete | indent | outdent |
  format | cut | copy | paste | duplicate | apply-text

executeFlowEditorCommand(document, selection, request, { now, expectedRevision })
  -> { ok, reason, nextDocument, historyEntry, clipboard?, createdBlockIds? }
```

- 文档块地址：`scope:'surface'`, `layerItemId: blockId`, `field: 'block' | 'text'`
- 浮层地址：global/surface `field:'item'`
- 空白页：`createBlankFlowPageBlocks()` → H1「无标题」+ 空 paragraph
- **paragraph 不进图层**：`buildFlowEditorView().overlayLayers` 与 `getEffectiveCourseLayerOrder` 只有 overlay；`isFlowZOrderLayerBlock` 恒为 false

## 未做

- 未改 App/store/Workspace/ScenePanel/RightSidebar，未 commit，未开始 R4-B/C/D/Z
- 未宣称 Flow 作者界面可用
