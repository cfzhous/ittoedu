# R7 — 交付缺口：整课 Player、导出写文件、recovery 补洞

> 状态：Gate 通过（`engineering candidate for this stage`）；Wave 8a 已开（R8-A/B/C/D）
> 默认工程真相：V9
> 执行加速手册：[`artifacts/R6_R8_EXECUTION_PLAYBOOK.md`](artifacts/R6_R8_EXECUTION_PLAYBOOK.md)
> 阶段目标：编辑器、archive、Player 与导出物对同一课程给出一致结果
> **本阶段不是**把生命周期和导出再实现一遍

## 1. 阶段结果

R3-CUT 已经让默认新建/打开/保存走 V9；R4-D / R5-D 已经交付 Flow/Spatial host 与 DOCX helper。R7 只补还没接到用户手上的缺口：

| 已是事实 | 本阶段缺口 | Owner |
|---|---|---|
| V9 新建/打开/保存；V8 显式导入 | recovery / recent 隔离、损坏与未来版本拒绝，**仅当仍缺** | R7-A |
| Spatial/Flow **当前位置**试运行走真实 host | 整课预览 + Slide 试运行仍可能 `buildStandaloneHtml` | R7-B、R7-Z（`R3CUT-R7B-01`） |
| `buildPublishedCourseV2Payload` | 单 HTML / 网页包离线资源走同一 V2 | R7-C |
| `flowDocx.ts` / `flowPrintPlan.ts`；V8 `buildPptx.ts` | PPTX/打印接 V2 页列表；DOCX **调用** helper | R7-D（`R4D-R7-01`） |
| Runtime API 2/3、Component API 4 合同 | Surface Runtime DOM 桥；发布 sidecar | R7-E（`R1D-R7E-01`） |
| 导出菜单 UI | 「继续导出」真实写到用户选的路径 | R7-Z |

R7 不以“内存生成了字节”冒充用户已经获得文件；R7-Z 接真实对话框。全量产物打开抽查属 R8，不要在 R7 为每种格式各冒烟一次。

## 2. 任务与依赖

| ID | 任务 | 独占写入 | 可并行 | 依赖 |
|---|---|---|---|---|
| R7-A | 只补 persistence 缺口 | 实际改过的 archive/IPC 文件；**禁止** App.tsx | R7-B/C/D/E | 无（不碰壳层） |
| R7-B | 组装三类 host 的课程 Player | 新建 CoursePlayer / Mixed 导航 / 薄 publishedDynamicHosts | R7-A/C/D/E | 无（不改现有 host 内部、不改 PlayerApp） |
| R7-C | HTML/网页包吃 V2 | **只新建** `export/course/buildCoursePackages.ts`（及自己的测试）；**禁止**改 `buildStandaloneHtml.ts` / `buildWebPackage.ts` / `export/course/index.ts`（R6-Z 冒烟与 App 仍在用） | R7-A/B/D/E | 无 |
| R7-D | PPTX/打印 + 调用 flowDocx | **只新建** `buildCoursePptx.ts` / `buildCoursePrintArtifacts.ts`（及测试）；**禁止**改 `buildPptx.ts` / `flowDocx.ts` / `index.ts` | R7-A/B/C/E | 无 |
| R7-E | Runtime DOM 桥 | `SurfaceRuntimeAuthoring.ts` 等 1–2 个窄文件 | R7-A/B/C/D | 无 |
| R7-Z | 预览/导出菜单接线 | App / TopToolbar / export dialog / 必要 IPC；此时才改 `buildStandaloneHtml` / `buildWebPackage` / `index.ts` 若仍需要 | 否 | R6-Z 释锁 + R7-A/B/C/D/E |

R7-A 与 R7-Z **不得同时改** `src/main/ipc.ts`：A 先完成。

## 3. R7-A — 生命周期补洞（先盘点，禁止重写）

### 3.1 开工 30 分钟

产品里已经有：`courseProjectArchive.ts`、`courseProjectIo.ts`、`courseProjectLifecycle.ts`、`recoveryWriteCoordinator.ts`、`projectPersistence.ts`、隔离 AppData `ittoedu-courseware-editor-v8-rebuild`。

`rg` 确认：recovery 文件是否与共享 `ittoedu-courseware-editor` 隔离；损坏 zip / 未来 schemaVersion 是否拒绝；recent 是否把 V8 当 V9 打开。

**若已经闭合：** 不要为了任务卡重写打开保存。跑下面两个测试，HANDOFF 写「无产品 diff / 已有缺口列表为空」，把剩余 UI 接线留给 R7-Z。

### 3.2 若仍有缺口，只改这些文件

- `src/renderer/project/courseProjectLifecycle.ts`
- `src/renderer/project/recoveryWriteCoordinator.ts`
- `src/main/projectPersistence.ts`
- `src/main/ipc.ts`（仅 recovery/recent 所需）
- `src/shared/ipcTypes.ts` 中必要窄扩展

