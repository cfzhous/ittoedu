# DeepSeek 评估 v2：纳入 Opus 与 GPTpro 后的结论更新与五方收敛基线

- 日期：2026-08-13
- 作者：DeepSeek（AI 研判，非人类审批，不具备任何批准效力）
- 本文取代并修正 [deepseek_evaluate.md](deepseek_evaluate.md) 与 [deepseek_cross_evaluate.md](deepseek_cross_evaluate.md) 中的部分结论；冲突处以本文为准。
- 新增评估对象：[opus_evaluate.md](opus_evaluate.md)、[GPTpro_evaluate.md](GPTpro_evaluate.md)
- 事实核查：对 Opus 的关键实测断言做了独立复算（解包两份 W2 `.h5lesson` + 源码 grep），结果见第一节。

## 1. 对 Opus 报告的评估

### 1.1 核查结论

对 Opus 的 12 条关键断言逐一独立复算，**全部命中**，其中含多处推翻此前前提的发现：

| 断言 | 复算结果 |
| --- | --- |
| 两工程 `playback.controls: none`；数学控制器 `defaultCollapsed=True` | 属实（解包 project.json） |
| 数学 4 幕 runtime source sha256 完全相同（`5c315872f59f…`） | 属实（独立计算的哈希前缀一致） |
| 两课各 14 个 scene 级 state；nodeOverrides 非空 0/14 | 属实（state 位于 scene.presentation 层，工程顶层仅 1 个） |
| 语文 build.ts 整屏 getBounds 批量注册 + `prepareCapture` 在 stable 帧预填 modelAnswer | 属实（源码逐字一致） |
| `INTERACTION_CONDITION_TYPES` 仅 `presentation.in / scene.in` | 属实（`interactionTypes.ts:25-28`） |
| `state:change` 两处 emit、零处订阅 | 属实 |
| `formulaLinear` 无 evaluate/compute，只有 parse/serialize | 属实 |
| `PlayerPresenterInput` 零引用 `controls`（键盘兜底事实存活） | 属实 |
| `scene.open-picker` 唯一发射源是控制器（场景目录在交付态是死代码） | 属实 |
| `editRoundTrips.binding` 不合 BINDING_PATTERNS 却通过校验 | 属实（`"runtime:scene:SCN-002:text:title + native:…"`、`"(stable-ID patch)"`） |
| 8 种自定义 artifact kind 绕过格式校验 | 属实（`static-project / edit-project / patched-project / edit-html / editor-screenshot / review-screenshot`） |
| `npm verify` 与 CI 未接任何 python 校验器 | 属实（verify = capabilities+typecheck+test+e2e+build） |

Opus 是五份报告中**唯一解包了实际 W2 工程做实测的**，其报告的证据等级高于其余四份（包括本文作者此前两份）。

### 1.2 重要贡献（必须吸收）

