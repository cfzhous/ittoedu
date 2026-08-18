# GLM 对 W2 HTML 课件问题说明的研判与 Skill 重构方案

- 日期：2026-08-13
- 对象：`docs/reviews/W2_HTML_COURSEWARE_PROBLEM_STATEMENT_20260813.md`
- 范围：仅出方案，不改动代码或 Skill 文件
- 核实：已独立复核 `createProject.ts`、`renderTeacherController.ts`、`editorStore.ts`、`PlayerApp.ts`、`validate_case.py`，事实与问题说明一致

---

## 一、总体判断

问题说明的根因分层基本准确，没有把锅甩给“再补几条 Skill 文案”。但有三个底层判断需要更明确：

1. **两个 Skill 本身不是主因，主因是 Skill 的门禁只证明“形式闭合”，不证明“行为真实”。** 现有 `validate_case.py` 证明标题齐全、ID 交叉引用闭合、分钟数加总相等；`validate_evidence.py` 证明文件真实、扩展名正确、三帧存在。它们都没有证明“教师能看见控制器”“错误后能逃生”“等价答案能过”。重构的方向是**给两个 Skill 加行为门禁和冻结缺失的合同字段**，不是重写 Skill。

2. **教师控制器不可见是“自愈缺口 + 门禁缺口”双重失效，不是单纯的 Builder 配置错误。** `editorStore.ensureTeacherController()` 在节点已存在时不修复 `playback.controls`（已核实），这是编辑器产品缺陷；而 Builder 生成了“有节点但 controls=none”的自相矛盾工程，校验器却没有拦住，这是门禁缺口。两者必须分别修，不能用其中一个替代另一个。

3. **Runtime 过度化是“编辑性目标未冻结”的下游症状，不是载体选择规则本身的问题。** `carrier-selection.md` 已经写了“选择满足必要编辑性的最薄方案”，但“必要编辑性”从来没有在合同里冻结。Builder 因此可以自证“property-only 已满足编辑性”。重构必须在编排阶段冻结**每类内容的编辑性档位**，Builder 才有可对照的目标，校验器才有可判定的红线。

PDF/PPTX 不是当前主矛盾，同意问题说明的判断。下文不围绕对象级兼容展开。

---

## 二、根因分配

按问题说明第 1 节的五层分配，并标注每一项的“Skill 可修 / 编辑器可修 / 两者必须协同”。

### 教学合同（orchestrate-courseware）
- **容量预算缺失（主因）。** 合同只有“各阶段几分钟”，没有“必答单元数 × 首次作答时间 + 一次重试 + 教师讨论”的可检验预算。`validate_case.py` 只校验 `sum(scene_minutes) ≈ duration`（已核实第 347–355 行），形式上相等不代表课堂可完成。→ Skill 可修。
- **学习证据与数字字段混淆（主因）。** 合同没有区分“页面采集的结构化答案 / 教师口头抽查 / 纸笔完成页面只揭示 / 仅讨论的开放表达”。Builder 因此把所有证据都变成页面输入。→ Skill 可修。
- **判定权威未冻结（主因）。** 精确内容列了替代答案，但没有区分“有限选项自动判 / 规范化短答案 / 数学等价 / 教师或自评判定”。Builder 把“有成功标准”误读为“应自动硬判”。→ Skill 可修。
- **对产品能力作了未经确认的假设。** 脚本要求全班预测分布、错误人数，但单机 Project V8 没有这些数据源。→ Skill 可修（决策门禁应强制确认能力边界）。
- **HTML 编辑结果不是明确合同。** 脚本没有冻结“哪些稳定内容必须画布可编辑”。→ Skill 可修。
- 学科事实、目标—证据链、典型错误反馈可保留，同意问题说明 §5.1。

### 呈现脚本（orchestrate-courseware）
- 脚本明确要求教师控制、揭示、重置、未完成继续，这部分**没有问题**，不是控制器缺失的上游原因。
- 脚本要求真实圈画、片段对应，但成品用“错误/完成”按钮直接切状态。这属于“脚本动作真实性”没有门禁，下游 Builder 可以用 Presentation State 冒充学生动作。→ Skill 可修（加动作真实性门禁）。