**不要**重写 `openCourseProjectArchive` / 默认保存 / CUT 已完成的导入分流。**不要改** `App.tsx`（R6-Z 持锁）；App 侧 `shouldOfferCourseProjectRecovery` 接线留给 R7-Z。

### 3.3 必须闭合（仅针对仍缺的项）

- V8/V9 recovery/recent namespace 或版本元数据隔离；
- 损坏文件和未来版本明确拒绝；
- 不保留 V8/V9 双写；
- 原子写入失败不损坏旧文件。

### 3.4 最轻量验证

```powershell
npx vitest run tests/unit/projectPersistence.test.ts tests/unit/projectFormatIsolation.test.ts
git diff --check -- <本任务实际改过的文件>
```

禁止 `-- src/renderer/project`。

## 4. R7-B — 组装 Published 运行（不是第二 App）

### 4.1 独占路径

产品 **没有** `PublishedCourseApp.ts`。禁止整文件覆盖 `PlayerApp.ts`。

**只写新组装文件**（HANDOFF 写实名）：

- `src/player/surfaces/CoursePlayer.ts`（供体可摘）
- `src/player/surfaces/mixed/MixedCourseNavigator.ts`（供体可摘）
- `src/player/surfaces/publishedDynamicHosts.ts`（`slide | flow | spatial` → **已有** host）

**禁止改** `src/player/surfaces/flow/FlowSurfaceHost.ts`、`src/player/surfaces/spatial/SpatialSurfaceHost.ts` 内部。`git diff` 不要 `-- src/player` 或 `-- src/player/surfaces`。

Slide：复用现有 Player 场景路径或最小 V2 adapter。禁止把三类都投影成 `buildStandaloneHtml`。

### 4.2 必须闭合

- Mixed location 顺序、上一/下一、目录、进度（单测即可证明导航状态机）；
- 切 surface 销毁或 `releaseSurfaceSession`，不泄漏 camera/audio；
- global 显隐按 active location；
- 运行会话不回写工程；
- 关闭 `R3CUT-R7B-01` 的**生产者/组装**部分；顶栏按钮属 R7-Z（`R7B-R7Z-01`）。

当前位置 Spatial/Flow 试运行已经接好，本任务不要回退它们。

### 4.3 最轻量验证

```powershell
npx vitest run tests/unit/publishedCourseNavigation.test.ts tests/unit/playerHostActions.test.ts
git diff --check -- src/player/surfaces/CoursePlayer.ts src/player/surfaces/mixed/MixedCourseNavigator.ts src/player/surfaces/publishedDynamicHosts.ts tests/unit/publishedCourseNavigation.test.ts tests/unit/playerHostActions.test.ts
```

若实际文件名不同，check 那些实名。不证明顶栏预览按钮。

## 5. R7-C — HTML、网页包与资源

### 5.1 独占路径

**与 R6-Z 重叠期间只新建** `src/renderer/export/course/buildCoursePackages.ts`。

- 入口吃 `buildPublishedCourseV2Payload`（已有），产出单 HTML / 网页包**文件清单**（相对路径、无本机绝对路径）。
- **不要改** `buildStandaloneHtml.ts`、`buildWebPackage.ts`、`export/course/index.ts`：它们被 App / Workspace 试运行使用，R6-Z 冒烟期间会 HMR。
- **不要 import** 正在由 R7-B 新建的 `CoursePlayer.ts`。HTML 壳只嵌入 V2 JSON + 现有 player bundle 占位；真正挂 CoursePlayer 属 `R7B-R7Z-01`。
- `exportPreflight.ts`：仅当必须补 V2 中文缺资源项时才改；否则把 V2 用例写进已有 `exportPreflight.test.ts` 或本任务第二个测试文件。

**不要改** `buildPublishedCourse.ts` 除非发现 V2 payload 缺字段（那时写 INTEGRATION_REQUEST，不要顺手重写 producer）。**不要改** `flowDocx.ts`。

### 5.2 必须闭合

- 单 HTML 与网页包同一 V2 producer；
- 资源路径离线可用，无绝对本机路径；
- 缺资源 / 版本冲突在 preflight 中文报告；
- 不恢复画布外旧 `.course-nav`。

### 5.3 最轻量验证

```powershell
npx vitest run tests/unit/coursePackageExport.test.ts tests/unit/exportPreflight.test.ts
git diff --check -- <实际改过的 export 文件与这两个测试>
```

`exportPreflight.test.ts` 若已存在就补 V2 用例，不要复制一份。禁止 `-- src/renderer/export/course`（会扫到 R4-D 的 docx）。

## 6. R7-D — PPTX、打印/PDF；调用已有 DOCX

### 6.1 独占路径

- **只新建** `src/renderer/export/course/buildCoursePptx.ts`、`buildCoursePrintArtifacts.ts`
- 可 `import` 现有 `buildPptx.ts` / `buildPdfPrintHtml` / `flowDocx.ts`，**不要改这些文件**
- 不要改 `export/course/index.ts`（R7-C 也不改；R7-Z 再 re-export）
- 可选：`src/renderer/course/coursePptxCurrentCapture.ts`

