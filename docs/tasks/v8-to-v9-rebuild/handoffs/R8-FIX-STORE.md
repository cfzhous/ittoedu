HANDOFF
- task: R8-FIX-STORE
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 只补 V9 投影缺口与优先失败测试。CUT 后默认仍是 `v9-slide-candidate`。sidecar 投影到 `assetFiles`；`globalLayer` / scene·global runtime 从 `globalLayerItems` 与 scene `kind:'runtime'` 图层投影；全局增删改、媒体导入、容量错误、教师控制器恢复走 `runV9DocumentMutation`。`selectActiveScene` 读 `slideCandidateUi.activeScene`，因此 `buildSlideCandidateUi` 也挂上 scene runtime。未重写 `activateCourseLocation`；未改 `reorderCourseSurfaces`；未改 `Workspace.tsx` / `ScenePanel.tsx` / `App.tsx`；未把默认 backend 改回 V8。已删调试 `console.error`。未 commit。未领取 R8-E。未宣称 art/accepted 或项目级 engineering candidate。
- owned files changed:
  - 产品 worktree：
    - `src/renderer/store/editorStore.ts`（V9 投影 + 写入；`buildSlideCandidateUi` 附加 runtime）
    - `tests/unit/assetTransactions.test.ts`（缺包用例补 V8 `componentPackages` 元数据）
    - `tests/unit/mediaTab.test.tsx`（`seedAssets` 走 `importAsset`；缺字节改 sidecar）
    - `tests/unit/globalEditorStore.test.ts`（不再断言持久化 `layer: 'underlay'`）
    - `tests/unit/globalLayerUi.test.tsx`（页面可见范围文案；runtime 走 store API；checkbox 匹配 `${surface.title} · ${scene.name}`）
  - **未改测试文件**（仍纳入优先 1–6 验证）：`tests/unit/batchMediaAndInsertion.test.ts`、`tests/unit/presenterSettingsUi.test.tsx`
  - 计划侧：本 HANDOFF
- donor files/functions consulted:
  - `handoffs/R8-D.md` / `R8-D-TRIAGE.md`（`R8D-STORE-01` 失败簇）
  - `projectCandidatePreviewDocument` / `attachProjectedRuntimes` / `appendGlobalCourseNode` / `writeSceneRuntime`
  - `selectActiveScene`（优先 `slideCandidateUi.activeScene`）
  - `PropertiesTab` `RuntimeInspector`（只读；未改）
- focused validation command:
  ```
  npx vitest run tests/unit/assetTransactions.test.ts tests/unit/batchMediaAndInsertion.test.ts tests/unit/mediaTab.test.tsx tests/unit/globalEditorStore.test.ts tests/unit/globalLayerUi.test.tsx tests/unit/presenterSettingsUi.test.tsx
  git diff --check -- src/renderer/store/editorStore.ts tests/unit/assetTransactions.test.ts tests/unit/mediaTab.test.tsx tests/unit/globalEditorStore.test.ts tests/unit/globalLayerUi.test.tsx
  ```
  工作目录：产品 worktree。Windows PowerShell。未跑 typecheck / 全量 test / verify / Electron。
- validation result:

  ### 开始前环境（产品 worktree）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `git status --short`（owned） | 工作树已有其他 lane 未提交改动；本任务改 `editorStore.ts` 与上表 4 个测试文件 |

  ### 优先 1–6（必须尽量绿）

  | # | 文件 | 结果 |
  |---|---|---|
  | 1 | `tests/unit/assetTransactions.test.ts` | **通过** |
  | 2 | `tests/unit/batchMediaAndInsertion.test.ts` | **通过**（测试文件未改） |
  | 3 | `tests/unit/mediaTab.test.tsx` | **通过** |
  | 4 | `tests/unit/globalEditorStore.test.ts` | **通过** |
  | 5 | `tests/unit/globalLayerUi.test.tsx` | **通过** |
  | 6 | `tests/unit/presenterSettingsUi.test.tsx` | **通过**（测试文件未改） |

  ### 命令

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | `npx vitest run` 上列 6 文件 | 0 | **6 files / 40 tests passed**；5.91s；Start at 23:03:43 |
  | 2 | `git diff --check --` 本任务实际改过的 5 个路径 | 0 | 无输出 |

- validation entry / fixture / backend:
  - entry: `useEditorStore`（`createNewProject` / `importAsset` / `persistMediaResult` / `appendV9GlobalNode` / `setSceneRuntime` / `setGlobalRuntime` / `updateGlobalLayerSettings` / `setActiveScene`）；UI 测 `MediaTab` / `ElementsTab` / `ComponentsTab` / `PropertiesTab` / `ScenePanel`
  - fixture: 各单测自造最小工程、PNG 字节、V4 组件包、Runtime API 2 模板
  - backend: CUT 后默认 `v9-slide-candidate`；投影为 V8 `ProjectDocument` 形状（`assetFiles`、`globalLayer`、`scenes[].runtime`、`globalRuntime`）
