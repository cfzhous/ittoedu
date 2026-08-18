HANDOFF
- task: R1-D
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 对比 `f272756` 与 `4755034` 后，Runtime API 2 / Component API 4 协议缺口不存在；API 3 surface/viewport 上下文已由 R1-A `surfaceRuntimeTypes.ts`（`SURFACE_RUNTIME_API_VERSION = 3`）提供，与供体 blob 相同。未改 `runtimeTypes` / `runtimeSchema` / `componentTypes` / `componentSchema` / `RuntimeHost`，未新建 `SurfaceRuntimeAuthoring.ts`，未改 UI Tab / App / store。只在已有两份定向测试中证明 API 3 可 import，并断言版本、关键字段与 `makeAuthoringAddress` 不含 hitId。本 lane 为 `lane_candidate`；未宣称 art/accepted。未 commit。
- owned files changed (product worktree):
  - `tests/unit/runtimeHostV2.test.ts`（补 API 3 import / 字段 / authoringAddress 断言）
  - `tests/unit/componentProtocolV4.test.ts`（补 variant+preset 合同、`emit` 类型、component `makeAuthoringAddress` 不含 hitId）
  计划侧：本 HANDOFF。生产协议文件零 diff。
- donor files/functions consulted:
  - `git diff f272756 4755034 -- src/shared/runtimeTypes.ts src/shared/runtimeSchema.ts src/shared/componentTypes.ts src/shared/componentSchema.ts src/player/RuntimeHost.ts src/player/SurfaceRuntimeAuthoring.ts tests/unit/runtimeHostV2.test.ts`
  - `git show 4755034:src/shared/surfaceRuntimeTypes.ts`（与 R1-A 产品文件相同）
  - `git show 4755034:src/player/SurfaceRuntimeAuthoring.ts`（DOM hit bridge，非本任务所需纯类型边界）
  - `git show 4755034:tests/unit/surfaceRuntimeV1.test.ts`（依赖 `SurfaceRuntimeRegistry` / Published host，未迁入）
  - 产品基线：`src/shared/runtimeTypes.ts`（`RuntimeApiVersion = 2`）、`runtimeSchema.ts`、`componentTypes.ts`（`ComponentSchemaVersion = 4`）、`componentSchema.ts`、`src/player/RuntimeHost.ts`、`src/renderer/components/importComponentPackage.ts`
- donor 舍弃部分:
  - `runtimeTypes.ts` 把 `RuntimeHostActions` / `RuntimePresentationApi` 改成 `boolean | PromiseLike<boolean>`（交互引擎异步，不是 API 3 表面合同，会改写 API 2 同步端口）
  - `componentTypes.ts` 的 `ComponentEditableAssetRegion` / `ComponentAuthoringAssetTarget` / `exportAuthoringCheckpoint`（后期 host 扩展，不是 API 4 package/props/variant/preset/nested content/事件的回退缺口）
  - `RuntimeHost.invalidateAuthoringTargets()`（便利方法，非协议缺口）
  - 整文件 `SurfaceRuntimeAuthoring.ts` DOM 命中桥（225 行，依赖 Player surface host；R1-D 类型已可表达，R7-E 再接线）
  - 供体 `runtimeHostV2.test.ts` 增补的 emit 路由 / 资源读取用例（基线 RuntimeHost 已实现；本任务不改 host，不为改而改）
  - `src/renderer/components/ComponentRegistry.ts` / `executeComponentRuntime.ts` 删除（CourseStudio 路径，禁止）
  - `tests/unit/surfaceRuntimeV1.test.ts`（第三测试文件，且依赖未授权 Player registry）
  - CourseStudio 动态编辑器、第二套 registry / adapter framework
- focused validation command:
  ```
  npx vitest run tests/unit/runtimeHostV2.test.ts tests/unit/componentProtocolV4.test.ts
  git diff --check -- src/shared/runtimeTypes.ts src/shared/runtimeSchema.ts src/shared/componentTypes.ts src/shared/componentSchema.ts src/player/RuntimeHost.ts src/player/SurfaceRuntimeAuthoring.ts tests/unit/runtimeHostV2.test.ts tests/unit/componentProtocolV4.test.ts
  ```
