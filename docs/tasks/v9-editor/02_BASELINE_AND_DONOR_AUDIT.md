# T01 — 恢复基线与 Git 供体审计

> Wave：0（串行）
> 生产代码：只读
> 输出：`docs/tasks/v9-editor/artifacts/BASELINE_DONOR_MATRIX.md`

## 1. 目标

在不破坏当前脏工作树的前提下，确认后续并发开发使用的安全基线，并建立可复用的 V8/V9 功能供体矩阵。结论必须基于入口链、diff 和代表性证据，不能仅凭提交说明，也不能整体回退到早期 V9。

## 2. 固定候选

- 当前工作区：保留作取证与局部供体，不执行 reset。
- `e2e34aa`：首选恢复候选。
- `7f04a8a`：条件回退候选。
- `3e41ec0`：V8 表面和早期 V9 供体，不作产品基线。
- `378c195`：V8 视觉基线。
- `14890bb`：V8 行为合同。
- `6361641`：Slide 纵切供体。

先用 `git cat-file -e <sha>^{commit}` 验证对象存在；若 SHA 在当前仓库不存在，报告事实，不猜替代提交。

## 3. 审计范围

矩阵至少逐项记录：

- 单一 App/Shell/Store 与 V9 默认新建/保存；
- V8 壳层、场景/state、画布选择/变换、文字/公式、媒体/声音、图层、属性、互动、控制器、试运行/导出；
- 右键、Delete/Backspace、多选、剪贴板；
- 全局层与 surface 共享作者入口；
- Flow 创建、页面—标题树、编辑、Player/导出；
- Spatial 创建、无限画布、镜头/路径/关系、Player/导出；
- Pure/Mixed 推导与跨 surface 目录；
- 当前工作区新增回归与可保留实现。

每行包含：`能力`、`当前事实`、`e2e34aa`、`7f04a8a`、`最佳 donor`、`现有测试`、`风险`、`建议 owner`。

## 4. 允许修改

- 允许新建：`docs/tasks/v9-editor/artifacts/BASELINE_DONOR_MATRIX.md`
- 允许在交付时更新：本文件末尾“交付记录”
- 其他全部只读。

## 5. 执行步骤

1. 记录 `git status --short`、当前 branch、HEAD 和基准差异。
2. 核对正式入口 `ProductApp.tsx → App.tsx`、V9 store/session、Player producer 和导出链。
3. 对候选提交使用 `git show` / `git diff --stat` / 窄路径 diff，定位功能供体；不 checkout 覆盖当前工作区。
4. 识别历史测试是否打在默认 V9 路径还是 legacy route。
5. 选择恢复基线，并写出否决其他候选的可验证原因。
6. 给 Wave 1/2 标出不可直接 cherry-pick 的提交和需要人工移植的热点。

## 6. 最小验证

只允许运行：

```powershell
git cat-file -e 'e2e34aa^{commit}'
git cat-file -e '7f04a8a^{commit}'
git cat-file -e '3e41ec0^{commit}'
git diff --check -- docs/tasks/v9-editor/artifacts/BASELINE_DONOR_MATRIX.md
```

如确需验证一个关键判断，可运行最多两个已存在的定向 Vitest 文件，并在矩阵中说明原因。禁止 typecheck、build、全量测试、E2E 和 visual gate。

## 7. 验收

- 当前工作树未被清理、覆盖或切换。
- 基线选择有源码/历史证据，不靠提交名。
- V8 供体与 V9 已闭合纵切均被复用，不建议整体重写。
- 全局层明确保留；Focusky/AI 扩张未混入当前基线。
- Wave 1 能据此冻结输入合同。

## 8. 交付记录

已执行（2026-08-17）。生产代码未改。工作树保持脏状态。

HANDOFF
- task: T01 恢复基线与 Git 供体审计
- baseline SHA / worktree: 选择恢复基线 `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c`。当前 branch `codex/v9-editor-v8-base` HEAD `85dd3cd60a5f04beccf235c1ebab21d4badae286`（docs revert）；`e2e34aa..HEAD` 无 src/tests，仅 3 个示例 HTML。脏工作树 60 个已跟踪 + 44 个未跟踪，未 reset。条件回退 `7f04a8a4286280209e7cb04982001bf047d09126` 不触发。
- outcome: 六个候选 SHA 均 `git cat-file` 存在。`ProductApp`→`App`、`createNewCourseProject()`、V9 保存/发布链在 `e2e34aa` 与 `7f04a8a` 成立；`3e41ec0` 仍是 `CourseStudioApp`+`legacy-v8` 双入口。`e2e34aa` 已含 Flow/Spatial 作者与原壳接线，缺口是入口退化而非真相破裂。工作区 `hideSharedLayerEntries` 与纯 Slide 隐藏创建是回归。右键全历史无实现。V8 行为图测试打在 `createNewProject()`（`courseSession === null`），不是默认 V9。
- files changed:
  - 新建 `docs/tasks/v9-editor/artifacts/BASELINE_DONOR_MATRIX.md`
  - 更新本文件交付记录
- focused validation commands:
  - `git cat-file -e` 对 e2e34aa / 7f04a8a / 3e41ec0 / 378c195 / 14890bb / 6361641
  - `git diff --check -- docs/tasks/v9-editor/artifacts/BASELINE_DONOR_MATRIX.md`
  - 未跑定向 Vitest（入口、新建/保存、键盘桩、文件有无均可由 show/diff 证明）
- results: 全部候选 commit 对象存在。矩阵已按合同逐项记录。基线否决均有源码/历史证据。未跑 typecheck/build/全量/E2E。
- INTEGRATION_REQUESTS: 无（只读审计）。Wave 1 应按矩阵从 `e2e34aa` 干净树起步；热点文件只提交 INTEGRATION_REQUEST。
- visual/manual evidence: 未截图、未重捕基线。对照提交为 `378c195`（原始 V8 壳）与 `e2e34aa` 内 `31f9f64`；工作区 PNG/`geometry.json` 视为污染。
- remaining risks: 协调者尚未建立独立恢复 worktree；本脏树仍含会藏全局入口的改动。`14890bb` 仍引用已删除的 `tests/e2e/editor.spec.ts`。若有人整串 cherry-pick `7f04a8a..e2e34aa` 或工作区热点，会破坏 T10 所有权。
- status: engineering candidate
