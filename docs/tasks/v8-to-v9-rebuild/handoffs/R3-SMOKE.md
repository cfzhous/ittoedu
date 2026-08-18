HANDOFF
- task: R3-SMOKE
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 用 Vite 编译期变量 `VITE_V9_CANDIDATE_SMOKE=1` 在专用 Electron 会话注入已有 R3-Z candidate（三 location、global 横幅+教师控制器、空媒体库）。真实窗口纵切已做成：desktopAPI 桌面壳、逐 location 显隐且课程顺序不变、owner 内图层拖排、MediaTab 导入图片+声音并加入画布、控制器西向 resize 与快速拖动选框跟手、当前位置试运行。产品工具栏保存仍是 V8 `projectArchive`（对话框已取消，未写成 V9 zip）。无该 env 的对照会话仍是默认 V8（单场景、图层标题不是「有效图层」）。未加菜单/顶栏开关/`?editor-backend=`/CourseStudio。未 commit。未开始 R3-CUT。
- owned files changed (product worktree):
  - `src/renderer/main.tsx`（仅当 `import.meta.env.VITE_V9_CANDIDATE_SMOKE === '1'` 时动态 import 并 inject；否则零调用）
  - `src/renderer/dev/v9CandidateSmokeInject.ts`（新建：夹具 + `injectV9SlideCandidateBackend(createSlideCandidateBackend(openSlideAuthoringSession(fixture)))`）
  - `src/renderer/vite-env.d.ts`（只增加 `VITE_V9_CANDIDATE_SMOKE?: string`）
  计划侧：本 HANDOFF。未改账本（协调者改）。截图在产品 worktree `output/r3-candidate-smoke/`（gitignore，不要提交二进制）。
- donor files/functions consulted:
  - `handoffs/R3-Z.md` / `R3-GATE.md` / `R2-Z.md`、`01_SHARED_EXECUTION_CONTRACT.md`、`05_R3` §7.3
  - `tests/unit/v9GlobalLayerUiAdapter.test.tsx` 夹具形状
  - `injectV9SlideCandidateBackend` / `createSlideCandidateBackend` / `openSlideAuthoringSession`
- donor 舍弃部分:
  - CourseStudio / `?editor-backend=` / 用户可见 V8/V9 切换
  - 把 inject 绑到教师可点控件
  - 默认 `npm run dev` / `npm run start` 改成 V9
  - R3-CUT / R3-G
- focused validation command:
  ```
  git diff --check -- src/renderer/main.tsx src/renderer/dev/v9CandidateSmokeInject.ts src/renderer/vite-env.d.ts
  ```
  真实窗口冒烟：`npm run build:electron` 后，`cross-env VITE_V9_CANDIDATE_SMOKE=1` 启动 Vite，Playwright `_electron.launch` 带 `--remote-debugging-port` 进入可见 Electron 窗口（不是浏览器开 5173）。
- validation result: `git diff --check` 无输出、exit 0。Electron 冒烟步骤见下；对照会话无 smoke env 仍为 V8。
- validation entry / fixture / backend:
  - entry: 产品 `src/renderer/main.tsx` → 成熟 V8 `App`；仅 smoke 编译注入 `injectV9SlideCandidateBackend`
  - fixture: 与 R3-Z 测试同形的内存 V9 Slide（location-scene-1/2/3、global-banner、teacher-controller-main、空 `assets`）
  - backend: smoke 会话 `{ kind: 'v9-slide-candidate' }`；默认入口仍 `{ kind: 'v8' }`
- validation proves / does not prove:
  - proves: 专用 Electron 有 frozen `desktopAPI`，无「未运行在课件编辑器桌面环境」；candidate 显示「有效图层」与三 location；横幅「当前页显示」切换后图层标注变为「仅所选页面」，场景顺序仍为 1/2/3；键盘/鼠标在 global owner 内重排控制器与横幅；MediaTab 导入 `icon.png` + `smoke-tone.wav` 并「添加到画布」；控制器 overlay 西向 resize（宽 595→643px）后快速拖动选框跟手（left/top 同步变化）；「当前位置试运行」进入 `workspace--run`；无 smoke env 时图层不是「有效图层」、只有一个 V8 `scene_*` location
  - does not prove: 产品默认保存/打开已是 V9 zip（工具栏保存仍走 V8 `saveProject`；本冒烟取消了保存对话框）；未跑 typecheck/build/E2E/视觉回归；未做 R3-G 教师走查
