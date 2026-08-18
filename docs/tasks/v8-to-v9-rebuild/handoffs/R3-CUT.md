HANDOFF
- task: R3-CUT
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 已把默认工程真相一次性切为 Course Project V9。新建/打开/保存/另存/恢复/试运行默认写 V9；V8 zip 只走显式导入并展示中文迁移报告，不进 `openProjectArchive`、不静默转换。生产入口不再注入 `VITE_V9_CANDIDATE_SMOKE`。UI 仍是成熟 V8 `App`。未建 CourseStudio，未加用户可见「旧版/新版」菜单或 `?editor-backend=`。未开始 R4-A / R5-A。未 commit。本阶段 execution 为 `engineering candidate for this stage`。不是 art/accepted，不宣称 Flow/Spatial 已可用。
- owned files changed (product worktree):
  - `src/renderer/App.tsx`（默认打开 `openDefaultCourseProjectAsync`；保存 `saveCourseProjectDocumentAsync`；V8 待导入对话框；试运行先调用 `buildPublishedCourseV2Payload`）
  - `src/renderer/store/editorStore.ts`（默认 `createBlankCourseProject` + `v9-slide-candidate`；禁止双写 V8 `commit`；组件导入/插入、删除选择、切场景提交文字、状态内排序/复制走 V9 命令）
  - `src/renderer/project/createCourseProject.ts`（新建：空白 Course Project V9）
  - `src/renderer/project/courseProjectIo.ts`（默认打开/保存分流；V8 只返回 pending import）
  - `src/renderer/main.tsx`（相对基线无 diff：生产入口不 import smoke inject）
  - `tests/unit/editorStore.test.ts`、`tests/unit/projectPersistence.test.ts`
  计划侧：本 HANDOFF。未改账本（协调者改）。
- donor files/functions consulted:
  - `05_R3` §9、`01_SHARED_EXECUTION_CONTRACT.md`、`handoffs/R3-G.md` / `R3-GATE.md` / `R3-Z.md` / `R3-SMOKE.md` / `R1-B.md` / `R0-D.md`
  - 账本 `R1B-R7A-01`
  - R1-B `detectCourseProjectArchiveFormat` / `openCourseProjectArchive` / `createCourseProjectArchive` / `importProjectV8ArchiveAsCourseProject`
  - R1-C `buildPublishedCourseV2Payload`
  - 已有 `createSlideCandidateBackend` / `injectV9SlideCandidateBackend`（仅 Vitest）
- donor 舍弃部分:
  - CourseStudio / `?editor-backend=` / 用户可见 backend 切换菜单
  - 把 `VITE_V9_CANDIDATE_SMOKE` 做成默认启动
  - 默认打开走 `openProjectArchive` 或静默 V8→V9
  - 双写 V8 `project` + V9 document 作为保存真相
  - R4-A / R5-A 实现
- focused validation command:
  ```
  npx vitest run tests/unit/editorStore.test.ts tests/unit/projectPersistence.test.ts
  git diff --check -- src/renderer/main.tsx src/renderer/App.tsx src/renderer/store/editorStore.ts src/renderer/project src/main src/preload
  ```
- validation result: Vitest 2 files / 69 tests passed，4.14s。`git diff --check` 无输出、exit 0（新文件 `createCourseProject.ts` / `courseProjectIo.ts` 先 `git add -N` 再 check，随后 `git reset`，仍为 untracked）。
- validation entry / fixture / backend:
  - entry: 产品 `src/renderer/main.tsx` → 成熟 V8 `App`；store `createNewProject` / App 打开保存
  - fixture: 内存新建 V9；V8 zip `createProjectArchive(createProject())`；Electron 临时 `cutover-roundtrip.h5lesson`
  - backend: 默认 `selectSlideBackendKind === 'v9-slide-candidate'`；派生 `state.project.schemaVersion` 仍为 8 仅供 V8 表面读取，不是保存真相
- validation proves / does not prove:
  - proves: 默认新建 `schemaVersion` 9；保存 zip 可被 `openCourseProjectArchive` 打开；打开 V8 zip 探测为 `v8` 且 `openCourseProjectArchive` 拒绝、`openDefaultCourseProject` 返回 pending 显式导入；AppData 仍是 `ittoedu-courseware-editor-v8-rebuild`；无 smoke env 的真实窗口默认已是 V9 有效图层，保存为 schema 9，重开文字仍在，试运行进入 `workspace--run`
  - does not prove: 未跑 typecheck / 全量 test / `build:desktop` / E2E / 视觉回归；Player iframe 仍消费派生 V8 HTML（已调用 V2 producer，但 Player 尚未改读 V2 payload）；未证明 Flow/Spatial 作者界面
