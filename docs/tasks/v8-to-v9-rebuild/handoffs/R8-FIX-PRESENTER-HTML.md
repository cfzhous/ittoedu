HANDOFF
- task: R8-FIX-PRESENTER-HTML
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: Published Course V2 离线单 HTML / 网页包在 `#course-root` 会话挂载后暴露 `window.__H5_LESSON_PLAYER__` 场景索引桥、教师 escape 控件与 PageUp/PageDown。未撤回 V2 包格式，未改回 `buildStandaloneHtml`。发布 Slide 原生文字按作者 `style` 渲染（默认 42px），使两页文案像素差能过现有 `> 0.05` 阈值。流程 5 截图宿主从 Phaser `.lesson-canvas-host canvas` 改为 `.slide-published-adapter`。未放宽阈值，未 skip。首次定向因未设字号而像素差 0.010；补样式后定向 **1 passed（1.1m）**。未 commit。未领取 R8-G。定向绿 → `lane_candidate`。不是 art/accepted。不是项目级 engineering candidate。不要把 `R8F-PRESENTER-HTML-01` 标 verified（等全量 RECHECK）。
- owned files changed (product worktree):
  - `src/player/publishedCoursePresenter.ts`（新：`attachPublishedCoursePresenter`；duck-typed `getCurrentSceneIndex` / `goToScene` / `destroy`；`TeacherEscapeControls`；`PlayerPresenterInput`）
  - `src/player/index.ts`（`bootstrapPublishedCourse` 在 `session.mount` 成功后调用 `attachPublishedCoursePresenter`）
  - `src/player/surfaces/slide/SlidePublishedAdapter.ts`（`applyNativeTextStyle`：fontSize/color/family/align 等；此前 `textContent` 无样式，浏览器默认 ~16px）
  - `tests/e2e/editor.spec.ts`（仅流程 5 截图 locator → `.slide-published-adapter`；保留 `playerSceneIndex`、escape testids、`> 0.05` / `* 0.6`、键盘 `PageUp`）
  计划侧：本 HANDOFF；`00_INDEX.md` 本行；账本 `R8F-PRESENTER-HTML-01` → implemented。
- donor files/functions consulted:
  - [`handoffs/R8-F-RECHECK-9.md`](R8-F-RECHECK-9.md) `:354` / `:2266` `playerSceneIndex` 收到 `null`
  - `src/player/PlayerApp.ts` / `startAndExposePlayer`（V8 `__H5_LESSON_PLAYER__`）
  - `src/player/TeacherEscapeControls.ts`、`PlayerPresenterInput.ts`
  - 目录 UI `verifyPublishedCourseExport`（`#course-root` + adapter；不可把纯 Slide HTML 改回 V8 包）
- donor 舍弃部分:
  - 把 V9 单 HTML 切回 `buildStandaloneHtml` / `__H5_LESSON_PAYLOAD__`（会打红目录 UI HTML 校验）
  - skip / 删除 `__H5_LESSON_PLAYER__` 断言 / 放宽像素阈值
  - 回滚 CATALOG-PPTX / E2E-EXPORT / SLIDE-PREVIEW-COMP
  - 复制 donor 899 行 runtime compositor；import `SurfaceRuntimeAuthoring`
- focused validation command:
  ```
  npm run build:player
  npm run build:renderer
  npx playwright test tests/e2e/editor.spec.ts -g "流程 5"
  git diff --check -- src/player/index.ts src/player/publishedCoursePresenter.ts src/player/surfaces/slide/SlidePublishedAdapter.ts tests/e2e/editor.spec.ts
  ```
  工作目录：产品 worktree。Windows PowerShell。`VITE_DEV_SERVER_URL` unset。未跑全量 e2e / `verify` / typecheck / `build:desktop`。未另开手工 App。
- validation result:

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | `npm run build:player` | 0 | vite ~1.3s；`dist-player/player.iife.js` |
  | 2 | `npm run build:renderer` | 0 | vite ~2.5s（嵌入 player） |
  | 3 | Playwright `-g "流程 5"`（字号修复前） | 1 | 场景索引 0/1 与 escape 已过；`:2288` `nextPageDifference` 0.010 < 0.05 |
  | 4 | 同上（`applyNativeTextStyle` 后） | 0 | **1 passed（1.1m）** |
  | 5 | `git diff --check`（上列 4 路径） | 0 | 无输出 |

  Electron 槽已释放。无 `electron.exe`。`:5173` 无 LISTENING。
- validation entry / fixture / backend:
  - entry: Electron 新建两页文字 → 导出单 HTML + 网页包 → Chromium `file://`
  - fixture: 流程 5 自建两页「第一页」「第二页」，不依赖 `global-component-roundtrip.h5lesson`
  - backend: 默认 Course Project V9；导出 Published Course V2（`#course-root` + `__H5_COURSE_PAYLOAD__`）
- validation proves / does not prove:
  - proves: 离线单 HTML 与网页包可 `getCurrentSceneIndex`、escape 下一页、PageUp 回第一页；两页像素差过现有阈值；网页包无 `https?` 请求
  - does not prove: 全量 `npm run test:e2e`；媒体批量 / 流程 6–9 / 课例验收；三视口；typecheck
- narrow UI smoke, if authorized: 未授权手工窗口。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-PRESENTER-HTML
  - target stage integrator: 协调者（账本 / 下一轮 R8-F-RECHECK）
  - id: R8F-PRESENTER-HTML-01
  - target hotspot file: artifacts/FINAL_GATE_REPORT.md 行 R8F-PRESENTER-HTML-01
  - exported symbol / callback: attachPublishedCoursePresenter
  - required user-visible behavior: 离线 HTML/网页包可翻页；教师 escape 与键盘 Presenter 可用；发布页原生文字带作者字号与颜色
  - focused test proving lane side: editor.spec「流程 5」1 绿（1.1m）
  - exact wiring requested: 将 R8F-PRESENTER-HTML-01 标为 implemented；全量 e2e 由 R8-F-RECHECK-10 关闭。不要领取 R8-G。不要把本行标 verified。
  - risk if omitted: 协调者仍按 :354 null 分类这条
  - status: implemented
  ```
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑全量 e2e。serial 其后：媒体批量、图片导入、流程 6–9、课例验收
  - `pretest:e2e` 会重编 player；全量必须以 pretest 产物为准
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。回退本 lane：删除 `publishedCoursePresenter.ts`；还原 `index.ts` bootstrap 接线；还原 `SlidePublishedAdapter` 原生文字样式；还原流程 5 截图 locator。不要回滚 EXPORT / CATALOG-PPTX / SLIDE-PREVIEW-COMP。
- execution state: `lane_candidate`
- integration state: `pending`
- quality state: `unverified`

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`；未领取 R8-G。
