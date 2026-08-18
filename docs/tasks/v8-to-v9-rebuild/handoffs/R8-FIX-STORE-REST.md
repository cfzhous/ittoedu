HANDOFF
- task: R8-FIX-STORE-REST
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 补上 CUT 后 V9 默认路径上组件包可执行副本、删除/替换、命名状态 override 与 history 栈。默认仍是 `v9-slide-candidate`。未重写 `activateCourseLocation`；未改 `reorderCourseSurfaces`；未回退 SHELL narrowing；未改 `Workspace.tsx` / `App.tsx`；未把默认 backend 改回 V8；未拆课树拖排（`@dnd-kit` / Grip / `reorderCourseSurfaces` 仍在）。`ScenePanel` 只给 slide-scene 按钮补了可访问名与「缩略图 · 状态」文案。未 commit。未领取 R8-E。未宣称 art/accepted 或项目级 engineering candidate。
- owned files changed:
  - 产品 worktree：
    - `src/renderer/store/editorStore.ts`（V9 组件包写入 + 可执行包 history 栈 + 命名状态 override）
    - `src/renderer/ui/ScenePanel.tsx`（仅 slide-scene `aria-label` 与「缩略图 · …」；课树拖排未动）
    - `tests/unit/simpleEditorMode.test.tsx`（入场动画 history 按 delta 计，不再把 V8 store `past=[]` 当成 V9 backend 已清空）
    - `tests/unit/sceneStateUi.test.tsx`（重复 video id 诊断改写入 V9 `history.present`，再 `setActiveScene`）
  - **未改测试文件**（纳入本任务 6 目标验证）：`tests/unit/componentPackageManagement.test.tsx`、`tests/unit/developerMode.test.tsx`、`tests/unit/formulaNode.test.ts`、`tests/unit/textEmphasis.test.ts`
  - **顺手加跑且绿、未改文件**：`tests/integration/componentCatalogV8Matrix.test.ts`、`tests/integration/componentTextEditSession.test.ts`、`tests/unit/editorFormattingUi.test.tsx`
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行
- donor files/functions consulted:
  - [`handoffs/R8-FIX-STORE.md`](R8-FIX-STORE.md)、[`handoffs/R8-FIX-SHELL.md`](R8-FIX-SHELL.md)、[`handoffs/R8-D.md`](R8-D.md)
  - `persistCandidateResult` sidecar 栈（可执行 `componentPackages` 按同样 undo/redo 对齐）
  - `writeNativeData` / `deriveSceneNodeOverride` / `sceneNodeToCourseLayerItem`
  - `evaluateComponentPackageDeletion` / `planComponentPackageReplacement`
- focused validation command:
  ```
  npx vitest run tests/unit/componentPackageManagement.test.tsx tests/unit/developerMode.test.tsx tests/unit/formulaNode.test.ts tests/unit/textEmphasis.test.ts tests/unit/simpleEditorMode.test.tsx tests/unit/sceneStateUi.test.tsx
  npx vitest run tests/unit/assetTransactions.test.ts tests/unit/batchMediaAndInsertion.test.ts tests/unit/mediaTab.test.tsx tests/unit/globalEditorStore.test.ts tests/unit/globalLayerUi.test.tsx tests/unit/presenterSettingsUi.test.tsx
  git diff --check -- src/renderer/store/editorStore.ts src/renderer/ui/ScenePanel.tsx tests/unit/simpleEditorMode.test.tsx tests/unit/sceneStateUi.test.tsx
  ```
  工作目录：产品 worktree。Windows PowerShell。未跑 typecheck / 全量 test / verify / Electron。
- validation result:

  ### 开始前环境（产品 worktree）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `git status --short`（owned） | `editorStore.ts` 已有 STORE+SHELL 未提交改动；`ScenePanel.tsx` 已有课树未提交改动（他 lane）。本任务在其上补缺口 |

  ### 6 个目标（必须全绿才 lane_candidate）

  | # | 文件 | 结果 |
  |---|---|---|
  | 1 | `tests/unit/componentPackageManagement.test.tsx` | **通过**（测试文件未改） |
  | 2 | `tests/unit/developerMode.test.tsx` | **通过**（测试文件未改） |
  | 3 | `tests/unit/formulaNode.test.ts` | **通过**（测试文件未改） |
  | 4 | `tests/unit/textEmphasis.test.ts` | **通过**（测试文件未改） |
  | 5 | `tests/unit/simpleEditorMode.test.tsx` | **通过** |
  | 6 | `tests/unit/sceneStateUi.test.tsx` | **通过** |

  ### 顺手（R8-D 仍可能红、STORE 余力表没列）

  | 文件 | 结果 |
  |---|---|
  | `tests/integration/componentCatalogV8Matrix.test.ts` | **通过**（未改文件） |
  | `tests/integration/componentTextEditSession.test.ts` | **通过**（未改文件） |
  | `tests/unit/editorFormattingUi.test.tsx` | **通过**（未改文件） |

  ### 命令

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | `npx vitest run` 上列 6 目标文件 | 0 | **6 files / 40 tests passed**；10.30s；Start at 23:33:13 |
  | 2 | `npx vitest run` STORE 优先 6 文件 | 0 | **6 files / 40 tests passed**；3.26s；Start at 23:33:32。未打回 |
  | 3 | 顺手 3 文件 | 0 | **3 files / 22 tests passed**；3.56s；Start at 23:33:32 |
  | 4 | 目标+顺手复跑（helpers 收进 editorStore 后） | 0 | **9 files / 62 tests passed**；4.23s；Start at 23:34:38 |
  | 5 | `git diff --check --` 本任务实际改过的 4 个路径 | 0 | 无输出 |