- narrow UI smoke, if authorized: **做成。** 为占 5173 并避免旧构建，已停止产品 worktree 里跑了数小时的 R0 `npm run dev`（那份 Electron 仍写共享 AppData `ittoedu-courseware-editor`）。新会话在 `build:electron` 之后使用 `ittoedu-courseware-editor-v8-rebuild`。MediaTab 文件选择在 main 进程按 e2e 方式 mock `dialog.showOpenDialog` 返回真实文件路径；教师点击的是 MediaTab「导入图片/导入声音/添加到画布」，不是第二套 UI。
- INTEGRATION_REQUESTS: 无新请求。建议协调者把 R3-Z 的 8 条（及仍 `integrated` 的 R2 六条，若冒烟覆盖范围内）从 `integrated` 升 `verified`。
- DECISION_REQUESTS: 无。不要由本任务开始 R3-CUT。
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 产品默认新建/打开/保存仍是 V8；candidate zip 仍只有 `exportV9SlideCandidateArchive`（测试已有 round-trip）。不要假装默认保存已是 V9
  - candidate 会话里顶栏仍读 V8 `state.project`（标题「未命名课件」、`场景 1 / 1`），左侧场景列表才是 V9 locations
  - 计划中的 R3-G 教师确认仍未做；原子切换默认 backend 仍应以 R3-G 为准
  - 公式/形状插入在 candidate 下仍可能走 V8 `commit`（R2-Z/R3-Z 已知缺口）
- rollback point: 还原 `src/renderer/main.tsx`、删除 `src/renderer/dev/v9CandidateSmokeInject.ts`、还原 `src/renderer/vite-env.d.ts` 中的 env 类型。R3-Z 热点保持不动。基线仍为 `f272756`。
- execution state: engineering candidate for this stage
- integration state: pending（冒烟已做成；账本 verified / R3-CUT 由协调者改）
- quality state: unverified（窗口纵切证据足够升本阶段 engineering candidate；不是 art/accepted）

## 入口与 backend

| 会话 | 启动 | backend |
|---|---|---|
| candidate 冒烟 | `VITE_V9_CANDIDATE_SMOKE=1` 的 Vite + 新 Electron（`--remote-debugging-port`） | V9 Slide candidate（inject） |
| 默认对照 | 无该变量的 Vite + 新 Electron | V8（`createNewProject`，图层不是「有效图层」） |

没有该变量时，`main.tsx` 不 import、不调用 inject。默认 `npm run dev` / `npm run start` 源码路径仍是 V8。

## 冒烟步骤与截图

目录：`C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild\output\r3-candidate-smoke\`

| 步 | 结果 | 证据 |
|---|---|---|
| 1 桌面壳 | 通过。`desktopAPI` 存在且 frozen | `01-desktop-shell.png`、`evidence.json` |
| 2 三 location 显隐，顺序不变 | 通过。场景顺序始终 scene-1/2/3；横幅变为「仅所选页面」 | `03-location-visibility.png`、`04-owner-reorder.png`（可见「仅所选页面」） |
| 3 owner 内拖排 | 通过。键盘把 global 两项对调，鼠标再拖回 | `reorder-retry.json`、`04b-owner-reorder-retry.png` |
| 4 MediaTab 导入图+声并入画布 | 通过 | `05-media-import.png` |
| 5 控制器八向/拖动，选框跟手 | 通过。西向 resize 宽 +48px，随后 left/top 跟手 | `06-controller-overlay.png`、`evidence.json` overlay 数值 |
| 6 保存/导出再重开 | 受阻于产品入口。工具栏保存仍是 V8；对话框已 mock 取消。只能继续证明测试里的 `exportV9SlideCandidateArchive`，**不能**声称产品默认保存已是 V9 | `07-product-save.png` |
| 7 试运行 | 通过。`workspace--run` | `08-preview-run.png` |
| 默认 V8 保护 | 通过。无 smoke env：单场景 `scene_*`、无「有效图层」 | `09-default-v8.png`、`default-v8.json` |

## 给协调者

- **建议把 R3 请求升 `verified`。** 真实 Electron 窗口纵切已做成，R3-GATE 冒烟受阻可以关闭。
- **建议进入 R3-CUT 流程**（本执行者不开始 CUT）。默认产品真相此刻仍是 V8。CUT 会把默认工程真相切为 V9；计划仍列有 R3-G 教师确认，请协调者按根计划决定 G 与 CUT 的先后。
- 本阶段 execution 建议标 `engineering candidate for this stage`。不要标 art/accepted，也不要宣称「V9 编辑器可用」。
- 不要把 `VITE_V9_CANDIDATE_SMOKE` 做成教师菜单。CUT 之后应删除或继续仅限编译期/测试注入。
