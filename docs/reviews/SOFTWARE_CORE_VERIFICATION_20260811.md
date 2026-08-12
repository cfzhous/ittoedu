# 软件本体验收证据报告

> 日期：2026-08-11
>
> 状态：**历史 S6 软件工程基线通过；软件本体结果为 engineering candidate**
>
> 当前性说明：本文冻结 2026-08-11 的 115 文件/717 项与隐藏 E2E 26/26，不再作为最新数量。2026-08-12 增量结果见 [AI-native 编辑器基建验证记录](AI_NATIVE_EDITOR_FOUNDATION_VERIFICATION_20260812.md)。
>
> 当前能力边界：Project V8 / Runtime API 2 / Component Schema 4 / Component Runtime API 4
>
> 适用范围：编辑器核心、播放器、导出链路、桌面壳、外部组件目录与软件侧自动化
>
> 不在范围：通用工作流、语文学科工作流、Project V8 实现 Skill、真实课例生产与教学/美术验收

## 0. 判定摘要

本报告冻结 S6 软件工程基线证据。最终隐藏 Playwright Electron 长跑通过 **26/26**，耗时约 **21.7 分钟**，主窗口和预览窗口全程隐藏；其中九组件 V8 矩阵通过 **2/2**，九包目录哈希一致，并完成目录 UI、编辑/重开、Player、缩略图、真实四格式导出、离线与 225 次压力导航。非 Electron 基线同时通过：类型检查 exit 0；Vitest **115 个文件、717 项测试**全部通过；桌面生产构建完成 Player、Renderer 与 Electron 三段。catalog 已登记九项各 5 个验证 case，并只移除矩阵 metadata 阻断；九组件 PDF/PPTX 与 FormulaNode/着重号跨表面制品、Export Preflight JSON 均已持久归档。该证据只把软件本体签发为 `engineering candidate`。

当前结论只能写为：

> **软件本体：engineering candidate（S6 软件工程基线通过）**

它明确不等于：

- 工作流或 Skills 已完成；
- 课件生产工作流 `accepted`；
- 真实语文课件或任一学科课件 `accepted`；
- 九个外部组件可以稳定发布；
- 用户可见效果已经完成教学、美术或课堂操作验收。

### 证据状态用语

| 用语 | 含义 |
|---|---|
| 已记录通过 | 当前最终工作树已有明确命令结果并已冻结到本报告 |
| 产物证据存在 | 文件与机器可读证据已落盘，不自动代表视觉结果通过 |
| 自动化入口存在 | 测试或脚本已经实现，但本报告没有把它预写成最终通过 |
| 收口后补签 | 不改变测试结论的签名字段由主代理在所有文档 patch 完成后追加 |
| 发布阻断 | 即使工程测试通过，也不得提升为 `candidate` / `stable` 或对外发布 |

## 1. 验收对象与工作树绑定

最终签发时，所有结果必须绑定到同一份工作树；不能把不同时间点、不同源码状态的成功结果拼接成一次“全通过”。

| 字段 | 最终值 |
|---|---|
| 仓库根目录 | `C:\Users\74755\Documents\HTML课件编辑器` |
| 组件仓库根目录 | `C:\Users\74755\Documents\courseware-components` |
| Git HEAD | `e938433c271c65f501fff6e78375589a2fd337db` |
| 工作树状态/补丁指纹 | 主仓：Git 可见变更 202 项（tracked 156、untracked 46），manifest SHA-256 `7d1b8ca832537d11107bdcca5bad1bc974a5da914c0ba5bb42ea5eb107b04298`；组件仓：`UNBORN`、untracked 64 项，manifest SHA-256 `f15c340ac33aac1dec4e891bbe3bba952586ff088e60877ee2f2cb5e25cd5a5e`。manifest 由 HEAD + 排序后的类型/路径/字节数/文件 SHA-256 组成；主仓排除本报告自身以避免自指，二者均不含 ignored 文件。 |
| `package-lock.json` SHA-256 | `9665dc4de149e413057635ed232ef71b9010fce07804fa8aeaec92880166cce4` |
| 组件仓库 Git HEAD/工作树状态 | `UNBORN`；尚无 commit，当前全部文件为 untracked |
| Node.js / npm / Shell / Windows 版本 | Node.js `v24.14.0`；npm `11.9.0`；PowerShell `7.6.4`；Windows 11 家庭中文版 `10.0.26200` |
| 最终验收开始与结束时间 | 2026-08-11 04:55–05:42（Asia/Shanghai）；隐藏 Electron 腿 04:55–05:17 |

权威计划软件边界见根目录 [内部正式版与多表面开发计划](../../MULTI_SURFACE_DEVELOPMENT_PLAN.md)。本报告不改变该计划，也不扩展到工作流或 Skill 开发。

## 2. S1–S6 证据总览