- validation entry / fixture / backend:
  - entry: `importComponentPackages` / `deleteComponentPackage` / `replaceComponentPackage` / `createEditableComponentCopy` / `updateEditableComponentPackage` / `updateNodes`（命名状态） / `setSimpleEntranceAnimation` / `ScenePanel` slide-scene 按钮
  - fixture: 各单测自造最小工程、V4 组件包、公式 AST、强调 runs、入场动画、重复 video id
  - backend: CUT 后默认 `v9-slide-candidate`；V9 文档为真相；store `componentPackages` 为可执行副本，随 candidate history 栈 undo/redo
- validation proves / does not prove:
  - proves: 教师可导入/删除未引用组件包、做可编辑副本；命名状态公式与强调只写 override；简单模式入场动画一次撤销（history +1）；课树场景按钮标明所用缩略图状态。STORE 优先 6 仍 40 passed
  - does_not_prove: 未跑 typecheck、全量 `npm test`、build、E2E、Electron、三视口、17 项体验、`npm run verify`。未接真实保存重开文件做手工课例
- 产品缺口怎么补:
  1. **组件包**：`delete` / `replace` / `createEditableComponentCopy` / `updateEditableComponentPackage` 走 `runV9DocumentMutation`，不再被 `rejectV8WriteIfCandidate` 吃掉。可执行包随 `persistCandidateResult` 做 past/future 栈，redo 仍是原对象身份。
  2. **命名状态**：`updateNodes` 在 `snapshot.stateId !== null` 时把 patch 写成 `layerItemOverrides`，不改基础 layer item。
  3. **入场动画**：命令本身已是一次 mutation；测试改为相对 `historyBefore` 计数，因为 V9 backend history 不会被 `setState({ history: { past: [] } })` 清掉。
  4. **缩略图 a11y**：slide-scene 按钮 `aria-label` 为 `打开场景“…”；缩略图使用状态“初始"`，并显示 `缩略图 · 初始`。
- narrow UI smoke, if authorized: 未授权。未开 Electron。未碰 `Workspace.tsx` / `App.tsx`。未拆 `@dnd-kit` 拖排。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-STORE-REST
  - target stage integrator: coordinator / R8-D-RECHECK
  - id: STORE-R8-02
  - target hotspot file: `src/renderer/store/editorStore.ts`（组件包 V9 写入 / 命名状态 override / componentPackages history 栈）
  - exported symbol / callback: `importComponentPackages`；`deleteComponentPackage`；`replaceComponentPackage`；`createEditableComponentCopy`；`updateNodes`
  - required user-visible behavior: 导入/删除未引用组件包、可编辑副本、命名状态公式与强调只写 override、简单模式入场一次撤销、场景缩略图标明所用状态。不得把默认 backend 改回 V8。
  - focused test proving lane side: `npx vitest run tests/unit/componentPackageManagement.test.tsx tests/unit/developerMode.test.tsx tests/unit/formulaNode.test.ts tests/unit/textEmphasis.test.ts tests/unit/simpleEditorMode.test.tsx tests/unit/sceneStateUi.test.tsx` → 6 files / 40 tests passed
  - exact wiring requested: 将 `R8D-STORE-02` 标 implemented。不要改 `Workspace.tsx` / `App.tsx`。不要拆 ScenePanel 拖排。
  - risk if omitted: R8-D 复验仍把组件包/命名状态/缩略图当 open
  - status: implemented
  ```
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：`npm run typecheck`、全量 `npm test`、`npm run build` / `build:desktop`、`npm run test:e2e`、三视口、17 项体验、`npm run verify`
  - 未启动 Electron
  - Spatial/Flow 会话里的组件包删除/替换仍走原 `commit` 拒绝臂；本任务目标测的是默认 Slide V9
  - `persistCandidateResult` 仍每次 `set` 新 `project` 引用
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`；本任务改动均未 commit。丢弃 `editorStore.ts` 会连同 STORE/SHELL 未提交改动一起丢，需协调者处理。`ScenePanel.tsx` 含他 lane 课树改动，只回滚 a11y 时不要整文件还原。
- execution state: `lane_candidate`
- integration state: `pending`
- quality state: `unverified`