1. **控制器不可见 = 四条独立故障串联**，主因重排：`createProject` API 陷阱（`controls` 与 `includeDefaultController` 捆绑默认）→ `controllerVisible()` 全局静音语义 → 跨渲染平面 z 上限 → 无障碍镜像自我阉割（`pointerEvents:'none'`）。z 序只是第二条，不是第一条。
2. **契约层没有"答案"概念**：`INTERACTION_CONDITION_TYPES` 只有两个成员，`ctx.emit` payload 被丢弃，`state:change` 零订阅。判题必然溢出到 runtime 私有 JS——"过度 Runtime 化"不是 Builder 品味问题，是产品能力缺口逼迫的唯一解。这条修正了我方"载体品味"向的归因。
3. **死锁源头在上游合同矛盾**：数学 `CNT-002` 合同写"口头或书面"，脚本写"全对后解锁下一场景"——判定权威冲突已存在于获批文档，Builder 不是唯一责任方。
4. **语文证据链是结构性伪造**：capture 模式在 stable-result 帧预填范文；配合"good"按钮一键填入官方答案。修正了此前"覆盖不足"的定性。
5. **判题止步规范形等价，不引 CAS**：全部判题失败源于字符串比较缺陷（无锚点子串匹配、无 NFKC、无数值规范化），没有一条真正需要符号等价；`formulaLinear` 无求值能力；引入 CAS 会与"教师可逐对象修改、判据可解释"方向冲突。
6. **控制器方案第三条路**：保持 Phaser 渲染 + 新增独立最高 z 的薄兜底逃生控制平面（复用 `presenterStatus` 量级），DOM 全面迁移单独排期、不与本次修复捆绑。比 GLM/SeedPro/我方此前方案都更薄。
7. **21 条门禁按执行层分类**（`static-json` 11 条 / `e2e` 8 条 / `human` 2 条），其中 11 条纯静态门禁多数是其余四份报告没有的：runtime source 跨场景 sha256 去重、getBounds 唯一性、nodeOverrides 非空率、`evidenceMethod + witnessedEvents`、`elementFromPoint` 遮挡裁判（明示不用 Phaser `hitTestPointer`）、artifact kind 闭集、python 校验器接线、commands 结构化 + e2e spec 常驻、`editRoundTrips.binding` fullmatch、`defaultCollapsed` 必须 false。
8. **e2e 前提约束**：vitest jsdom 无布局引擎（`getBoundingClientRect` 恒 0、`elementFromPoint` 不可用），行为门禁必须 Playwright；现有 e2e 是重资产路径（3 spec、`workers=1`、全量构建），这是门禁的真实成本，需实测后再定进不进 `verify`。
9. **校验器失效先例**：`validate_formula_markup.py` 写了但零引用——新校验器必须同时改 `SKILL.md` 脚本清单 + `validate_v8_case.py` + `package.json`。
10. **P0 排序锋利**：schema `superRefine` 加互斥是最小最锋利的一刀，直接让坏工程无法加载/保存/导出，从数据层根除自相矛盾态。

### 1.3 轻微出入（不影响结论）

- "commands 是叙述散文"：数学 manifest 的前两条 command 是真实命令串（`validate:project` / `validate_authoring_inventory`），"不可复跑"成立，"散文"的定性偏重；其"e2e spec 临时复制进编辑器后删除、不进 CI"的说法未逐一复核，可信。
- "问题说明背景材料称 `presentation.states=[]`"：我读的问题说明原文无此表述，推测出自课例内部材料；实测真相（14 state、nodeOverrides 全空）本身无误。
- "28 个输入槽"未复核，与问题说明"21 个响应槽"互不矛盾（统计口径不同），不影响容量结论。

## 2. 对 GPTpro 报告的评估

### 2.1 定位与价值

GPTpro 自称"联合决策基线 V1"，定位是**工作草案 + 结构化落地模板**，不追求新的根因发现。其价值：

1. **四个跨 Skill 合同**（Evidence/Response、Assessment Authority、Authoring Outcome、Required Action/Teacher Escape）给出可直接抄用的 YAML schema：`RESP-*`（`mode: digital-required|oral-check|paper-work|discussion-only…`、`firstAttemptSeconds/retrySeconds/teacherDiscussionSeconds`）、`ACT-*`（`kind: circle-text|drag|text-input…`、`evidenceProduced`、`requiredForCompletion`）、`authoringRequirement.access: direct-canvas|authoring-view|structured-property|developer-only`、`behaviorGates`（六项 status）。
2. **候选等级链** `pipeline-passed → behavior-verified → engineering candidate`，或退而求其次用 `behaviorGates.status==="passed"` 作子条件——给出不新增状态值的兼容方案。
3. **Phase 0–5 实施顺序**：冻结失败基线 → 产品 P0 → Skill1 合同/校验 → Skill2 合同/校验 → **用原 W2 失败课例回归**（明确"不是新建第三个课例"）→ 再做冷启动。与 Opus 的"不批量生成新课例"一致。
4. 每轮只审一个合同族，避免 Skill 文案、Schema、Validator、产品代码同时漂移——对共同工作节奏的实操建议。

### 2.2 弱点