### Builder（build-project-v8-courseware）
- **控制器配置自相矛盾（主因）。** 数学课例 `includeDefaultController: false` 建工程再手加控制器，却没把 `playback.controls` 改回 `canvas`。→ Builder 规则可修（生成控制器时强制同步 controls），但根因是编辑器允许这种不一致状态存在。
- **Runtime 比例失衡。** 语文 4 幕全 Runtime、0 原生；数学名义 hybrid 实际每幕仅 1 个原生公式。Builder 在没有编辑性合同的情况下自证 property-only 可接受。→ Skill 可修（合同冻结编辑性档位 + 校验器对照）。
- **判定实现没有等价层。** 手写正则 + 关键词拼接，假阴性和假阳性并存。→ 部分可修（合同冻结判定权威后，Builder 知道哪些不该自动判），但通用数学等价层属于编辑器产品能力，不在 Skill 范围。
- **死锁。** 机器不接受答案时隐藏下一步入口，控制器又不可见。这是“开放回答硬锁 + 控制器不可见”两个问题的叠加。→ 两者协同。

### 编辑器 / Player（产品，非 Skill）
- **`ensureTeacherController` 自愈缺口。** 节点已存在时不修复 `playback.controls`（已核实）。已有坏状态会持续存在。→ 编辑器可修，一行级修复。
- **Player 跨渲染平面层级风险。** 控制器在 Phaser Canvas(z=2) 内，scene DOM overlay(z=3) 在其上。即使修正 controls，全屏 Runtime 仍可能视觉遮挡控制器。→ 编辑器/Player 产品决策，Skill 无法替代。
  - 注意：runtime DOM 层容器本身 `pointerEvents: none`，所以控制器可能是“视觉被遮、功能仍可点”。这意味着门禁需要**同时**做截图测试（查视觉遮挡）和交互测试（查功能阻断），二者不可互代。
- **Runtime Authoring 的 `visible` 不等于逐对象画布编辑。** 大量文字共享整幕 bounds，只是属性入口。这是产品模型问题，不是 Skill 文案问题。

### 校验与评级
- 现有门禁证明“文件真实、Schema 有效、黄金路径可达、三帧存在、哈希闭合”，不证明“控制器可见、可逃生、等价答案过、真实动作产生、visible 真可逐对象编辑、容量成立”。→ Skill 可修（加行为门禁）。
- `engineering candidate` 门槛过低。Schema/导出绿色就给 candidate，但教师控制、真实互动、恢复路径都未验证。→ Skill 可修（拆分 candidate 子条件）。

---

## 三、P0（继续创作前必须解决）

### P0-1 教师控制器可达性门禁（Builder + 编辑器协同）
- **编辑器侧（非 Skill）：**
  - 修 `editorStore.ensureTeacherController()`：节点已存在时也修复 `playback.controls = 'canvas'`。
  - 决策 `TeacherControllerNode` 渲染平面：留在 Phaser Canvas 但保证其 Phaser depth 高于任何 scene Runtime DOM overlay，或迁移到独立 global DOM 控制平面（z 高于 4）。二选一，需产品决策。
- **Skill 侧（build-project-v8）：**
  - 新增 `validate_teacher_controller_reachability`：对每幕真实 Player 截图，断言控制器可见且不被 scene overlay 视觉遮挡；对每幕做一次 next/previous/replay 真实点击，断言导航发生。
  - Builder 规则：生成或保留控制器节点时，强制 `playback.controls = 'canvas'`；不得产出“有节点 + controls=none”的工程。

### P0-2 教师逃生路径门禁（Builder）
- 新增 `validate_escape_path`：对每个错误态、空白态、未完成态，断言教师能揭示/跳过/带未完成继续，不依赖学生先答对。
- 开放回答在无可靠语义判定时**不得成为唯一导航硬门禁**。Builder 规则：开放字段只能自检/提示/教师判定，不得隐藏下一步入口。

### P0-3 判定权威冻结（orchestrate）
- 合同每个 `CNT-*` 或每个响应槽必须声明 `judgmentAuthority`：`auto-exact | auto-normalized | auto-equivalent | teacher-or-self | discuss-only`。
- Builder 据此决定是否自动判、是否需要等价层、是否只收不自判。`auto-equivalent` 在编辑器没有通用等价层时，**回到编排重新分档**，不得临时手写正则冒充。

### P0-4 容量预算冻结（orchestrate）
- 合同新增 `responseBudget`：必答单元数、首次作答时间、一次重试时间、教师讨论时间，按幕汇总。
- `validate_case.py` 增加预算校验：超预算时阻止 `implementation-ready`，或要求明确缩减并记录决策。

