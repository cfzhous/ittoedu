HANDOFF
- task: R8-FIX-SHELL-WS
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 清掉 R8-C 记在 `src/renderer/ui/Workspace.tsx` 的 **7** 条 `tsc --noEmit` 错误。只做合法 narrowing / 类型对齐：sidecar `Uint8Array` 拷成 `BlobPart`、Spatial preview state 收成 `readonly`、shape 背景走 `style.fillColor`、图层标题走 `SceneNode.name`（投影里 `item.label` → `name`）。未用 `as any`。未改隔离 Player 依赖、`previewGeneration`、`previewRebuildKey` 算法、`workspaceSlidePreviewRebuild.ts`。未加回 `locationId:generation` React key，未把 `componentPackages` / `assetFiles` 对象身份加回 `previewGeneration` 或隔离 Player `useEffect`，未让 `previewRebuildKey` 再 `JSON.stringify` 整个 `project`。未改 `editorStore.ts`、`ScenePanel.tsx`、`App.tsx`。未领取 R8-E。未 commit。未宣称 art/accepted 或项目级 engineering candidate。
- owned files changed:
  - 产品 worktree：
    - `src/renderer/ui/Workspace.tsx`（仅 Spatial 世界层类型对齐：Blob / previewFrames / fillColor / name）
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行状态；`handoffs/R8-C-TRIAGE.md` 本行标已关
  - **未改**：`workspaceSlidePreviewRebuild.ts`、`editorStore.ts`、`ScenePanel.tsx`、`App.tsx`、隔离 Player `useEffect` 依赖数组、`previewGeneration` 依赖数组
- donor files/functions consulted:
  - [`handoffs/R8-C.md`](R8-C.md)、[`handoffs/R8-C-TRIAGE.md`](R8-C-TRIAGE.md)、[`handoffs/R8-FIX-PREVIEW.md`](R8-FIX-PREVIEW.md)
  - `SceneNode` / `ShapeNode.style.fillColor` / `BaseNode.name`（`src/shared/projectTypes.ts`）
  - `courseLayerItemToSceneNode`（`item.label` → `node.name`）
  - `SpatialWorldAuthoringResult.preview`（`readonly SpatialEditorWorldTransform[]`）
  - `blobUrlRegistry` / `assetManager` 的 `Uint8Array.from(bytes)` Blob 写法
- focused validation command:
  ```
  npx tsc --noEmit --pretty false
  npx vitest run tests/unit/slidePreviewRebuildKey.test.ts
  git diff --check -- src/renderer/ui/Workspace.tsx
  ```
  工作目录：产品 worktree。Windows PowerShell。`tsc` 只用来确认 `Workspace.tsx` 不再出现，**不是**全仓库 Gate。无现成 Workspace.tsx 单测，未为类型新建套件。
- validation result:

  ### 开始前环境（产品 worktree）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `node --version` | `v24.14.0` |
  | `npm --version` | `11.9.0` |
  | `git status --short`（owned） | 工作树已有其他 lane 未提交改动；`Workspace.tsx` 在本任务前已是 `M`（含 R8-FIX-PREVIEW） |

  开始前 7 条（`npx tsc --noEmit --pretty false` 过滤 `Workspace.tsx`）：

  | # | 行 | 码 | 原文 |
  |---|---:|---|---|
  | 1 | 662 | TS2322 | `Uint8Array<ArrayBufferLike>` 不能赋给 `BlobPart` |
  | 2 | 790 | TS2345 | `readonly SpatialEditorWorldTransform[] \| null` 不能赋给 `SetStateAction<SpatialEditorWorldTransform[] \| null>` |
  | 3 | 803 | TS2345 | 同上（pointerMove） |
  | 4 | 935 | TS2322 | `unknown` 不能赋给 CSS `background`（`'fill' in node ? node.fill`） |
  | 5 | 945 | TS2339 | `ExternalComponentNode` 无 `label` |
  | 6 | 946 | TS2339 | `ImageNode \| ShapeNode \| TeacherControllerNode \| VideoNode` 无 `label` |
  | 7 | 985 | TS2339 | `SceneNode` 无 `label` |

  ### 7 条分别怎么收窄

  1. **662 BlobPart**：sidecar 字节是 `Uint8Array<ArrayBufferLike>`；DOM `BlobPart` 要 `ArrayBuffer` 视图。改为 `new Blob([Uint8Array.from(bytes)], …)`，与 `blobUrlRegistry` / `assetManager` 一致。不改 sidecar 身份，也不把 bytes 放进 preview 依赖。
  2. **790 pointerDown preview**：`SpatialWorldAuthoringResult.preview` 已是 `readonly`。`useState` 从 `SpatialEditorWorldTransform[] \| null` 收成 `readonly SpatialEditorWorldTransform[] \| null`。setter 调用不变。
  3. **803 pointerMove preview**：同一 state 类型，两条赋值一起过。
  4. **935 shape 背景**：`ShapeNode` 没有 `fill`；`'fill' in node` 把值收成 `unknown`。`node.type === 'shape'` 后读 `node.style.fillColor`（与 Properties / Spatial host 一致）。text 仍 `transparent`，其余仍半透明白。
  5. **945 组件标题**：`SceneNode` 字段是 `name`。`courseLayerItemToSceneNode` 已把 `item.label` 映到 `name`。`external-component` 分支改为 `node.name \|\| '组件'`。
  6. **946 其他世界层标题**：同一映射，`node.name \|\| node.type`。
  7. **985 HUD 标题**：同一映射，`node.name \|\| (teacher-controller ? '教师控制台' : node.type)`。

  ### 命令

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | `npx tsc --noEmit --pretty false` 过滤 `Workspace.tsx` | 0（过滤器无匹配） | **Workspace.tsx 0 条 `error TS`**。同一次 tsc 仍有 **20** 条，全在 `editorStore.ts`（STORE 持锁）。**未宣称全仓库已绿**。 |
  | 2 | `npx vitest run tests/unit/slidePreviewRebuildKey.test.ts` | **0** | 1 file / 4 tests passed，1.62s |
  | 3 | `git diff --check -- src/renderer/ui/Workspace.tsx` | **0** | 无输出 |

  结束后 HEAD 未变，未 commit。未开 Electron。

