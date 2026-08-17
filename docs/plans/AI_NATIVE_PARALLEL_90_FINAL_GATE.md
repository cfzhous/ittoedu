# FINAL lane：窄集成与唯一全量 Gate

> LANE_ID: FINAL
> OWNER_SCOPE: 跨 lane 窄接线、一次集成验证、一次全量验证、真实体验结论
> START_STATE: I1 DONE；Z1 READY（F1 已 DONE）
> FULL_TEST_OWNER: 只有本 lane
> REQUIRED_READING: [执行索引](AI_NATIVE_PARALLEL_00_INDEX.md)、[共享合同](AI_NATIVE_PARALLEL_05_SHARED_CONTRACT.md)及所有 lane 交付记录

## I1 — 窄集成

> TASK_ID: I1
> STATUS: DONE（2026-08-16：接线与 43/43 代表测试通过，integration candidate）

### 目标

合并各 lane 后，只处理明确的接线请求和跨 lane 类型问题，不在此新增功能或重构架构。

### 允许修改

- 各 lane 交付中列出的 `INTEGRATION_REQUEST` 目标
- `src/renderer/App.tsx` 的窄 prop/callback/derived-policy 接线
- 直接受类型影响的 import/export
- 一份最小跨 lane smoke 单测

### 禁止修改

- 新 Schema、IPC、依赖、Store、协议版本
- 新 UI 功能、可见 AI、批量工作流
- 为通过测试重写 lane 内实现

### 集成顺序

1. 按 LAYOUT → SHELL → FLOW → AI-BOUNDARY → RELEASE 的顺序应用交付。
2. 检查独占文件没有跨 lane 未声明修改。
3. 逐条处理 `INTEGRATION_REQUEST`；没有请求就不改 App。
4. 静态审计可见 AI：正式 App/Workspace/工具栏/右栏/DesignTokens 不得出现 AI 复制、导入、应用或 Clipboard 入口。
5. 静态审计控制器：没有把 global controller 复制到 scene/surface/world。

### 唯一的集成验证

I1 只运行一次全仓类型检查和最多三个跨 lane 定向测试：

```powershell
npm run typecheck
npx vitest run tests/unit/editorShellMultiSurface.test.tsx tests/unit/flowWorkspace.test.tsx tests/unit/courseAiPatch.test.ts
git diff --check
```

如果实际最终文件名不同，替换为各 lane 交付的一个代表测试；总数不得超过三个。不得在 I1 运行 build、compat、E2E、`npm test` 或 `verify:full`。

### 失败回派

- 类型/测试错误定位到单一 lane：附最小复现命令回派该 lane。
- App 接线错误：FINAL 自行做窄修复。
- 跨两 lane 合同冲突：协调者选择一个 owner；不得让两个 AI 同时改同一文件。
- 修复 AI 只跑最小复现，不跑 I1 全套；全部修复合并后 I1 最多重跑一次。

### 验收

- 类型检查通过。
- 三个代表最小测试通过。
- 没有未处理接线请求。
- 没有可见 AI、Schema/IPC/Store 扩张或控制器副本。

## E2 — 真实 artifact 准备

> TASK_ID: E2
> STATUS: DONE（2026-08-16：artifact 清单与 fixture 已交付，见 [RELEASE lane 交付记录](AI_NATIVE_PARALLEL_50_RELEASE_LANE.md)）
> DEPENDS_ON: I1、E1

I1 通过后，RELEASE owner 只提交最终 artifact 清单和同一 Mixed fixture 路径，不执行构建。随后 DOCS 可根据集成候选更新事实；实际构建/打开在 Z1 统一完成。

## Z1 — 最终全量工程 Gate

> TASK_ID: Z1
> STATUS: DONE（2026-08-17 全绿；engineering candidate）
> DEPENDS_ON: F1、E2

这是唯一允许全量验证的任务。先确认所有 lane 已停止修改，再依次运行：

```powershell
npm run verify:full
npm run test:compat
npx playwright test tests/e2e/v9GlobalControllerAndHealth.spec.ts tests/e2e/v9SpatialAuthoring.spec.ts tests/e2e/v9TrialRun.spec.ts tests/e2e/v9MixedTrialRun.spec.ts
```

说明：

- `verify:full` 已包含能力卡检查、typecheck、全量 Vitest/Agent Kit、完整构建和既有 preservation visual Gate；不要在它前面重复这些命令。
- `test:compat` 单独补 V8/Runtime/Component 协议兼容。
- 最后一条只补当前 V9 的关键真实纵切；不为每个单测事实再造 E2E。
- 若同一个失败在回派修复后仍出现，才允许整体 Z1 再跑一次。

### Z1 机器验收

- 全量命令全部通过。
- Mixed 保存重开后仍只有一个 global controller。
- Slide/Flow/Spatial 真实编辑、Trial 隔离和 Mixed 目录回归通过。
- 当前界面无可见 AI 控件或模型网络路径。
- 适用导出文件能生成且内容与 E1 矩阵一致。

## Z1 交付记录（2026-08-17）

- `verify:full` EXIT=0：check:ai-capabilities、typecheck、全量 Vitest **1445/1445**、agent-kit、prepare:e2e、**preservation visual Gate（1280/1366/1920 全绿）**。
- `test:compat` EXIT=0：**38/38**。
- E2E 5/5：单 global controller 保存重开、Mixed trial、Spatial 编辑与相机、Trial 隔离。
- 过程中处理：5 个单测失败（行为映射漂移 ×2 → 重建 `v8-behavior-map.json` 并同步脚本硬编码；P2 继承回归 ×3 → 适配断言对齐 controller 代理语义）；SHELL 视觉回归（scene-panel 塌缩 → globals.css flex 修复）；基线重采集（P3 界面收敛为预期变化，1366/1920 异常捕获轮次被稳定状态替换）。
- 已知缺口（非失败）：PDF 真实导出 Slide 场景页未传 `captureSlide`（`App.tsx:3291`），见 E2 清单；真实离线/真机导出打开属 Z2 范围。
- 结论：项目整体 **engineering candidate**；未做真实视觉互动复核前不称 art candidate。

## Z2 — 真实体验 Gate

> TASK_ID: Z2
> STATUS: BLOCKED
> DEPENDS_ON: Z1
> NOTE: 需真实 1366×768 环境人工复核（教师任务级），由用户参与后按 §结果口径定级。

在 1366×768 至少复核纯 Slide、纯 Flow、纯 Spatial、Mixed：

- 找到内容 → 修改 → 当前位置试运行 → Undo → 保存；
- 中央内容为主体，左右栏可收起且选择不丢；
- 普通界面无协议词和可见 AI；
- Flow 中文输入法不误提交；
- Spatial 固定屏控制器不随 world 缩放；
- Mixed 目录和适用导出真实打开。

保留四张截图和一份简短问题表。机器 Gate 通过只能称 `engineering candidate`；视觉互动复核后才可提议 `art candidate`，教师明确验收后才是 `accepted`。