### P0-5 候选等级分离（build-project-v8）
- `engineering candidate` 拆为子条件：`schema-green | export-green | controller-reachable | escape-path | equivalent-answer-matrix | real-action-evidence | edit-closure | capacity-within-budget`。
- 任一行为子条件未过，只能停在 `placeholder`/`unusable`，不得写 `engineering candidate`。

---

## 四、P1（可并行改进）

### P1-1 编辑性档位合同（orchestrate）
- 合同按内容类别冻结编辑性档位：`canvas-editable | property-editable | runtime-owned-acceptable`。
- 稳定题面、正文、反馈、教师提示默认 `canvas-editable`；复杂动态图象、连续交互允许 `runtime-owned-acceptable`。
- Builder 据此选载体；校验器对照合同判定 `visible/property-only/blocked` 是否符合档位。

### P1-2 载体降级显式化门禁（build-project-v8）
- 当稳定内容从 `canvas-editable` 降为 `property-only` 或 `blocked`，必须回到编排取得明确取舍，不得仅在 evidence differences 披露后继续通过。

### P1-3 答案容错矩阵门禁（build-project-v8）
- 每个 `auto-*` 响应槽至少覆盖：标准答案、等价正确答案、全/半角和空白变体、典型近错、关键词拼接假阳性。
- 假阳性必须失败，假阴性必须失败或降级为 `teacher-or-self`。

### P1-4 脚本动作真实性门禁（build-project-v8）
- 脚本写圈画/拖放/输入/参数操作，E2E 必须通过对应真实控件产生证据；禁止直接设置 Presentation State 冒充。
- 门禁方式：声明每个 `STATE-*` 的触发来源是 `student-action | teacher-action | system-derivation`，system-derivation 不得充当学生证据。

### P1-5 HTML 编辑闭环门禁（build-project-v8）
- 按载体类型修改关键内容 → 保存 → 关闭 → 重开 → Player 更新 → HTML 更新。
- `visible` 必须有真实可定位区域；`property-only` 必须有稳定属性入口；`blocked` 在 `accepted` 前不得保持（除非内部算法/装饰）。

### P1-6 `ensureTeacherController` 自愈（编辑器，非 Skill）
- 已在 P0-1 列出，此处单列提醒：这是编辑器一行级修复，但它不能替代门禁，因为门禁要拦住 Builder 直接产出的坏工程。

---

## 五、最小充分硬门禁

按问题说明第 7 节的 9 项候选，我的取舍如下（标注采纳/调整/不采纳及理由）：

1. **教师控制可达性** — 采纳为 P0。补充：必须同时做截图（视觉）和点击（功能），因为 DOM 层 `pointerEvents: none` 导致两者可能不一致。
2. **教师逃生路径** — 采纳为 P0。
3. **脚本动作真实性** — 采纳为 P1。补充：用 `STATE-*` 触发来源标签实现，比纯 E2E 更可机械判定。
4. **答案容错矩阵** — 采纳为 P1。补充：仅对 `auto-*` 槽强制；`teacher-or-self`/`discuss-only` 不做容错矩阵，只做“不硬锁”检查。
5. **开放回答不硬锁** — 采纳为 P0（并入 P0-2）。
6. **HTML 编辑闭环** — 采纳为 P1。补充：`visible` 必须有可测量 bounds，不是“Runtime 注册了文字”就算。
7. **载体降级显式化** — 采纳为 P1。
8. **响应容量预算** — 采纳为 P0。补充：预算字段必须可机械求和，不接受“各阶段几分钟”代替。
9. **候选等级分离** — 采纳为 P0。

PDF/PPTX 轻量门禁：同意问题说明，仅保留可打开、页数正确、主要内容可读、静态状态有意义、差异披露真实。

---

## 六、不建议采用的方案及原因

