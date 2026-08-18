HANDOFF
- task: R2-SEAM
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在现有 V8 `useEditorStore` 上建立最薄 Slide backend 接缝。默认仍是 `{ kind: 'v8' }` 与 V8 `ProjectDocument`。V9 candidate 只能通过 store 测试方法注入，未改 `App.tsx` / `Workspace.tsx`，无菜单、无 URL query、无顶栏切换、无第二 App。一次会话只持有一个 backend：candidate 命令不改 V8 `project`/`history`；注入期间 V8 写入枢纽拒绝双写。本 lane 为 integration candidate。未 commit。
- owned files changed (product worktree):
  - `src/renderer/store/slideBackendPort.ts`（新建）
  - `src/renderer/store/editorStore.ts`（最小增量）
  - `tests/unit/v9SlideBackendSelection.test.ts`（新建）
  - **未改** `src/renderer/App.tsx`
  计划侧：本 HANDOFF；账本 `R2A-R2SEAM-01` 记为 lane 已消费（`implemented`）。
- donor files/functions consulted:
  - `handoffs/R2-A.md`「R2-SEAM port 形状」：`createSlideCandidateBackend` / `SlideCandidateBackend`
  - 产品 worktree：`v9SlideVerticalSlice.ts` 的 `SlideCandidateBackend`、`createSlideCandidateBackend`、`openSlideAuthoringSession`
  - 现有 `useEditorStore` 的 `createNewProject` / `loadProject` / `commit` 形状（保持默认 V8）
- donor 舍弃部分:
  - `V9_SLIDE_TEST_QUERY` / `?editor-backend=` / `resolveEditorStartupBackend`
  - 用户可见 backend 切换、第二 App、第二侧栏、CourseStudio
  - 完整 V9 UI 接线；未把 V8 action 转发给 V9
- focused validation command:
  ```
  npx vitest run tests/unit/v9SlideBackendSelection.test.ts
  git diff --check -- src/renderer/store/editorStore.ts src/renderer/store/slideBackendPort.ts src/renderer/App.tsx tests/unit/v9SlideBackendSelection.test.ts
  ```
- validation result: Vitest 1 file / 3 tests passed，1.92s。`git diff --check` 无输出、exit 0（对新文件先 `git add -N` 再 check，随后 `git reset`，新文件仍为 untracked）。
- validation entry / fixture / backend:
  - entry: `useEditorStore` 默认态、`injectV9SlideCandidateBackend`、`clearV9SlideCandidateBackend`、`runSlideCandidateCommand`、`selectSlideBackendKind` / `selectSlideCandidateBackend` / `selectSlideAuthoringSnapshot`、`createNewProject` / `addScene` / `markSaved`
  - fixture: 内存最小 V9 Slide（1 surface / 1 scene / 1 native text）；默认 store 为 `createProject()` V8
  - backend: 默认 V8 `ProjectDocument`；candidate 仅为测试注入的 in-memory `SlideCandidateBackend`
