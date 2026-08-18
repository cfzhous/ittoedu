HANDOFF
- task: R8-FIX-SIMPLE-FADE
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: V9 `setSimpleEntranceAnimation` 不再在点「淡入」时自动 `requestNodeMotionPreview`。与 V8 一样，只在「预览」按钮播放。消除 RECHECK-8/11 的竞态：自动预览把 motion alpha 打到 0，e2e 再采 “stable” 得到 Expected `< 0`。未放宽 `:886`。未 skip。未改 editor.spec。定向「简洁模式」**1 passed（33.7s）**。未 commit。未领取 R8-G。不要把 `R8F-IMAGE-ASPECT-01` 标 verified。定向绿 → `lane_candidate`。不是 art/accepted。不是项目级 engineering candidate。
- owned files changed (product worktree):
  - `src/renderer/store/editorStore.ts`（V9 写入出现动画后不再自动预览；去掉未用 import）
  - `tests/unit/v9SlideProductIntegration.test.tsx`（断言：设动画不发 bus；点「预览」才发 `node.enter`）
  计划侧：本 HANDOFF；`00_INDEX.md` 本行；账本 `R8F-SIMPLE-FADE-01` → implemented。
- donor files/functions consulted:
  - [`handoffs/R8-F-RECHECK-11.md`](R8-F-RECHECK-11.md) `:886` Expected `< 0` Received `1`
  - V8 `setSimpleEntranceAnimation` 非 candidate 分支：只写规则，不自动预览
  - `SimpleEntranceAnimationEditor`「预览」→ `requestNodeMotionPreview`
- donor 舍弃部分:
  - skip / 放宽 timeout / `toBeLessThan`
  - 回滚 IMAGE-ASPECT / PRESENTER-HTML / CATALOG-PPTX / EXPORT
- focused validation command:
  ```
  npx vitest run tests/unit/v9SlideProductIntegration.test.tsx tests/unit/simpleEditorMode.test.tsx
  npm run build:renderer
  npx playwright test tests/e2e/editor.spec.ts -g "简洁模式"
  git diff --check -- src/renderer/store/editorStore.ts tests/unit/v9SlideProductIntegration.test.tsx
  ```
  工作目录：产品 worktree。Windows PowerShell。`VITE_DEV_SERVER_URL` unset。未跑全量 e2e / `verify` / typecheck / `build:desktop`。
- validation result:

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | 上列 Vitest | 0 | product integration 5 passed；simpleEditorMode 含在 11 passed 批次 |
  | 2 | `npm run build:renderer` | 0 | vite 2.94s |
  | 3 | Playwright `-g "简洁模式"` | 0 | **1 passed（33.7s）**；原 `:886` 已过 |
  | 4 | `git diff --check` | 0 | 无输出 |

  Electron 槽已释放。
- validation entry / fixture / backend:
  - entry: 简洁模式点「淡入」只写规则；点「预览」才播淡入
  - backend: Course Project V9 candidate
- validation proves / does not prove:
  - proves: 点「预览」后 2s 内文字 motion alpha 会降到 stable 的 90% 以下；试运行 CoursePlayer 仍过
  - does not prove: 全量 `npm run test:e2e`；图片导入全量（勿标 IMAGE-ASPECT verified）
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-SIMPLE-FADE
  - target stage integrator: 协调者（账本 / 下一轮 R8-F-RECHECK）
  - id: R8F-SIMPLE-FADE-01
  - target hotspot file: artifacts/FINAL_GATE_REPORT.md 行 R8F-SIMPLE-FADE-01
  - exported symbol / callback: editorStore.setSimpleEntranceAnimation
  - required user-visible behavior: 选淡入不自动播；预览按钮才播
  - focused test proving lane side: editor.spec「简洁模式」1 绿（33.7s）
  - exact wiring requested: 标 implemented；全量由 R8-F-RECHECK-12 关闭。不要领取 R8-G。不要把 R8F-IMAGE-ASPECT-01 标 verified。
  - status: implemented
  ```
- DECISION_REQUESTS: 无。
- remaining risks: 未跑全量 e2e。serial 其后仍含图片导入与流程 6–9。
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。回退本 lane：还原 `editorStore.ts` 自动预览与该单测。不要回滚 IMAGE-ASPECT。
- execution state: `lane_candidate`
- integration state: `pending`
- quality state: `unverified`

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`；未领取 R8-G。