- validation proves / does not prove:
  - proves: 优先 6 文件在当前脏树上全绿。教师路径可导入媒体、看见文件名、加入画布、编辑 global native/component、改页面可见范围、编辑 scene/global runtime 文案；缺字节/缺可执行包仍 conservative 拦截；容量满时保留 library fallback 文案
  - does_not_prove: 未跑 typecheck、全量 `npm test`、`build`/`build:desktop`、E2E、Electron、三视口、17 项体验、`npm run verify`。未证明余力簇全绿。未接真实保存重开文件。`persistCandidateResult` 仍每次换 `project` 对象身份（R8-FIX-PREVIEW 已不跟身份重建 iframe）
- narrow UI smoke, if authorized: 未授权。未开 Electron。未碰 `Workspace.tsx` / `ScenePanel.tsx` / `App.tsx`（R8-A-RECHECK 窗口期）。
- 余力簇（定向加跑，未改这些测试文件）:

  | 文件 | 结果 |
  |---|---|
  | `componentPropertiesEditor.test.tsx` | 通过 |
  | `componentCatalogReplacement.test.ts` | 通过 |
  | `componentCatalogUi.test.tsx` | 通过 |
  | `formulaNodeUi.test.tsx` | 通过 |
  | `imageSafeAreas.test.tsx` | 通过 |
  | `designTokens.test.tsx` | 通过 |
  | `componentPackageManagement.test.tsx` | **仍失败** 4：import 后 `componentPackages[id]` 引用不稳；delete 后 V9 `project.componentPackages` 仍在；replace 多 1 条 history；管理列表删不掉 |
  | `developerMode.test.tsx` | **仍失败** 2：可编辑副本未进入 `componentPackages`；校验读 `manifest` undefined |
  | `formulaNode.test.ts` | **仍失败** 1：命名状态 override 写进了基础 scene 节点（`accessibleText` 已是状态文案） |
  | `sceneStateUi.test.tsx` | **仍失败** 2：视频诊断文案 `/会覆盖该视频/`；缩略图 `打开场景“…”；缩略图使用状态“初始”`（课树可访问名，`ScenePanel` 未授权） |
  | `simpleEditorMode.test.tsx` | **仍失败** 1：入场动画 `history.past` 期望 1 实得 2 |
  | `textEmphasis.test.ts` | **仍失败** 1：命名状态 emphasis 写进基础节点 `runs`，未只留在 override |

- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-STORE
  - target stage integrator: coordinator / R8-D-RECHECK
  - id: STORE-R8-01
  - target hotspot file: `src/renderer/store/editorStore.ts`（`projectCandidatePreviewDocument` / `buildSlideCandidateUi` / `persistCandidateResult`）
  - exported symbol / callback: `projectCandidatePreviewDocument`；`selectActiveScene`
  - required user-visible behavior: 媒体库文件名与画布插入可用；global 文字/图形/图片/组件可添加与编辑；页面可见范围可改；场景/全局运行时属性表可编辑。不得把默认 backend 改回 V8。
  - focused test proving lane side: `npx vitest run tests/unit/assetTransactions.test.ts tests/unit/batchMediaAndInsertion.test.ts tests/unit/mediaTab.test.tsx tests/unit/globalEditorStore.test.ts tests/unit/globalLayerUi.test.tsx tests/unit/presenterSettingsUi.test.tsx` → 6 files / 40 tests passed
  - exact wiring requested: 将 `R8D-STORE-01` 中优先媒体/global 6 文件标 implemented。不要改 `Workspace.tsx` / `ScenePanel.tsx` / `App.tsx` 来“修”本 lane。余力簇未全绿，不要把整份 `npm test` 标绿。
  - risk if omitted: R8-D 复验仍把媒体/global 当 open
  - status: implemented
  ```
- DECISION_REQUESTS: 无。V9 投影 `globalLayer[].layer` 恒为 `overlay`；`updateGlobalLayerSettings({ layer: 'underlay' })` 可调用但 no-op。测试已不再断言持久化 underlay。
- remaining risks / untested full checks:
  - 未跑：`npm run typecheck`、全量 `npm test`、`npm run build` / `build:desktop`、`npm run test:e2e`、三视口、17 项体验、`npm run verify`
  - 未启动 Electron
  - 余力 6 文件仍红：组件包可执行副本/删除、命名状态 formula/emphasis override、ScenePanel 缩略图标签、simple 入场动画多一条 history
  - `editorStore.ts` 仍可能有 R8-C typecheck 余量（本任务未跑 tsc）
  - `persistCandidateResult` 仍每次 `set` 新 `project` 引用
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`；本任务改动均未 commit，可从工作树丢弃 `editorStore.ts` 与 4 个测试文件（会连同其他 lane 对该 store 的未提交改动一起丢，需协调者处理）
- execution state: `lane_candidate`
- integration state: `pending`
- quality state: `unverified`
