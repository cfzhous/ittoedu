# R8-D 回派（协调者，2026-08-17）

来源：[R8-D 全量 Vitest](7f54ca27-1ce5-4c2c-8d36-f3a572d26836) [`handoffs/R8-D.md`](R8-D.md)

187 文件 / 1107 测试：158 / 1030 绿，**29 / 77 红**。R5 无失败。不是 R8-B ScenePanel。

R8-B 已交卷。Electron 空闲。不要开 R8-E。Workspace 类型已关；不要改隔离 Player 依赖。STORE 优先 6 已关（`R8D-STORE-01` verified）。

已关：CAP、FLOW-TSC、TSC-REST、TREE、CUT-TESTS、R6-TESTID、TABS、PREVIEW、A-RECHECK、STORE 优先簇、SHELL（`editorStore` 类型；优先 6 仍绿）、STORE-REST（`R8D-STORE-02` 6 目标全绿）。
`editorStore` 锁已释放。

已关：初跑 29 红已全部在全量中绿（[R8-D-RECHECK-2](7ed08d58-8fd2-4159-9e93-54b6cdae79dc) 189/1118）。不要再派 Vitest 修复刀。
仍进行：R8-F-RECHECK-12。R8-FIX-SIMPLE-FADE 已交（简洁模式定向绿），不要回滚。IMAGE-ASPECT 定向绿、全量未跑，不要回滚、不要标 verified。PRESENTER-HTML / CATALOG-PPTX / E2E-EXPORT 已交，不要回滚。不要 R8-G。不要提交。

注意：FLOW-TSC 已为类型改过 `tests/unit/flowProductIntegration.test.tsx`。R6-TESTID 只改 `add-flow-page` 查找（或菜单 alias），**保留**该文件里的 narrowing，不要整文件回写。

## 本波领取（并行）

| 修复任务 | 范围 | 不要做 |
|---|---|---|
| R8-FIX-CAP | `npm run generate:ai-capabilities` → `artifacts/ai-capabilities/` | 不改 `src/` |
| R8-FIX-CUT-TESTS | CUT 后默认已是 `v9-slide-candidate` 的过期断言；`recoveryWriteCoordinator` 应允许写 V9 恢复包 | 不把默认 backend 改回 V8；不改 ScenePanel / Workspace / editorStore |
| R8-FIX-FLOW-TSC | R8-C Flow typecheck 簇 | 不改 ScenePanel；`add-flow-page` testid 留给 B 交卷后 |
| R8-FIX-TSC-REST | Spatial + export + `publishedDynamicHosts` typecheck | 不改壳层热点 |

每条：只跑自己改过的 Vitest 文件（CUT-TESTS 可一次列出全部改过的测试文件）。禁止 `npm test` 全量、禁止 `verify`。

## 暂缓（等 R8-B，必要时等 A）

| 簇 | 文件 | 原因 |
|---|---|---|
| V8 store / 媒体 / global UI | `assetTransactions`、`batchMediaAndInsertion`、`globalEditorStore`、`globalLayerUi`、`mediaTab`、`presenterSettingsUi`、component/formula/image/sceneState/simpleEditor/textEmphasis/designTokens/developerMode | 多半要改 `editorStore` 投影或 V9 sidecar |
| R6 testid | `flowProductIntegration` `add-flow-page` | ScenePanel / AddCourseContentMenu，B 持锁 |
| Electron 脚本 | `coursewareAuthoringRunner`、`projectV8CoursewareSkill` 超时 | A 占 Electron；CAP 后再看 EndToEnd |

## 原则

- 过期「默认是 V8」断言：改成 CUT 事实（默认 V9），或显式注入 V8 backend 再测 V8 路径。这不是放宽合同。
- 禁止为绿而 `toBeTruthy()` 掉关键形状。
- 禁止把产品切回默认 V8。
