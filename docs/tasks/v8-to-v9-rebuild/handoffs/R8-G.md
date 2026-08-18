HANDOFF
- task: R8-G
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器` / `main` / `e53c126cef768eaed2377baf95dd21ea24964090`（当前产品已合回根目录；V8 基线仍为 `f272756`）
- outcome: 三视口视觉 **通过**（`evidence.passed=true`，`failures=[]`）。在默认 V9 产品路径上，对 1280×720、1366×768 与最大可达大视口执行 §6 全部检查并截图。未改 `src/**`。未 commit。未跑 typecheck / Vitest / `build:desktop` / `test:e2e` / `verify`。未领取 R8-H/Z。未宣称 art/accepted，未宣称项目级 engineering candidate。Electron 与 Vite `:5177` 已停。
- owned files changed:
  - 产品源码：无
  - 环境：根目录 `npm install` 补齐本机缺失的 Electron / Playwright（`node_modules` 原先不完整）；未改 `package.json` / lock
  - 证据（gitignore `output/`，不要提交二进制）：`output/r8-g-visual/run-smoke.cjs`、`evidence.json`、`vite.log`、三视口各 13 张 PNG
  - 计划侧：本 HANDOFF；`00_INDEX.md` / `10_R8` 本行状态
- donor files/functions consulted:
  - `10_R8_FINAL_FULL_GATE.md` §6、§11.6
  - `01_SHARED_EXECUTION_CONTRACT.md` HANDOFF 模板
  - `tests/e2e/editor.spec.ts`（`electron.launch`、`patchDialogs`、元素/图层 tab）
  - 只读 UI：`AddCourseContentMenu.tsx`、`ScenePanel.tsx`、`Workspace.tsx`、`FlowBlockContextToolbar.tsx`、`ElementsTab.tsx`
- focused validation command:
  ```
  npm install
  node output/r8-g-visual/run-smoke.cjs
  git diff --check -- docs/tasks/v8-to-v9-rebuild/00_INDEX.md docs/tasks/v8-to-v9-rebuild/10_R8_FINAL_FULL_GATE.md
  ```
  工作目录：仓库根目录。无 Vitest。无 `VITE_V9_CANDIDATE_SMOKE`。Vite `http://127.0.0.1:5177 --strictPort`。`--user-data-dir=output/r8-g-visual/electron-profile`。Playwright `_electron.launch`（`--remote-debugging-port=9360`）。`COURSEWARE_E2E_BACKGROUND=0`。
- validation result: **passed。** 墙钟约 **66 s**。`evidence.json` `failures: []`。`git diff --check` 无输出。未抢 `:5174`。

  ### 开始前环境

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `main` |
  | `git rev-parse HEAD` | `e53c126cef768eaed2377baf95dd21ea24964090` |
  | `node` / `npm` | `v24.14.0` / `11.9.0` |
  | Electron 槽 | 空闲 |
  | `:5177` | 本任务独占 `--strictPort` |

  ### 视口与 §6 检查

  | 视口 | 实际窗口 | 壳层/下拉/长树/20+图层 | Slide 文字·选框·控制器·媒体 | Flow 长文·工具·目录 | Spatial 世界·缩放·选框·镜头·viewport 控制器 | Mixed 切页壳层 |
  |---|---|---|---|---|---|---|
  | 1280×720 | 1280×721（内容 1267×686） | 通过。19 场景；可见约 7 条需滚动；24 图层；下拉在视口内 `panel--bottom` | 通过。画布无 mask；控制器 overlay 可见；媒体分类+导入/声音栏 | 通过。上下文工具；paragraph 不进图层；试运行 TOC 三角可点 | 通过。缩放条 100%；选择框；镜头 全景+镜头2；底部教师控制器 HUD | 通过。切 Slide→Flow→Spatial 后 toolbar/tree/主按钮仍在 |
  | 1366×768 | 1366×768（内容 1353×733） | 同上，全绿 | 同上 | 同上 | 同上 | 同上 |
  | 1920×1080 | **本机工作区钳制为 1560×992**（内容 1547×957） | 通过。约 12/19 场景可见；24 图层；下拉在视口内 | 同上 | 同上 | 同上 | 同上 |

  1920×1080 未能铺满是 Windows 工作区限制，不是产品裁切。该档按最大可达尺寸跑完同一套检查，不记产品失败。

  核心画布 / 控制器 / 新增菜单 / Flow 稿纸 / Spatial 世界 **未使用 mask**。

- validation entry / fixture / backend:
  - entry: 成熟 V8 `App`；`add-content-primary` / `add-content-menu`；`canvas-stage`；`flow-workspace`；`spatial-workspace`；`global-layer-entry`；`media-tab`
  - fixture: fresh `--user-data-dir` 默认空白 V9 Slide，冒烟内新增 18 场景、22 文本/矩形、1 张 `resources/icons/icon.png`、1 页 Flow、1 页 Spatial
  - backend: Course Project V9
- validation proves / does not prove:
  - proves: 三档窗口下 V8 壳层几何、主按钮+下拉避让、长课树、20+ 图层、Slide 文字/选择/控制器/媒体入口、Flow 点选与上下文工具与运行态目录三角、Spatial 缩放条/选择框/镜头/viewport 控制器、Mixed 切页后壳层稳定；无核心 mask
  - does_not_prove: 17 项真实体验（R8-H）；保存重开/导出抽查；教师验收；全量自动化（已由 C–F 另证）
- narrow UI smoke, if authorized: **做成，Gate 通过。** 证据 `output/r8-g-visual/`。每视口 13 张：`01-shell-tree` … `13-mixed-spatial`。
- INTEGRATION_REQUESTS: 无。
- DECISION_REQUESTS: 无。1920 钳制记录为环境事实，不申请改范围。
- remaining risks / untested full checks:
  - 未跑 `check:ai-capabilities` / `typecheck` / `npm test` / `build:desktop` / `test:e2e` / `verify`（本任务禁止）
  - 连续插入的文字在 1280 画布上大量重叠（错开合同的定量验证属 R8-H 项 1）
  - Flow TOC 点击后 `aria-expanded` 仍为 `"true"`，但 `08`/`09` 截图像素差明显（09 更小）；R8-H 项 11 再核收起后的贴边三角
  - 未领取 R8-H
- rollback point: 删除 `output/r8-g-visual/` 与本 HANDOFF。产品 `src/` 无本任务 diff。HEAD 仍为 `e53c126`。
- execution state: `lane_candidate`
- integration state: `n/a`
- quality state: `unverified`（三视口视觉已过；17 项体验与教师验收未做）