- validation entry / fixture / backend:
  - entry: `SpatialLocationWorkspace` 的 sidecar Blob URL、world preview frames、world/HUD 图层标题与 shape 背景
  - fixture: 无新测试夹具；指纹单测沿用 R8-FIX-PREVIEW / PREVIEW-TEST
  - backend: Course Project V9 `SceneNode` / Spatial authoring preview；jsdom Vitest 只覆盖 rebuild key
- validation proves / does not prove:
  - proves: 上述 7 条 typecheck 错误已用合法 narrowing 消失；`Workspace.tsx` 不再出现在 `tsc --noEmit` 输出；结构指纹单测仍 4 passed
  - does_not_prove: 全仓库 `tsc` / `npm run typecheck`（electron/e2e 项目未作为本任务 Gate）；真实 Workspace 单击/双击、隔离 iframe、Electron；`editorStore.ts` 的 20 条
- preview 依赖确认（未动）：

  `previewGeneration` 仍是 `[canvasMode, previewRebuildKey, previewRetryRevision]`。

  隔离 Player `useEffect` 仍是 `[canvasMode, clearRuntimePreviewStartupTimer, failRuntimePreview, previewRebuildKey, previewRetryRevision, retirePreviewResources, useCoursePlayerTryRun]`。

  `previewRebuildKey` 仍走 `buildSlidePreviewRebuildKey`（结构指纹）；`useMemo` 输入仍可含 `project` / `componentPackages` / `assetFiles` 以算出字符串，**输出不是对象身份，也不是整份 `JSON.stringify(project)`**。未把这些对象身份加回 `previewGeneration` 或隔离 Player effect。未加回 `locationId:generation` React key。Spatial 试运行 host 原有 `componentPackages`/`sidecarFiles` 依赖未改（不是隔离 Slide iframe）。
- narrow UI smoke, if authorized: 未授权，未开 App / Electron。单击空白不闪启动层仍以 R8-A-RECHECK / `PRE-R8-01` verified 为准。
- INTEGRATION_REQUESTS: 无。本任务只修授权文件类型，不接线。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 全仓库 `tsc --noEmit` 仍有 **20** 条，全在 `editorStore.ts`（R8-FIX-STORE 持锁 / 之后 R8-FIX-SHELL）。复跑全量 typecheck 归 R8-C-RECHECK。
  - 未跑 `npm run typecheck` 链式 electron/e2e tsconfig、`npm test`、`build:desktop`、E2E、视觉。未领取 R8-E。
  - Spatial 世界层标题从错误的 `node.label` 改为类型上真实的 `node.name`；投影路径下与图层 `label` 同值。未做窗口复验。
- rollback point: 产品 worktree HEAD 仍为 `f272756`。回滚本任务 = 还原 `Workspace.tsx` 中上述 7 处类型对齐（不要整文件 checkout，该文件含 R8-FIX-PREVIEW 等其他 lane 改动）。
- execution state: `lane_candidate`
- integration state: `n/a`
- quality state: `unverified`

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`。
