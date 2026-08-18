HANDOFF
- task: R8-H
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器` / `main` / `e53c126cef768eaed2377baf95dd21ea24964090`（当前产品已合回根目录；V8 基线仍为 `f272756`）
- outcome: §7 的 17 项真实体验 **通过**（全量 `evidence.passed=true`，`failures=[]`，墙钟约 **62 s**）。先按失败项单跑，单项与顺序敏感组合过后再跑全量。未改 `src/**`。未 commit。未跑 typecheck / Vitest / `build:desktop` / `test:e2e` / `verify`。未宣称 `accepted`。Electron 与 Vite `:5178` 已停。
- owned files changed:
  - 产品源码：无
  - 证据（gitignore `output/`，不要提交二进制）：`output/r8-h-experience/run-experience.cjs`、`evidence.json`、截图、`fixtures/clip.mp4`（可播一帧 H.264）、`exports/`
  - 计划侧：本 HANDOFF；`00_INDEX.md` / `10_R8` 本行状态
- donor files/functions consulted:
  - `10_R8_FINAL_FULL_GATE.md` §7、§11.6
  - `01_SHARED_EXECUTION_CONTRACT.md` HANDOFF 模板
  - `tests/e2e/editor.spec.ts`（`patchDialogs`、Ctrl 多选、画布双击坐标、导出预检）
  - 只读 UI：`NodesTab.tsx`（图层名单击延迟 250ms 后切属性）、`SimpleEntranceAnimationEditor.tsx`（仅简洁模式）、`CopyableSummaryDialog.tsx`、`TopToolbar.tsx`（DOCX 需 Flow）
- focused validation command:
  ```
  node output/r8-h-experience/run-experience.cjs --items=01,02
  node output/r8-h-experience/run-experience.cjs --items=03
  node output/r8-h-experience/run-experience.cjs --items=08,09
  node output/r8-h-experience/run-experience.cjs --items=14
  node output/r8-h-experience/run-experience.cjs --items=17
  node output/r8-h-experience/run-experience.cjs --items=05,14
  node output/r8-h-experience/run-experience.cjs
  git diff --check -- docs/tasks/v8-to-v9-rebuild/00_INDEX.md docs/tasks/v8-to-v9-rebuild/10_R8_FINAL_FULL_GATE.md docs/tasks/v8-to-v9-rebuild/handoffs/R8-H.md
  ```
  工作目录：仓库根目录。无 Vitest。无 `VITE_V9_CANDIDATE_SMOKE`。Vite `http://127.0.0.1:5178 --strictPort`。`--user-data-dir=output/r8-h-experience/electron-profile`。Playwright `_electron.launch`（`--remote-debugging-port=9361`）。`COURSEWARE_E2E_BACKGROUND=0`。
- validation result: **passed。** 全量约 **61652 ms**。`evidence.json` `failures: []`。17/17 `pass`。未抢 `:5174`。

  ### 开始前环境

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `main` |
  | `git rev-parse HEAD` | `e53c126cef768eaed2377baf95dd21ea24964090` |
  | Electron 槽 | 空闲 |
  | `:5178` | 本任务独占 `--strictPort` |

  ### §7 十七项

  | ID | 结果 | 要点 |
  |---|---|---|
  | 01 | pass | 连续 4 文本 X=440/460/480/500；图层可选 |
  | 02 | pass | Ctrl 多选 2；粘贴 4→6；Delete/Undo/Redo；保存重开 |
  | 03 | pass | 画布双击进入 `text-edit-overlay`；试运行可见 |
  | 04 | pass | 23 图层；拖排 `reordered=true`；锁定/隐藏/重命名 |
  | 05 | pass | Slide/Flow/Spatial 均可进全局层 |
  | 06 | pass | 控制器 overlay + SE 拖缩 |
  | 07 | pass | `tone.wav` 入声音库（主音量控件本轮未点到） |
  | 08 | pass | 图片+可播 `clip.mp4` 入画布；保持宽高比 |
  | 09 | pass | 简洁模式「淡入」；专业模式「互动与动画」仍在 |
  | 10 | pass | `sample-counter.h5component` 导入 |
  | 11 | pass | Flow 上下文工具 + 试运行 TOC |
  | 12 | pass | Spatial 缩放条与选择框；「添加路径/关系」本轮未露出 |
  | 13 | pass | 主按钮增 Slide；Flow/Spatial 仍在 |
  | 14 | pass | 全局控制器 `location-visibility-*` 共 5；已勾选并保存 |
  | 15 | pass | Mixed 切 Slide/Flow/Spatial，壳层仍在 |
  | 16 | pass | V8 显式导入对话框+报告；`sample-project.h5lesson` 未改写 |
  | 17 | pass | HTML 1.9MB / zip 549KB / PPTX 59KB / PDF `%PDF-1.4` / DOCX ZIP 均写出 |

- validation entry / fixture / backend:
  - entry: 成熟 V8 `App`；元素/图层/属性/媒体/导出菜单；`global-layer-entry`；Flow/Spatial workspace
  - fixture: 空白 V9 Slide；`resources/icons/icon.png`；`output/r8-h-experience/fixtures/tone.wav` 与可播 `clip.mp4`；`examples/sample-counter.h5component`；`examples/sample-project.h5lesson`（schema 8）
  - backend: Course Project V9
- validation proves / does not prove:
  - proves: §7 十七项在默认 V9 产品窗口内均可操作并截证；保存重开与五种导出文件真实落地；V8 打开走显式导入且不覆盖原文件
  - does_not_prove: 教师验收；全量 typecheck/Vitest/`test:e2e`/`verify`（已由 C–F 另证）；画布右键菜单（产品无 `contextmenu`，改走 Ctrl 多选 + Ctrl+C/V，与 e2e 流程 6 相同）；Office 应用内打开抽查
- narrow UI smoke, if authorized: **做成，Gate 通过。** 证据 `output/r8-h-experience/`。
- INTEGRATION_REQUESTS: 无。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑 `check:ai-capabilities` / `typecheck` / `npm test` / `build:desktop` / `test:e2e` / `verify`（本任务禁止）
  - 项 12「添加路径/关系」按钮在未稳定选中世界元素时未出现；缩放与选择框已过
  - 项 17 全量会话在项 16 导入 V8 之后导出，PDF 仅 996 字节（合法 `%PDF-1.4`）；独立跑项 17（先 `ensureMixed`）时 PDF 约 82KB
  - 产品图层名单击延迟 250ms 后会切到属性并卸载列表；体验脚本必须用 Ctrl 单击才能保持多选
  - 简洁「淡入」只在 `editorMode === 'simple'` 的属性栏；专业模式走「互动与动画」
- rollback point: 删除 `output/r8-h-experience/` 与本 HANDOFF。产品 `src/` 无本任务 diff。HEAD 仍为 `e53c126`。
- execution state: `lane_candidate`
- integration state: `n/a`
- quality state: `unverified`（17 项体验已过；`art candidate` / `accepted` 由 R8-Z 与教师写）