| 阶段 | 软件目标 | 已有证据 | 当前判定 | 剩余边界 |
|---|---|---|---|---|
| S1 | Project V8 / Runtime 2 / Component 4 单轨；后台测试不显示窗口 | 严格 Schema/Registry、旧版本明确拒绝；隐藏 Electron 26/26；115 文件/717 测试；桌面生产构建 | **通过** | 无软件阻断；人工/分发项见第 10.4 节 |
| S2 | V8 原生文本着重号 | 节点/run 语义、编辑命令、状态、保存重开、复制粘贴、四格式制品与持久视觉证据 | **通过** | 结果状态仍只属于软件工程候选 |
| S3 | 外部组件目录与九个 `experimental` 组件 | 九包哈希匹配；最终隐藏矩阵 2/2；225 次导航；PDF 9 页、PPTX 9 张；组件双重核验 exit 0 | **通过**；矩阵 metadata 阻断已移除 | 许可、来源与维护人仍阻断组件发布 |
| S4 | 教师控制器、PresenterInput、FormulaNode、Export Preflight | 控制器/Presenter/Formula/预检自动化、四格式视觉证据及持久 Preflight JSON | **通过** | 真实翻页硬件人工冒烟未执行，不改变软件基线结论 |
| S5 | designTokens、图片安全区、信息释放、视觉密度 | 相应只读/编辑能力、115/717 全量基线和跨表面边界均已通过；多帧捕获保持研究项 | **通过** | 作者辅助不进入成品，也不变成确定性阻断 |
| S6 | 软件工程基线验收 | 类型、115/717 Vitest、隐藏 Electron 26/26、九组件矩阵 2/2、桌面构建、四格式与视觉证据 | **软件工程基线通过** | 签发结果仅为 `engineering candidate`，W1 尚未开始 |

## 3. S1：严格单轨与后台窗口策略

### 3.1 协议边界

已有实现证据：

- Project 常量与 Schema：`src/shared/constants.ts`、`src/shared/projectSchema.ts`；当前只接受 `schemaVersion: 8`。
- 工程打开边界：`src/renderer/project/projectArchive.ts`；Project V1–V7 会得到明确的“不自动迁移”错误。
- Runtime：`src/shared/runtimeSchema.ts`、`src/player/RuntimeRegistry.ts`、`src/player/RuntimeHost.ts`；当前主线只接受 Runtime API 2，开发合同见 `docs/RUNTIME_AUTHORING.md`。
- Component：`src/shared/componentSchema.ts`、`src/player/ComponentRegistry.ts`、`src/renderer/components/importComponentPackage.ts`；当前主线只接受 Component Schema / Runtime API 4。
- 对应拒绝与当前协议测试：`tests/unit/projectV8Schema.test.ts`、`tests/unit/projectArchive.test.ts`、`tests/unit/runtimeSchema.test.ts`、`tests/integration/runtimeRegistry.test.ts`、`tests/unit/runtimeHostV2.test.ts`、`tests/unit/componentProtocolV4.test.ts`。

阶段记录：S1 完成时的工作树快照曾执行 `npm test`，结果为 **115 个测试文件、707 个测试通过**。该数量只能证明当时快照，不替代本报告签发前对最终工作树的复跑。

### 3.2 Electron/Playwright 后台窗口策略

默认后台 E2E 的目标不是“把窗口挪远一点”，而是 BrowserWindow 从始至终不显示、不聚焦、不进入任务栏；透明与离屏位置仅为防御性附加条件。

实现证据：

- 环境开关：`src/main/windowVisibility.ts` 的 `COURSEWARE_E2E_BACKGROUND`。
- 主窗口：`src/main/createWindow.ts`。后台模式使用 `show: false`、`skipTaskbar: true`、`opacity: 0`、离屏坐标；`ready-to-show` 仅在正常可见模式调用 `window.show()`。
- 预览窗口：`src/main/previewWindow.ts`，执行相同的隐藏策略。
- 默认 E2E：`tests/e2e/editor.spec.ts` 与 `tests/e2e/componentCatalogMatrix.spec.ts` 默认把未显式提供的模式解释为后台，并检查所有 BrowserWindow 同时满足 `!isVisible()`、`!isFocused()`、透明和离屏坐标。
- 发布验证：`scripts/verify-release.ts` 在打包目录和便携程序启动时显式注入 `COURSEWARE_E2E_BACKGROUND=1`，并使用 `windowsHide: true` 启动子进程。
- 单元边界：`tests/unit/windowVisibility.test.ts` 证明普通应用启动仍可见，只有后台 E2E 被隐藏。
- 可见调试为显式选择：`package.json` 中只有 `npm run test:e2e:visible` 会把环境开关设为 `0`；S6 不运行该命令。

最终隐藏 Electron 长跑已提供实际运行证据；它不替代尚未完成的非 Electron 基线和生产构建：

| 项目 | 结果 |
|---|---|
| `npm run test:e2e` 命令、退出码、测试数量、耗时 | **PASS；exit 0；26/26；约 21.7 分钟** |
| 主窗口全程 `isVisible=false` / `isFocused=false` | **PASS** |
| 预览窗口全程 `isVisible=false` / `isFocused=false` | **PASS** |
| 任务栏无测试窗口、未抢占用户焦点 | **PASS** |
| 失败重试、导出窗口与退出阶段仍保持隐藏 | **PASS；完整套件所有隐藏窗口断言通过** |