- narrow UI smoke, if authorized: **做成。** 未设 `VITE_V9_CANDIDATE_SMOKE`。`npm run build:electron` 后 Vite 无该变量，Playwright `_electron.launch` 进入真实 Electron。证据在产品 worktree `output/r3-cutover-smoke/`（gitignore）。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R3-CUT
  - target stage integrator: 协调者（账本）
  - target hotspot file: artifacts/INTEGRATION_LEDGER.md
  - exported symbol / callback: openDefaultCourseProject / saveCourseProjectDocument / App ingestOpenedCourseBytes
  - required user-visible behavior: 默认打开/保存已是 V9；V8 只显式导入
  - focused test proving lane side: tests/unit/editorStore.test.ts default Course Project V9 persistence
  - exact wiring requested: 将 R1B-R7A-01 标为 implemented（CUT 已消费打开/保存分流，不要再留给 R7 导致默认仍写 V8）
  - risk if omitted: 账本仍写「默认仍走 V8」，与产品事实不一致
  - status: implemented
  ```
- DECISION_REQUESTS: 无。建议协调者：CUT 成功后 R4-A 与 R5-A `READY`（设计已 freeze）。不要由本任务开始 R4/R5。
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 试运行 HTML 仍由 `projectCandidatePreviewDocument` → `buildStandaloneHtml` 投影；`buildPublishedCourseV2Payload` 已被调用，但当前 Player 不消费 V2
  - 一次会话的 `state.project` 仍是只读 V8 投影给 TopToolbar/Phaser；保存/打开不持久化该投影
  - 公式/形状插入已接到 V9 `addSlideFormulaLayer` / `addSlideShapeLayer`；未在本次窗口冒烟覆盖
- rollback point: CUT 前默认真相是 V8 `createNewProject` / `openProjectArchive` / `saveProject`，`selectSlideBackendKind` 为 `v8`。回退：还原 `App.tsx`、`editorStore.ts`，删除 `createCourseProject.ts` 与 `courseProjectIo.ts`，还原两个测试文件。基线仍为 `f272756`。AppData 名称不要改回共享目录。
- execution state: engineering candidate for this stage
- integration state: pending（产品已切默认 V9；账本 R1B-R7A-01 与 R4/R5 READY 由协调者改）
- quality state: unverified（窗口纵切足够升本阶段 engineering candidate；不是 art/accepted）

## 可回退点（CUT 前）

| 入口 | CUT 前 | CUT 后 |
|---|---|---|
| 新建 | V8 `createProject` / `{ kind: 'v8' }` | `createBlankCourseProject` + `v9-slide-candidate` |
| 打开 | `openProjectArchive` | `detectCourseProjectArchiveFormat` → V9 `openCourseProjectArchive`；V8 pending 显式导入 |
| 保存 | `saveProject` V8 zip | `createCourseProjectArchive` / sidecar |
| 试运行 | `buildPublishedLesson` V8 producer | 调用 `buildPublishedCourseV2Payload`，iframe 暂仍用派生 HTML |
| smoke env | R3-SMOKE 可从 `main.tsx` 注入 candidate | 生产入口零调用；helper 文件可留作测试 |

## 冒烟步骤与截图

目录：`C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild\output\r3-cutover-smoke\`

未设 `VITE_V9_CANDIDATE_SMOKE`。Vite 编译期无该变量。

| 步 | 结果 | 证据 |
|---|---|---|
| 1 默认新建 | 通过。desktopAPI frozen；图层标题「有效图层」 | `01-default-v9-shell.png`、`evidence.json` |
| 2 编辑文字 | 通过。属性「文字内容」= `CUT切转保存文字` | `02-edited-text.png` |
| 3 保存 | 通过。zip `project.json` `schemaVersion` 9 | `03-saved.png`、`cutover-roundtrip.h5lesson` |
| 4 关闭/重开同一文件 | 通过。新建后再打开；文字仍在，已选文本 | `04-reopened.png` |
| 5 试运行 | 通过。`workspace--run` | `05-preview-run.png` |

## 给协调者

- **建议把 R1B-R7A-01 标 `implemented`。** CUT 已消费打开/保存分流。
- **建议 R4-A 与 R5-A `READY`。** 设计已 freeze；本执行者不开始。
- 本阶段 execution：`engineering candidate for this stage`。不要标 art/accepted，也不要宣称「V9 编辑器已全部完成」或「Flow/Spatial 已可用」。
