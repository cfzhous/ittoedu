# T12 — 最终整合后的唯一全量 Gate

> Wave：5（最后串行执行）
> 唯一授权：本任务可以运行全量 typecheck/test/build/E2E/visual
> 前提：T01–T11（含 T09A/T09B）全部交付

## 1. 目标

对已经整合完成的候选版本一次性运行完整工程验证与真实体验复核。此任务不承接新功能；任何失败先归因并回派给文件 owner，修复者只跑最小测试，然后回到本 Gate 复验。

## 2. 预检

- 工作树不存在未解释的跨 lane 冲突。
- 每个任务 HANDOFF 有 baseline、文件、最小测试和风险。
- 所有 `INTEGRATION_REQUEST` 已关闭。
- UI 参考图和体验清单已冻结，未为适配回归重捕 baseline。
- 测试脚本仍覆盖默认 V9 路径；V8-only preservation 不能代替 V9 E2E。

## 3. 全量自动化顺序

先记录环境、HEAD 与工作树，再执行：

```powershell
npm run verify:full
npx playwright test --config=playwright.config.ts
npm run verify:course-cases
```

`verify:full` 当前应覆盖 capability check、全部 typecheck、全部 unit/component、renderer/electron/player 构建、E2E 准备和 preservation visual。随后显式运行完整 Playwright 集，确保所有 V9 spec 也执行，而不是只跑 V8 preservation。

如果脚本事实已变化，先列出实际展开命令并确认覆盖以下集合，再执行等价命令：

- Agent Kit/capability check；
- renderer/electron/e2e typecheck；
- 全部 Vitest 与 Agent Kit test；
- player/renderer/electron build；
- 全部 V9 Electron/Playwright specs；
- V8 行为/视觉 preservation；
- course cases 与发布/导出校验。

不得并行启动多个会争抢端口、Electron 窗口或生成目录的全量命令。

## 4. 真实体验 Gate

按 `artifacts/FINAL_EXPERIENCE_CHECKLIST.md` 完整执行，至少覆盖：

1. 纯 Slide：多选、右键复制、粘贴、Delete、Undo/Redo、文字双击、保存重开。
2. 全局层：进入、编辑、锁定/隐藏、跨 location 投射、退出后 active location/history 不变。
3. 教师控制台：八向 resize、zoom/pan 对齐、属性折叠、试运行与 Player 一致。
4. 声音：导入、试听、重命名、引用、删除保护、发布播放。
5. 纯 Flow：从空白创建、页面—标题目录、正文编辑、运行态目录三角、导出。
6. 纯 Spatial：从空白创建、世界元素、镜头/路径/关系、控制器 viewport、Player。
7. Mixed：连续切三类 location、课程目录、上一/下一、进度、保存重开与导出。
8. 三视口：壳层几何、长图层、右键浮层、Flow 长文、Spatial chrome 不越界。

自动化通过前不得开始“修图式”视觉验收；真实问题必须回到源码 owner。

## 5. 失败处理

每个失败记录：命令/步骤、首个错误、复现条件、owner、是否跨 lane。然后：

1. 回派给原任务 owner；
2. owner 只跑其最小测试并提交修复 HANDOFF；
3. T10 只处理必要热点接线；
4. 本任务先复跑失败 Gate；
5. 所有失败关闭后，最多再完整运行一次全量自动化，形成最终证据。

禁止通过删除测试、放宽行为图、重捕截图或禁用功能解决失败。

## 6. 判定

- 全量机器 Gate 全绿：`engineering candidate`。
- 体验清单全部通过并有截图/录像：`art candidate`。
- 只有教师明确确认：`accepted`。

任一 V8 已有能力缺失、全局层不可达、三类页面不能从空白创建、Flow 层级错误、控制器错位或声音管理缺失，均不得带已知限制发布。

## 7. 最终报告格式

```md
FINAL_GATE
- baseline / HEAD:
- full commands and durations:
- machine results:
- V9 E2E coverage:
- preservation results:
- experience evidence:
- export artifacts:
- unresolved issues:
- outcome status: engineering candidate | art candidate | accepted
```

## 8. 交付记录