- validation proves / does not prove:
  - proves: 默认 kind 为 `v8`，candidate getter 为 null；注入后 kind 为 `v9-slide-candidate` 且一次只持有一个 backend；candidate 命令不改 V8 `project`/`history`；注入期间 `createNewProject` 等 V8 写入被拒绝，V8 引用不变；`clear` 后回到 V8 且 V8 写入恢复
  - does not prove: 未接真实 Workspace / ScenePanel / MediaTab / Player；未证明任何 V9 UI 能力；未把 V8 action 转发给 V9；candidate 命令不会触发 Zustand 订阅刷新（闭包内突变）
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R2-A
  - target stage integrator: R2-SEAM
  - target hotspot file: src/renderer/store/slideBackendPort.ts、editorStore.ts
  - exported symbol / callback: createSlideCandidateBackend、injectV9SlideCandidateBackend
  - required user-visible behavior: 无
  - focused test proving lane side: tests/unit/v9SlideBackendSelection.test.ts
  - exact wiring requested: R2A-R2SEAM-01 已由本任务消费：测试注入 candidate；默认仍 V8；一次会话一个 backend；未移植 ?editor-backend=；未改 App.tsx。
  - risk if omitted: （已消费）
  - status: implemented（lane 侧已满足）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R2-SEAM
  - target stage integrator: R2-B
  - target hotspot file: 禁止改 editorStore.ts / App.tsx / Workspace.tsx
  - exported symbol / callback: selectSlideAuthoringSnapshot、selectSlideCandidateBackend、runSlideCandidateCommand
  - required user-visible behavior: 无。未实现能力继续走默认 V8，禁止 candidate UI no-op。
  - focused test proving lane side: tests/unit/v9SlideBackendSelection.test.ts
  - exact wiring requested: 见下方「R2-B/C/D/E 如何读 store」。命中/选择/变换只通过 candidate backend 命令；不要改 store 接缝。
  - risk if omitted: R2-B 另起第二 store 或改热点
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R2-SEAM
  - target stage integrator: R2-C
  - target hotspot file: 禁止改 editorStore.ts / App.tsx / Workspace.tsx / PropertiesTab.tsx
  - exported symbol / callback: selectSlideAuthoringSnapshot、selectSlideCandidateBackend、SlideAuthoringTarget（R2-A）
  - required user-visible behavior: 无
  - focused test proving lane side: tests/unit/v9SlideBackendSelection.test.ts
  - exact wiring requested: 文字/公式事务从 candidate snapshot/target 读取；执行走 backend 或 R2-C 自有命令模块。默认 V8 时 getter 为 null，走现有 V8 文字路径。
  - risk if omitted: 文字编辑双写 V8 project
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R2-SEAM
  - target stage integrator: R2-D
  - target hotspot file: 禁止改 editorStore.ts / App.tsx / MediaTab.tsx
  - exported symbol / callback: selectSlideCandidateBackend、selectSlideAuthoringSnapshot
  - required user-visible behavior: 无
  - focused test proving lane side: tests/unit/v9SlideBackendSelection.test.ts
  - exact wiring requested: 媒体/Component/Runtime/动画命令只写 candidate session。不要把 V8 saveProject 写成 V9 archive。
  - risk if omitted: 内容命令改 V8 project
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R2-SEAM
  - target stage integrator: R2-E
  - target hotspot file: 禁止改 editorStore.ts / App.tsx / Workspace.tsx / NodesTab.tsx
  - exported symbol / callback: selectSlideCandidateBackend、selectSlideAuthoringSnapshot
  - required user-visible behavior: 无
  - focused test proving lane side: tests/unit/v9SlideBackendSelection.test.ts
  - exact wiring requested: 图层/剪贴板/Delete/互动只走 scene candidate 命令。global/surface 交给 R3。默认 V8 时不要放 no-op。
  - risk if omitted: 动作路由同时写两套
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R2-SEAM
  - target stage integrator: R2-Z
  - target hotspot file: src/renderer/store/editorStore.ts、src/renderer/App.tsx、src/renderer/ui/Workspace.tsx
  - exported symbol / callback: runSlideCandidateCommand / inject 不得绑到 App 生命周期
  - required user-visible behavior: 教师仍只看到成熟 V8 App。V9 candidate 仅内部注入。禁止用户可见 V8/V9 切换。
  - focused test proving lane side: tests/unit/v9SlideBackendSelection.test.ts
  - exact wiring requested: candidate 命令目前在闭包内突变，Zustand 不会自动通知。R2-Z 接线 UI 时需在成功 command 后 `set` 触发订阅（例如缓存 snapshot）。默认入口仍 V8。不要移植 ?editor-backend=。
  - risk if omitted: UI 接上 candidate 后画面不刷新，或出现用户可见双编辑器
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 未实现完整 V9 UI；未转发全部 V8 action 到 V9
  - 注入期间只拒绝 V8 写入枢纽（`commit` / `commitAssetTransaction` / `createNewProject` / `loadProject` / `markSaved` / `undo` / `redo`）。选择、tab 等 UI 状态仍可改；若存在未提交的 V8 文字会话，非枢纽 action  theoretically 仍可能经 `commitTextEditSessionState` 碰 V8 project。产品 App 不会注入 candidate。
  - candidate 命令不 `set` store，React 订阅不会因 V9 mutation 刷新（R2-Z）