`test-results/.last-run.json` 记录 `status: passed` 且 `failedTests: []`。组件运行证据同时记录 `backgroundWindowIsolation: true`。本轮没有运行 `npm run test:e2e:visible`。

## 4. S2：文本着重号

能力证据覆盖：

- V8 节点级与 rich-text run 级语义：`src/shared/projectTypes.ts`、`src/shared/projectSchema.ts`、`src/shared/textRuns.ts`。
- 排版与横排/竖排渲染：`src/shared/textLayout.ts`、`src/player/renderNode.ts`、编辑画布文本适配链路。
- 编辑、选区、撤销/重做、状态：`src/renderer/ui/TextEditOverlay.tsx`、`src/renderer/store/editorStore.ts`。
- PPTX 保真策略：`src/renderer/export/buildPptx.ts`、`src/renderer/export/pptxTextAndShape.ts`。
- 核心定向测试：`tests/unit/textEmphasis.test.ts`；相关排版、富文本、UI、导出回归分布在 `tests/unit/textLayout.test.ts`、`tests/unit/textRuns.test.ts`、`tests/unit/editorFormattingUi.test.tsx`、`tests/unit/export.test.ts`。

已知定向记录：**33/33 通过**。最终签发已由同一工作树的 115 文件/717 项全量基线、隐藏 Electron 26/26 与持久化四格式制品共同证明；该证据不只验证 JSON 与 Canvas 命令存在，也包含真实导出和逐页/逐张视觉复核。

## 5. S3：外部目录与九组件证据

### 5.1 目录、按需嵌入与锁定

实现与测试入口：

- 目录契约：`src/shared/componentCatalog.ts`。
- 扫描、目录根信任与哈希检查：`src/main/componentCatalogScanner.ts`、`src/main/componentCatalogManager.ts`。
- 编辑器状态与按需嵌入：`src/renderer/components/componentCatalogStatus.ts`、`src/renderer/components/componentPackageStore.ts`、`src/renderer/components/importComponentPackage.ts`。
- 构建/核验脚本：`scripts/build-component-catalog-matrix.ts`、`scripts/verify-component-catalog.ts`。
- 单元/集成/E2E 入口：`tests/unit/componentCatalog.test.ts`、`tests/unit/componentCatalogReplacement.test.ts`、`tests/unit/componentCatalogStatus.test.ts`、`tests/unit/componentCatalogUi.test.tsx`、`tests/integration/componentCatalogV8Matrix.test.ts`、`tests/e2e/componentCatalogMatrix.spec.ts`。

当前自动化覆盖浏览不嵌入、首次使用才嵌入、精确版本与 SHA-256 锁定、同版本不同哈希拒绝、只提示更新而不静默替换、属性编辑、撤销/重做、状态覆盖、保存重开、生命周期、离线运行、压力翻页和四格式导出；最终隐藏 E2E 中的矩阵测试已经通过 2/2。S6 同时完成了非 Electron 组件构建/核验和总工作树指纹冻结；许可、素材来源、维护人和发行包集成仍是独立发布阻断，不因矩阵通过而解除。

### 5.2 九个包、哈希与发布阻断

权威目录：`C:\Users\74755\Documents\courseware-components\catalog.json`。来源边界：`C:\Users\74755\Documents\courseware-components\PROVENANCE.md`。2026-08-11 对 `packages/*.h5component` 做了只读 SHA-256 重算，以下九项均与目录值匹配：

| 组件 | 版本 | SHA-256 | 质量 | 发布阻断 |
|---|---:|---|---|---|
| `com.alepha.language.reading-annotation` | 1.0.3 | `70a9deb58fb3282dd87c9d432f1cca8fab6db46d4278a44b97757a7d64aa3e11` | experimental | license、maintainer |
| `com.alepha.language.pinyin-annotation` | 1.1.1 | `e606c5283c46656d29910b4b42775f98833e766253a7502013c6febf572bc904` | experimental | license、maintainer |
| `com.alepha.visual-container.transparent-glass` | 1.0.0 | `0f71d0194af324a1619257dea1ab5d73a466694910b31e95bd98c8c186c49143` | experimental | asset license、asset provenance、maintainer |
| `com.alepha.visual-container.frosted-glass` | 1.0.0 | `4385f786265a1a1ab96a4a60687ba6956d938175e9dcf8df1e86cb4f7c0aaf93` | experimental | asset license、asset provenance、maintainer |
| `com.alepha.visual-container.torn-paper` | 1.0.0 | `21f6ed79345620b8fe01345dd425721dd460f9cf1db8186e06572d750fde3055` | experimental | asset license、asset provenance、maintainer |
| `com.alepha.visual-container.brush` | 1.0.0 | `d49a5e1ed91a1c367d27ac499be2729f0f15258d340851b7ef21afbdbc19e400` | experimental | asset license、asset provenance、maintainer |
| `com.alepha.visual-container.sticky-note` | 1.0.0 | `cf6bb96fe507455617c2f4a839f4a119847f689845139ad7b3ad217a01825a88` | experimental | asset license、asset provenance、maintainer |
| `com.alepha.visual-container.file-folder` | 1.0.0 | `9bba62fc028b938f188b6d5ce18bcd94ef9c73af1fb09c893ec92ab5ee7a9590` | experimental | asset license、asset provenance、maintainer |
| `com.alepha.visual-container.sticker` | 1.0.0 | `c02bfc07c7963ba7f044e6eaba5d761f67ac6c2e8321b184dffe9d2efa743ccf` | experimental | asset license、asset provenance、maintainer |

