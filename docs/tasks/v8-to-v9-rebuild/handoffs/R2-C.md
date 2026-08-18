HANDOFF
- task: R2-C
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 新建 V9 Slide 文字/公式内容事务纯模块。双击以 `authoringAddress + revision + generation` 开会话；IME composing 时 Enter/blur 不提交；Enter/Ctrl+Enter/blur/Escape 与外部 selection 切换有明确 commit/cancel/defer；最终写入 V9 `text`/`runs` 或公式 `ast`/`accessibleText`；选区级粗体/斜体/颜色只改对应 Unicode 区间；scene/state/scope 切换后陈旧回调按 generation 拒绝；竖排 `writingMode` 与自适应 `overflow: 'auto-height'` 以及宽度作为数据字段保留。默认 V8（`selectSlideCandidateBackend` 为 null）不劫持现有文字路径。未改 Workspace / PropertiesTab / editorStore / App / Phaser / `stageViewportTransform.ts` / R2-A 三文件 / `v9SlideContentCommands.ts`。未 commit。本 lane 为 integration candidate。
- owned files changed (product worktree):
  - `src/renderer/authoring/v9SlideContentEdit.ts`（新建）
  - `src/shared/textRuns.ts`（新增 `applyTextRunStyle`：选区级 runs，空选区不整段套格式）
  - `tests/unit/v9SlideTextTransaction.test.ts`（新建）
  - `tests/unit/textRuns.test.ts`（补选区级粗体/斜体/颜色断言）
  计划侧：本 HANDOFF。未改 UI 组件。
- donor files/functions consulted:
  - `handoffs/R2-A.md`：`SlideAuthoringTarget` / `slideAuthoringGeneration` / `makeSlideAuthoringTarget` / `SlideCommandResult` / 拒绝语义
  - `handoffs/R2-SEAM.md`：`selectSlideCandidateBackend` 默认 null 走 V8；candidate 命令只写 V9 session
  - 产品 worktree：`commitSlideProjectMutation` / `commitSlideAuthoringHistory`、`toggleTextRunEmphasis` / `remapTextRuns`、`TextEditOverlay` IME（`composingRef` + blur defer）、`FormulaAuthoringEditor` Enter/IME、`editorStore` 文字事务（竖排 auto-width 同一次提交）
  - 断言意图：`tests/unit/editorFormattingUi.test.tsx` IME blur；`tests/unit/editorStore.test.ts` 竖排自适应宽度；`tests/unit/textRuns.test.ts` 既有 runs
- donor 舍弃部分:
  - 未改 `TextEditOverlay.tsx` / `CanvasPlainTextEditor.tsx` / `FormulaAuthoringEditor.tsx` / `FormulaEditDialog.tsx`（R2-Z 接线时调用本模块 resolvers + commit）
  - 未改 `v9SlideVerticalSlice.ts`（缺写 text/runs 命令，本任务对 `history.present` 做纯函数 patch）
  - 未把 V8 `textEditSession` 预写入 project；V9 草稿只活在 edit token，commit 一次 revision
- focused validation command:
  ```
  npx vitest run tests/unit/v9SlideTextTransaction.test.ts tests/unit/textRuns.test.ts
  git diff --check -- src/renderer/authoring/v9SlideContentEdit.ts src/shared/textRuns.ts tests/unit/v9SlideTextTransaction.test.ts tests/unit/textRuns.test.ts
  ```
- validation result: Vitest 2 files / 12 tests passed，1.48s。`git diff --check` 无输出、exit 0（对新文件先 `git add -N` 再 check，随后 `git reset`，新文件仍为 untracked）。
- validation entry / fixture / backend:
  - entry: `beginV9SlideContentEdit`、`commitV9SlideContentEdit`、`commitV9SlideTextRunStyle`、`applyV9SlideTextRunStyle` / `applyTextRunStyle`、`resolveV9SlideContentKeyDown` / `Blur` / `SelectionChange`、`markV9SlideContentComposing`、`selectSlideCandidateBackend`、`slideAuthoringGeneration`
  - fixture: 内存 V9 Slide（可写文字「春⭐风」、锁定文字、竖排 `vertical-lr` + `overflow: 'auto-height'`、公式 token `x`）
  - backend: 纯函数操作 `SlideAuthoringSession`；V8 守卫用 store 默认 `kind: 'v8'`（getter null）；candidate 仅测试注入