```md
FINAL_GATE
- baseline / HEAD: 恢复基线 `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c`。Gate 当时工作于 `codex/v9-parity-reconstruction`（checkpoint `bffbf95`），随后合回仓库根目录。
- full commands and durations:
  - `npm run verify:full`（状态条隐藏后终跑）exit 0，83.9s，2026-08-16T23:39:48Z
    - capability index OK：12 cards
    - typecheck：renderer + electron + e2e
    - Vitest 216 files / 1462 tests；Agent Kit 8/8
    - prepare:e2e（player / course-cases / renderer / electron）
    - preservation visual 1280/1366/1920
  - 此前同命令在图层删除按钮重捕后亦 exit 0（107.0s，2026-08-16T23:32:22Z，1461 tests）
  - `npx playwright test --config=playwright.config.ts` 9 passed / 6.8m（2026-08-16T23:46:56Z，状态条修复后终跑）；此前同套件 9 passed / 6.7m（23:29:32Z）
  - `npm run verify:course-cases` valid:true（2026-08-16T23:33Z）
- machine results: 机器 Gate 全绿。未并行争抢 Electron。
- V9 E2E coverage:
  - `starts on production V9, rejects normal legacy open, imports explicitly, and discards recovery safely`
  - `opens Flow and Spatial start locations in their production authoring workspaces`
  - `ignores an old V8 recovery copy and requires explicit legacy import`
  - `checks health, authors the global controller, and preserves it across a full reopen`
  - `moves, undoes, redoes, saves and reopens one V9 text in the original App`
  - `authors V9 scenes and presentation states through the original panels`
  - `authors one Spatial world text with stable chrome across camera and save`
  - `authors one shared surface text across scenes and a complete reopen`
  - `trial-runs the current location, exits cleanly, and keeps authoring undoable`
- preservation results: 三视口 0 mismatch（canvasStage 已蒙版）。几何矩形与 `378c195` 合同一致。两次书面重捕：① recovery 状态条 settle；② 图层行 `onDelete` 使操作列 108px。阈值未放宽。
- experience evidence: 已填 `artifacts/FINAL_EXPERIENCE_CHECKLIST.md`。四态×三视口截图在 `artifacts/experience/`。对照五张 `V9_EDITOR_UI_*` 为 **partial**：分区骨架在；纯 Slide 紧凑左栏无可见「共享内容 / 全课」（`ScenePanelContent` 绕过 `SharedContentSection`）；Flow/Spatial 已去掉误挂的场景状态条。EX-11 记受阻。清单仅 EX-17 / EX-18 标通过。未做 IME、扬声器、八向 resize 录像。无教师验收。
- export artifacts: 工程层绿灯。`verify:course-cases` 证明三课例 archive 往返、离线 `course.html`（Published V2），以及内存中的 print HTML / Flow DOCX / Slide PPTX。磁盘上只有 `examples/course-project-v9/*/project.h5lesson` 与 `course.html`，没有检出的 `.docx` / `.pptx` / 二进制 PDF / publish `.zip`。E2E 另覆盖单 HTML / web zip / PPTX 对话框路径；Slide 上 DOCX 正确禁用。不得把内存导出字节写成已交付文件。
- unresolved issues:
  - `addCourseRuntimeLayer` 不存在；V9 开发页无假创建按钮（owner T05/T09A）
  - 全局层非拖放上/下移仍拒绝；`reorderCourseLayers` 仍走 Slide-only API；Slide 命令层仍可能抛「全局层暂不能调整顺序」（owner T06/T05）
  - 纯 Slide 紧凑左栏缺可见「共享内容 → 全局层（全课）」文案（owner T10）
  - Flow cut/paste、全局 paste、组件替换、声音导入播放、八向手柄、IME、关窗三按钮人工全流程无实机勾选
  - 参考图未像素对齐；EX-11 受阻
- outcome status: engineering candidate
```

Gate 修复：`courseWorkspaceShowsSceneStateStrip` — Flow/Spatial 不再渲染 `SceneStateStrip`（避免回落到 V8 legacy 适配器）。Slide 与 unavailable 仍显示。

不得称 `art candidate`（清单多项未执行/受阻，无完整互动录像）。不得称 `accepted`（无教师确认）。已知 V8 表面缺口仍在，不得带限制发布。