阻断字段的完整机器值以 `C:\Users\74755\Documents\courseware-components\catalog.json` 为准：两个语言组件仍写有 `license-unverified`、`maintainer-unassigned`；七个视觉容器仍写有 `asset-license-unverified`、`asset-provenance-unverified`、`maintainer-unassigned`。最终隐藏矩阵通过后，九项均登记 5 个 `verifiedCases` 和同一 `verifiedAt: 2026-08-10T20:55:36.685Z`，并只移除了 `current-v8-full-matrix-unverified`。catalog 当前 SHA-256 为 `407aa7311f115c80df9f37ef284302531765ccfaee197fd248e2104975063a3e`。没有新的来源、授权与负责人证据时，其余阻断无论如何都不得清除，九组件质量级别继续保持 `experimental`。

### 5.3 已有生成物运行证据

当前可追溯文件：

- `artifacts/component-catalog-matrix/matrix-build-evidence.json`
- `artifacts/component-catalog-matrix/matrix-runtime-evidence.json`
- `artifacts/component-catalog-matrix/component-catalog-v8-matrix.project.json`
- `artifacts/component-catalog-matrix/component-catalog-v8-matrix.h5lesson`
- `artifacts/component-catalog-matrix/component-catalog-v8-matrix.html`
- `artifacts/component-catalog-matrix/component-catalog-v8-matrix-web.zip`

`matrix-build-evidence.json` 记录 Project V8、Component Schema/Runtime API 4、九场景、九组件和精确目录哈希。最终隐藏 Electron 矩阵通过 2/2 后，`matrix-runtime-evidence.json` 已记录最终段且不含 `notYetVerified`；该文件 SHA-256 为 `c3cae1907ae8faa6d1018f3413041bc73ecc42847caabf7c98889747bb1376ff`：

- 生成的独立 HTML：225 次导航，挂载实例始终为 1，无外部请求，无页面错误；
- 生成的网页包：9 次导航，挂载实例始终为 1，无外部请求，无页面错误；
- 压力参数：25 轮 × 9 场景 = 225 次导航；
- `backgroundWindowIsolation: true`，九组件 Electron 目录 UI 完成按需嵌入、删除/撤销/重做、保存重开和哈希锁定；
- 编辑画布逐场景挂载一个组件，九张缩略图均完成非空像素断言，命名状态覆盖逐一显示；
- 独立预览窗口完成九场景离线遍历，挂载实例始终为 1，无外部请求、页面错误或组件失败诊断；
- 编辑器真实导出的单 HTML 与网页包分别完成九场景离线遍历，挂载实例始终为 1，无外部请求或页面错误；
- 编辑器真实导出的 PDF 具有 9 页，PPTX 具有 9 张包含组件图片和追踪文字的幻灯片。

该轮编辑器真实产物与截图位于：

- `output/playwright/component-catalog-matrix/catalog-ui-roundtrip.h5lesson`
- `output/playwright/component-catalog-matrix/catalog-matrix-ui.html`
- `output/playwright/component-catalog-matrix/catalog-matrix-ui-web.zip`
- `output/playwright/component-catalog-matrix/catalog-matrix-ui.pdf`
- `output/playwright/component-catalog-matrix/catalog-matrix-ui.pptx`
- `output/playwright/component-catalog-matrix/editor-nine-component-matrix.png`
- `output/playwright/component-catalog-matrix/preview-player.png`
- `output/playwright/component-catalog-matrix/standalone-player.png`

这组文件证明九组件最终隐藏工程矩阵已经通过 2/2。`output/` 目录仍可能被后续测试覆盖，因此运行证据 JSON 的持久哈希已在上文冻结；四格式产物的最终字节数、哈希和视觉检查仍在第 10 节单独记录，不能只凭 E2E 退出码宣称 `accepted`。

## 6. S4：控制、公式与导出预检

### 6.1 PresenterInput 与教师控制器

实现证据：

- Presenter 输入与 PageUp/PageDown/作者命令：`src/player/PlayerPresenterInput.ts`、`src/player/InteractionEngine.ts`、`src/renderer/ui/PresenterSettingsEditor.tsx`。
- 控制器运行会话、拖动、逻辑坐标换算、旋转边界、贴边、键盘等价与无障碍：`src/player/teacherControllerRuntimeSession.ts`、`src/player/renderTeacherController.ts`、`src/shared/teacherControllerLayout.ts`。
- 定向测试：`tests/unit/playerPresenterInput.test.ts`、`tests/unit/presenterSettingsUi.test.tsx`、`tests/unit/teacherControllerRuntimeSession.test.ts`、`tests/unit/teacherControllerLayout.test.ts`、`tests/unit/teacherControllerActions.test.ts`。

