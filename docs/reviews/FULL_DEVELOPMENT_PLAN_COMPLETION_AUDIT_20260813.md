# 全开发计划完成审计（2026-08-13）

> 历史审计。当时对照的是 Project V8 / 多表面计划；现行总纲是根目录 `COURSEWARE_DEVELOPMENT_PLAN.md` 12.1。本记录不得称为当前完成定义。

## 1. 审计结论

**完整开发计划尚未完成。** 当前软件主线的 Slide / Project V8 基础、W1 工作流实现和 W3 同机可移植性自动化已经形成较强的 `engineering candidate`，但完成定义中的下列硬条件仍不成立：

1. W2 数学、语文两个冷启动课例已经持久化有效用户选择并进入 `contract-review`，但合同仍在编写，尚无任何批准、`implementation-ready`、`.h5lesson`、HTML、网页包、PDF、PPTX、逐幕图像、contact sheet、录屏或人工 `accepted`。
2. W3 尚无另一台真正干净 Windows 的首次安装/可见冒烟，也没有两个 W2 课例和内部正式版的人类接受。
3. 里程碑 6–9 均未实现；它们依次受 W3、Flow `art candidate`、两表面生产可用和多表面宿主稳定等前置门禁约束。

因此，当前允许的总签名是：

- 软件管线：**Capability check 与最终全量 Vitest 130 文件/804 项均为绿色；整体仍签发为 `engineering candidate`**。
- Slide 产品结果：**`engineering candidate`，未 `accepted`**。
- W2 产品结果：**决定已确认、合同编写中，`pending`，0/2 达到 `accepted`**。
- 内部正式版 1.0：**未完成**。
- 多表面路线：**未开始生产实现，未完成**。

## 2. 审计范围、状态口径与证据优先级

审计以以下当前状态为权威，而不是以计划中的“已完成”文字自身作为证明：

- 核心仓：`C:\Users\74755\Documents\HTML课件编辑器`，分支 `codex/complete-development-plan`，HEAD `79ee9816cbaa`，审计时有 95 个工作树状态条目。
- 课例仓：`C:\Users\74755\Documents\courseware-cases`，`main@e66dcfa58583`，工作树干净。
- 组件仓：`C:\Users\74755\Documents\courseware-components`，仓内证据快照加固已提交为 `main@e85b65a`，工作树干净。
- 当前源码、Schema、测试和机器报告优先于历史说明；实际命令结果优先于文档中旧的测试数量；真实制品优先于清单声明；明确人类意见才可证明 `accepted`。

本文使用以下状态：

| 状态 | 含义 |
| --- | --- |
| **已证明** | 当前或冻结证据直接覆盖要求，未发现相反证据 |
| **已实现，待最终复验** | 实现和历史证据存在，但当前并发工作树尚未完成最终绿色复验/固化 |
| **部分完成** | 只覆盖要求的一部分，不能外推到完整门禁 |
| **未完成** | 当前证据直接表明必需产物或结果不存在 |
| **未启动（正确受门禁约束）** | 前置依赖未满足，按计划不得越级开始 |

## 3. 当前自动化与仓库快照

### 3.1 实时命令结果

| 检查 | 本次审计快照 | 结论 |
| --- | --- | --- |
| `npm run --silent check:ai-capabilities` | 通过；索引 6327 / 16384 字节，组件目录 `available` | Capability Index、生成证据与当前来源一致 |
| `npm run --silent test` | **130 个文件 / 804 项全部通过** | 包含 Project V8 Builder 端到端、前向夹具、证据真实性和 W3 可移植性单测 |
| 组件仓 `npm run --silent verify` | 通过；4 个 Component API 4 包，100 次压力导航，证据 SHA-256 `9a925e0900226e163ee6a506e3ab6fb8b5b01872969a58e837f2ad345fd65f87` | 仓内 attestation 链自洽、可执行，已提交为 `e85b65a` |
| W3 机器报告 | 7/7 检查通过，状态 `engineering-candidate` | 证明同机隔离复制、断源、移动和离线运行，不证明另一台干净 Windows 或人类接受 |