**`flowDocx.ts` / `flowPrintPlan.ts` 不是本任务独占文件。** 只 `import`。发现 bug 写请求，不要大改。

### 6.2 必须闭合

- Slide 页按 scene；Spatial **每个 camera frame 一页**；Flow 按 `buildFlowPrintPlan` 分页。禁止把无限 world 裁成一张 1280×720。
- **global / 教师控制器默认不进 PPTX/PDF/DOCX**（与视口 HUD 一致）。不要在 R7-Z 再争论。
- 导出尺寸、缺字体、缺资源给中文原因。
- 真实写文件由 R7-Z 做。

### 6.3 最轻量验证

```powershell
npx vitest run tests/unit/coursePptxExport.test.ts tests/unit/coursePrintArtifacts.test.ts
git diff --check -- <实际新建或修改的 pptx/print 文件与这两个测试>
```

禁止 `-- src/renderer/export/course`。DOCX 行为用现有 `flowDocx` 测试证明「能 import」，不要为 DOCX 再写第三个测试文件。

## 7. R7-E — Runtime DOM 桥

### 7.1 独占路径

只补关闭 `R1D-R7E-01` 所需的 1–2 个文件，预期：

- `src/player/SurfaceRuntimeAuthoring.ts`（新建或从供体窄摘）

不要重做插入 UI、不要第二套 registry、不要改 V8 组件面板合同。不要用 Runtime 代替 Native 文字。

### 7.2 必须闭合

- Player 表面 Runtime 命中 / authoring 桥；
- 包 sidecar 随发布离线；
- 销毁与会话隔离。

Slide/Flow/Spatial 的 viewport vs world 只在桥里按 surface kind 传已有 context，不要新造编辑器。

### 7.3 最轻量验证

```powershell
npx vitest run tests/unit/runtimeHostV2.test.ts tests/unit/componentProtocolV4.test.ts
git diff --check -- src/player/SurfaceRuntimeAuthoring.ts tests/unit/runtimeHostV2.test.ts tests/unit/componentProtocolV4.test.ts
```

若测试文件已存在且无需改，check 只列新 ts。禁止 `-- src/shared src/player`。

## 8. R7-Z — 中央交付接线

### 8.1 独占热点

- `src/renderer/App.tsx`
- `src/renderer/store/editorStore.ts`
- `src/renderer/ui/TopToolbar.tsx`
- 现有 Export menu/dialog/preflight UI 文件
- 若 R7-A 已结束：相关 `ipc.ts` / preload

不要改 `PlayerApp.ts` 来假装当前位置试运行已完成（Spatial/Flow 已接）。不要拆 R6 课树。

### 8.2 接线步骤

1. 关闭 R7-A/B/C/D/E blocking 请求。硬需求不能以“已记录限制”关闭。
2. 整课预览与仍缺的 Slide 试运行挂 R7-B 组装（`R7B-R7Z-01`、`R3CUT-R7B-01`）。
3. 导出菜单「继续导出」走真实 `showSaveDialog` 写文件；DOCX 调 `buildFlowDocx`（`R4D-R7-01`）。
4. Runtime/Component 作者入口继续复用 V8 UI。
5. 不删除 V8 显式导入。不要为每种格式各做一次窗口冒烟。

### 8.3 最轻量验证

```powershell
npx vitest run tests/unit/exportMenuUi.test.tsx tests/unit/projectPersistence.test.ts
git diff --check -- src/renderer/App.tsx src/renderer/store/editorStore.ts src/renderer/ui/TopToolbar.tsx
```

把实际改过的 export dialog / ipc 文件追加到 check。禁止 `-- src/renderer/ui`、`-- src/renderer/export`、`-- src/main`。

**一次**冒烟（`output/r7-z-smoke/`）：打开已有三类 surface 的 V9 工程（R6-Z zip 或当场下拉加两类）→ 另存副本 → 当前位置试运行切一页 → 导出 **一个** HTML 到该目录 → 确认文件非空。不要 HTML+包+PPTX+PDF+DOCX 全跑。

## 9. R7 Gate

- persistence 缺口已盘点并补上，或 HANDOFF 证明无缺口；
- 整课预览与 Slide 试运行不再用派生 V8 HTML 冒充三类 Player；
- 导出入口至少有一条真实写文件路径；
- `R3CUT-R7B-01`、`R4D-R7-01`、`R1D-R7E-01`、`R7B-R7Z-01` 为 `integrated + verified`（E 若仍 non-blocking 可 documented 但不得把 blocking 项留下）；
- 未运行全量 typecheck/test/build/E2E/visual。

完成后冻结 candidate，停止功能开发，R8-FINAL 才 `READY`。

裁决见 [`handoffs/R7-GATE.md`](handoffs/R7-GATE.md)：交付接线已过。R8 按 11.4 拆分为 A–H/Z，Wave 8a 与两件产品补丁并行。
