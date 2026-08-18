HANDOFF
- task: R8-FIX-PREVIEW
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: Slide 隔离 Player 的重建 key 改为 **scene / global / asset / packageId@version 结构指纹**，不再跟 `project`、`componentPackages`、`assetFiles` 对象身份走。`previewGeneration` 与 preview `useEffect` 已去掉这些引用依赖；选择、同 scene 再 activate、单击空白时 key 稳定，不会 `setPreviewFeedback` 启动层。真换 scene / 增删节点 / 改 runtime / 素材或组件包集合变化时 key 仍变，允许短暂 loading。未加回 `locationId:generation` React key。未改 `editorStore.ts`、`ScenePanel.tsx`、`App.tsx`、Flow/Spatial 宿主。未开 Electron，未重跑 `output/r8-a-smoke`。未 commit。未领取 R8-E。未宣称 art/accepted 或项目级 engineering candidate。
- owned files changed:
  - 产品 worktree：
    - `src/renderer/ui/workspaceSlidePreviewRebuild.ts`（新；`buildSlidePreviewRebuildKey` / package 指纹）
    - `src/renderer/ui/Workspace.tsx`（仅 `SlideLocationWorkspace`：preview key、`previewGeneration` 依赖、隔离 Player `useEffect` 依赖；payload 从 `useEditorStore.getState()` 读最新 project/assets/packages）
    - `tests/unit/slidePreviewRebuildKey.test.ts`（新；同一结构不同对象身份 → key 相等）
  - 计划侧：本 HANDOFF
- donor files/functions consulted:
  - [`handoffs/R8-A.md`](R8-A.md)、`output/r8-a-smoke/evidence.json`（只读根因）
  - `SlideLocationWorkspace` 原 `previewRebuildKey` / `previewGeneration` / preview `useEffect`（约 1395 / 1450 / 1979）
  - `workspaceSlideAuthoring.ts`（已存在，职责是手势；预览 key 放到同目录新文件以便单测）
- focused validation command:
  ```
  npx vitest run tests/unit/slidePreviewRebuildKey.test.ts
  git diff --check -- src/renderer/ui/Workspace.tsx src/renderer/ui/workspaceSlidePreviewRebuild.ts tests/unit/slidePreviewRebuildKey.test.ts
  ```
  工作目录：产品 worktree。Windows PowerShell。未跑 typecheck / 全量 test / verify / Electron。
- validation result:

  ### 开始前环境（产品 worktree）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `git status --short`（owned） | 工作树已有其他 lane 未提交改动；本任务新增 helper/测试，并改 `Workspace.tsx` 预览依赖 |

  ### 命令

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | `npx vitest run tests/unit/slidePreviewRebuildKey.test.ts` | 0 | 1 file / 4 tests passed；1.02s |
  | 2 | `git diff --check --` 上表三个路径 | 0 | 无输出 |

- validation entry / fixture / backend:
  - entry: `buildSlidePreviewRebuildKey` / `slidePreviewComponentPackageFingerprint`（`src/renderer/ui/workspaceSlidePreviewRebuild.ts`）；`SlideLocationWorkspace` 通过该函数生成 `previewRebuildKey`
  - fixture: 最小 scene/global/asset/package 结构对象（非真实工程文件）
  - backend: 结构指纹与 Course Project V9 / V8 投影字段无关对象身份；未接 live store
- validation proves / does not prove:
  - proves: 同一 scene/global/asset/package 结构、不同 `project`/`componentPackages`/`assetFiles` 引用 → key 字符串相等；换 scene、增节点、改 runtime、改素材集合、改 packageId@version → key 不相等；run mode key 不含整份 `project`（无 `title`/`updatedAt`）
  - does_not_prove: 未接真实 Workspace / `persistCandidateResult` / 隔离 iframe / Electron 窗口；未证明单击空白后盖层消失（需 R8-A-RECHECK）；未证明 Flow/Spatial；未跑 typecheck / 全量 test / build
