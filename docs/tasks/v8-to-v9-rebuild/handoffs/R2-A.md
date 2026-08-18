HANDOFF
- task: R2-A
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 新建 Slide domain：session / scene / state / selection / history / 只读 snapshot。唯一工程真相是 R1 已证明的 `CourseProjectDocument` + `courseProjectDocumentSchema` + `makeAuthoringAddress`，未另起并行 schema。当前 Slide surface 新增 scene 只在同一 surface 追加，不创建隐藏 surface，不影响其他 location，旧 scene 仍在。未改 App/store/Workspace/sidebars，未把 V9 接到默认打开/保存，未 commit，未宣称 V9 编辑器可用。本 lane 为 integration candidate。
- owned files changed (product worktree, new):
  - `src/renderer/course/v9SlideVerticalSlice.ts`
  - `src/renderer/course/slideEditorCommands.ts`
  - `src/renderer/course/slideEditorView.ts`
  - `tests/unit/v9SlideDomain.test.ts`
  计划侧：本 HANDOFF。未改 R0-D / R1 协议、archive、export 文件。
- donor files/functions consulted:
  - `git show 4755034:src/renderer/course/slideEditorView.ts`（`buildSlideEditorView`、base vs named-state materialize）
  - `git show 4755034:src/renderer/course/slideEditorCommands.ts`（`selectSlideEditorLayers`、scene Native transform / sparse override）
  - `git show 4755034:src/renderer/course/v9SlideVerticalSlice.ts` 中 session、scene/state、selection、history、generation 片段
  - `git show 4755034:src/renderer/course/courseStudioModel.ts` 中 `addSlideScene` / duplicate / delete / presentation-state / history 纯函数（产品 worktree 无此文件，内联进 slice，未新建 `courseStudioModel`）
  - 断言意图：`v9SlideSceneSession.test.ts`、`v9SlidePresentationStateSession.test.ts`、`slideEditorCommands.test.ts`、`slideEditorView.test.ts`（未整文件迁入）
  - R1-A/Z：`courseProjectDocumentSchema`、`makeAuthoringAddress`、round-trip 夹具形状
- donor 舍弃部分:
  - `V9_SLIDE_TEST_QUERY` / `resolveEditorStartupBackend` / 用户可见 backend 切换（R2-SEAM）
  - Flow/Spatial 选择与 workspace（`selectV9CourseFlow*` / `selectV9CourseSpatialLayers`）
  - Media batch insert、Player runtime 转换（`buildV9SlideWorkspaceSnapshot`）
  - App/store 接线、`useEditorStore` 测试、`courseStudioModel.ts` 整文件
  - 图层增删改、互动命令、剪贴板、文字会话（R2-B/C/D/E）
- focused validation command:
  ```
  npx vitest run tests/unit/v9SlideDomain.test.ts
  git diff --check -- src/renderer/course/v9SlideVerticalSlice.ts src/renderer/course/slideEditorCommands.ts src/renderer/course/slideEditorView.ts tests/unit/v9SlideDomain.test.ts
  ```
- validation result: Vitest 1 file / 6 tests passed，1.67s。`git diff --check` 无输出、exit 0（对新文件先 `git add -N` 再 check，随后 `git reset`，文件仍为 untracked）。
- validation entry / fixture / backend:
  - entry: `openSlideAuthoringSession`、`buildSlideAuthoringSnapshot`、`makeSlideAuthoringTarget`、`addSlideScene` / scene·state 命令、`transformSlideNativeLayers`、`createSlideCandidateBackend`、`courseProjectDocumentSchema`、`makeAuthoringAddress`
  - fixture: 内存 V9 Mixed（1 Slide surface + 1 Flow surface + mixedPrintPlan；scene native 含可写/锁定文字；surface 共享层；global 层）。`openSlideAuthoringSession` 经 `courseProjectDocumentSchema.parse`
  - backend: 纯 Slide domain / in-memory candidate；默认产品仍为 V8 `App` / `openProjectArchive` / `saveProject`
