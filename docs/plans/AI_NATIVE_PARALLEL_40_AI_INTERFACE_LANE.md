# AI-BOUNDARY lane：无可见 AI 的纯接口边界

> LANE_ID: AI-BOUNDARY
> OWNER_SCOPE: P5
> START_BASELINE: P2-G
> EXECUTION_ORDER: D0 -> D1 -> D2 -> D3 -> D-G
> PRODUCT_POLICY: 当前版本不增加任何可见 AI 能力
> TEST_POLICY: 每包只跑 1–3 个精确 Vitest 文件或窄源码审计；不跑 typecheck/build/E2E/全量测试

执行 AI 开始前必须先读 [并行执行索引](AI_NATIVE_PARALLEL_00_INDEX.md) 与 [共享合同](AI_NATIVE_PARALLEL_05_SHARED_CONTRACT.md)。本 lane 先删除遗留的可见 AI UI，再保留未挂载、无副作用的稳定 handoff 和单目标 preflight 纯接口。它不交付教师可使用的 AI 功能。

## 1. 文件归属

### 独占生产文件

- `src/renderer/ui/Workspace.tsx`：只允许 D0 做遗留 AI 减法；D1–D3 不再修改
- `src/renderer/ui/DesignTokensEditor.tsx`
- `src/renderer/authoring/courseAiHandoff.ts`（新增纯 helper）
- `src/renderer/authoring/courseAiPatch.ts`（新增纯 helper）

### 允许修改的测试

- `tests/unit/designTokens.test.tsx`
- `tests/unit/courseAiHandoff.test.ts`（新增）
- `tests/unit/courseAiPatch.test.ts`（新增）

### 只读参考

- `src/renderer/authoring/aiSelectionReference.ts`：旧 V8/ProjectDocument helper，保留但不得重新挂入 UI
- `src/shared/courseProjectModel.ts`
- `src/shared/authoringAddress.ts`
- `src/renderer/course/courseStudioModel.ts`
- `src/renderer/course/CourseStudioApp.tsx`
- `src/main/courseSelectionBridge.ts`
- `src/shared/ipcTypes.ts`
- `tests/unit/authoringAddress.test.ts`
- `tests/unit/courseProjectProtocol.test.ts`
- `tests/unit/courseStudioModel.test.ts`
- `tests/unit/courseProjectPatchCli.test.ts`

### 禁止修改

- `src/renderer/App.tsx`、`TopToolbar.tsx`、`RightSidebar.tsx`、`ConfirmDialog.tsx`
- `aiSelectionReference.ts`、Schema、Store、IPC/preload/main、file dialog、CLI、Player、export
- Flow lane 与其他 lane 的生产文件/测试
- `package.json` 和依赖锁文件

## 2. 整个 lane 的硬边界

1. 正式界面中没有 AI 按钮、AI 文案、复制引用、Clipboard、Patch 文件选择、影响确认、应用、聊天、模型、账号、Provider 或网络调用。
2. D1/D2 的 helper 只能接受显式参数并返回结构化数据；不得读取 Store、DOM、`window`、文件、网络或 IPC。
3. helper 结果不持久化，不修改工程，不产生 history/revision/dirty，不发布实时 selection。
4. 只复用 Course Project V9 的 `deriveCourseProjectAuthoringInventorySnapshot`、stable `authoringAddress` 与既有 revision 语义；不得新建协议版本、Schema 或地址格式。
5. P5 不宣称“已支持 AI 修改”；只声明内部纯接口已预留且未接入。
6. 名称含 `Ai` 只表示未来外部边界，不构成 UI 能力；生产 App、Workspace、工具栏和右栏不得导入 D1/D2 helper。

## 3. TASK_ID: D0 — 移除遗留可见 AI UI

> STATUS: READY
> DEPENDS_ON: P2-G
> PARALLELISM: 可与 LAYOUT、FLOW、RELEASE 并行；独占 `Workspace.tsx`

### 可见结果

教师界面不再出现“AI 引用”“AI 修改引用”“可直接粘贴给 Codex”等入口或说明；Design Tokens 只描述稳定 ID、名称和值。

### 允许文件

- `src/renderer/ui/Workspace.tsx`
- `src/renderer/ui/DesignTokensEditor.tsx`
- `tests/unit/designTokens.test.tsx`

### 禁止文件

- D1/D2 新 helper 暂不创建
- §1 的其他全部禁止文件

### 实施步骤