定向测试覆盖输入去重、可编辑区域/组件键盘所有权排除、边界反馈、作者命令不隐式翻页、鼠标/触控点击与拖动阈值、固定逻辑画布换算、折叠/旋转边界与贴边；最终隐藏 E2E 已确认鼠标拖动、Alt/Shift 键盘细移、缩放换算、切页/重播保持，以及单 HTML/网页包 PageUp/PageDown。真实触控和翻页硬件仍属于第 10.4 节人工项，自动化不冒充硬件验收。

### 6.2 FormulaNode

实现与定向证据：

- V8 AST、样式、无障碍与状态契约：`src/shared/projectTypes.ts`、`src/shared/projectSchema.ts`。
- 递归共享渲染器：`src/shared/formulaRenderer.ts`。
- 编辑画布适配器与 Player：`src/renderer/phaser/adapters/FormulaNodeAdapter.ts`、`src/player/renderNode.ts`。
- 导出与静态化：`src/renderer/export/buildPublishedLesson.ts`、`src/renderer/export/buildPptx.ts`、`src/renderer/export/renderSceneImages.ts`。
- 测试：`tests/unit/formulaNode.test.ts`、`tests/unit/formulaNodeUi.test.tsx`、`tests/unit/formulaCrossSurface.test.tsx`。

这些测试覆盖最小递归 AST、公式稳定 ID、保存/发布往返、状态覆盖与撤销/重做、裁切诊断、作者 UI、Editor/Player/缩略图/静态捕获、PPTX 透明图片静态化。最终同工作树基线和真实四格式视觉证据如下：

| FormulaNode 证据 | 结果 |
|---|---|
| 阶段定向结果 | 已纳入最终 `npm test` 115 文件/717 项测试，exit 0；视觉证据见下三行 |
| HTML/网页包实际显示截图 | `artifacts/software-core-verification/formula-cross-surface/html.png`、`web.png`；横/竖/局部 run 着重号与递归公式可见 |
| PDF 页面截图与公式清晰度 | `artifacts/software-core-verification/formula-pdf-render/slide-1.png`；1 页，无空白、裁切或非预期重叠 |
| PPTX 透明图片、元数据与视觉抽检 | `artifacts/software-core-verification/formula-pptx-render/slide-1.png`；1 张、4 个媒体对象，扩大画布检查 `overflow=[]` |

### 6.3 Export Preflight

实现证据：

- 统一报告模型与四目标格式检查：`src/renderer/export/exportPreflight.ts`。
- 错误阻断、warning/info 人工确认、定位与 JSON 保存：`src/renderer/ui/ExportPreflightDialog.tsx`、`src/renderer/App.tsx`。
- JSON 文件对话框链路：`src/shared/ipcTypes.ts`、`src/main/fileDialogs.ts`、`src/main/ipc.ts`。
- 定向测试：`tests/unit/exportPreflight.test.ts`、`tests/unit/exportPreflightUi.test.tsx`。

测试覆盖缺失素材、组件/运行时外网依赖、稳定状态几何、字号/溢出、静态格式解释，以及低对比度、密度、安全区、图片硬边和控制器遮挡等明确标为 heuristic 的 warning/info。真实单 HTML 导出的零问题预检 JSON 已持久归档；错误阻断、warning/info 需用户确认后继续、定位与 JSON 保存链路均由单元/UI/E2E 回归保护。

### 6.4 当前导出 Payload 与运行时静态化回归

当前职责命名下的证据入口：

- 导出 Payload 的运行时/组件依赖校验、静态导出条目与快照键：`src/renderer/export/exportPayloadSupport.ts`。
- Runtime API 2 的单 HTML、网页包、PDF 与 PPTX 回归：`tests/unit/runtimeExport.test.ts`。

该测试文件覆盖发布数据保留、资源改写、依赖与作用域拒绝，以及 PDF/PPTX 的实际快照、逐项回退和可见占位断言；相关回归已纳入最终 `npm test` 115 文件/717 项测试并通过。

## 7. S5：最小作者评审辅助

| 能力 | 软件边界 | 证据路径 | 已知状态 |
|---|---|---|---|
| `designTokens` | 项目级稳定字体/颜色 ID 与值；不承载美术 prose，不自动改节点 | `src/renderer/ui/DesignTokensEditor.tsx`、`src/shared/projectSchema.ts`、`tests/unit/designTokens.test.tsx` | 最终 115/717 基线通过 |
| 图片 `safeAreas` | 节点归一化作者元数据；只在编辑画布显示，不进入 Player/缩略图/导出 | `src/renderer/phaser/adapters/ImageNodeAdapter.ts`、`tests/unit/imageSafeAreas.test.tsx` | 最终 115/717 基线通过 |
| 信息释放 | 基于现有 state/interaction 的只读可达性检查；不建立第二运行时 | `src/shared/informationRelease.ts`、`tests/unit/informationRelease.test.ts`、`tests/unit/projectHealth.test.ts` | 最终 115/717 基线通过 |
| 视觉密度 | 0–100 只读启发式概览；不单独阻断导出 | `src/shared/visualDensity.ts`、`tests/unit/visualDensity.test.ts`、`tests/unit/exportPreflight.test.ts` | 最终 115/717 基线通过 |
| 动态多帧捕获 | 研究项；当前只保留 `waitUntil()` + `prepareCapture()` 的确定帧 | `src/renderer/export/playerCapture.ts`、`tests/unit/playerCapture.test.ts` | 不实现第二协议；不是 S6 阻断项 |