- validation proves / does not prove:
  - proves: V9 document 是唯一工程真相；snapshot/target 不含 hitId；当前 Slide surface 新增 scene 保旧、不新建 surface、不影响 Flow location；base vs named-state override；scene/state/scope 切换清空 selection 并 bump generation；一次成功 mutation 一次 revision/history；locked / stale-revision / wrong-owner 统一拒绝；candidate backend 可在测试中注入且不改源 fixture
  - does not prove: 未接真实 Workspace / ScenePanel / MediaTab / Player；未接默认打开/保存；未证明 global/surface 写命令；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R1-Z
  - target stage integrator: R2-A
  - target hotspot file: src/renderer/course/v9SlideVerticalSlice.ts
  - exported symbol / callback: CourseProjectDocument、courseProjectDocumentSchema、makeAuthoringAddress
  - required user-visible behavior: 无
  - focused test proving lane side: tests/unit/v9SlideDomain.test.ts
  - exact wiring requested: R1Z-R2A-01 已由本任务消费：open/mutate 都 parse 既有 V9 schema；target 只用 makeAuthoringAddress；未另起 schema；未接默认打开/保存。账本 status 请协调者改为 implemented（本任务不改 INTEGRATION_LEDGER）。
  - risk if omitted: （已消费）
  - status: implemented（lane 侧已满足；待协调者改账本）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R2-A
  - target stage integrator: R2-SEAM
  - target hotspot file: src/renderer/store/slideBackendPort.ts（SEAM 可新建）、editorStore.ts、App.tsx
  - exported symbol / callback: createSlideCandidateBackend、SlideCandidateBackend、openSlideAuthoringSession、buildSlideAuthoringSnapshot、makeSlideAuthoringTarget、SlideCommandResult
  - required user-visible behavior: 无。不得出现用户可见 backend 切换。默认仍走 V8。V9 candidate 仅测试/开发注入。
  - focused test proving lane side: tests/unit/v9SlideDomain.test.ts（createSlideCandidateBackend）
  - exact wiring requested: 见下方「R2-SEAM port 形状」。一次会话只持有一个 backend，不双写。本任务不改 store。
  - risk if omitted: R2-B/C/D/E 没有注入点，只能改热点或另起第二 App
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - global/surface owner 仅只读投影与拒绝写；编辑命令属 R3
  - 互动图在 duplicate/delete 时做了引用清理，但本定向测试未覆盖复杂 interaction 图
  - `setInitial` / `setThumbnail` / 背景 / 图层增删未做（R2-D/E）
- rollback point: 删除产品 worktree 中上述 4 个未跟踪文件（`src/renderer/course/` 目录与 `tests/unit/v9SlideDomain.test.ts`）；其他 lane 文件保持不动；基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 冻结接口（实际导出名）

### `src/renderer/course/v9SlideVerticalSlice.ts`

| 符号 | 角色 |
|---|---|
| `SlideAuthoringSession` | in-memory session：`sessionId` / `history` / `selection` / `scope` / `generation` |
| `SlideAuthoringSnapshot` | `sessionId` / `locationId` / `surfaceId` / `sceneId` / `stateId` / `scope` / `selection` / `revision` |
| `SlideAuthoringTarget` | `sessionId` / `revision` / `generation` / `authoringAddress` / `scope` / `layerItemId`。`authoringAddress` 来自 `makeAuthoringAddress`；禁止 persist `hitId` |
| `SlideCommandResult` | `ok` / `reason?` / `nextSession?` / `historyEntry?` / `selection?` |
| `SlideCommandOptions` | `now?` / `expectedRevision?` |
| `openSlideAuthoringSession` | 从已证明 V9 document 开会话（内部 `courseProjectDocumentSchema.parse`） |
| `buildSlideAuthoringSnapshot` | 只读 snapshot |
| `makeSlideAuthoringTarget` | 稳定 target token |
| `selectSlideLayers` | 当前 scope 内选择；可含 locked（只读） |
| `setSlideEditingScope` | `scene` / `surface` / `global`；切换清空 selection、bump generation、无 history |
| `activateSlideScene` / `addSlideScene` / `renameSlideScene` / `reorderSlideScenes` / `duplicateSlideScene` / `deleteSlideScene` | scene 激活/增/改名/排序/复制/删 |
| `activateSlidePresentationState` / `addSlidePresentationState` / `renameSlidePresentationState` / `reorderSlidePresentationStates` / `duplicateSlidePresentationState` / `deleteSlidePresentationState` | state 同上 |
| `transformSlideNativeLayers` | 仅 scene Native；一次调用最多一次 revision |
| `undoSlideAuthoring` / `redoSlideAuthoring` | 只动 V9 history |
| `slideAuthoringGeneration` | 按 `sessionId` 查询 generation（给 R2-C 拒绝陈旧回调） |
| `createSlideCandidateBackend` / `SlideCandidateBackend` | 注入用 port；`kind: 'v9-slide-candidate'` |
| `buildSlideEditorView` | 只读投影（re-export） |

### `src/renderer/course/slideEditorCommands.ts`