- **硬 Runtime/原生比例（如“原生不得低于 30%”）。** 会制造 perverse incentive：为凑比例塞无教学意义的原生节点。应按内容类别门禁，不按比例。这是对问题说明 §8 Q3 的明确回答。
- **为 PDF/PPTX 对象级编辑率做大规模重构。** 当前主矛盾是 HTML 主产品，PDF/PPTX 只需轻量兼容。同意问题说明 §10。
- **扩大正则列表解决开放判定。** 数学等价和语文证据表达，扩大正则既增加假阳性也增加假阴性。正确方向是判定权威分档 + 教师接管，自动判只覆盖 `auto-exact`/`auto-normalized`。
- **把控制器问题完全推给编辑器修。** 编辑器必须修自愈缺口和层级，但 Builder 门禁必须独立拦住“有节点 + controls=none”和“controller 被 scene overlay 遮挡”，否则任何一次 Builder 回归都会重现。
- **把 `property-only` 一律视为可接受。** 它只对“合同声明 `property-editable` 或 `runtime-owned-acceptable`”的内容可接受；对合同声明 `canvas-editable` 的内容，`property-only` 是降级，必须回到编排。
- **用 `fast` 路径压缩 W2 这种高互动课例的审阅。** W2 数学/语文都有复杂互动、错误反馈、开放判定，应走 `high-risk`。`fast` 只适用于材料已闭合且低返工风险的场景。

---

## 七、仍需补充的证据或问题

1. **控制器渲染平面的产品决策未定。** 留 Phaser Canvas + 提高 depth，还是迁移到独立 global DOM 平面？这决定 P0-1 门禁的实现方式和截图断言。需要产品 owner 拍板，不是 Skill 能决定。
2. **通用数学等价层是否纳入编辑器产品路线。** 如果纳入，`auto-equivalent` 可由编辑器能力支撑；如果不纳入，合同里不得出现 `auto-equivalent`，必须降级为 `teacher-or-self`。需要产品确认。
3. **Runtime Authoring 的 `visible` 是否能升级为逐对象 bounds。** 当前大量文字共享整幕 bounds。如果产品不升级，合同里 `canvas-editable` 对 Runtime 文字就是空话，必须改为 `property-editable` 或回到原生。需要产品确认。
4. **多人数据源（全班预测分布、错误人数）。** 单机 Project V8 没有这些。需要确认是否在产品路线内；不在则脚本不得要求，编排决策门禁应强制拒绝。
5. **W2 两个课例的处置。** 同意问题说明 §10：不视为可用成品，不批量生成新课例，保留为失败样本。但需要决定是“原地修补到通过新门禁”还是“重开编排”。我的建议：合同层（容量、判定权威、编辑性档位）重开编排补冻结；Builder 层（控制器配置、Runtime 比例、判定实现）原地修补 + 重过新门禁。

---

## 八、Skill 重构方案（文件级，不实施）

> 本节是给你看的落地清单。每一项都标了“改哪个文件 / 加什么 / 不加什么”。确认后我再动手。

### A. orchestrate-courseware

#### A1. `assets/case-templates/01-courseware-contract.md`
- 在“## 精确内容”或“## 评价、反馈与约束”下新增三块**必填**子结构：
  - **`responseBudget`（响应容量预算）**：按幕列必答单元数、首次作答时间、一次重试时间、教师讨论时间，以及预算上限判断。
  - **`judgmentAuthority`（判定权威）**：每个 `CNT-*` 或每个响应槽声明 `auto-exact | auto-normalized | auto-equivalent | teacher-or-self | discuss-only`。
  - **`editabilityTier`（编辑性档位）**：按内容类别声明 `canvas-editable | property-editable | runtime-owned-acceptable`，并标注哪些是稳定题面/正文/反馈（默认 canvas-editable），哪些是复杂动态/连续交互（允许 runtime-owned）。
- 新增“## 学习证据分层”节，区分：页面采集的结构化答案 / 教师口头抽查 / 纸笔完成页面只揭示 / 仅讨论的开放表达。后三类不得自动变成页面输入字段。
- 新增“## 产品能力边界确认”节，凡脚本要求全班数据、多人统计、联网能力，必须经决策门禁确认编辑器当前支持，否则不得写入脚本。

#### A2. `references/artifact-contracts.md`
- 在 `case.json` shape 中新增三个字段：`responseBudget`、`judgmentAuthority`、`editabilityTier`，并说明它们参与 review scope hash（变化即失效审批）。
- 说明 `derivedReadiness` 现在还须包含这三块的闭合检查结果。

#### A3. `references/review-rubrics.md`
- 合同审阅增加三项必判：容量预算是否可检验、判定权威是否分档、编辑性档位是否按内容类别冻结。
- 明确拒绝“用各阶段几分钟代替容量预算”“用‘有成功标准’代替判定权威分档”。