1. 在 `Workspace.tsx` 删除可见“AI 引用”按钮、`copyAiReferenceFor`、`navigator.clipboard.writeText`、相关状态文案和仅由它使用的 `Copy` / `copyableAiSelectionReference` import。
2. `AuthoringCanvasTarget` 若仍用于普通 Runtime/Component 命中，改成 Workspace 内部的中性本地类型或已有中性类型；正式 Workspace 不得再从 `aiSelectionReference.ts` 导入任何值或类型。
3. 不以 CSS 隐藏、feature flag、菜单、快捷键或测试分支保留入口。
4. `aiSelectionReference.ts` 保持原样、未挂载且可编译；不要删除历史兼容 helper。
5. 将 Design Tokens 提示精确改为：`只保存稳定 ID、名称和值，便于统一取色与字体；不承载叙述性美术方向，也不会自动改写已有节点。`
6. 在 `designTokens.test.tsx` 增加可见文案断言：包含新句子，不包含 `AI` / `Codex`。
7. 不清理 `CourseStudioApp.tsx` 等 donor/历史入口；本包只处理正式 Workspace 和 Design Tokens。

### 必须断言

- `Workspace.tsx` 不含 `AI 引用`、`AI 修改引用`、`Codex`、`navigator.clipboard` 或对 `aiSelectionReference` 的 import。
- Design Tokens 的渲染文案不含 AI。
- token 编辑行为保持不变。
- Schema、Store、history、revision、dirty、IPC 均无修改。

### 最小验证

只运行：

```powershell
npx vitest run tests/unit/designTokens.test.tsx
rg -n "AI 引用|AI 修改引用|Codex|navigator\.clipboard|aiSelectionReference" src/renderer/ui/Workspace.tsx src/renderer/ui/DesignTokensEditor.tsx
git diff --check -- src/renderer/ui/Workspace.tsx src/renderer/ui/DesignTokensEditor.tsx tests/unit/designTokens.test.tsx
```

`rg` 的期望结果是零匹配；零匹配返回非零 exit code 属于通过，必须在交付中明确记录。不得因此改用全仓审计。

### 验收

- 定向单测通过，窄 `rg` 零匹配。
- 可见 AI 减法完成且没有隐藏替代入口。
- 只称 D0 `engineering candidate`。

### 停止条件

- 普通画布命中依赖 AI helper 的运行时逻辑，无法用中性本地类型解耦。
- 需要修改 Schema/Store/IPC/其他 lane 文件。
- 定向失败属于 Workspace 之外的旧 donor UI。

## 4. TASK_ID: D1 — V9 稳定上下文 handoff 纯接口

> STATUS: DONE
> DEPENDS_ON: D0
> DELIVERED: 2026-08-16 交付；`npx vitest run tests/unit/courseAiHandoff.test.ts tests/unit/courseProjectProtocol.test.ts` 22/22 通过，git diff --check 通过；helper 无产品调用点
> UNBLOCK_WHEN: 正式 Workspace 已与旧 AI helper 解耦

### 可见结果

界面完全不变。新增一个未挂载纯 helper，可从显式 V9 project、location 和 source-aware target 构造稳定字段上下文，供未来另行授权的外部协作调用。

### 允许文件

- `src/renderer/authoring/courseAiHandoff.ts`（新增）
- `tests/unit/courseAiHandoff.test.ts`（新增）

### 禁止文件

- `Workspace.tsx`、`DesignTokensEditor.tsx` 不再修改
- App/UI/Store/Schema/IPC 与 §1 全部禁止文件

### 建议的最小 API

可以调整命名，但不得扩大能力：

```ts
export type CourseAiHandoffTarget =
  | { locationId: string; source: 'global'; layerItemId: string }
  | { locationId: string; source: 'surface'; surfaceId: string; layerItemId: string }
  | { locationId: string; source: 'scene'; surfaceId: string; sceneId: string; layerItemId: string }
  | { locationId: string; source: 'world'; surfaceId: string; layerItemId: string }
  | { locationId: string; source: 'flow-block'; surfaceId: string; blockId: string }

export function buildCourseAiHandoff(input: {
  project: CourseProjectDocument
  target: CourseAiHandoffTarget
}): CourseAiHandoff | null
```

返回值至少包含 project ID/revision、location ID/label/kind、target source/stable ID/label，以及按稳定地址排序的字段 `{ label, authoringAddress, valueKind, currentValue }`。不包含 Clipboard 文本、UI packet、hitId 或一次性 JSON Pointer。

### 实施步骤

1. 从 `deriveCourseProjectAuthoringInventorySnapshot(project)` 获取字段集合；不得手拼 JSON Pointer 或自行生成另一套作者地址。
2. 解析 inventory 中已有的 `authoringAddress`，按显式 target 的 source、surface、scene 与稳定 ID 精确过滤；同 ID 不同 source 不得串线。
3. `currentValue` 只通过当前 snapshot entry 的 `jsonPointer` 对传入 project 做只读解析；拒绝 prototype 相关 segment，不修改输入对象。
4. location 必须在当前 project 中存在且与 target surface/scene/block 对应；不匹配返回 `null` 或稳定的纯错误结果，不猜测当前选择。
5. 字段按 authoringAddress 稳定排序并返回只读结构。project revision 改变时调用方必须重新构造，helper 不缓存。
6. 不导入 Store、React、DOM、CourseStudioApp、Clipboard、IPC 或文件 API；不在任何产品文件接入此 helper。

