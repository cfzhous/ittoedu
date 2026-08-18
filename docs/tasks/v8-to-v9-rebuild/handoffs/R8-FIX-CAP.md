HANDOFF
- task: R8-FIX-CAP
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 关闭 `R8C-CAP-01`。先复现 `npm run check:ai-capabilities` 因 `generation-evidence.json` 过期失败；再只跑 `npm run generate:ai-capabilities`。磁盘上其余 8 个能力 JSON 字节未变；溯源证据仅更新 `src/renderer/project/projectArchive.ts` 的输入哈希。复跑 check 绿。未改 `src/`、`tests/`、`package.json`。未 commit。未领取 R8-E。未宣称 art/accepted 或项目级 engineering candidate。
- owned files changed:
  - 产品 worktree：`artifacts/ai-capabilities/generation-evidence.json`（1 行 canonical JSON；`git diff --stat` = 1 file, 1 insertion, 1 deletion）
  - 其余 `artifacts/ai-capabilities/*`：命令重写了 9 个文件，但 8 个能力 JSON 的 SHA-256 与生成前相同
  - 计划侧：本 HANDOFF
- donor files/functions consulted:
  - `scripts/generate-ai-capabilities.ts`：`checkAiCapabilityArtifacts` / `writeAiCapabilityArtifacts` / `generateAiCapabilityArtifacts`
  - `handoffs/R8-C.md`、`handoffs/R8-C-TRIAGE.md`（`R8C-CAP-01`）
  - `10_R8_FINAL_FULL_GATE.md` §11.4
- focused validation command:
  ```
  npm run generate:ai-capabilities
  npm run check:ai-capabilities
  npx vitest run tests/unit/aiCapabilities.test.ts
  git diff --check -- artifacts/ai-capabilities/generation-evidence.json
  ```
  工作目录：产品 worktree。Windows PowerShell。未合并成 `npm run verify`。
- validation result:

  ### 开始前环境（产品 worktree）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `git status --short`（owned） | 生成前 `artifacts/ai-capabilities/` 无 dirty；工作树含其他 lane 未提交改动（含 `M src/renderer/project/projectArchive.ts`） |

  ### 复现

  | # | 命令 | 结果 |
  |---|---|---|
  | 0 | `npm run check:ai-capabilities`（生成前） | 失败：`来源溯源证据过期 generation-evidence.json` |

  ### 生成后

  | # | 命令 | exit | 结果 |
  |---|---|---|---|
  | 1 | `npm run generate:ai-capabilities` | 0 | `已生成 9 个 AI 能力文件；索引 6859 / 16384 字节，组件目录 available。` |
  | 2 | `npm run check:ai-capabilities` | 0 | `AI 能力清单已是最新状态；索引 6859 / 16384 字节，组件目录 available。` |
  | 3 | `npx vitest run tests/unit/aiCapabilities.test.ts` | 0 | 1 file / 10 tests passed；2.37s |
  | 4 | `git diff --check -- artifacts/ai-capabilities/generation-evidence.json` | 0 | 无输出 |

  证据唯一输入变化：`src/renderer/project/projectArchive.ts` sha256
  `414d8e96900f03d8d1656e0b9b29ab514a30e7b48929ccbcae8988f5141d343a`
  → `72321f1421e6b9c5238734c9e0b265fe12e6d5af9240511505cab1bd3fb9ad26`。
  能力输出哈希未变（`index.json` 仍 `a458dad251b45df047494e115a50175b6ff601781fa23369bbb714fff97062b4`）。该 `projectArchive.ts` 改动属于其他 lane，本任务只刷新溯源证据，未改其源码。

- validation entry / fixture / backend:
  - entry: `scripts/generate-ai-capabilities.ts`（CLI `--check` → `checkAiCapabilityArtifacts`；生成 → `writeAiCapabilityArtifacts`）；可选单测 `tests/unit/aiCapabilities.test.ts`
  - fixture: 产品 worktree 当前脏树（HEAD `f272756` + 未提交 R6–R8）；内置组件目录 `available`
  - backend: 能力清单仍记录 Project Schema 8 / Runtime 2 / Component 4（生成器常量，不是 Course Project V9 工程真相）
- validation proves / does not prove:
  - proves: 磁盘能力 JSON 与内存生成一致；`generation-evidence.json` 不再过期；`check:ai-capabilities` 在当前工作树绿；生成器单测 10 项绿；本任务 diff 无 whitespace 错误
  - does_not_prove: typecheck、全量 Vitest、`build`/`build:desktop`、E2E、三视口、17 项体验、教师验收、Agent Kit 运行时消费、`projectArchive.ts` 内容是否正确
- narrow UI smoke, if authorized: 未授权，未做。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-CAP
  - target stage integrator: coordinator / R8-C-RECHECK
  - target hotspot file: n/a（生成物，非壳层热点）
  - exported symbol / callback: n/a
  - required user-visible behavior: 无教师可见行为。`npm run check:ai-capabilities` 必须继续绿。
  - focused test proving lane side: `npm run check:ai-capabilities` exit 0；`npx vitest run tests/unit/aiCapabilities.test.ts` 10 passed
  - exact wiring requested: 将 `R8C-CAP-01` 标 `implemented`。检查命令已绿，coordinator 可标 `verified`。不要改 `src/` 再“修”本项。
  - risk if omitted: 方式 A `verify` 第一环仍被记为 open，尽管生成物已与内存一致
  - status: implemented
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck`（R8-C / R8-FIX-FLOW-TSC 等）
  - 未跑全量 `npm test`（R8-D）
  - 未跑 `npm run build` / `build:desktop`（R8-E，未领取）
  - 未跑 `npm run test:e2e`（R8-F）
  - 未跑三视口视觉（R8-G）、17 项体验（R8-H）、完整 `npm run verify`
  - 未启动 Electron
  - 其他 lane 继续改被证据追踪的源文件时，`generation-evidence.json` 可能再次过期；能力 JSON 字节是否仍一致需再跑 check
- rollback point: 还原产品 worktree `artifacts/ai-capabilities/generation-evidence.json`。HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。未 commit。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`；未领取 R8-E。
