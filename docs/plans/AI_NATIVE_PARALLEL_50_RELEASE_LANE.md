# RELEASE lane：Mixed、保存与导出事实

> LANE_ID: RELEASE
> OWNER_SCOPE: 代表 Mixed fixture、课程发布/导出窄实现及对应测试
> START_STATE: E1 READY；E2 BLOCKED（等待 I1）
> PARALLEL_WITH: LAYOUT、FLOW、AI-BOUNDARY
> REQUIRED_READING: [执行索引](AI_NATIVE_PARALLEL_00_INDEX.md)、[共享合同](AI_NATIVE_PARALLEL_05_SHARED_CONTRACT.md)

本 lane 先把保存/发布/导出的数据事实做成确定性 fixture 与单测。真实 Electron、构建和文件打开统一留给最终 Gate，避免每个 lane 重复构建播放器和桌面包。

## E1 — 代表 Mixed fixture 与导出矩阵

> TASK_ID: E1
> STATUS: READY
> DEPENDS_ON: P2-G

### 目标

用一个包含 Slide、Flow、Spatial 和单一 global controller 的代表工程，证明发布与静态导出读取同一 Course V9 真相，并明确各格式的适用差异。

### 允许修改

- `tests/unit/multiSurfaceExports.test.ts`
- `tests/unit/coursePublishPipeline.test.ts`
- `src/renderer/export/course/**`，仅当定向断言证明真实缺口时
- `examples/course-project-v9/ecosystem-mixed/**`，仅在 fixture 必须同步时；生成 HTML 不手工编辑

### 禁止修改

- `src/renderer/App.tsx`、任何编辑器 UI
- Course/Published Schema、Store、IPC
- Flow/Spatial 作者命令
- 文档、Skill、能力卡

### 实施步骤

1. 复用现有 `ecosystem-mixed` 或测试工厂；不得再造第二套近似 Mixed 工程。
2. fixture 至少含一个 Slide scene、一个 Flow location、一个非 1× Spatial frame 和一个 global `teacher-controller`。
3. 在归档/发布输入中断言：控制器只在 global 保存一份；scene/surface/world 无副本。
4. 在同一 fixture 上覆盖：
   - single HTML / web package 的三类 location 与离线资源闭包；
   - PDF 打印计划的 Slide/Flow/Spatial 页面；
   - PPTX 只承诺 Slide 可编辑/静态后备，不伪造 Flow/Spatial 编辑语义；
   - DOCX 读取最新 Flow 语义块；
   - `includeInStaticExports` 的控制器差异。
5. 输出教师可读 difference report；不把“不适用”当静默成功。
6. 如果现有导出已经满足合同，只补 fixture/断言，不改生产代码。

### 必须断言

- 保存重开前后的 location 顺序、stable IDs、Flow 文本、Spatial camera 和 global controller 一致。
- 发布 payload 的三类 location 与工程一致。
- 各静态格式的差异有显式报告，不丢内容、不伪称可编辑。
- 归档与导出过程不修改 project/revision/dirty。

### 最小验证

只运行：

```powershell
npx vitest run tests/unit/multiSurfaceExports.test.ts tests/unit/coursePublishPipeline.test.ts
git diff --check -- tests/unit/multiSurfaceExports.test.ts tests/unit/coursePublishPipeline.test.ts src/renderer/export/course
```

不得运行 build、prepare:e2e、Electron 或全量测试。

### 交付

按共享合同 §6 交付，并附一张格式矩阵：格式、读取的真相、静态化差异、测试名称。若需要 App 接线，按 `INTEGRATION_REQUEST` 提交，不直接改 App。

### 停止条件

- 需要修改 Schema/协议版本。
- 需要为动态 Surface 伪造 PPTX/DOCX 编辑语义。
- 需要手工改生成 HTML 才能通过。

## E2 — 集成候选的真实 artifact 清单

> TASK_ID: E2
> STATUS: 清单已交付（等待 Z1 统一执行；原依赖 I1、E1，E1 已 DONE）
> DEPENDS_ON: I1、E1

E2 不新增实现，也不在本 lane 跑构建。执行 AI 只需把 E1 的同一 fixture 和下列最终检查项交给 `Z1`：

- 保存、完全关闭、重开；
- single HTML 与 web package 离线打开；
- PDF、PPTX、DOCX 的适用内容真实打开；
- Mixed 目录可到达 Slide、Flow、Spatial；
- 三类 Surface 读取同一个 global controller；
- 导出前后 archive 不变。

这些检查在 [最终 Gate](AI_NATIVE_PARALLEL_90_FINAL_GATE.md) 中一次完成，不在此重复执行。

### E2 交付记录（2026-08-16，清单已整理，Z1 按此执行）

- **代表 Mixed fixture（唯一）**：`examples/course-project-v9/ecosystem-mixed/project.h5lesson`
  （`openCourseProjectArchive` 直接读取；含 Slide×2、Flow、非 1× Spatial frame（zoom 0.55/1.65/1.1）、
  global `teacher-controller`；tracked 且未修改）。
- **E1 基线**：`npx vitest run tests/unit/multiSurfaceExports.test.ts tests/unit/coursePublishPipeline.test.ts`
  → 38/38 通过（重跑确认，2026-08-16）。