130/804 是本轮主线稳定后的最终全量 Vitest 数字，Capability 产物也已在同一最终状态刷新并通过。若此后继续修改源码、Skill 或测试，该数字与生成证据会自然失效，必须重新执行相同门禁；类型检查、隐藏 Electron E2E 和桌面生产构建的完整绿色证据仍以最近冻结记录为准，并应在 W3 最终签署前再做一次同工作树复验。

### 3.2 已存在的冻结/历史绿色证据

| 证据 | 已证明范围 | 不足以证明的范围 |
| --- | --- | --- |
| `internal-prototype-1.7.0` / `af5908d` | 里程碑 0 可恢复归档、100 文件/641 项测试和生产构建 | 当前 1.0.0 工作树 |
| `PRODUCT_IDENTITY_RENAME_VERIFICATION_20260812.md` | 127 文件/799 项、隐藏 E2E 27/27、制品 16/16、身份与 Headless 基线 | 后续 W1/W3 新代码的最终同树复验 |
| `COURSEWARE_WORKFLOW_W1_VERIFICATION_20260813.md` | W1 历史快照 129 文件/801 项、E2E 27/27、构建及 Skill 测试 | 后续最终 130/804 快照；W2/W3 人工结果 |
| `W3_WINDOWS_PORTABILITY_VERIFICATION_20260813.md` 与 `release/verification/w3-portability/report.json` | 同机隔离的目录版/Portable 启动、组件断源、工程移动重存、HTML/网页包离线互动 | 另一台干净 Windows、W2、PDF/PPTX 本轮重导出、最终文档和人类签署 |

## 4. 里程碑 0–9 总审计