### 必须断言

- Slide scene、Flow block、Spatial world、surface layer 和 global controller 都能得到 source 正确的稳定地址。
- 同 ID 不同 source 不串线；临时 hitId 变化不影响结果。
- 保存重开等价 project 得到同地址；revision 改变只改变 handoff revision。
- 缺失或不匹配 location/target 安全返回空结果。
- 调用前后 project 深度相等，revision/history/dirty 无变化。

### 最小验证

只运行：

```powershell
npx vitest run tests/unit/courseAiHandoff.test.ts tests/unit/courseProjectProtocol.test.ts
git diff --check -- src/renderer/authoring/courseAiHandoff.ts tests/unit/courseAiHandoff.test.ts
```

### 验收

- 两个精确测试文件通过。
- 新 helper 只有纯类型/纯函数，仓库中没有产品调用点。
- 只称“非可见接口 engineering candidate”。

### 停止条件

- 需要持久化 handoff、实时发布 selection、扩 IPC 或修改 inventory/address 格式。
- 需要导入 App/Workspace/Store 才能知道当前目标。
- 现有 inventory 无法表达目标；记录具体缺口后停止，不扩 Schema。

## 5. TASK_ID: D2 — 单目标 Patch parser / preflight 纯接口

> STATUS: DONE
> DEPENDS_ON: D1
> DELIVERED: 2026-08-16 交付；`npx vitest run tests/unit/courseAiPatch.test.ts tests/unit/courseStudioModel.test.ts` 21/21 通过，git diff --check 通过；parser/preflight 无产品调用点

### 可见结果

界面完全不变。未来调用方可把一个内存中的未知值交给纯 parser/preflight，判断单个 `replace` 是否满足当前 revision、地址、expectedValue 和锁定边界；本任务不应用 Patch。

### 允许文件

- `src/renderer/authoring/courseAiPatch.ts`（新增）
- `tests/unit/courseAiPatch.test.ts`（新增）

### 禁止文件

- D0/D1 文件不再修改
- `courseStudioModel.ts`、CourseStudioApp、App、Workspace、Store、IPC、file dialog、CLI 与 §1 全部禁止文件

### 建议的最小 API

```ts
export function parseSingleCourseAiPatch(value: unknown): CourseAuthoringPatch

export function preflightSingleCourseAiPatch(input: {
  project: CourseProjectDocument
  value: unknown
}):
  | { ok: true; patch: CourseAuthoringPatch; impact: CourseAiPatchImpact }
  | { ok: false; code: CourseAiPatchRejectCode; message: string }
```

`impact` 只包含 project/revision、target/field 教师可读标签、authoringAddress、currentValue、nextValue；不得包含应用 callback、文件路径或 UI 状态。

### 实施步骤

1. parser 只接受普通对象和精确字段：`op`、`expectedRevision`、`authoringAddress`、`value`、可选 `expectedValue`。拒绝数组、`operations`、未知 key、非 `replace`、负数/非安全整数 revision、无效地址和缺少 value。
2. 通过当前 `deriveCourseProjectAuthoringInventorySnapshot` 查地址；地址不在当前 project 时返回 `target-missing`。
3. 只读解析当前值，prototype segment 安全拒绝；expectedValue 比较必须与现有 `applyCourseAuthoringPatch` 的 JSON canonical 语义一致。
4. expectedRevision 与 project.revision 不同返回 `stale-revision`。
5. 若地址目标是 global/surface/scene/spatial layer item 且当前 item `locked`，返回 `target-locked`。Flow block 没有 locked 字段，不虚构锁定状态。
6. 所有拒绝路径返回稳定 code 和教师可读 message；不得暴露一次性 `jsonPointer`。
7. 不调用 `applyCourseAuthoringPatch`，不 clone-and-commit，不修改 project，不生成 history/dirty/revision，不读取 bytes/file/network/DOM/window。

### 必须断言

- 有效单目标 replace 得到确定 impact，project 完全不变。
- stale revision、expectedValue 不符、locked、非法/外部地址分别得到正确 reject code。
- 数组、多操作对象、未知字段和无效 shape 均拒绝。
- parser/preflight 不调用应用函数、Store、文件、Clipboard、网络或 UI API。

### 最小验证

只运行：

```powershell
npx vitest run tests/unit/courseAiPatch.test.ts tests/unit/courseStudioModel.test.ts
git diff --check -- src/renderer/authoring/courseAiPatch.ts tests/unit/courseAiPatch.test.ts
```

### 验收

- 两个定向测试通过。
- helper 没有产品调用点，所有路径只读。
- 不宣称 Patch 已可导入或应用。