- narrow UI smoke, if authorized: 未授权，未做。未开 Electron，未重跑 `output/r8-a-smoke`。
- 依赖数组怎么改 / 何时仍重建:

  `previewRebuildKey` 仍可用 `project` / `componentPackages` / `assetFiles` 作 **useMemo 输入**（用来算出字符串），但输出是结构指纹：
  - edit：`mode` + `authoringContext(editingScope, sceneId, stateId)` + 当前 scene 的 nodeIdentity / stateIds / runtime + global 结构 + globalRuntime + asset id/kind/byteLength/path + sidecar 文件 id + `packageId@version` 排序指纹
  - run：**不再** `JSON.stringify` 整个 `project`；用 `currentSceneId` + **全部** scene 的 nodeIdentity/runtime + 同上 global/asset/sidecar/packages

  `previewGeneration` 依赖：`[canvasMode, previewRebuildKey, previewRetryRevision]`。已去掉 `componentPackages`、`assetFiles`。

  隔离 Player `useEffect` 依赖：`[canvasMode, clearRuntimePreviewStartupTimer, failRuntimePreview, previewRebuildKey, previewRetryRevision, retirePreviewResources, useCoursePlayerTryRun]`。已去掉 `componentPackages`、`assetFiles`。payload 改从 `useEditorStore.getState()` 读取，避免闭包绑身份。

  **不重建（key 稳定，不得 setPreviewFeedback 启动层）：** 选择、同 scene 再 activate、单击空白；`persistCandidateResult` 换新 `project`/`componentPackages` 引用但结构相同。

  **仍重建（允许短暂 loading）：** 真换 scene、增删节点、改 `scene.runtime` / `globalRuntime`、sidecar/asset 文件集合变化、组件包 `packageId@version` 集合变化、canvasMode 切换、手动 retry。

- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-PREVIEW
  - target stage integrator: coordinator / R8-A-RECHECK
  - id: PRE-R8-01
  - target hotspot file: `src/renderer/ui/Workspace.tsx`（Slide 隔离 Player preview effect / `previewRebuildKey`）
  - exported symbol / callback: `buildSlidePreviewRebuildKey`
  - required user-visible behavior: 编辑态单击当前页、单击画布空白、双击文字不得整页盖上「正在准备编辑画布 / 隔离页面已连接，正在启动 Player…」；切场景仍允许短暂 loading
  - focused test proving lane side: `npx vitest run tests/unit/slidePreviewRebuildKey.test.ts` 4 passed
  - exact wiring requested: 不要加回 `locationId:generation` React key。窗口复验走 R8-A-RECHECK，不要本任务重开 Electron。`editorStore.persistCandidateResult` 仍每次换引用（R8-FIX-STORE 持锁）；本 lane 已不跟那些引用重建 iframe。
  - risk if omitted: 教师仍看到编辑画布闪启动层
  - status: implemented
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑窗口：R8-A-RECHECK 才能证明真实单击/双击不再换 blob `src`
  - `persistCandidateResult` 仍 `set` 新 `project` / `componentPackages` 身份（STORE 持锁）。若 derived V8 投影在 no-op activate 时改变 node 集合或 runtime 内容，key 仍会变。不要本任务改 store；若必须 skip no-op persist，留给 STORE / 协调者
  - Phaser `loadScene` 仍用 `previousComponentPackagesRef.current !== componentPackages`（画布 overlay，不是隔离 iframe）。本任务未改
  - Flow/Spatial try-run effect 仍依赖 `componentPackages` 身份；不是同一 iframe blob 模式，未改
  - 未跑 `npm run typecheck`（R8-C）、全量 `npm test`（R8-D）、`build:desktop`（R8-E，未领取）、E2E / 三视口 / 17 项体验 / `npm run verify`
- rollback point: 删除 `src/renderer/ui/workspaceSlidePreviewRebuild.ts` 与 `tests/unit/slidePreviewRebuildKey.test.ts`；还原 `SlideLocationWorkspace` 中 `previewRebuildKey` / `previewGeneration` / preview `useEffect` 依赖。HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。未 commit。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`；未领取 R8-E；未开 Electron。