| 里程碑 | 计划要求 | 权威证据 | 当前状态 | 依赖 / 人类门禁 | 最短下一步 |
| --- | --- | --- | --- | --- | --- |
| **0：冻结原型基线与正式版合同** | 可恢复 1.7.0；冻结版本、协议、删除/迁移理由；多表面不冒充 1.0；未审阅不得 `accepted` | 标签 `internal-prototype-1.7.0`、提交 `af5908d`、`docs/INTERNAL_1_0_MILESTONE_0.md` | **已证明** | 无新增门禁 | 保持归档只读；不把旧兼容代码带回主线 |
| **1：Project V8 与协议断代** | 新建/保存/打开/Player 只接受 Project V8、Runtime 2、Component 4；旧版本明确拒绝；四种导出保留 | `src/shared/constants.ts` 为 1.0.0/V8/2/4；`projectArchive.ts`、Player 与旧 V6/V7 拒绝测试；Capability 与 130/804 全绿；发布 16/16 报告 | **已证明为软件工程能力** | W3 最终候选仍需同树复验 | 保持旧协议拒绝测试，不恢复 V1–V7 兼容 |
| **2：仓库职责与本地组件库** | 三仓分离；catalog/发现/信任/哈希/锁定/更新；工程自包含；组件治理 | 课例仓 `e66dcfa`；组件仓 `e85b65a`；四包 catalog；W3 断源重开；组件矩阵；仓内 hash-bound attestation | **软件实现与证据链已证明**；组件仍为 `experimental` | 四包许可证和维护人未闭合，只能排除于正式发布，不能晋升 stable | 保持 catalog/attestation 门禁；如要随发行版交付，再由人确认许可与维护人 |
| **3：正式版高价值质量能力** | 控制器拖动、PresenterInput、公式、Export Preflight、designTokens、安全区、评审辅助及保存/恢复/离线回归 | 里程碑 0 合同、127/799 与 27/27 冻结记录、16/16 制品、现行源码/测试/文档 | **软件已实现，结果仅 `engineering candidate`** | 真实教师任务、输入法、读屏、硬件、可见视觉/操作仍需人类验收 | 在 W2 成品和干净 Windows 上用真实任务覆盖这些能力并签署结果 |
| **4：W1/W2 工作流和冷启动验证** | 薄编排、V8 Builder、安全安装、前向夹具，再由两个全新课例证明完整链路 | W1 实现、Capability check 与 130/804 全绿；两个 case 已持久化用户选择并进入 `contract-review`；两个 V7 用户发现根均不存在 | **未完成**：W1 工程/发现门禁成立，W2 合同编写中且 0/2 `accepted` | 当前用户仍需依次批准合同、呈现脚本、视觉方向并最终审阅成品；自动化不得代签 | 完成两份合同并请求精确 scope 批准，再生成脚本、视觉方向和 2 个成品 |
| **5：W3 内部正式版 1.0 验收** | 全软件门禁、干净 Windows、Project 全链路、组件/工程离线、2 个 W2 `accepted`、文档真实 | Capability check 与 130/804 全绿；W3 同机 7/7；历史 E2E/构建绿色；W2 无成品 | **部分完成**，不得称内部正式版 1.0 | 两课例人工 `accepted`；另一台干净 Windows；最终产品签署 | 完成 W2 后在干净 Windows 重跑全链路、四格式和最终文档审计，再由指定人类签署 |
| **6：Flow 独立原型** | 结构块、阅读宽度、无限纵向、大纲/折叠、组件嵌入、HTML、A4 PDF、DOCX 结构映射；不得长截图冒充排版 | 当前只有计划/RFC，源码与测试中无 Flow 生产实现证据 | **未启动（正确受 W3 门禁约束）** | W3 内部 1.0 必须先通过；需真实长文内容与人类评审 | W3 `accepted` 后选一份真实长文课例，冻结最小块模型并做独立原型，取得 `art candidate` |
| **7：Project V9 与 Slide + Flow 生产化** | V9 判别联合、Surface Host、PublishedLesson 决策；只迁移真实 V8；两表面生产化 | 无实现/Schema/迁移/真实制品证据 | **未启动（正确受 M6 门禁约束）** | Flow 原型必须达到 `art candidate`；12.2 的 V9/Flow/PublishedLesson 决策需人类冻结 | 基于 M6 证据做 V9 ADR，再实现双表面保存、预览、HTML 与各自兼容导出 |
| **8：Slide + Flow 混合工程** | 统一目录、导航、主题、素材、课程状态、共同 HTML/PDF、选择性 PPTX/DOCX及差异报告 | 无实现、测试或真实混合课例 | **未启动（正确受 M7 门禁约束）** | Slide 与 Flow 必须各自生产可用；跨表面语义需人类确认 | 先做一个最小跨表面真实课例纵切，证明状态连续、往返导航和共同导出 |
| **9：Spatial 2D 原型、生产决策与三维复审** | 世界坐标、相机、平移缩放、书签、小地图、裁剪、HTML 探索、总览/镜头 PDF；以真实教学收益决定生产化/3D | 无 Spatial 工程、课例、性能或视觉证据 | **未启动（正确受多表面宿主门禁约束）** | 多表面宿主先稳定；真实空间课例需达到人工结果证据；通用 3D 决策需人类作出 | 选择一项无法被 Slide/Flow 充分表达的真实任务做原型，对照教学收益后决定是否生产化和是否继续 3D |

## 5. W1 分项审计