- **Z1 检查清单（六项）**：

| # | 检查项 | 检查方式 | 对应 E1 断言 / Z1 命令 | 预期结果 |
|---|---|---|---|---|
| 1 | 保存、完全关闭、重开 | 真实打开（Electron 文件生命周期） | E1：`coursePublishPipeline.test.ts > 保存重开前后的 location 顺序、stable IDs、Flow 文本、Spatial camera、global controller 一致`；Z1：保存 `project.h5lesson` → 完全关闭 → 重开 | 重开后 location 顺序、stable IDs、Flow 文本、Spatial camera、global controller 与保存前一致；revision 不变 |
| 2 | single HTML 与 web package 离线打开 | 真实打开（断网环境） | E1：`coursePublishPipeline.test.ts > single HTML 与 web package 携带三类 location 且离线资源闭包`；Z1：导出后离线打开 | 三类 location 可导航；资源全部离线（HTML 内联 data URL / web package 相对文件）；无网络请求 |
| 3 | PDF、PPTX、DOCX 的适用内容真实打开 | 真实打开（本机 PDF 查看器 / Office） | E1：`multiSurfaceExports.test.ts > PDF 打印计划覆盖…`、`> PPTX 只承诺 Slide…`、`> DOCX 读取最新 Flow 语义块…`；Z1：导出后用真实应用打开 | PDF 含 Slide/Flow/Spatial 页；PPTX 仅 Slide 可编辑对象 + 静态后备（Flow/Spatial 显式说明，不伪称可编辑）；DOCX 含最新 Flow 语义块与控制器省略标记 |
| 4 | Mixed 目录可到达 Slide、Flow、Spatial | 真实打开 + 断言 | E1：`coursePublishPipeline.test.ts > 发布 payload 的三类 location 与工程一致…`；Z1：播放器场景目录逐一导航 | 目录按工程 location 顺序列出三类 location，可逐一到达 |
| 5 | 三类 Surface 读取同一个 global controller | 真实打开 + 断言 | E1：`coursePublishPipeline.test.ts > 归档/发布输入中控制器只在 global 保存一份…`；Z1：依次进入三类 Surface | 每类 Surface 均渲染同一个 global `teacher-controller`（canvas 控制器）；scene/surface/world 无副本 |
| 6 | 导出前后 archive 不变 | 断言（字节级） | E1：`coursePublishPipeline.test.ts > 归档与导出过程不修改 project/revision/dirty`；Z1：导出前后对同一工程 `createCourseProjectArchive` 比较 | 归档/导出前后 `project.h5lesson` 字节一致，project/revision/dirty 不变 |

- **PDF captureSlide 已知缺口（Z1 必须知道）**：
  `src/renderer/App.tsx:3291`（`handleExportPdf` 的 V9 分支）调用 `buildCoursePrintArtifacts(project, { resolveAsset })`
  **未传 `captureSlide`/`captureFlow`**，Slide 场景页将进入 `failures` 而缺失；
  现成实现嵌在 `src/renderer/course/CourseStudioApp.tsx`（`captureSlide` @906、`captureFlow` @945，装配于 @991），
  位于 Course Studio 壳，主编辑器不可复用。Z1 若发现真实 PDF 导出的 Slide 页缺失，按此定位
  （App.tsx 归 SHELL/最终集成；行号可能随 SHELL 修改漂移）。

### E1 格式矩阵（Z1 对照基准，与两个 E1 测试文件断言一致）

| 格式 | 读取的真相 | 静态化差异 | 测试名称 |
|---|---|---|---|
| single HTML | Course V9 → Published V2 payload（内联 data URL 资产） | html 全 preserved；三类 location 内联；离线闭包无 http(s)；controller 在 global | `coursePublishPipeline.test.ts > single HTML 与 web package 携带三类 location 且离线资源闭包` |
| web package | 同上（资产改 `./assets/` 文件引用） | 同上；zip 往返不变，无 base64 往返 | 同上 |
| PDF 打印计划 | `buildCoursePrintArtifacts` 按 mixedPrintPlan 读工程 | slide=static 帧、flow=preserved 语义文档+有序静态图层、spatial=static 总览+3 个 camera frames SVG；controller 省略标记；多页尺寸显式警告 | `multiSurfaceExports.test.ts > PDF 打印计划覆盖 Slide/Flow/Spatial 页面并显式报告每页差异` |
| PPTX | 只读 Slide surface（含 global 可见层） | slide=preserved（Native 为 Office 对象，dynamic 走快照/静态后备/占位）；flow/spatial=`omitted` 显式警告；controller 按 `includeInStaticExports` | `multiSurfaceExports.test.ts > PPTX 只承诺 Slide 可编辑/静态后备…` |
| DOCX | 只读 Flow surface 最新语义块 + 有序图层 | flow=preserved；slide/spatial=`omitted`；controller 按 `includeInStaticExports` 省略标记/可读标签 | `multiSurfaceExports.test.ts > DOCX 读取最新 Flow 语义块…` |
| 差异报告 | 工程 surfaces 枚举 | 每个 surface×target 一条 disposition（preserved/static/fallback/omitted）+ 教师可读 detail | `multiSurfaceExports.test.ts > 格式矩阵差异报告覆盖每个 surface × 每个目标…` |