- validation result: Vitest 2 files / 18 tests passed，1.26s。`git diff --check` 无输出、exit 0。
- validation entry / fixture / backend:
  - entry: `RuntimeHost`（API 2 mount）；`SURFACE_RUNTIME_API_VERSION` / `SurfaceRuntimeCreateContext` / `SurfaceRuntimeDefinition`；`componentManifestSchema` / `mergeComponentProps` / `findComponentVariant` / `resolveComponentPresetProps` / `ComponentCreateContextV4.emit`；`makeAuthoringAddress`
  - fixture: 既有 RuntimeHost DOM/phaser/hybrid 源码夹具；既有 V4 manifest，补 `variants.dense` + preset `variantId`；测试内构造 runtime/component authoringAddress
  - backend: 默认产品仍为 V8 `ProjectDocument` / V8 `App`；API 3 仅为可 import 的纯类型合同
- validation proves / does not prove:
  - proves: API 2 RuntimeHost 既有合同仍绿；`RuntimeDocument.runtimeApiVersion` 仍为 2；API 3 可从产品 worktree `surfaceRuntimeTypes` import；`SURFACE_RUNTIME_API_VERSION === 3`；`SurfaceRuntimeCreateContext` 含 mode/width/height/dom/content/assets/authoring；API 4 schema 仍拒绝 1/2/3；package props / nested content / variant / preset / `emit` 合同仍成立；runtime 与 component 的 `makeAuthoringAddress` 稳定且不含 hitId；V8 `importComponentPackage` 仍读同一 `componentManifestSchema`（本任务未改该路径）
  - does not prove: 未接真实 Workspace / ComponentsTab / DeveloperTab / Player SurfaceHost；未执行 Surface Runtime 源码 `define`；未跑 package zip 导入 E2E；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS: 无。若 R7-E 需要 DOM 命中桥，再独占迁入 `src/player/SurfaceRuntimeAuthoring.ts`；不要改本任务未动的 RuntimeHost API 2 同步端口。
- DECISION_REQUESTS: 无
- remaining risks / untested full checks: 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）。供体后来的 component asset-target 与 RuntimeHost PromiseLike 端口未纳入本 lane；若后续阶段需要，应另开任务，不能当作 R1-D 已接线。
- rollback point: 还原产品 worktree 中上述两个测试文件；R0-D / R1-A 未跟踪文件保持不动；基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: n/a
- quality state: unverified

## 缺口重现结论

`git diff --stat f272756 4755034` 在本任务授权路径上只有：

| 文件 | 供体差异 | 本任务处理 |
|---|---|---|
| `runtimeTypes.ts` | host action / presentation 改为 `PromiseLike` | 舍弃（非 API 3 缺口） |
| `runtimeSchema.ts` | 无 | 无需改 |
| `componentTypes.ts` | asset region / checkpoint | 舍弃（非 API 4 回退） |
| `componentSchema.ts` | 无 | 无需改 |
| `RuntimeHost.ts` | `invalidateAuthoringTargets` | 舍弃 |
| `SurfaceRuntimeAuthoring.ts` | 新增 225 行 DOM bridge | 不建；类型已在 R1-A |
| `surfaceRuntimeTypes.ts` | 供体新增；R1-A 已建且与 `4755034` 相同 | 只 import |
| `runtimeHostV2.test.ts` | 供体多了 emit/资产用例 | 不抄；改补 API 3 断言 |

基线已是 Runtime API 2 + Component API 4；包读取入口仍是 `src/renderer/components/importComponentPackage.ts` → `componentManifestSchema`。API 3 所需 surface/viewport 上下文字段（`mode`、`width`/`height`、`dom.root`、`content`、`assets`、`authoring`）已在 R1-A 类型中可表达，因此生产协议文件零改动。