| 工作包 | 要求与现有证据 | 当前状态 | 未闭合依赖 / 人类门禁 | 最短下一步 |
| --- | --- | --- | --- | --- |
| **W1-0** | `courseware-cases` 以 178 文件、64,818,336 字节、零哈希差异迁移；历史旗舰 `pending`、失败课例 `rejected`；提交 `22837e3`/`e66dcfa`；Capability check 当前通过 | **已证明** | 无产品人类门禁 | 后续来源变更时继续以只读 check 阻断漂移 |
| **W1-1** | V2 薄核心、最小三文件、`fast/standard/high-risk`、结构化决定、review hash、级联失效、V1 原字节迁移；15/15 Python 测试历史通过，最终全量 Vitest 绿色 | **已实现并通过当前工程门禁** | W2 真实批准仍是产品层验证 | 在 W2 实际使用中保留越级拒绝和哈希失效语义 |
| **W1-2** | V8 Builder 使用真实 TypeScript API、四载体、Inventory、稳定绑定、局部 Patch、分层真实性证据；Builder 端到端包含在最终 130/804 全绿中 | **已实现并通过当前工程门禁** | W2 真实课例仍是产品层验证 | 用两个获批 W2 case 运行真实 Builder、编辑闭环和四格式 |
| **W1-3** | 仓库 V7 删除、受管 `.agents` 安装仅 V2+V8、事务更新/回滚和 8 类安装测试；用户已明确选择删除非受管 `.codex` V7 | **已证明**：9 个文件已精确删除，4 个空子目录和根目录随后删除；`.codex` 与 `.agents` 两个用户发现根的 V7 `SKILL.md` 均不存在 | 无剩余人类门禁 | 保持安装器“不覆盖非受管内容”的安全规则和 V7 缺席回归 |
| **W1-4** | `AGENTS.md` 短路由；可执行规则进入 Skill/reference；长规范为人类背景；Unified Authoring Blueprint RFC 明确非当前能力 | **已实现** | 最终文档一致性复核 | 最终集成后扫描过期能力和旧数字，保证 RFC 没被写成已交付功能 |
| **W1-5** | 原生与 Runtime/Hybrid 前向夹具覆盖门禁、恢复、错误态、公式、绑定、Inventory、stable-ID Patch 和 640×360 静态后备 | **已实现；最终 130/804 全绿** | 夹具只证明机制，不替代 W2 产品验收 | 保持夹具回归，并转入两个真实 W2 课例 |

W1 的代码、Capability、自动化和 V7 发现退场现已闭合：用户明确授权删除非受管历史副本后，两个用户发现根都不再存在 V7 `SKILL.md`。W1 前向夹具仍只证明机制；W2 真实课例结果继续是独立产品门禁。

## 6. W2 冷启动课例审计

### 6.1 当前事实

| 课例 | 当前课例状态 | 有效决定 / 批准 | 产品制品与证据 | 是否计入 W2 |
| --- | --- | --- | --- | --- |
| `w2-math-cold-start-1` | `contract-review`、`pending`、`derivedReadiness: not-ready` | 已持久化 `DEC-001-A`“二次函数＋判别式”和 `DEC-002-A`“高一 15 分钟／当前用户审阅”；blocking IDs 已清空；3 个 required review 均 pending | 合同编写中；尚无批准、工程、导出、图像、录屏或产品证据 | 否，尚未完成且未 `accepted` |
| `w2-chinese-cold-start-1` | `contract-review`、`pending`、`derivedReadiness: not-ready` | 已持久化 `DEC-001-A`“《赤壁赋》证据路径”和 `DEC-002-A`“高一 15 分钟／当前用户审阅”；blocking IDs 已清空；3 个 required review 均 pending | 合同编写中；尚无批准、工程、导出、图像、录屏或产品证据 | 否，尚未完成且未 `accepted` |

### 6.2 要求、缺口和人类门禁

两个课例必须同时满足：不同学科、不同互动机制、来自干净上下文；各自走适合风险的最薄路径；至少一个正式验证数学公式；完成 Editor 编辑—保存—关闭—重开、Player、单 HTML、网页包、PDF、PPTX、互动幕三帧/静态幕稳定帧、contact sheet、核心互动录屏、编辑性限制复核和精确 evidence scope；最后由指定人类分别授予 `accepted`。

有效人类决定已经通过真实 `request_user_input` 获得并持久化，不是自动化代选：数学采用“二次函数＋判别式”，语文采用“《赤壁赋》证据路径”，均面向高一、15 分钟、由当前用户审阅。当前工作停在 `contract-review`：合同正在编写，尚未获得合同批准；呈现脚本和视觉方向也没有批准。任何内容或哈希改变仍会使相关批准失效，`derivedReadiness` 因此正确保持 `not-ready`。