- 无独立代码/工程实测痕迹，事实层完全依赖问题说明，因此未发现 Opus 发现的一切（capture 预填、sha256 复用、nodeOverrides 全空等）；
- `authority` 七值枚举（`finite-auto|normalized-auto|symbolic-equivalence|teacher|self-check|peer-check|none`）偏重，建议收敛为 Opus 三档 A/B/C（C 涵盖 teacher/self/peer）；
- 逐项 `firstAttemptSeconds` 字段对 AI 作者较重，可与 Opus 的一行式 `N/D ≤ 1.5、F ≤ 3` 并用：细表供编排阶段填、粗线供校验器拦；
- `behavior-verified` 新状态值涉及 manifest schema 涟漪，若采纳宜走其兼容方案（子条件而非新枚举值）。

## 3. 对既有结论的修正清单（含我方此前两份文档）

| # | 旧结论 | 修正后 |
| --- | --- | --- |
| 1 | 判题四档 T1–T4，T3 需数学等价引擎 | **三档 A（auto-choice）/ B（auto-normalized-short，止步规范形等价）/ C（human，不判对错、不作导航条件）**。不引 CAS；B 档必须走统一归一化器 + 声明 tolerance |
| 2 | 控制器不可见根因 = 工程配置自相矛盾 + z 序结构缺陷 | 四条独立故障：API 陷阱（createProject 捆绑默认）→ 全局静音语义 → z 序上限 → 无障碍镜像自我阉割；另加 `defaultCollapsed=True` 与"键盘兜底活着但不可发现"两个新事实 |
| 3 | Q2 两步走（近期一致性修复，中期 DOM 化） | **第三条路**：保持 Phaser + 新增独立最高 z 薄兜底逃生控制平面（并成为场景目录第二发射源）；DOM 全面迁移另案，不与本次捆绑 |
| 4 | 语文失真 = 错误/完成按钮切状态 | 升级为：按钮切状态 + **capture 模式预填范文的证据链结构性伪造**（`prepareCapture` 注入 modelAnswer） |
| 5 | 死锁责任 = Builder 误读成功标准 | 责任上移：数学 CNT-002 的合同/脚本判定权威矛盾已存在于获批文档 |
| 6 | 过度 Runtime 化 = Builder 载体选择失误 | 部分成立，但更底层是**契约层无"答案"概念**（条件类型仅 2 个、`state:change` 零订阅、`ctx.emit` payload 丢弃），判题无声明式落点，全幕 Runtime 是被迫解 |
| 7 | 门禁 6 条 | 扩展为 **Opus 21 条按执行层分类**（静态 11 + e2e 8 + human 2），吸收其机械门禁与 elementFromPoint 裁判 |
| 8 | 编辑闭环按载体取样即可 | 加 `editRoundTrips.binding` fullmatch + 至少覆盖一条 `native:*` 与一条 `runtime:*`（现有两条均不匹配） |
| 9 | （我方未发现） | 新增：artifact kind 闭集、python 校验器接线、commands 结构化 + spec 常驻、runtime source 跨场景去重、getBounds 唯一性、nodeOverrides 非空率、`evidenceMethod: real-control|state-injection` + `witnessedEvents` |
| 10 | 容量预算 = 必答单元 × 时间档 | 与 Opus 一行式并存：`N/D ≤ 1.5`、自由文本 `F ≤ 3`（数学 30/15=2.0、F=6 与语文 15/15、F≥3 均被拦）；细表供编排填、粗线供校验拦 |
| 11 | e2e 证据层实现方式未定 | 明确：vitest jsdom 不可用，行为门禁必须 Playwright；e2e 成本需实测后再定是否进 `verify` |

## 4. 五方收敛基线（更新版）

五份报告（DeepSeek / GLM / SeedPro / Opus / GPTpro）经交叉修正后的共同基线：

**根因链**：产品契约层缺"答案"概念 → 上游合同未冻结采集通道/判定权威/容量/编辑结果 → Builder 在无门禁下选择最省事实现（全幕 Runtime + 手写正则 + 按钮切状态 + capture 预填）→ 产品层四条控制器故障串联 → 校验器只证结构不证行为 → `engineering candidate` 语义漂移。

