HANDOFF
- task: R8-FIX-SHELL
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 清掉 SHELL-WS 后全仓 `tsc --noEmit` 里 **20** 条、全部落在 `src/renderer/store/editorStore.ts` 的类型错误。只做合法 narrowing / 类型对齐：candidate 有效图层补 `spatialSession`/`flowSession`、Spatial `flatMap` 标成 `SceneNode[]`、text draft / Flow `blockId` / `DeepPartial<SceneNode>` patch 用 `in` 收窄、`commitSlideCandidateTextRunStyle` 返回 `SlideCommandResult | SpatialCommandResult`、global 重排先排除 null projection。未用 `as any`。未回退 STORE 投影（`assetFiles`、`globalLayer`、scene/global runtime、`runV9DocumentMutation`、`selectActiveScene` 读 `slideCandidateUi.activeScene`、`buildSlideCandidateUi` 挂 runtime）。未重写 `activateCourseLocation`，未改 `reorderCourseSurfaces`，未把默认 backend 改回 V8。未改 `Workspace.tsx` / `ScenePanel.tsx` / `App.tsx`。未把 `componentPackages` 身份绑回隔离 Player。未改余力失败测试。未领取 R8-E。未 commit。未宣称 art/accepted 或项目级 engineering candidate。未跑 `npm run typecheck` 全链。
- owned files changed:
  - 产品 worktree：
    - `src/renderer/store/editorStore.ts`（仅类型对齐 / narrowing）
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行状态；`handoffs/R8-C-TRIAGE.md` 本行标已关；`handoffs/R8-D-TRIAGE.md` 余力簇改指向 STORE-REST
  - **未改**：`Workspace.tsx`、`ScenePanel.tsx`、`App.tsx`、任何测试文件、隔离 Player 依赖
- donor files/functions consulted:
  - [`handoffs/R8-FIX-STORE.md`](R8-FIX-STORE.md)、[`handoffs/R8-FIX-SHELL-WS.md`](R8-FIX-SHELL-WS.md)、[`handoffs/R8-C-TRIAGE.md`](R8-C-TRIAGE.md)
  - `buildCandidateEffectiveLayers` / `CourseLocation` / `V9SlideTextContentDraft` / `SpatialWorldContentEditSession`
  - `withV9ContentDraft`（既有 `kind === 'text'` 后再读 draft；本任务用 `in` predicate 替代 Spatial 臂上的联合字段访问）
- focused validation command:
  ```
  npx tsc --noEmit --pretty false
  npx vitest run tests/unit/assetTransactions.test.ts tests/unit/batchMediaAndInsertion.test.ts tests/unit/mediaTab.test.tsx tests/unit/globalEditorStore.test.ts tests/unit/globalLayerUi.test.tsx tests/unit/presenterSettingsUi.test.tsx
  git diff --check -- src/renderer/store/editorStore.ts
  ```
  工作目录：产品 worktree。Windows PowerShell。`tsc` 用来确认 `editorStore.ts` 不再出现；本次输出为空（renderer 工程 0 错）。**不是** `npm run typecheck` Gate（electron/e2e tsconfig 未跑）。