- rollback point: 还原产品 worktree 中 `editorStore.ts` 的本任务 diff；删除 `src/renderer/store/slideBackendPort.ts` 与 `tests/unit/v9SlideBackendSelection.test.ts`。其他 lane 文件保持不动。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 冻结：R2-B/C/D/E 如何读 store

默认产品路径仍是 V8。**不要**改 `editorStore.ts`、`App.tsx`、`Workspace.tsx`、任何 UI Tab。

### Import（R2-B 首选）

```ts
import {
  selectSlideAuthoringSnapshot,
  selectSlideBackendKind,
  selectSlideCandidateBackend,
  selectSlideCandidateDocument,
  useEditorStore,
} from '@/renderer/store/editorStore'
import {
  executeSlideCandidateCommand,
  getSlideBackendKind,
  isV9SlideCandidateBackend,
  type SlideBackend,
} from '@/renderer/store/slideBackendPort'
import type {
  SlideAuthoringSnapshot,
  SlideCandidateBackend,
  SlideCommandResult,
} from '@/renderer/course/v9SlideVerticalSlice'
```

命令实现继续从 R2-A 的 `v9SlideVerticalSlice.ts` / 各 lane 自有模块 import。不要依赖未导出的未来符号。

### 读取

| 需要 | 默认 V8 | candidate 会话 |
|---|---|---|
| `selectSlideBackendKind(state)` | `'v8'` | `'v9-slide-candidate'` |
| `selectSlideCandidateBackend(state)` | `null` | `SlideCandidateBackend` |
| `selectSlideAuthoringSnapshot(state)` | `null` | `SlideAuthoringSnapshot` |
| `selectSlideCandidateDocument(state)` | `null` | V9 `history.present`（只读，供日后保存） |

```ts
const state = useEditorStore.getState()
const backend = selectSlideCandidateBackend(state)
if (!backend) {
  // 默认 V8：继续现有 V8 路径。不要放 no-op UI。
  return
}
const snapshot = selectSlideAuthoringSnapshot(state)!
```

### 执行 command

```ts
const result = useEditorStore.getState().runSlideCandidateCommand((backend) =>
  backend.transformNativeLayers(input, { expectedRevision: snapshot.revision }),
)
// 或：backend.addScene / selectLayers / undo / redo / ...
```

失败时 `ok: false` 且带 `reason`（含默认 V8 时的 `not-v9-slide-candidate`）。一次成功 mutation 只产生一次 V9 revision/history。

### 保存 / 丢弃 candidate

- **丢弃**：`useEditorStore.getState().clearV9SlideCandidateBackend()`（回到 V8；不改当前 V8 `project`）。
- **保存**：读 `selectSlideCandidateDocument(state)`。**禁止**调用 V8 `markSaved` / `saveProject` 去写 V9 archive。真实 archive 留给 R7 / R2-Z。
- **注入**：仅测试/开发 `injectV9SlideCandidateBackend(createSlideCandidateBackend(openSlideAuthoringSession(v9Document)))`。禁止绑到 App 生命周期、菜单、顶栏或 `?editor-backend=`。

### 禁止改的热点

- `src/renderer/store/editorStore.ts`（本接缝已冻结；R2-Z 才可再动）
- `src/renderer/App.tsx`、`src/renderer/ui/Workspace.tsx`
- `ScenePanel.tsx`、`RightSidebar.tsx`、`NodesTab.tsx`、`PropertiesTab.tsx`、`ElementsTab.tsx`、`MediaTab.tsx`
- R2-A：`v9SlideVerticalSlice.ts` / `slideEditorCommands.ts` / `slideEditorView.ts`
- R0-D / R1 shared、archive、export
- 不得新建第二 store、第二 App、第二侧栏

## R2A-R2SEAM-01

已消费：`createSlideCandidateBackend` 经 store 测试槽注入；默认 `{ kind: 'v8' }`；一次会话一个 backend；candidate 命令不改 V8 `project`/`history`；未改 App.tsx。账本已标 `implemented`。