**P0（继续创作前）**：
1. 产品四条薄修复：schema 互斥（有 visible 控制器 ⇒ controls 非 none）、`projectHealth` error 码、`createProject` controls 解耦、`ensureTeacherController` 已有节点时也修 controls + `PropertiesTab` 警示；
2. 产品兜底逃生控制平面（独立最高 z、`pointer-events:auto`、场景目录第二发射源）——唯一同时兜住"关停"与"满幅遮挡"两条的修法；
3. 上游四合同：响应预算（RESP-*）、判定权威三档（A/B/C）、编辑结果要求（access 档位）、动作/逃生契约（ACT-* + 每状态非判题依赖前进通道）；
4. 校验器：11 条静态门禁（见 §3 修正清单 #9）+ artifact kind 闭集 + python 校验器接线；
5. `engineering candidate` = pipeline-passed + behaviorGates 全绿（控制器双测、真实动作、判定容错、编辑闭环、容量）；
6. capture 模式禁止写 content/courseState/输入草稿；推进控件不得以判题结果为渲染条件。

**P1**：共享归一化层（NFKC/全半角/减号统一/数值规范化/有序对解析，不含语义评估）、尝试次数兜底（≥3 次无条件呈现示范并开放前进）、Runtime Authoring bounds 上报、e2e 基础设施成本实测。

**否决清单（五方一致）**：扩正则、引 CAS/语义自动判定、硬比例、PPTX 对象级重构、纯 Skill 文案、DOM 迁移捆绑本次修复、控制器问题全推给编辑器或全推给 Builder。

**W2 处置**：保留为回归素材——11 条静态门禁中至少 6 条能令两课立即红；Phase 4 用原课例回归而非新建。

## 5. 剩余待人类决策项（更新后）

1. **`INTERACTION_CONDITION_TYPES` 是否扩展**（最薄：`state.equals { key, value, normalize? }` 读 courseState，同步四处改动）。不扩也能活，但判题永远留在 runtime 私有 JS，门禁只能事后检测死锁不能预防——这是唯一影响"改产品 vs 只改 Skill"范围的决定；
2. **`03-development-plan.md` 归属**：目前不在 ARTIFACT_SPECS、不参与 scope hash、不被校验器读取，而数学 dev-plan 是唯一写明"教师导航由 TeacherControllerNode 承担"的文档。纳管或禁止二选一；
3. **兜底逃生控制平面与 capture 路径的交互**（`includeInStaticExports:false` 语义是否扩展）需实现时验证；
4. **班级聚合（6 处 CP-*）产品方向**：短期只加"产品能力前提"字段拦住无根据假设，多端聚合是否进路线另定；
5. e2e 门禁（Opus #12–19）的运行成本实测后再决定是否进 `npm verify`。

## 附：五份报告定位对照（v2）

| 维度 | DeepSeek v1 | GLM | SeedPro | Opus | GPTpro | 收敛结论 |
| --- | --- | --- | --- | --- | --- | --- |
| 证据等级 | 源码抽查 | 源码抽查 | 部分引用 | **解包工程实测** | 无独立核查 | 以 Opus 为事实基线 |
| 控制器方案 | 两步走 | 倾向 DOM 两步 | 立即 DOM 化 | **兜底平面 + 迁移另案** | 独立 top plane | 采纳 Opus 第三条路 |
| 判题模型 | T1–T4 | 五档 | L1–L4 | **A/B/C 三档** | 七值枚举 | 三档 A/B/C，止步规范形 |
| 数学等价 | 需要引擎 | 有则用 | 保守反馈不门禁 | **不需要，字符串缺陷为主因** | symbolic 需真能力 | 不引 CAS |
| 编辑性 | 类别门禁 | 三档 tier | 类别表+bounds | 类别门禁+机械下限 | 四档 access | 类别门禁 + getBounds 唯一 |
| 动作真实性 | 清单比对 | STATE 标签 | API 黑名单 | **evidenceMethod+witnessedEvents+动作映射** | ACT-* 合同 | Opus 双条并用 |
| 容量 | 时间档求和 | 可求和预算 | 系数+阈值 | **一行 N/D+F** | 逐项秒数 | 细表编排填、粗线校验拦 |
| 独有贡献 | 门禁收敛 6 条 | pointerEvents 双测 | 教师导航权威、三件套 | 全部实测新事实 | 落地 schema+Phase 序 | 全部吸收 |