### 停止条件

- 需要改既有 Patch 协议、应用模型或 Store 才能完成 preflight。
- 需要文件选择、确认框、Clipboard、IPC 或网络。
- 锁定判断只能通过新增持久化字段实现。

## 6. TASK_ID: D3 — batch 明确拒绝边界

> STATUS: DONE
> DEPENDS_ON: D2
> DELIVERED: 2026-08-16 交付；`npx vitest run tests/unit/courseAiPatch.test.ts` 15/15 通过；rg 仅命中 courseAiPatch.ts 的 batch 拒绝判断依据（BATCH_KEYS 与注释），CourseAuthoringPatchBatch 零命中，courseAiHandoff.ts 零命中；git diff --check 通过

### 可见结果

界面和工程协议无变化。单目标接口明确拒绝 batch；仓库不新增 batch 类型、文件格式或执行入口。

### 允许文件

- `tests/unit/courseAiPatch.test.ts`
- 只有当 D2 parser 缺少明确拒绝且不改变公开形状时，才允许最小修改 `src/renderer/authoring/courseAiPatch.ts`

### 禁止文件

- 其他全部生产文件和测试

### 实施步骤

1. 增加表驱动断言，覆盖根数组、`operations`、`patches`、多个 op 和伪 `CourseAuthoringPatchBatchV1`。
2. 确认公开 export 只有单目标 parser/preflight；不得添加 batch interface/type/parser。
3. 确认 D0 后正式 App/Workspace/工具栏/右栏没有新增 AI/batch 入口；只做窄 `rg`，不修改这些文件。
4. 不扩展 `scripts/patch-course-project.ts`，不设计跨 location 批处理格式。

### 必须断言

- 所有 batch-like 输入使用稳定的 `batch-not-supported` 或等价拒绝 code。
- 拒绝前后 project 引用内容、revision 完全不变。
- 没有新 IPC、Schema、Store action、文件入口或可见文案。

### 最小验证

只运行：

```powershell
npx vitest run tests/unit/courseAiPatch.test.ts
rg -n "CourseAuthoringPatchBatch|operations|patches" src/renderer/authoring/courseAiHandoff.ts src/renderer/authoring/courseAiPatch.ts
git diff --check -- src/renderer/authoring/courseAiPatch.ts tests/unit/courseAiPatch.test.ts
```

`rg` 只允许命中明确的拒绝判断/错误码，不允许命中新的 batch 类型、parser 或执行结构。

### 验收

- 单测试文件通过。
- batch 只有拒绝证据，没有协议和入口。

### 停止条件

- 真实需求要求批量应用或跨 location workflow；必须由用户另行授权并新建计划。
- 为表达拒绝需要新增 batch Schema/IPC/type。

## 7. TASK_ID: D-G — lane 自检与交付

> STATUS: DONE
> DEPENDS_ON: D3
> DELIVERED: 2026-08-16 交付；复核 rg `courseAiHandoff|courseAiPatch` 在 src/renderer|src/main|src/preload|src/shared（排除测试）零匹配；D0 可见 AI 零残留；D2 只做单目标 preflight、D3 只做 batch 拒绝；未运行 typecheck/build/E2E/全量测试

本包不增加功能、不运行新测试。复核最后一次最小测试和 diff：

- D0 已清除正式 Workspace/Design Tokens 的可见 AI。
- D1/D2 helper 未被 App、Workspace、工具栏、右栏、Store 或 IPC 导入。
- D2 只做单目标 preflight，D3 只做 batch 拒绝。
- 没有模型、网络、Clipboard、文件选择、确认应用、Schema、IPC 或持久化状态。
- 未运行 typecheck/build/E2E/全量测试。

AI-BOUNDARY lane 不提交 App 接线请求；这些接口当前必须保持未接入。若最终集成发现任何产品调用点，应删除调用点，而不是完成接线。

## 8. 每包交付格式

```text
TASK_ID：D0 / D1 / D2 / D3 / D-G
状态：DONE / BLOCKED
修改文件：
可见结果：无可见 AI / 遗留入口已移除
纯接口：无 / handoff / single-target preflight / batch reject
关键不变量：无 Store/Schema/IPC/Clipboard/network/history/dirty mutation
最小验证：精确命令 + 结果（注明 rg 零匹配是否为预期）
Integration request：无；当前禁止接入产品 UI
Pipeline status：engineering candidate / unusable
已知风险：
```

## 9. 整个 lane 的立即停止条件

- 任何需求要求增加可见 AI、模型调用、账号、Provider、聊天或网络。
- 任何实现要求修改 App/Store/Schema/IPC/preload/main/file dialog/CLI。
- helper 必须持久化 selection、handoff 或 Patch 状态。
- 需要通用 batch 协议才能继续。
- 同一跨模块原因导致最小测试连续失败三次。