#### A4. `scripts/validate_case.py`
- `semantic_closure` 增加三组检查：
  - 每个 `CNT-*` 必须有 `judgmentAuthority` 声明；`auto-equivalent` 在 `targetProjectSchemaVersion: 8` 当前能力未确认时报警或拒过。
  - `responseBudget` 必须存在且按幕可求和；超预算且无缩减决策时，`implementation-ready` 失败。
  - `editabilityTier` 必须存在；稳定题面/正文/反馈不得声明 `runtime-owned-acceptable` 而无决策记录。
- 时长校验从“`sum(scene_minutes) ≈ duration`”升级为“`responseBudget` 总和 ≤ duration × 容差”，旧的分钟加总保留为 sanity check。

### B. build-project-v8-courseware

#### B1. `SKILL.md`（不可妥协规则）
- 新增规则：生成或保留 `TeacherControllerNode` 时强制 `playback.controls = 'canvas'`；不得产出“有控制器节点 + controls=none”的工程。
- 新增规则：开放回答（`judgmentAuthority ∈ {teacher-or-self, discuss-only}`）不得成为唯一导航硬门禁。
- 新增规则：`engineering candidate` 必须八项子条件全绿（见 B4）。

#### B2. `references/carrier-selection.md`
- 增加“编辑性档位对照”小节：载体选择必须对照合同 `editabilityTier`；`canvas-editable` 内容降级为 `property-only`/`blocked` 视为降级，须回到编排。
- 明确：不设硬 Runtime/原生比例。

#### B3. `references/authoring-inventory.md`
- `editability` 字段必须对照合同 `editabilityTier`：`visible` 对应 `canvas-editable`，`property-only` 对应 `property-editable`，`blocked` 仅对内部算法/装饰可接受。
- `visible` 必须有可测量 bounds；共享整幕 bounds 的 Runtime 文字不得标 `visible`，只能标 `property-only`。

#### B4. `references/export-and-evidence.md`
- `engineering candidate` 拆为八项子条件：`schema-green | export-green | controller-reachable | escape-path | equivalent-answer-matrix | real-action-evidence | edit-closure | capacity-within-budget`。
- 每项有具体证据要求：
  - `controller-reachable`：每幕真实 Player 截图（控制器可见、不被遮挡）+ 每幕一次真实 next/previous/replay 点击证据。
  - `escape-path`：每个错误/空白/未完成态的揭示/跳过/继续证据。
  - `equivalent-answer-matrix`：每个 `auto-*` 槽的标准/等价/变体/近错/假阳性矩阵。
  - `real-action-evidence`：每个 `STATE-*` 标注触发来源；学生证据态必须由 student-action 产生。
  - `edit-closure`：按载体类型修改关键内容 → 保存 → 重开 → Player/HTML 更新的闭环证据。
  - `capacity-within-budget`：实际响应单元数 ≤ 合同 `responseBudget`。

#### B5. `scripts/validate_evidence.py`
- 增加八项子条件检查；任一未过，`outcomeStatus` 不得写 `engineering candidate`，只能写 `placeholder`/`unusable`。
- `currentAcceptanceScopeSha256` 现在绑定八项子条件证据。

#### B6. 新增 `scripts/validate_teacher_controller_reachability.py`（或并入 validate_v8_case.py）
- 输入：真实 Player 截图 + 交互日志。
- 断言：每幕控制器可见、不被 scene overlay 遮挡、next/previous/replay 可点击且导航发生。

#### B7. 新增 `scripts/validate_escape_path.py`（或并入）
- 断言：每个错误/空白/未完成态有非学生答案依赖的逃生路径。

### C. 编辑器/Player（非 Skill，但必须配套，列出供你决策）

- **C1.** `editorStore.ensureTeacherController()`：节点已存在时也修复 `playback.controls = 'canvas'`。一行级修复。
- **C2.** `TeacherControllerNode` 渲染平面决策：留 Phaser Canvas（提高 depth 高于 scene overlay）或迁独立 global DOM 平面。需产品决策。
- **C3.** 通用数学等价层是否纳入路线。若不纳入，合同禁止 `auto-equivalent`。
- **C4.** Runtime Authoring `visible` 是否支持逐对象 bounds。若不支持，合同 `canvas-editable` 对 Runtime 文字无效。

---

## 九、回答问题说明第 8 节的 8 个问题