W2 的最短充分路径是：

1. 完成正在编写的两份课程合同和精确内容，交给当前用户审阅合同 scope；
2. 获得合同批准后完成呈现脚本与必要视觉方向，并分别取得精确 hash scope 批准，使 V2 校验器派生 `implementation-ready`；
3. 先分别完成最高风险互动纵切，再扩展全课；
4. 用 V8 Builder 走真实 API、保存重开、局部 Patch、Player 与四格式；
5. 采集逐幕、contact sheet、录屏和真实文件证据；
6. 由当前用户查看精确成品 scope 后分别写入 `accepted`。

历史物理旗舰、数学失败课例和 W1 前向夹具都不能替代这 2 个冷启动课例。

## 7. W3 内部正式版 1.0 审计

| W3 门禁 | 当前证据 | 状态 | 关闭条件 |
| --- | --- | --- | --- |
| 类型、单元/集成、Electron E2E、三端生产构建 | Capability check 与最终 Vitest 130/804 全绿；类型、隐藏 E2E 27/27 和桌面构建有最近冻结记录 | **软件工程门禁已具备绿色证据**；W3 签署前仍应做最终同树复跑 | 完成 W2 后在最终候选上重跑整套 `verify` 并绑定同一提交/工作树 |
| 干净内部 Windows 按文档启动 | 当前 Windows 11 同机隔离的目录版和 Portable 真实启动；另一台无 `node_modules` 主机未执行 | **部分完成** | 在另一台干净 Windows 10/11 x64 执行首次 `npm ci`/双击入口和可见基础操作，记录环境与证据 |
| Project V8 新建到四格式全链路 | 发布样例和历史 E2E 有证据；W3 本轮重开/重存与 HTML/网页包有证据；W2 正式课例无制品 | **部分完成** | 对最终 W2 课例和最终构建重跑新建、编辑、恢复、重开、Player、HTML/ZIP/PDF/PPTX |
| 组件目录断开、工程移动、离线打开 | W3 唯一临时组件源实际删除；归档恢复 manifest/runtime/hash；移动 HTML/网页包点击成功；0 外部请求 | **自动化已证明** | 最终 W3 复验保留该门禁；不把同机隔离外推为干净机器 |
| 两个冷启动课例管线与结果 | 选择已持久化，两个 case 均为 `contract-review / not-ready`；0/2 `accepted` | **未完成，硬门禁** | 完成合同/脚本/视觉批准、工程与证据，并由当前用户分别 `accepted` |
| README、指南、规范、Skill、示例只描述真实能力 | W1 已大范围同步；现有组件验证记录仍引用旧的主仓可覆盖证据路径/旧 SHA；当前并发代码和数字尚未最终同步 | **部分完成** | 以稳定工作树做全仓语义扫描，更新 attestation、测试数字和未交付能力边界 |
| 内部产品接受 | 所有自动化都明确最多为 `engineering candidate` | **未完成，硬门禁** | 指定内部审阅人在干净 Windows 与两个 W2 结果上明确签署 |
| 非目标边界 | 许可证调整、签名、公开安装器、自动更新、外部分发明确不阻塞内部 1.0 | **已证明为范围决定** | 保持文档边界，不把非目标误写成已交付 |

## 8. 组件 attestation 复核

组件仓已经把旧的跨仓、可被后续 E2E 覆盖的路径：

```text
../HTML课件编辑器/artifacts/component-catalog-matrix/matrix-runtime-evidence.json
```

改成仓内快照：

```text
verification/matrix-runtime-evidence-20260813.json
```

当前 `catalog.post-verification-attestation.json` 为 schema V2，并绑定：