`tests/unit/exportPreflightUi.test.tsx`、`tests/unit/playerCapture.test.ts` 与上述 S5 定向测试均已纳入最终 115 文件/717 项基线；同一工作树的类型检查、隐藏 E2E、生产构建和持久证据索引也已统一记录在本报告。

## 8. 跨表面能力矩阵

图例：`最终基线` = 115/717 非 Electron 测试已通过；`最终 E2E` = 隐藏 Electron 长跑已通过并落盘证据；`视觉归档` = 对应真实制品已有持久截图/渲染检查；`不进入` = 契约明确不出现在该表面；`不适用` = 能力本身不属于该表面。

| 对象 | 数据/协议 | 编辑/撤销 | 状态/运行 | 保存重开 | 缩略图 | HTML | 网页包 | PDF | PPTX | 离线/隔离 |
|---|---|---|---|---|---|---|---|---|---|---|
| Project V8 / Runtime 2 / Component 4 单轨 | 最终基线 | 最终 E2E | 最终基线 | 最终 E2E | 最终 E2E | 最终 E2E | 最终 E2E | 最终 E2E | 最终 E2E | 最终 E2E |
| 文本着重号 | 最终基线 | 最终基线 | 最终基线 | 最终 E2E | 最终 E2E | 视觉归档 | 视觉归档 | 视觉归档 | 视觉归档 | 最终 E2E |
| FormulaNode | 最终基线 | 最终基线 | 最终基线 | 最终 E2E | 最终 E2E | 视觉归档 | 视觉归档 | 视觉归档 | 视觉归档 | 最终 E2E |
| 九个外部组件 | 哈希匹配 | 最终 E2E | 最终 E2E | 最终 E2E | 最终 E2E | 最终 E2E | 最终 E2E | 最终 E2E（9 页，逐页视觉检查通过） | 最终 E2E（9 张，逐张视觉检查通过） | 最终 E2E；225 次压力；挂载始终为 1 |
| 教师控制器 | 最终基线 | 最终基线 | 最终 E2E | 会话偏移重开复位 | 最终 E2E | 最终 E2E | 最终 E2E | 不适用 | 不适用 | 最终 E2E |
| PresenterInput | 最终基线 | 最终基线 | 最终 E2E | 最终 E2E | 不适用 | 最终 E2E | 最终 E2E | 不适用 | 不适用 | 最终 E2E |
| Export Preflight | 最终基线 | 定位/保存 JSON 通过 | 不适用 | 报告已归档 | 不适用 | 最终 E2E | 最终基线 | 最终基线 | 最终基线 | 最终 E2E |
| `designTokens` | 最终基线 | 最终基线 | 不自动改节点 | 最终基线 | 不进入 | 随发布所需值 | 随发布所需值 | 不进入 | 不进入 | 最终基线 |
| 图片 `safeAreas` | 最终基线 | 最终基线 | 不进入 | 最终基线 | 不进入 | 不进入 | 不进入 | 不进入 | 不进入 | 最终基线 |
| 信息释放/视觉密度 | 最终基线 | 只读、不改工程 | 不进入 | 可重算 | 不进入 | 不进入 | 不进入 | 不进入 | 不进入 | 最终基线 |
| 大媒体 `sandbox-transfer` | 最终基线 | 最终 E2E | 最终 E2E | 最终 E2E | 最终 E2E | 最终 E2E | 最终 E2E | 最终基线 | 最终基线 | 最终 E2E |

## 9. 已知定向测试与最终长跑清单

### 9.1 早期定向记录与最终基线归并

| 检查 | 当前记录 | 证据限制 |
|---|---|---|
| S1 快照 `npm test` | 115 个测试文件、707 个测试通过 | 已由最终 115 文件/717 项测试取代 |
| S2 文本着重号定向 | 33/33 通过 | 已纳入最终 115/717 基线并有真实视觉制品 |
| 当前 `npm run typecheck` | 通过 | 只证明执行时类型状态，不证明 E2E、构建或视觉结果 |
| Project Health / 信息释放 / Export Preflight / UI | 定向通过记录 | 已纳入最终 115/717 基线；Preflight JSON 已归档 |
| 视觉密度 / 图片安全区 / designTokens | 定向通过记录 | 已纳入最终 115/717 基线 |
| Player 捕获 | `tests/unit/playerCapture.test.ts` 5/5 通过记录 | 不等于真实 Electron 导出通过 |
| FormulaNode 三个定向测试文件 | 一轮通过记录 | 已纳入最终 115/717 基线；四格式与截图已归档 |
| 九组件包构建/目录核验 | 九包已生成；哈希与 `catalog.json` 匹配；九项各登记 5 个 verified case | 矩阵 metadata 阻断已移除；许可、来源和维护人阻断保留 |
| 最终隐藏 E2E | `npm run test:e2e` 26/26，exit 0，约 21.7 分钟 | 与最终非 Electron 基线、生产构建共同完成 S6 签发 |
| 九组件 V8 完整矩阵 | E2E 子集 2/2：目录 UI、编辑/撤销、状态、保存重开、Player、九缩略图、真实 HTML/网页包/PDF/PPTX、离线与 225 次压力 | PDF 9 页、PPTX 9 张逐页/逐张视觉检查通过；不解除许可/来源/维护人阻断 |