- validation result:

  ### 开始前环境（产品 worktree）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `node --version` | `v24.14.0` |
  | `npm --version` | `11.9.0` |
  | `git status --short`（owned） | 工作树已有其他 lane 未提交改动；`editorStore.ts` 在本任务前已是 `M`（含 R8-FIX-STORE） |

  开始前 20 条（`npx tsc --noEmit --pretty false`，全在 `editorStore.ts`）：

  | # | 行 | 码 | 原文 |
  |---|---:|---|---|
  | 1 | 861 | TS2739 | `buildCandidateEffectiveLayers` 缺 `spatialSession` / `flowSession` |
  | 2 | 947 | TS2345 | Spatial `flatMap` 推断成 text 字面量数组 ∪ `SceneNode[]` |
  | 3–8 | 958–961 | TS2339 | `edit.draft` 仍是 text∪formula，读 `text`/`runs`/`width`/`height` |
  | 9 | 2640 | TS2345 | `commitSlideCandidateTextRunStyle` 实现返回 Spatial 结果，接口只标 Slide |
  | 10 | 4254 | TS2339 | `find(..., kind === 'flow-block')?.blockId`（`find` 不收窄） |
  | 11 | 5924 | TS2339 | `normalizeNewNodeGeometry` 后 `SceneNode` 无 `text` |
  | 12–17 | 8678–8722 | TS2339 | `DeepPartial<SceneNode>` 联合上读 `text`/`style` |
  | 18 | 8895 | TS18047 | `projection?.unifiedRows` 之后仍当 `projection` 可空 |
  | 19–20 | 9013 / 9124 | TS2339 | 同上，`CourseLocation.blockId` |

  ### 怎么收窄

  1. **861 有效图层 Pick**：`candidateViewState` 是 Slide 会话视图，补 `spatialSession: null`、`flowSession: null`。不改投影内容。
  2. **947 flatMap**：回调显式返回 `SceneNode[]`，空数组 / 草稿节点 / 原节点同一元素类型。
  3. **958–961 draft**：`isV9SlideTextContentDraft`（`'text' in draft && 'runs' in draft`）后再读字段。不改草稿写入。
  4. **2640 返回类型**：接口改为 `SlideCommandResult | SpatialCommandResult`，与 Spatial 早退臂一致。`PropertiesTab` 不使用返回值。
  5. **4254 / 9013 / 9124 blockId**：`flowLocationBlockId` 先 `find` 再 `kind === 'flow-block'` 收窄。语义仍是 `selectedBlockId ?? location.blockId ?? locationId`。
  6. **5924 text 节点**：`normalizeNewNodeGeometry` 后 `node.type !== 'text'` 则 return；`createTextNode` 运行时仍是 text。
  7. **8678–8722 patch**：`'text' in patch` / `'style' in patch` 后再读。`name` 在 `BaseNode` 上，无需 narrowing。
  8. **8895 projection**：global 重排先 `if (!projection) return`，再读 `unifiedRows`。原先 `first` 为空也会 return，行为不变。

  ### 命令

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | `npx tsc --noEmit --pretty false` | **0** | 无输出。**`editorStore.ts` 0 条 `error TS`。renderer tsc 本文件清零。** 同一次命令全仓 renderer 工程也是 0 错。**未宣称 `npm run typecheck` 全链已绿**（electron/e2e 未跑）。 |
  | 2 | `npx vitest run` 上列 6 文件 | **0** | **6 files / 40 tests passed**；3.75s；Start at 23:11:29 |
  | 3 | `git diff --check -- src/renderer/store/editorStore.ts` | **0** | 无输出 |

  结束后 HEAD 未变，未 commit。未开 Electron。

- validation entry / fixture / backend:
  - entry: `useEditorStore` 的 candidate 有效图层、Spatial 文本草稿投影、Flow 选块、`addTextNode`、`updateNodes` content patch、global `reorderNodes`、`commitSlideCandidateTextRunStyle`
  - fixture: 优先 6 单测自造最小工程、PNG 字节、V4 组件包、Runtime API 2 模板（本任务未改测试）
  - backend: CUT 后默认 `v9-slide-candidate`；投影仍为 V8 `ProjectDocument` 形状
- validation proves / does not prove:
  - proves: 上述 20 条 typecheck 错误已用合法 narrowing 消失；`editorStore.ts` 不再出现在 `tsc --noEmit` 输出；本次 renderer `tsc --noEmit` 全仓 0 错；STORE 优先 6 文件仍 40 passed
  - does_not_prove: `npm run typecheck`（electron/e2e 项目未跑）；全量 `npm test`；余力 6 红测；真实保存重开、Electron、隔离 Player
- narrow UI smoke, if authorized: 未授权。未开 Electron。未碰 `Workspace.tsx` / `ScenePanel.tsx` / `App.tsx`。
- INTEGRATION_REQUESTS: 无。本任务只修授权文件类型，不接线。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` 链式 electron/e2e tsconfig、`npm test`、`build:desktop`、E2E、视觉。复跑全量 typecheck 归 R8-C-RECHECK。未领取 R8-E。
  - 余力簇仍按 [R8-FIX-STORE](R8-FIX-STORE.md) 交卷时红：`componentPackageManagement`、`developerMode`、`formulaNode`、`sceneStateUi`、`simpleEditorMode`、`textEmphasis`。本任务未改这些测试，留给 STORE-REST。
  - `persistCandidateResult` 仍每次 `set` 新 `project` 引用（R8-FIX-PREVIEW 已不跟身份重建 iframe）。
- rollback point: 产品 worktree HEAD 仍为 `f272756`。回滚本任务 = 还原 `editorStore.ts` 中上述 narrowing（不要整文件 checkout，该文件含 R8-FIX-STORE 等其他 lane 改动）。
- execution state: `lane_candidate`
- integration state: `n/a`
- quality state: `unverified`

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`。