- 仓内证据原字节 SHA-256：`9a925e0900226e163ee6a506e3ab6fb8b5b01872969a58e837f2ad345fd65f87`；
- 验证后 `catalog.json` SHA-256：`fedf8315a8a1cc636771760be95931b31dba7f6625b62adc8247d7eebf044573`；
- 4 包 / 4 幕 / 25 轮 / 100 次导航；
- 后台窗口隔离；
- Player、单 HTML、网页包挂载数为 1、无外部请求、无 page error；
- PDF 4 页、PPTX 4 页。

新 `scripts/verify-attestation.mjs` 强制 evidence path 解析后仍位于组件仓内，并检查证据哈希、catalog 哈希、时间、数量和上述矩阵语义。现场 `npm run verify` 已通过，因此**从外部可覆盖输出改成仓内 hash-bound 快照的机制是成立的**。

该加固已提交到组件仓 `main@e85b65a`（`test: bind component matrix attestation`），工作树干净，因而现在既能由 `npm run verify` 执行，也能由 Git 恢复。verifier 校验证据快照的内容与语义，不重新执行 Electron 矩阵，也不逐一哈希快照 `outputs` 字段指向的导出文件；真实运行来源仍需保留原矩阵运行记录。核心仓现有 `COMPONENT_LIBRARY_CONSOLIDATION_VERIFICATION_20260813.md` 仍记录旧证据 SHA `286058...`，最终文档复核应切换到新仓内证据链而不抹除历史值。

## 9. 内部正式版 1.0 完成定义逐项核对

| 完成条件组 | 状态 | 证据 / 缺口 |
| --- | --- | --- |
| 1.0.0 / Project V8 / Runtime 2 / Component 4 / PublishedLesson V1 边界 | **已证明** | 常量、Schema、严格解析、发布报告一致 |
| 旧 Project/Runtime/Component 不静默兼容 | **已证明** | 打开、Player、组件注册和 Headless 均有拒绝测试 |
| 编辑器、组件、课例三仓职责分离 | **已实现，待核心工作树固化** | 两个相邻仓已存在；核心迁出变更仍在当前未提交工作树 |
| 组件发现/审阅/导入/锁定/嵌入/显式更新及移动离线 | **自动化已证明** | catalog/矩阵/W3 断源移动；组件发布质量仍 experimental |
| 教师控制器、PageUp/PageDown 与 authored command | **历史软件证据通过；待 W2 真实任务验收** | 代码、E2E、HTML 制品存在；没有 W2 人类结果 |
| 正式公式排版与四格式降级可见 | **历史软件证据通过；待 W2 数学课例验收** | FormulaNode/导出测试存在；W2 数学尚无内容/制品 |
| 四格式 Preflight、Token、安全区、只读启发式 | **历史软件证据通过；待最终同树复验** | 127/799 与制品记录；当前全量门禁未绿色 |
| ittoedu 身份、Headless 诊断、canonical 组件哈希 | **已证明为工程能力** | 16/16、`validate:project`、双哈希记录 |
| 自动化窗口始终隐藏 | **历史 E2E 27/27 已证明** | 最终并发工作树需重跑 |
| Capability Index 与生成证据为绿色 | **已证明** | `check:ai-capabilities` 通过；索引 6327 / 16384 字节，组件目录 `available` |
| 薄编排、自适应路径、可恢复决定/批准 | **已实现** | V2 Skill 与测试；W2 尚未走完真实批准 |
| V8 Builder 真实 API、Inventory、绑定、纵切、Patch、证据 | **已实现并通过当前工程门禁** | Builder 端到端与前向夹具包含在最终 130/804 全绿中 |
| 当前安装与发现不再暴露 V7 | **已证明** | 用户授权后精确删除非受管 V7 的 9 个文件及 4 个空子目录/根；`.codex` 与 `.agents` 两个用户发现根均不存在 V7 `SKILL.md` |
| 每个正式课例真实编辑闭环和四格式 | **不满足** | W2 两课例均无工程或导出 |
| 两个不同学科/机制课例人工 `accepted` | **不满足** | 两个主题/范围已确认并进入合同审阅，仍为 0/2 `accepted` |
| 正式课例 HTML/网页包/PDF/PPTX 真实离线复查 | **不满足** | 样例/W3 有工程证据，但不能替代 W2 正式课例 |
| 管线与结果状态分离 | **已证明为治理规则** | 历史失败课例保持 `passed/rejected`；自动化未越权授予 accepted |
| 文档、Skill、示例只描述真实能力 | **部分完成** | Capability、130/804、组件 attestation 与 V7 状态已同步；W2/W3 仍在推进，最终候选需再做全仓语义审计 |
| 签名/公开安装器/更新/外发为非目标 | **已证明为范围决定** | 不阻塞内部 1.0；也不得冒充已交付 |