1. **根因分层是否准确？是否遗漏更底层的产品模型问题？**
   基本准确。遗漏的底层问题：`editorStore.ensureTeacherController` 的自愈缺口（让坏状态持续）、Runtime Authoring `visible` 的产品语义（共享 bounds 不等于逐对象编辑）。这两个是产品模型问题，不是 Skill 文案问题。

2. **`TeacherControllerNode` 留 Phaser 还是独立 DOM？**
   倾向独立 global DOM 控制平面（z 高于 4），理由：全屏 scene Runtime DOM overlay 是预期会持续存在的用例（语文这类整幕 Runtime 课例），每次都靠 Phaser depth 跨平面压过 DOM 不可靠。但这是产品决策，需要权衡拖拽/对齐/无障碍现有实现。更薄的办法是先修自愈缺口和 controls 同步，再决定平面迁移。

3. **Runtime 与原生最小可执行编辑性边界？硬比例还是类别门禁？**
   类别门禁，不要硬比例。硬比例制造凑数节点。边界按内容类别：稳定题面/正文/反馈/教师提示 `canvas-editable`；复杂动态/连续交互 `runtime-owned-acceptable`。Builder 对照合同 `editabilityTier`，降级须回编排。

4. **开放数学/语文表达的判定模型？哪些不该自动判？**
   模型：判定权威分档。`auto-exact`（有限选项）/`auto-normalized`（去空白全半角后的短答案）可自动判；`auto-equivalent`（数学等价）只在编辑器有通用等价层时可自动判，否则降级；`teacher-or-self`/`discuss-only` 不自动判，只收不自判，不得硬锁导航。不该自动判的：数学开放解释、语文证据表达、40 字结论、因果解释。

5. **如何用最少门禁发现“脚本要圈画，成品只是完成按钮”？**
   给每个 `STATE-*` 标注触发来源 `student-action | teacher-action | system-derivation`。学生证据态必须由 `student-action` 产生；`system-derivation` 不得充当学生证据。这是可机械判定的，比纯 E2E 轻得多。

6. **不厚重、对 AI 友好的响应容量预算？**
   按幕列：必答单元数 × 首次作答时间 + 一次重试时间 + 教师讨论时间，求和 ≤ duration × 容差。字段结构化、可机械求和。超预算时校验器拒过 `implementation-ready`，要求明确缩减并记决策。不要求精确到秒，只要求可检验。

7. **`engineering candidate` 最低 HTML 行为证据？哪些留给人类？**
   最低行为证据（自动化）：控制器每幕可见可点、逃生路径、等价答案矩阵、真实动作来源、编辑闭环、容量预算。留给人类：开放回答的语义正确性、视觉审美、学科事实的最终把关、整体教学节奏。`art candidate` 仍需真实视觉/互动证据；`accepted` 必须人类验收。

8. **哪些必须先修编辑器，哪些可通过 Builder 和校验器解决？**
   先修编辑器：`ensureTeacherController` 自愈（一行）、控制器渲染平面决策、（可选）数学等价层、（可选）Runtime visible bounds。可通过 Builder + 校验器解决：controls 同步规则、逃生路径门禁、判定权威分档、容量预算、编辑性档位对照、候选等级分离。但注意：编辑器不修自愈缺口，门禁能拦住 Builder 新产出，却拦不住人工编辑引入的坏状态——所以两者必须协同，不能二选一。

---

## 十、建议的执行顺序

1. **先决策（你拍板，非我实施）：** C2 控制器平面、C3 数学等价层、C4 Runtime visible bounds。
2. **编辑器一行修复：** C1 `ensureTeacherController` 自愈。
3. **Skill 重构 P0：** A1/A2/A3/A4（编排合同字段 + 校验）、B1/B4/B5/B6/B7（Builder 规则 + 候选分离 + 控制器/逃生门禁）。
4. **W2 课例处置：** 合同层重开编排补冻结；Builder 层原地修补 + 重过新门禁。
5. **Skill 重构 P1：** B2/B3（载体/编辑性对照）、答案容错矩阵、动作真实性、编辑闭环。
6. **再跑新课例：** 新门禁全绿后才允许批量。

等你确认本方案，特别是第七节“仍需补充的证据或问题”里的四个产品决策，以及第十节的执行顺序。确认后我再按 A/B 两节动手改 Skill 文件。
