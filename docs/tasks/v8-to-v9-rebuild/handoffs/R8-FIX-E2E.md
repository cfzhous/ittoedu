HANDOFF
- task: R8-FIX-E2E
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 只改两个现有 e2e spec，把 R8-F 的两条原失败跟到当前 V9 表面。图层仍露出默认教师控制器（4 组件 + 1 控制器）；删除只点组件节点。Slide 试运行断言 `course-try-run-host` CoursePlayer，不再等 blob iframe。流程 9 recovery 改为 Course Project V9。目录 UI 同文件后半段（V8 显式导入、课树 testid、整课预览 overlay、PPTX 占位、导出 HTML `#course-root`）一并跟切，否则 `-g "目录 UI"` 过不了原失败点之后的当前 DOM。未改产品源码，未改默认 backend，未 skip，未新建 §5 spec，未 commit，未领取 R8-G。两条原失败对应命令均绿 → `lane_candidate`。不是 art/accepted。
- owned files changed (product worktree):
  - `tests/e2e/componentCatalogMatrix.spec.ts`
  - `tests/e2e/editor.spec.ts`
  计划侧：本 HANDOFF；`00_INDEX.md` 本行；`artifacts/FINAL_GATE_REPORT.md` 的 `R8F-LAYER-01` / `R8F-TRYRUN-01` 标 implemented。
  **未改**：`src/renderer/store/editorStore.ts`、`src/renderer/ui/Workspace.tsx`、`src/renderer/ui/ScenePanel.tsx`、`src/renderer/App.tsx`（工作树上这四份仍是其他 lane 的既有 diff）。
- donor files/functions consulted:
  - [`handoffs/R8-F.md`](R8-F.md) 两条失败与只读定位
  - `src/renderer/ui/NodesTab.tsx` `.node-item` / `teacher-controller` 图标 title
  - `src/renderer/ui/Workspace.tsx` `data-testid="course-try-run-host"` / `data-course-player-ready` / 试运行翻页 chrome
  - `src/renderer/ui/coursePlayerTryRun.ts`、`src/player/surfaces/slide/SlidePublishedAdapter.ts`
  - `src/shared/courseProjectSchema.ts` `courseProjectDocumentSchema`；`COURSE_PROJECT_SCHEMA_VERSION = 9`
  - `src/renderer/ui/AddCourseContentMenu.tsx` `data-testid="add-content-primary"`（`add-scene` 只是 alias）
  - `src/renderer/App.tsx` V8 显式导入对话框；整课预览 `course-preview-host`
  - `src/renderer/export/course/buildCoursePackages.ts` `#course-root` standalone HTML
- donor 舍弃部分:
  - 把教师控制器从图层藏掉，或改 NodesTab / editorStore 投影凑 4
  - 把 Workspace 试运行退回 blob iframe / generation key
  - 把 recovery / 默认保存写回 V8
  - 为绿 skip 或新建 §5 spec
  - 改 `editorStore.ts` / `Workspace.tsx` / `ScenePanel.tsx` / `App.tsx`
- focused validation command:
  ```
  npx playwright test tests/e2e/componentCatalogMatrix.spec.ts -g "目录 UI"
  npx playwright test tests/e2e/editor.spec.ts -g "简洁模式完成文字|CoursePlayer 宿主|流程 9"
  git diff --check -- tests/e2e/componentCatalogMatrix.spec.ts tests/e2e/editor.spec.ts
  ```
  工作目录：产品 worktree。Windows PowerShell。未跑 pretest（沿用 R8-F 的 `dist-*`，只改 spec）。未抢 `:5174`（仍为 PID 19432）。`--user-data-dir` 用 spec 已有临时 profile。未跑全量 `test:e2e` / `verify` / typecheck / `npm test` / `build:desktop`。
- validation result: Playwright 1.61.1。**目录 UI 1 passed（3.0m）**。**editor 定向 3 passed（1.5m）**：简洁模式试运行、CoursePlayer 宿主、流程 9。`git diff --check` 无输出、exit 0。Electron 槽已释放。
- validation entry / fixture / backend:
  - entry: Electron 编辑器（spec `launchEditor` / catalog `launchEditor`）+ 导出 HTML 的 Chromium `#course-root`
  - fixture: 空白 Course Project V9；catalog 四组件库加入；V8 矩阵 `.h5lesson` 经「导入为当前课程工程」
  - backend: 默认 `v9-slide-candidate`；试运行 CoursePlayer / Published Course V2；未切回 V8
- validation proves / does not prove:
  - proves: 加入 4 组件后图层 = 4 组件 + 1 可见控制器，删除点的是组件；简洁模式试运行 CoursePlayer 宿主可见且翻页钮可点；无 `iframe[title="当前位置试运行"]`；两场景试运行 previous/next 改变 `data-location-id`；流程 9 recovery `schemaVersion === 9` 且恢复后图层含控制器+文字；目录 UI 从图层计数跑到导出
  - does not prove: 全量 `npm run test:e2e`（留给 R8-F-RECHECK）；`editor.spec` 其余 serial 条（仍有 `.node-item` 不计控制器、`add-scene` testid、整课预览等独立窗口）；画布组件文字 overlay（Phaser canvas 仍拦截 pointer，本任务改走属性面板）；Flow/Spatial/Mixed §5 新 spec
- narrow UI smoke, if authorized: 未授权手工窗口。本任务只跑上列定向 Playwright。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-E2E
  - target stage integrator: 协调者（账本 / R8-F-RECHECK）
  - target hotspot file: artifacts/FINAL_GATE_REPORT.md 行 R8F-LAYER-01、R8F-TRYRUN-01
  - exported symbol / callback: n/a（仅 spec 跟切）
  - required user-visible behavior: 无产品表面变化；教师控制器仍在图层
  - focused test proving lane side: catalog「目录 UI」1 绿；editor「简洁模式完成文字」+「CoursePlayer 宿主」+「流程 9」3 绿
  - exact wiring requested: 将 R8F-LAYER-01 / R8F-TRYRUN-01 标为 implemented；全量 e2e 由 R8-F-RECHECK 关闭为 verified。不要领取 R8-G。
  - risk if omitted: 协调者仍按 iframe/图层 4 分类这两条
  - status: implemented
  ```
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：全量 `npm run test:e2e`、`typecheck`、`npm test`、`build:desktop`、三视口、17 项体验、`verify`
  - `editor.spec.ts` 未跑到的条仍可能红：`.node-item` 未加控制器、`getByTestId('add-scene')`、`waitForEvent('window')` 整课预览、流程 8B 虽已改保存断言但本轮未执行
  - catalog 夹具 `schemaVersion: 8` 仍是 pretest 生成的 V8 矩阵物，不是默认保存
  - 画布 `.canvas-authoring-target` 被 `canvas-stage` canvas 挡住；目录 UI 改为属性面板改组件文字
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。回退本 lane：还原上列 2 个 spec。未改产品源码。
- execution state: `lane_candidate`
- integration state: `pending`（定向 e2e 绿；全量 e2e 待 R8-F-RECHECK）
- quality state: `unverified`