## 10. 多表面完成定义核对

| 多表面完成条件 | 当前状态 |
| --- | --- |
| 按内容意图选择 Slide / Flow / Spatial 2D | 只有设计规则，无可运行选择器或真实多表面工程 |
| 三种表面各自创作、保存、预览、HTML 与兼容导出 | Slide 有工程能力；Flow、Spatial 2D 均无实现 |
| 混合工程统一导航、主题、素材、状态与 HTML | 无实现 |
| Project V8 显式迁移到真实多表面版本 | 无 Project V9 或迁移器；计划正确禁止先造占位字段 |
| 所有兼容导出有真实文件复查 | Slide 有部分/历史证据；Flow DOCX/PDF、Spatial PDF、Mixed 共同 PDF 均无 |
| 各表面至少一个真实课例 `accepted` | 0；连 Slide 的 W2 也尚未 accepted |
| 通用 3D 基于真实需求作出明确决策 | 未到决策时点，无真实多课例证据 |

多表面路线因此不是“接近完成”，而是尚处于设计计划阶段。遵守门禁不等于完成里程碑；越过 W3 直接搭建 Flow/Project V9 也不构成无降级完成。

## 11. 从当前状态到完整计划的最短关键路径

1. **保持当前工程绿线**：Capability check、最终 Vitest 130/804 和组件仓 `e85b65a` attestation 已闭合；后续每次代码变更继续用相同门禁检测漂移，并在 W3 最终候选上重跑类型、Skill、隐藏 E2E、桌面构建和必要制品验证。
2. **完成 W2 合同与批准**：V7 发现已关闭，W2 决定也已落盘；当前最短动作是完成正在编写的数学/语文合同，由当前用户批准合同 scope，再依次批准呈现脚本和必要视觉方向。
3. **完成两个 W2 成品**：在各 case 派生 `implementation-ready` 后，生成真实 V8 工程、编辑闭环、Player、四格式、逐幕证据、contact sheet、录屏和公式；分别达到人工 `accepted`。
4. **关闭 W3**：在另一台干净 Windows 做首次启动和可见冒烟；合并最终软件/离线/文档证据；由当前用户签署内部正式版 1.0。
5. **顺序推进 M6–M9**：Flow 独立原型并达到 `art candidate` → Project V9 与双表面生产化 → 混合工程 → Spatial 2D 原型和真实教学收益决策 → 通用 3D 复审。

W2 的合同/脚本/视觉批准、两个成品 `accepted` 和 W3 产品签署都需要当前用户作出明确判断；自动化可以准备内容、制品和证据，但不能代签。除此之外的工程复验、证据生成和后续实现都可继续自动推进。

## 12. 审计判定

本审计没有找到可以支持“开发计划全部完成”的完整证据。Capability check、最终 Vitest 130/804、组件仓 attestation 和 V7 发现退场已经闭合；W2 虽已确认选择并进入合同审阅，仍为 `not-ready`、无批准且 0/2 `accepted`，此外还有 W3 人工门禁和 M6–M9 无实现等直接反证。因此：

> **不得把当前目标标记为 complete。当前软件真相门禁和 V7 退场已经闭合；下一步是完成正在编写的 W2 合同并由当前用户审阅批准，随后才能进入实现、W3 和多表面顺序里程碑。**