### 9.2 最终长跑结果

以下结果来自实现收口后的同一工作树；Electron 使用后台模式，未运行 `npm run test:e2e:visible`。未重复调用只负责串联已执行步骤的 wrapper 时，表中明确列出其等价分段，避免虚构一次额外命令。

| 命令 | 测试/任务数量 | 退出码 | 耗时 | 结果 |
|---|---:|---:|---:|---|
| `npm run typecheck` | TypeScript 工程检查 | 0 | 4.9 秒 wall | **PASS** |
| `npm test` | 115 个文件 / 717 项测试 | 0 | 19.8 秒 wall；Vitest 18.44 秒 | **PASS**；仅有 jsdom Canvas 非致命提示 |
| `npm run verify:component-catalog` | 9 包 | 0 | 1.3 秒 | **PASS** |
| `npm run test:component-catalog-matrix` | Vitest 4 文件/20 项；Playwright 矩阵 2/2 | 0 | 288.8 秒 wall；Playwright 7.4 秒 + 4.5 分钟 | **PASS；完整隐藏矩阵** |
| `npm run test:e2e` | 26/26 | 0 | 约 21.7 分钟 | **PASS；完整隐藏模式** |
| `npm run build` 等价分段 | `typecheck` + `test` + `build:desktop` | 0 / 0 / 0 | 4.9 + 19.8 + 19.4 秒 wall | **PASS**；wrapper 未重复执行 |
| `npm run build:desktop` | Player 126 modules；Renderer 2007 modules；Electron `tsc` | 0 | 19.4 秒 wall | **PASS**；仅有既有 chunk / `inlineDynamicImports` warning |
| 组件仓库 `npm run verify` | 9 包 | 0 | 1.1 秒 | **PASS** |

若使用 `npm run verify` 或 `npm run verify:release` 作为汇总入口，仍需记录它展开后的每一阶段结果，避免一个总退出码掩盖跳过项。

## 10. 最终产物、哈希与视觉证据

`release/` 当前存在的 1.6.0 历史包和失败打包调试目录不属于本轮 V8 验收，不能被登记为当前产物。本轮真实四格式制品和生产构建均由第 1 节绑定的工作树生成，并登记如下。

### 10.1 编辑器真实导出

| 目标 | 最终绝对/仓库相对路径 | 字节数 | SHA-256 | 自动检查 | 视觉证据与结果 |
|---|---|---:|---|---|---|
| 单 HTML | `artifacts/software-core-verification/formula-cross-surface/formula-static.html` | 1,684,218 | `3efc1d6be6447a68c4f4f6bbb52d0269292dbf2cb2a86895b998ba94a275e1a3` | Formula 跨表面截图通过 | 横/竖/局部着重号与递归公式可见 |
| 网页包 ZIP | `artifacts/software-core-verification/formula-cross-surface/formula-static-web.zip` | 472,246 | `e410b36fe869a65b8a3d6e2bfdde45b2ea3742ff680471659efa688b5982f2ab` | Formula 跨表面截图通过 | 与单 HTML 画面一致 |
| PDF | `artifacts/software-core-verification/formula-cross-surface/formula-static.pdf` | 32,770 | `8f5e5b4453f9d7bb785764040cf25f79dd0d34e76e63b76162314fb4e8328330` | 1 页、1 图像 | 无空白、裁切或非预期重叠 |
| PPTX | `artifacts/software-core-verification/formula-cross-surface/formula-static.pptx` | 111,379 | `fdaf199f33b4f5700323c8d23e4902368124823824266b17fa7f74e6b92d43a5` | 1 张、4 个媒体对象；`overflow=[]` | 无空白、裁切或非预期重叠 |
| Export Preflight JSON | `artifacts/software-core-verification/offline-courseware-single-html-preflight.json` | 289 | `360f39fd4cfff4d4ffe5721b1baf9ceccade743f3de25cc3179eca73685aabe8` | Project V8 / single HTML；items 为空；error/warning/info 均为 0；`canExport: true` | 不适用 |

已抽检文本着重号横排/竖排与局部 run、FormulaNode 分数/根式/上下标、九个组件、状态覆盖、DOM/Canvas 对齐、字体与图片边界；PDF/PPTX 共 20 个渲染页面逐页检查无空白、裁切或非预期重叠。PPTX 结构检查同时确认普通文本路径与着重号/公式保真静态化产物存在。

### 10.2 构建与发布候选

