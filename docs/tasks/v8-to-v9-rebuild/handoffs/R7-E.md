HANDOFF
- task: R7-E
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 从产品供体窄摘 `SurfaceRuntimeAuthoringBridge`（225 行 DOM 命中桥），关闭 `R1D-R7E-01` 的模块交付侧。桥实现 API 3 `SurfaceRuntimeAuthoring` 合同：`registerText` / `registerAsset` / `invalidate` + 宿主侧 `setMode` / `destroy`；命中上报 `{ field, hitId, targetKind }`，其中 `field` 为 JSON Pointer 稳定路径（`runtime/content/values/<key>` 或 `runtime/assets/<key>/assetId`），`hitId` 仅会话级（`surface-runtime:<kind>:<n>:<encodedKey>`）。未改 RuntimeHost API 2、未改 Flow/Spatial/Slide host 内部、未改壳层、未 commit。发布 sidecar 塞进导出包属 R7-C/Z；本 lane 只证明 register/dispose 与离线可 import 的桥模块。
- owned files changed (product worktree, new):
  - `src/player/SurfaceRuntimeAuthoring.ts`
  - `tests/unit/surfaceRuntimeAuthoring.test.ts`
  计划侧：本 HANDOFF；`artifacts/INTEGRATION_LEDGER.md`（`R1D-R7E-01` → implemented）。
- donor files/functions consulted:
  - `C:\Users\74755\Documents\HTML课件编辑器\src\player\SurfaceRuntimeAuthoring.ts`（整文件窄摘 `SurfaceRuntimeAuthoringBridge`）
  - `C:\Users\74755\Documents\HTML课件编辑器\tests\unit\surfaceRuntimeEditorHost.test.ts`（命中 field/hitId、destroy 隔离意图；未整文件迁入，产品无 `CourseEditorDynamicHostRegistry`）
  - 产品只读：`src/shared/surfaceRuntimeTypes.ts`（API 3 合同）、`tests/unit/runtimeHostV2.test.ts`（API 3 import / authoringAddress 不含 hitId）
  - 供体 `publishedDynamicHosts.ts` 中 `PublishedSurfaceRuntimeHost` 接线模式（只读参考，本任务不迁入）
- donor 舍弃部分:
  - 供体 `surfaceRuntimeEditorHost.test.ts` 全链（依赖未授权 `CourseEditorDynamicHostRegistry` / Slide host mount）
  - `publishedDynamicHosts.ts` / `SurfaceRuntimeRegistry` 整文件（R7-B 组装）
  - Flow/Spatial/Workspace/ComponentsTab 接线
  - 第二套组件库/开发面板；Runtime 代替 Native 文字
  - 新 sidecar 协议字段（Published V2 / component 合同无 sidecar 字段；真正塞进导出包写 R7-C/Z INTEGRATION_REQUEST）
- focused validation command:
  ```
  npx vitest run tests/unit/surfaceRuntimeAuthoring.test.ts tests/unit/runtimeHostV2.test.ts
  git add -N src/player/SurfaceRuntimeAuthoring.ts tests/unit/surfaceRuntimeAuthoring.test.ts
  git diff --check -- src/player/SurfaceRuntimeAuthoring.ts tests/unit/surfaceRuntimeAuthoring.test.ts
  git reset -- src/player/SurfaceRuntimeAuthoring.ts tests/unit/surfaceRuntimeAuthoring.test.ts
  ```
- validation result: Vitest 2 files / 21 tests passed，1.24s。`git diff --check` 无输出、exit 0。
- validation entry / fixture / backend:
  - entry: `SurfaceRuntimeAuthoringBridge`、`SurfaceRuntimeAuthoringOptions`；`makeAuthoringAddress`（field 持久化，无 hitId）
  - fixture: jsdom root + 声明式 `[data-courseware-content-key]` / `[data-courseware-asset-key]`；显式 bounds / element 注册；双桥实例会话隔离
  - backend: 纯 Player 模块；未接真实 Surface host / Workspace / 导出 HTML
