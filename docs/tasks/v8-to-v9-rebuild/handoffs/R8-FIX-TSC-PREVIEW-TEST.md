HANDOFF
- task: R8-FIX-TSC-PREVIEW-TEST
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 清掉 R8-FIX-TSC-V9TEST 交卷后仍挂在 `tests/unit/slidePreviewRebuildKey.test.ts` 的 **1** 条 `tsc --noEmit` 错误（TS2698：`visibility: unknown` 不能直接 spread）。fixture 对齐 `SlidePreviewRebuildKeyInput` / `SlidePreviewRebuildScene` / `SceneNode['type']`；拷贝 global visibility 前用 `isPlainObject` 收窄再浅拷贝。未用 `as any`。未弱化「同一结构不同对象身份 → key 相等」断言（edit/run 两处 `toBe` 仍在；`componentPackages` / `scene` / `assets` 的 `.not.toBe` 仍在）。未改任何 `src/**`，尤其未改 `Workspace.tsx`、`workspaceSlidePreviewRebuild.ts`、`editorStore.ts`。未领取 R8-E。未 commit。
- owned files changed:
  - 产品 worktree：
    - `tests/unit/slidePreviewRebuildKey.test.ts`（scene helper 标注 `SlidePreviewRebuildScene`；节点 `type` 用 `satisfies SceneNode['type']`；`clonePlainObject` 收窄后再 spread `visibility`）
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行状态改为 `lane_candidate`
  - **未改**：`src/**`（含 `Workspace.tsx`、`workspaceSlidePreviewRebuild.ts`、`editorStore.ts`、`ScenePanel.tsx`、`App.tsx`）；未跑 Electron / R8-A-RECHECK 窗口
- donor files/functions consulted:
  - `SlidePreviewRebuildKeyInput` / `SlidePreviewRebuildScene` / `SlidePreviewIdentityNode`（`workspaceSlidePreviewRebuild.ts`；只读）
  - `SceneNode['type']`（`projectTypes.ts`；只读）
  - [`R8-FIX-PREVIEW.md`](R8-FIX-PREVIEW.md)、[`R8-FIX-TSC-V9TEST.md`](R8-FIX-TSC-V9TEST.md)、[`R8-C-TRIAGE.md`](R8-C-TRIAGE.md)
- focused validation command:
  ```
  npx tsc --noEmit --pretty false
  npx vitest run tests/unit/slidePreviewRebuildKey.test.ts
  git add -N -- tests/unit/slidePreviewRebuildKey.test.ts
  git diff --check -- tests/unit/slidePreviewRebuildKey.test.ts
  git reset -- tests/unit/slidePreviewRebuildKey.test.ts
  ```
  工作目录：产品 worktree。Windows PowerShell。`tsc` 只用来确认本任务文件不再出现，**不是**全仓库 Gate。
- validation result:

  ### 开始前环境（产品 worktree）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `node --version` | `v24.14.0` |
  | `npm --version` | `11.9.0` |
  | `git status --short`（本任务文件） | `?? tests/unit/slidePreviewRebuildKey.test.ts`（R8-FIX-PREVIEW 新增；本任务只改类型/fixture） |

  修复前同一次 `tsc --noEmit --pretty false` 过滤本任务文件：**1** 条。
  - `tests/unit/slidePreviewRebuildKey.test.ts(71,23)` TS2698：`Spread types may only be created from object types.`（`item.visibility` 类型为 `unknown`）

  ### 修复后

  | # | 命令 | exit | 结果 |
  |---|---:|---|
  | 1 | `npx tsc --noEmit --pretty false` 过滤 `slidePreviewRebuildKey.test.ts` | 过滤器无匹配 | 本任务文件 **0** 条 `error TS`。同一次 tsc 仍有 **28** 条：`editorStore.ts` 21、`Workspace.tsx` 7。**未宣称全仓库已绿**。 |
  | 2 | `npx vitest run tests/unit/slidePreviewRebuildKey.test.ts` | **0** | 1 file / **4** tests passed，1.59s |
  | 3 | `git diff --check -- tests/unit/slidePreviewRebuildKey.test.ts` | **0** | 无输出。先 `git add -N`，随后 `git reset --` 该文件，它仍为 untracked。 |

  结束后 HEAD 未变，未 commit。

- validation entry / fixture / backend:
  - entry: `buildSlidePreviewRebuildKey` / `slidePreviewComponentPackageFingerprint`（`src/renderer/ui/workspaceSlidePreviewRebuild.ts`；本任务只读）
  - fixture: 最小 scene/global/asset/package 结构对象（非真实工程文件）；`scene()` 现返回 `SlidePreviewRebuildScene`
  - backend: 结构指纹与对象身份无关；未接 live store / Workspace / Electron
- validation proves / does not prove:
  - proves: 该测试文件 1 条 typecheck 错误已用合法 narrowing 消失；同一 scene/global/asset/package 结构、不同对象身份 → key 仍相等；换 scene / 增节点 / 改 runtime / 改素材或 package 集合 → key 仍不相等；4 项运行时断言仍过
  - does_not_prove: 全仓库 `tsc` / `npm run typecheck`（electron/e2e 项目未作为本任务 Gate）；`editorStore.ts` / `Workspace.tsx`；真实 Workspace 单击空白、隔离 iframe、Electron
- narrow UI smoke, if authorized: 未授权，未开 App / Electron。窗口冒烟仍归 R8-A-RECHECK。
- INTEGRATION_REQUESTS: 无。本任务只修授权测试类型，不接线。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 全仓库 `tsc --noEmit` 仍有 **28** 条：`editorStore.ts` 21（R8-FIX-STORE / 之后 SHELL；STORE 并行中，条数相对 V9TEST 交卷时的 20 多 1）、`Workspace.tsx` 7（R8-A-RECHECK 窗口期不要改）。复跑全量 typecheck 归 R8-C-RECHECK。
  - 未跑 `npm run typecheck` 链式 electron/e2e tsconfig、`npm test` 全量、`build:desktop`、E2E、视觉。未领取 R8-E。
- rollback point: 产品 worktree HEAD 仍为 `f272756`。回滚本任务 = 还原 `tests/unit/slidePreviewRebuildKey.test.ts` 里的 `clonePlainObject` / `satisfies SceneNode['type']` / `SlidePreviewRebuildScene` 标注（不要整文件删除，它是 R8-FIX-PREVIEW 产物）。
- execution state: `lane_candidate`
- integration state: `n/a`
- quality state: `unverified`

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`。