| 产物 | 路径 | 字节数 | SHA-256 | 启动/离线结果 |
|---|---|---:|---|---|
| Player 生产构建 | `dist-player/` | 1,675,975（1 文件） | tree SHA-256 `71d3875ec0b829fab32188adb256ace33e0c36f68f22461d78f97128884ef71b` | `build:desktop` PASS；Player 126 modules |
| Renderer 生产构建 | `dist-renderer/` | 20,596,020（14 文件） | tree SHA-256 `e6e24a4d3f6e79591eed6aeaae1d390659a4fd6307fd82230101d032557ef7be` | `build:desktop` PASS；Renderer 2007 modules |
| Electron 生产构建 | `dist-electron/` | 669,247（102 文件） | tree SHA-256 `6411a76f78ef9077710716141433ed065fd26a30e74dc7f9c652e6eb7c595abe` | Electron `tsc` PASS |
| Windows 打包目录或便携程序（若本轮生成） | **未生成；当前仅有不属于本轮的历史 1.6.0 产物** | 不适用 | 不适用 | **未完成：无干净 Windows 包启动、创建/保存/重开证据** |

### 10.3 截图/录屏索引

| 证据 | 路径 | 审核结果 |
|---|---|---|
| 编辑画布 + Player 对照 | `artifacts/software-core-verification/formula-cross-surface/editor.png`、`player.png` | Formula 与着重号跨表面可见，检查通过 |
| 缩略图九组件/着重号/公式 | `output/playwright/component-catalog-matrix/editor-nine-component-matrix.png`；Formula 证据见上行 | 九组件缩略图断言通过；Formula/着重号视觉证据已归档 |
| 单 HTML/网页包离线运行 | `artifacts/software-core-verification/formula-cross-surface/html.png`、`web.png` | 两条路径画面一致；E2E 外部请求为空 |
| PDF 渲染页 | `artifacts/software-core-verification/matrix-pdf-render/slide-1.png` 至 `slide-9.png`；`formula-pdf-render/slide-1.png` | 9+1 页逐页检查，无空白、裁切或非预期重叠 |
| PPTX 渲染页 | `artifacts/software-core-verification/matrix-pptx-render/slide-1.png` 至 `slide-9.png`；`formula-pptx-render/slide-1.png` | 9+1 张逐张检查，扩大画布检查 `overflow=[]` |
| 后台 E2E 窗口状态日志 | `artifacts/component-catalog-matrix/matrix-runtime-evidence.json`；第 9.2 节最终命令记录 | 26/26 PASS；`backgroundWindowIsolation: true` |

全部视觉结果和 Export Preflight 的机器可读索引位于 `artifacts/software-core-verification/visual-verification.json`，状态为 `pass`，生成时间为 `2026-08-10T21:22:51.6571982Z`，当前文件 SHA-256 为 `379e49ad1f3685a9f861e92388df9853a786ca1d0031d39901dfd39dcd480d0c`。其中九组件矩阵 PDF 为 2,515,879 字节、SHA-256 `215d205b65db974c51634125f23f0d07564f1df15391f1a590dbcefbac601305`，PPTX 为 3,007,913 字节、SHA-256 `9349999be52ac93a1ab688d9996bc20db8f2d3a784b148c6b9a1fae41211f477`；两者分别完成 9 页/9 张全量视觉检查。

### 10.4 明确未完成且不得由自动化推断的项目

- 三仓物理拆分未完成：仅 `courseware-components` 已物理落地；`courseware-cases` 建库与历史课例迁移按已批准边界留到用户另行授权的 W1，不是 S6 软件阻断项。
- 未生成或验证当前 1.0.0 Windows Portable、目录版或安装包，也没有干净 Windows 环境的包启动、创建、保存和重开证据。
- 未执行根目录 `启动课件编辑器.cmd` 的人工启动冒烟。
- 未执行至少两类真实翻页硬件/按键输出的人工冒烟；现有 PresenterInput 自动测试不能冒充硬件验收。
- 通用工作流、语文学科工作流、Project V8 实现 Skill、冷启动课例和教学/美术/课堂结果验收均未启动。

## 11. 最终签发规则

以下条件已经满足，因此本报告签发为“S6 软件工程基线通过”：

1. 第 1 节的工作树、依赖与环境指纹完整；
2. 第 9.2 节全部命令在同一最终工作树通过，且精确数量、耗时与退出码已记录；
3. Electron 主窗口、预览窗口和发布验证启动全程隐藏、未聚焦、未进入任务栏；
4. 九组件目录与包哈希一致，编辑/重开/Player/缩略图/真实四格式导出/离线/压力/错误隔离矩阵完成；
5. HTML、网页包、PDF、PPTX 与构建产物路径、字节数、SHA-256 和视觉证据齐全；
6. 确定性 error 与 heuristic warning/info 的分层没有被混淆；
7. 九组件仍保持 `experimental`，且许可、素材来源、维护人未补证前不提升质量级别；
8. 没有启动通用工作流、语文学科工作流、Skill 或真实课例开发来掩盖软件本体缺口。

即使上述 S6 条件全部满足，最终签发措辞仍应是：

> **软件本体 engineering candidate**

后续必须另行完成工作流/Skill 与真实冷启动课例验收，才能讨论“课件生产工作流 accepted”或“真实课件 accepted”。
