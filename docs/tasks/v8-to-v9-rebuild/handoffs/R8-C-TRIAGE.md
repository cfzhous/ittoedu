# R8-C 回派（协调者，2026-08-17）

来源：[R8-C typecheck](12d5b989-8c3d-40cf-aac0-40aacecd10c3) [`handoffs/R8-C.md`](R8-C.md)

Wave 8a：**R8-C-RECHECK-3 已绿**（LASTSCENE+AUTHORING 后 `npm run typecheck` 全链 exit 0）。`R8C-TSC-01` **保持 verified**。仍进行 **R8-D-RECHECK-2**。不要 R8-E。不要改隔离 Player 依赖。

## 失败

| ID | 命令 | 首错 | Owner 归类 | 修复任务 |
|---|---|---|---|---|
| R8C-CAP-01 | `check:ai-capabilities` | `generation-evidence.json` 过期 | 生成物维护 | **已关。** [R8-FIX-CAP](4b755647-081d-497c-8696-47ec736ab074) |
| R8C-TSC-01 | `tsc --noEmit` | 全链 exit 0（renderer / electron / e2e） | 跨 lane 累积 | **已关。** [R8-C-RECHECK-3](e7df3c1b-6d4c-421c-be1d-9c580161d9ff) LASTSCENE+AUTHORING 后仍绿；`R8C-TSC-01` verified |

electron / e2e tsconfig 已跑且绿（R8-C-RECHECK 至 R8-C-RECHECK-3）。

## typecheck 拆分

| 修复任务 | 文件簇 | 状态 |
|---|---|---|
| R8-FIX-CAP | `artifacts/ai-capabilities/` | `lane_candidate`；`R8C-CAP-01` verified |
| R8-FIX-FLOW-TSC | `flow*` player/course/UI + `tests/unit/flow*` | **已关** `lane_candidate`；授权路径 0 TS；根因 `filter` 不收窄 `CourseLocation` |
| R8-FIX-TSC-REST | Spatial runtime/session 测试 + print/PPTX 视口 + `publishedDynamicHosts` | **已关** `lane_candidate`；授权文件 0 条 TS；PPTX 行为未改 |
| R8-FIX-CUT-TESTS | `v9SlideTextTransaction.test.ts` 等 CUT 测试类型/断言 | **已关** `lane_candidate`；7 文件 / 34 测试绿；默认仍是 V9 |
| R8-FIX-TSC-TREE | `tests/unit/courseTreeView.test.ts` | **已关** `lane_candidate`；6 条 TS 为 `requireSession` 泛型 |
| R8-FIX-TSC-TABS | `PropertiesTab.tsx`（2）、`NodesTab.tsx`（1） | **已关** `lane_candidate`；授权文件 0 TS |
| R8-FIX-TSC-V9TEST | `v9SlideTextTransaction.test.ts` 等仍余 TS | **已关** `lane_candidate`；4 文件 21 TS→0；CUT 默认仍是 V9 |
| R8-FIX-TSC-PREVIEW-TEST | `slidePreviewRebuildKey.test.ts`（1） | **已关** `lane_candidate`；该测试 0 TS；4 passed |
| R8-FIX-SHELL-WS | `Workspace.tsx`（7） | **已关** `lane_candidate`；授权文件 0 TS；未改隔离 Player 依赖 |
| R8-FIX-SHELL | `editorStore.ts`（约 20） | **已关** `lane_candidate`；该文件 0 TS；renderer `tsc --noEmit` 0；未回退 STORE 投影；未改余力测试 |

每条修复：最多两个 Vitest 文件 + `git diff --check` 只列改过的文件。禁止 `npm run verify`。复跑 typecheck 由协调者在簇交齐后派一次 R8-C-RECHECK。