- validation proves / does not prove:
  - proves: 声明式与显式 register 命中上报稳定 `field`（含 `~0`/`~1` JSON Pointer 转义）与会话级 `hitId`；`makeAuthoringAddress` 只用 field、不含 hitId；destroy 清理 bounds 层与监听；playback 不命中、setMode 切换 inspect；invalidate 重挂 bounds 层并更新动态 bounds；未知/空 key 与 root 外元素拒绝；不同桥实例 hitId 不同、field 相同；Runtime API 2 既有测试仍绿（含 API 3 类型 import）
  - does not prove: 未接真实 Player surface host（R7-B `publishedDynamicHosts` / editor dynamic registry）；未执行 Surface Runtime 源码 `CoursewareSurfaceRuntime.define` 全链；未跑 typecheck/build/E2E/视觉；发布包 sidecar 离线嵌入未做（R7-C/Z）
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R7-E
  - target stage integrator: R7-B / R7-Z
  - target hotspot file: src/player/surfaces/publishedDynamicHosts.ts（或等价 Surface Runtime V1 adapter）；后续 editor dynamic host registry
  - exported symbol / callback: SurfaceRuntimeAuthoringBridge；SurfaceRuntimeAuthoringOptions
  - required user-visible behavior: surface-v1 + API 3 Runtime 挂载后，检查态可命中 runtime 内容/素材；选中走稳定 field → makeAuthoringAddress；销毁/切页后 hit 监听释放；mount 后须调用 invalidate() 挂载 bounds 层
  - focused test proving lane side: tests/unit/surfaceRuntimeAuthoring.test.ts
  - exact wiring requested: 参照供体 PublishedSurfaceRuntimeHost：create 上下文传入 authoring: new SurfaceRuntimeAuthoringBridge({ root, contentKeys, assetKeys, reportHit: context.reportHit }, mode)；create 成功后 authoring.invalidate()；destroy/catch 时 authoring.destroy()；setInspectionMode 时 authoring.setMode
  - risk if omitted: Surface Runtime 作者命中仍不可用；临时 hitId 可能被误当持久 address
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R7-E
  - target stage integrator: R7-C / R7-Z
  - target hotspot file: export/course/buildCoursePackages.ts（R7-C）；Published V2 payload 打包
  - exported symbol / callback: （无新协议）Runtime sidecar 随 V2 已有 runtime 字段离线携带；桥本模块不参与导出
  - required user-visible behavior: 离线 HTML/网页包中 surface-v1 runtime 源码与 content/assets 可加载；不要求本任务新建 sidecar 字段
  - focused test proving lane side: tests/unit/surfaceRuntimeAuthoring.test.ts（register/dispose 合同）
  - exact wiring requested: R7-C 使用现有 buildPublishedCourseV2Payload；若需 runtime bundle sidecar 只复用已有 published runtime 块，不要新造协议名
  - risk if omitted: 发布物缺 runtime 离线资源（属 R7-C 范围，非本 lane 阻塞）
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 全局 `nextHitId` 计数器跨测试/实例单调递增（与供体一致；持久化不依赖 hitId）
  - 真实 host 须 mount 后 `invalidate()`，否则 bounds overlay 不在 DOM（供体 PublishedSurfaceRuntimeHost 已如此）
- rollback point: 删除产品 worktree 中上述 2 个未跟踪文件；还原账本 `R1D-R7E-01` 为 open。
- execution state: lane_candidate
- integration state: pending（`R1D-R7E-01` → implemented，待 R7-B/Z host 接线 verified）
- quality state: unverified

## 冻结导出（实际导出名）

### SurfaceRuntimeAuthoring.ts

- `SurfaceRuntimeAuthoringBridge` — 实现 `SurfaceRuntimeAuthoring`；构造 `(options: SurfaceRuntimeAuthoringOptions, mode: SurfaceRuntimeMode)`
- `SurfaceRuntimeAuthoringOptions` — `{ root, contentKeys, assetKeys, reportHit }`
- `reportHit(detail)` — `{ field: string; hitId: string; targetKind: 'text' | 'asset' }`
- 宿主额外方法（非 interface 但供 host 调用）：`setMode(mode)`、`destroy()`

### hitId vs field 合同

| 概念 | 用途 | 格式 / 规则 |
|---|---|---|
| `field` | 持久化、`makeAuthoringAddress` | `runtime/content/values/<json-pointer-key>` 或 `runtime/assets/<json-pointer-key>/assetId`；`/`→`~1`，`~`→`~0` |
| `hitId` | 当前 DOM 会话命中实例 | `surface-runtime:<text\|asset>:<monotonic>:<encodeURIComponent(key)>`；**不得**写入工程或 authoringAddress |
| `invalidate()` | host 在 runtime create/update/capture 后调用 | 重挂 `.surface-runtime-authoring-targets` 层并重算 bounds |