- validation proves / does not prove:
  - proves: 默认 V8 不劫持；双击开会话带稳定 address/revision/generation；IME composing 挡 Enter/blur/commit；commit/cancel/defer 语义；文字写入 `text`/`runs`、公式写入 `ast`；选区级格式不整段；属性与画布共用 `commitV9SlideTextRunStyle` → 同一 commit；generation/revision 陈旧拒绝；竖排与自适应宽度字段及本次宽度提交保留
  - does not prove: 未接真实 Workspace 双击、PropertiesTab、Player；`SlideCandidateBackend` 无通用 setter，成功 `nextSession` 尚未写回 candidate 闭包；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R2-SEAM
  - target stage integrator: R2-C
  - target hotspot file: 禁止改 editorStore.ts / App.tsx / Workspace.tsx / PropertiesTab.tsx
  - exported symbol / callback: selectSlideAuthoringSnapshot、selectSlideCandidateBackend、SlideAuthoringTarget
  - required user-visible behavior: 无
  - focused test proving lane side: tests/unit/v9SlideTextTransaction.test.ts（默认 getter null 走 not-v9-slide-candidate）
  - exact wiring requested: R2SEAM-R2C-01 已由本任务消费：文字/公式事务从 candidate snapshot/target 读取；执行走本模块纯函数 + 可替换 commit 回调。默认 V8 时 getter 为 null，begin 拒绝且不写 V9。
  - risk if omitted: （已消费）
  - status: implemented（lane 侧已满足）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R2-C
  - target stage integrator: R2-Z
  - target hotspot file: src/renderer/ui/Workspace.tsx、src/renderer/ui/PropertiesTab.tsx、src/renderer/store/editorStore.ts
  - exported symbol / callback: beginV9SlideContentEdit、commitV9SlideContentEdit、commitV9SlideTextRunStyle、resolveV9SlideContentKeyDown、resolveV9SlideContentBlur、resolveV9SlideContentSelectionChange、runV9SlideContentCommand、defaultCommitV9SlideContentDocument
  - required user-visible behavior: 教师仍只看到成熟 V8 App。V9 candidate 注入时，画布双击文字/公式与属性面板局部格式写入同一 V9 text/runs 或 ast 事务。默认 V8 继续现有 beginTextEdit / FormulaEditDialog，禁止 no-op。
  - focused test proving lane side: tests/unit/v9SlideTextTransaction.test.ts
  - exact wiring requested: 见下方「R2-Z 接线」。candidate 时双击调用 beginV9SlideContentEdit({ backend })；IME 把 composing / isComposing 交给 resolvers，composing 中不得 commit；blur/Ctrl+Enter/Escape/换选与本模块 action 对齐；属性选区粗体/斜体/颜色走 commitV9SlideTextRunStyle（与画布同一 commitV9SlideContentEdit）。成功结果的 nextSession 必须写回 candidate session（backend 无 setter，用 runV9SlideContentCommand 的 writeSession 或 seam 一次 apply）。
  - risk if omitted: 画布与属性各写一套；或 V9 文字提交停留在纯函数结果、candidate 闭包仍是旧 revision
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 未接真实 contentEditable / IME 浏览器事件，只证明纯函数门闩
  - 命名状态 sparse `nativeData` 写入路径已实现，本定向测试未覆盖 named-state override
  - `SlideCandidateBackend` 仍无 content 方法；R2-Z 必须自己持久化 nextSession
- rollback point: 删除产品 worktree 中 `src/renderer/authoring/v9SlideContentEdit.ts` 与 `tests/unit/v9SlideTextTransaction.test.ts`；还原 `src/shared/textRuns.ts` 与 `tests/unit/textRuns.test.ts` 的本任务 diff。其他 lane 文件保持不动。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 冻结接口（实际导出名）

### `src/renderer/authoring/v9SlideContentEdit.ts`

| 符号 | 角色 |
|---|---|
| `beginV9SlideContentEdit` | `backend: null` → `not-v9-slide-candidate`（默认 V8）。candidate / 测试 session 以 target 开会话 |
| `commitV9SlideContentEdit` | 一次写入 V9 text/runs 或 formula ast；identity no-op 不写 history |
| `commitV9SlideTextRunStyle` | 属性面板与画布共用：选区 apply runs 后走同一 commit |
| `applyV9SlideTextRunStyle` / `applyV9SlideContentEditRunStyle` | 选区级格式；空选区不整段 |
| `updateV9SlideContentTextDraft` / `updateV9SlideContentFormulaDraft` | 会话内草稿，不写 document |
| `cancelV9SlideContentEdit` | 丢草稿，不写 history |
| `resolveV9SlideContentKeyDown` | composing → `ignore`；Esc → `cancel`；文字 Ctrl/Cmd+Enter → `commit`；公式 Enter → `commit` |
| `resolveV9SlideContentBlur` | composing → `defer`，否则 `commit` |
| `resolveV9SlideContentSelectionChange` | 换选 → `commit`；仍选中自己 → `ignore`；composing → `defer` |
| `markV9SlideContentComposing` / `deferV9SlideContentAction` / `finishV9SlideContentComposition` | IME 门闩；结束 composing 后放出 pending commit/cancel |
| `runV9SlideContentCommand` / `defaultCommitV9SlideContentDocument` | 可替换 commit；测试直接用 `nextSession` |
| `readV9SlideNativeContent` | 只读 materialized native item |

拒绝：`not-v9-slide-candidate` / `composing` / `stale-generation` / `stale-revision` / `locked` / `wrong-owner` / `invalid-target`。

### `src/shared/textRuns.ts`

`applyTextRunStyle(text, runs, start, end, patch)`：只改 `[start, end)` Unicode 码点；`end <= start` 原样返回。

## R2-Z 接线

```ts
const backend = selectSlideCandidateBackend(useEditorStore.getState())
if (!backend) {
  // 默认 V8：现有 beginTextEdit / FormulaEditDialog。不要放 no-op。
  return
}
const begun = beginV9SlideContentEdit({ backend, layerItemId, source: 'canvas' })
// 键盘/blur：resolveV9SlideContentKeyDown / Blur / SelectionChange
// 提交：commitV9SlideContentEdit(session, edit)
// 属性局部格式：commitV9SlideTextRunStyle(session, { layerItemId, selectionStart, selectionEnd, patch })
// 持久化：
runV9SlideContentCommand(
  () => backend.getSession(),
  (next) => { /* 必须写入 candidate 持有的 session；backend 现无 setter */ },
  (session) => commitV9SlideContentEdit(session, edit),
)
```

`createSlideCandidateBackend` 闭包 session 不会因为返回 `nextSession` 而更新。R2-Z 接线 UI 时需在成功 command 后把 `nextSession` 写回（扩展 seam 或包装 backend）。不要双写 V8 `project`。