| 符号 | 角色 |
|---|---|
| `SlideAuthoringSelection` | `locationId` / `stateId` / `selectionIds` |
| `SlideAuthoringHistory` | `present` / `past` / `future`（均为 `CourseProjectDocument`） |
| `selectSlideEditorLayers` | document 级选择（含 global/surface 层，供 view 对齐） |
| `transformSelectedSlideNativeLayers` | history 级 scene Native 变换 |
| `SLIDE_REJECT_LOCKED` | `'locked'` |
| `SLIDE_REJECT_STALE_REVISION` | `'stale-revision'` |
| `SLIDE_REJECT_WRONG_OWNER` | `'wrong-owner'` |
| `commitSlideProjectMutation` / `createSlideAuthoringHistory` / `commitSlideAuthoringHistory` / `undoSlideAuthoringHistory` / `redoSlideAuthoringHistory` | 给 slice 使用；R2-B 可用 history 级 transform |

### `src/renderer/course/slideEditorView.ts`

`buildSlideEditorView`、`SlideEditorView`、`SlideEditorLayerView`、`SlideEditorLayerScope`、`BuildSlideEditorViewInput`。

## 拒绝语义

所有写命令走 `SlideCommandResult`，失败时 `ok: false`、`historyEntry: false`、`nextSession` 为当前会话（不丢会话）。

| `reason` | 何时 |
|---|---|
| `locked` | 对 `item.locked === true` 的 scene Native 做 transform |
| `stale-revision` | `options.expectedRevision` 与 `history.present.revision` 不一致 |
| `wrong-owner` | 当前 `scope` 不是 `scene` 却调用 scene 写命令（含 transform）；或 transform 目标层 source 不是 scene |
| `invalid-selection` | 重复 id、不在当前 scope 可选集、失效层 |
| 其他中文 `Error.message` | 例如至少一张幻灯片 / 至少一个命名状态 / 找不到状态 |

locked 项可选中查看，不可写。global/surface 本任务只经 `buildSlideEditorView` 读取/保留；不提供其编辑命令。

一次成功 document mutation：`historyEntry: true`，`revision + 1`，`past` 追加恰好一条。identity no-op（空/同名 rename、同序 reorder、无变化 transform）`ok: true`、`historyEntry: false`、`present` 引用不变。

scene / state / scope 切换：清空 `selectionIds`，`generation + 1`，不写 history。

## 新增 scene 保旧（§5.1 / U1）

`addSlideScene` 只向**当前 location 所属 Slide surface** 的 `scenes` 追加，并在该 surface 的 location 块之后插入一条 `slide-scene` location。不新建 surface，不改其他 surface / Flow location，旧 scene 与其 `layerItems` 仍在同一 surface。Mixed 若有 `mixedPrintPlan`，只给该 Slide 的 print entry 追加 sceneId。

## R1Z-R2A-01

已消费：session 打开与每次 mutation 都 `courseProjectDocumentSchema.parse`；`SlideAuthoringTarget.authoringAddress` 只用 `makeAuthoringAddress`；测试 fixture 是 V9 Mixed document，不是 V8 project / Player 反建。请协调者将账本 `R1Z-R2A-01` 标为 `implemented`。

## R2-SEAM port 形状（如何注入，不改 store）

本任务导出的注入点是 **闭包持有一份 `SlideAuthoringSession` 的 `SlideCandidateBackend`**，不是 query string、不是第二 App。

```ts
import {
  openSlideAuthoringSession,
  createSlideCandidateBackend,
  type SlideCandidateBackend,
} from '@/renderer/course/v9SlideVerticalSlice'

// 测试/开发注入（R2-SEAM 放到 store 私有字段；默认产品路径不调用）
const backend: SlideCandidateBackend = createSlideCandidateBackend(
  openSlideAuthoringSession(v9Document),
)
backend.kind === 'v9-slide-candidate'
backend.getSnapshot()           // SlideAuthoringSnapshot
backend.makeTarget(layerItemId)  // SlideAuthoringTarget
backend.addScene({ expectedRevision: snapshot.revision, now })
backend.selectLayers(ids)
backend.transformNativeLayers(input, { expectedRevision })
backend.undo() / backend.redo()
```

建议 R2-SEAM：

1. 新建窄 `src/renderer/store/slideBackendPort.ts`，类型可为 `{ kind: 'v8' } | SlideCandidateBackend`。
2. `editorStore` 增加仅内部/测试可写的 candidate 槽；**默认 `kind: 'v8'`**，现有 selector/action 形状不变。
3. 禁止 `?editor-backend=` 用户可见切换（供体 `V9_SLIDE_TEST_QUERY` 不要移植）。
4. 一次会话只持有一个 backend；candidate 命令只写 V9 session，V8 `project`/`history` 保持不动（本任务测试已断言源 fixture 不被改）。
5. 未实现能力继续走默认 V8，不要在 candidate UI 放 no-op。

R2-B/C/D/E 公共输入：`SlideAuthoringSnapshot`、`SlideAuthoringTarget`、`SlideCommandResult`、`SlideAuthoringSelection`、`SlideAuthoringHistory`。不要依赖未导出的未来符号。
