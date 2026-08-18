# SeedPro 评估报告：HTML互动课件创作链重构方案

- 日期：2026-08-13
- 评估人：SeedPro AI
- 评估对象：W2 HTML课件问题说明 + 现有创作链架构
- 状态：方案设计，不涉及代码修改

---

## 一、执行摘要

本次评估基于Codex提交的W2问题说明文档，结合对现有Skill定义、Player/Editor核心代码的分析，确认当前问题不是单点bug，而是创作链各层之间存在**系统性契约缺口**。两个通过了管线校验的"engineering candidate"课例在真实教师体验中存在阻断性问题：教师控制器看不见且点不了、大量稳定内容被过度Runtime化导致无法编辑、开放题答案判定不可靠且形成死锁。

核心结论：
1. **架构层P0**：Player合成层级存在设计缺陷——Phaser Canvas内的全局教师控制器无法越过场景级DOM overlay，即使配置正确也可能被遮挡
2. **契约层P0**：编排阶段没有冻结"答案判定职责"、"容量预算"、"编辑性要求"、"教师逃生路径"这四个结果级约束，Builder获得了过大的自由裁量权
3. **门禁层P0**：当前校验只证明"课件能跑通"，不证明"教师能用"，engineering candidate门槛过低
4. **执行层P1**：Builder对载体选择的"最小充分原则"执行偏差，违反了Skill中"选择质量更高、机制更薄方案"的要求

本报告按照问题说明要求的结构展开，给出可执行的修复方案，不追求大重构，坚持"最小充分门禁"原则。

---

## 二、根因分层详细分析

### 2.1 教学合同层（orchestrate-courseware输出）

**现有问题：**

虽然 [orchestrate-courseware/SKILL.md](file:///C:/Users/74755/Documents/HTML课件编辑器/.agents/skills/orchestrate-courseware/SKILL.md) 要求冻结目标、证据、精确内容和反馈，但在以下四个维度存在契约缺口：

| 缺口 | 具体表现 | 后果 |
|------|----------|------|
| **容量预算缺失** | 合同以"各阶段分配几分钟"证明15分钟容量，但没有对必答单元数、平均首次作答时间、典型错误重试、教师讨论时间建立可检验预算 | 数学课例塞了21+响应槽，语文课例三段长文+圈画+解释+40字结论，真实课堂根本完不成 |
| **判定职责未分类** | 合同列出了替代答案，但没有明确哪些是"有限选项自动判定"、"经规范化即可判定"、"需要数学等价"、"必须教师接管" | Builder默认"有成功标准=Runtime自动硬判"，开放数学解释和语文证据都上手写正则 |
| **学习证据≠页面输入** | 合同隐含"所有学习证据都必须学生在页面输入"，没有区分页面采集vs教师抽查vs纸笔完成vs仅讨论 | 每一个观察点都变成输入框，既拖慢节奏，又为死锁埋下伏笔 |
| **编辑性要求缺失** | 脚本不指定native/runtime是对的，但没有冻结"哪些稳定内容必须方便教师在编辑器修改"这个结果级要求 | Builder可以放心把题面、正文、标签、反馈全部扔进全屏Runtime，编辑器中只能改属性文本 |
| **未确认的产品假设** | 脚本要求查看全班预测分布、错误人数，但当前单机Project V8根本没有多人数据架构 | Builder要么不实现，要么临时猜造，造成体验断裂 |

**代码/文档证据：**
- [orchestrate-courseware/SKILL.md#L56-L76](file:///C:/Users/74755/Documents/HTML课件编辑器/.agents/skills/orchestrate-courseware/SKILL.md#L56-L76) 合同和脚本的编写要求中，没有上述四个维度的强制字段
- 合同模板 [01-courseware-contract.md](file:///C:/Users/74755/Documents/HTML课件编辑器/.agents/skills/orchestrate-courseware/assets/case-templates/01-courseware-contract.md) 和脚本模板需要补充对应章节

---

### 2.2 呈现脚本层

**现有问题：**

脚本虽然明确提到了教师控制、重试、揭示、恢复，但这些都是"描述性要求"，不是"可验证的验收标准"：

1. **教师控制不是每幕不变量**：脚本说"教师可以控制推进"，但没有要求"每一幕中控制器必须可见且按钮可点击"作为验收条件
2. **动作真实性无约束**：脚本写"学生圈画关键词"、"学生填写坐标"，但没有禁止"测试时直接设Presentation State冒充完成"
3. **逃生路径未硬要求**：脚本有揭示和重试，但没有明确"任意错误或空白状态下，教师必须能够跳过或带未完成继续"
4. **静态帧要求只覆盖外观**：脚本要求HTML/PDF/PPTX静态审阅帧，但没有要求"错误态、未完成态也要有静态帧并披露导航状态"

**证据：**
- W2数学课例脚本计划的响应单元远超15分钟容量，但没有预算校验机制拦截
- 语文课例前三幕用"错误/完成"按钮直接切状态，没有真实圈画证据收集，但脚本没有明确禁止这种"状态作弊"

---

### 2.3 Builder层（build-project-v8-courseware）

**现有问题：**

Builder在三个关键地方违反了自身Skill的"不可妥协规则"：

#### 问题A：载体选择系统性偏向Runtime

[carrier-selection.md](file:///C:/Users/74755/Documents/HTML课件编辑器/.agents/skills/build-project-v8-courseware/references/carrier-selection.md) 明确说：

| 所有权 | 使用条件 |
|--------|----------|
| `native-owned` | 简单图文、公式、图片、稳定排版、逐步显现和少量规则 |
| `runtime-owned` | 一次性高定制构图、连续拖动、算法、参数联动、SVG/Canvas/WebGL/Three |

但实际执行结果：
- **语文课例**：4幕全是`runtime-owned`，86个绑定中0个原生绑定，32个是`property-only`
- **数学课例**：名义上`hybrid-owned`，但每幕只有1个原生公式节点，题面、输入、反馈、图象全是Runtime

这违反了"选择质量更高、机制更薄且仍满足必要编辑性的最短充分方案"原则。稳定文字和布局根本不需要Runtime。

#### 问题B：控制器配置自相矛盾

从问题说明中确认：
- 数学Builder先以`includeDefaultController: false`建工程，再手工加控制器节点，但没有把`playback.controls`改回`canvas`
- [createProject.ts#L114-L176](file:///C:/Users/74755/Documents/HTML课件编辑器/src/renderer/project/createProject.ts#L114-L176) 中默认逻辑是对的：有控制器时`controls: 'canvas'`，无控制器时`controls: 'none'`，但Builder绕过了这个默认逻辑
- [renderTeacherController.ts#L195-L201](file:///C:/Users/74755/Documents/HTML课件编辑器/src/player/renderTeacherController.ts#L195-L201) 中`controllerVisible()`严格检查`canvasControlsEnabled`，配置为`none`时即使节点存在也强制隐藏
- 更糟的是，editorStore的`ensureTeacherController()`发现节点已存在时只定位节点，不修复`playback.controls`，坏状态永久保留

#### 问题C：Authoring Inventory语义滥用

[authoring-inventory.md](file:///C:/Users/74755/Documents/HTML课件编辑器/.agents/skills/build-project-v8-courseware/references/authoring-inventory.md) 定义了三个编辑状态：
- `visible`：可在当前作者视图直接定位/编辑
- `property-only`：有稳定属性入口，但画布没有可测量区域
- `blocked`：没有可用修改入口

但实际执行中：
- Runtime共享整幕或大区域bounds注册的text，被标记为`visible`，但这不是逐对象画布编辑
- 数学7/15、语文32/86的`property-only`实际上是大部分可见内容只能改属性文本
- Inventory没有几何校验：两个`visible`实体bounds重叠度超过80%时没有警告

#### 问题D：答案判定没有通用层，各自手写正则

核心仓库没有共享的答案归一化、数学等价或开放回答评估器：
- 数学检查`f(x)=0`固定字符串，"0和2"判断根，固定半角括号/逗号判断坐标
- 语文40字结论用关键词正则
- 结果：等价数学表达被拒绝，关键词拼接被误判为正确，答不出就死锁

---

### 2.4 Editor / Player产品层

这是最底层的架构问题，必须先修：

#### 问题A：Player合成层级错误

[PlayerApp.ts#L95-L101](file:///C:/Users/74755/Documents/HTML课件编辑器/src/player/PlayerApp.ts#L95-L101) 记录的当前层级：

```text
global DOM underlay: z=0
scene DOM underlay:  z=1
Phaser canvas host:  z=2  ← TeacherControllerNode在这里面
scene DOM overlay:   z=3  ← 全屏Runtime DOM在这里，比Canvas高
global DOM overlay:  z=4
```

原生`TeacherControllerNode`位于Phaser Canvas(z=2)内部。即使它在Phaser中的depth属于global overlay，也**无法越过Canvas外部**、z=3的scene Runtime DOM overlay。

这是一个**独立于配置错误**的风险：即使把`playback.controls`改回`canvas`，只要场景使用了全屏Runtime overlay，控制器仍然会被挡住。

#### 问题B：没有全局导航UI的独立平面

教师控制器本质上是**课件的全局导航UI**，不是场景内容的一部分。它的产品属性更接近视频播放器的控制条——永远在最上层，不被内容遮挡，随时可用。

但当前设计把它当作一个普通的Phaser节点放在globalLayer里，受Canvas内部depth和外部DOM z-index双重夹击。

#### 问题C：导航规则没有教师优先权

当Runtime规则阻止导航（比如学生没答对）时，教师控制器的"下一幕"按钮应该**始终有最高权限**可以覆盖规则——教师选择继续就是权威决定，不需要学生先答对。当前没有这个"教师优先"逻辑。

---

### 2.5 校验与评级层

现有门禁证明了"课件是一个合法的工程文件"，但没有证明"课件是一个可用的教学工具"：

**现有门禁能证明：**
- 文件和容器是真实产物
- Project Schema与引用有效
- 预设初始、反馈、稳定帧存在
- 一条自动化黄金路径可以到达稳定状态
- 某些Runtime文本可通过属性入口修改、保存重开
- HTML、网页包、PDF、PPTX、截图、录屏存在且哈希闭合

**现有门禁不能证明：**
- 每一幕教师控制器真实可见、无遮挡、按钮可点击
- 错误答案后可以重试、揭示或由教师带未完成继续
- 正确但不同表述的答案能通过，错误关键词拼接不能通过
- 脚本要求的圈画、拖放、填写确实由学生通过真实控件完成
- `visible`真的是逐对象可编辑，而不是Runtime大区域入口
- 15分钟容量在真实交互节奏下成立
- `engineering candidate`已达到教师可用水平

**E2E测试的作弊问题：** 当前自动化测试可以直接调用`runtimeKernel.setPresentationState()`或类似API跳状态，根本不需要模拟学生真实输入、圈画、拖放，因此"测试通过"完全不代表"互动真实"。

---

## 三、对8个重点问题的直接回答

### 问题1：根因分层是否准确？是否遗漏了更底层的产品模型问题？

**根因分层基本准确，但需要补充一个更底层的问题：**

当前产品模型隐含了"场景内容优先于全局控制"的层级假设，但教师控制是**教学主权的体现**，它的产品层级应该高于一切场景内容。这不是一个bug，而是一个**产品优先级决策**没有在架构中固化。

就像视频播放器的进度条和控制按钮永远不会被视频内容遮挡一样，教师的上一幕/下一幕/揭示/跳过按钮永远不应该被任何场景Runtime盖住。现在的层级模型正好搞反了。

---

### 问题2：TeacherControllerNode应继续留在Phaser Canvas，还是应拥有独立的全局DOM控制平面？

**结论：必须拥有独立的全局DOM控制平面。**

理由：
1. **层级问题本质解**：放在Canvas里永远要和scene DOM overlay(z=3)打架，就算临时调z-index，以后再加什么全局层还会出问题。独立DOM层直接给z-index=1000，一劳永逸。
2. **更简单的交互**：DOM按钮天生支持hover、focus、键盘导航、触屏，不需要在Phaser里手写Zone、手势、拖放、无障碍支持（看[renderTeacherController.ts](file:///C:/Users/74755/Documents/HTML课件编辑器/src/player/renderTeacherController.ts)里几百行手势代码，本质是在DOM已经做好的事情上重造轮子）。
3. **编辑器中仍然可配置**：TeacherControllerNode继续保留在Project的globalLayer中，教师可以在编辑器里调整它的位置、按钮配置、颜色、是否可折叠等，保存到课件里。**只改渲染层，不改数据模型**。
4. **更薄的实现**：当前renderTeacherController有900行代码处理Phaser渲染、手势、无障碍DOM镜像。改成纯DOM实现后可以大幅精简，无障碍也天然支持。

**具体方案：**
- PlayerApp构造时，在stage最后创建一个`lesson-global-controls`DOM容器，z-index=1000，`pointer-events: auto`（需要穿透的地方设为none）
- TeacherControllerNode仍然从Project的globalLayer读取配置（位置、按钮、颜色、折叠状态）
- 渲染成普通的DOM按钮栏，位置用绝对定位+transform对齐画布坐标系
- 拖动、折叠、全屏、静音这些功能全部用标准DOM事件处理
- 现有Phaser的renderTeacherController可以保留给编辑器画布内的预览/编辑模式（可选），播放模式用新的DOM层
- **存量课件兼容**：新播放器加载旧课件时，如果检测到TeacherControllerNode但`playback.controls !== 'canvas'`，自动修正为`canvas`（就像编辑器的ensureTeacherController应该做但没做的修复）

这不是大重构——数据模型完全不动，只改Player的渲染路径。

---

### 问题3：Runtime与原生节点之间最小、可执行的编辑性边界是什么？

**结论：不要硬比例，按"内容类别"建立门禁规则。**

**默认归属规则（Builder必须遵守）：**

| 内容类别 | 默认所有权 | 例外条件 |
|----------|------------|----------|
| 稳定题面、题干、正文、标题、标签说明 | `native-owned`（TextNode/FormulaNode/ImageNode） | 除非文字与连续动画/算法实时联动 |
| 静态反馈文案、正确/错误提示、教师提示 | `native-owned`（可先隐藏再用Presentation State控制显示） | 除非反馈是实时算法生成的个性化内容 |
| 稳定布局容器、装饰、背景 | `native-owned` | 除非布局本身是互动的一部分（如拖放目标区高亮） |
| 按钮、简单选择、有限选项交互 | `native-owned` + 声明式interactions | 除非需要高度定制的视觉效果 |
| 连续拖动、实时参数联动、函数图象动态绘制 | `runtime-owned` | —— |
| 复杂SVG/Canvas/WebGL可视化、算法动画 | `runtime-owned` | —— |
| 一次性格局复杂但内容稳定的场景 | `hybrid-owned`，Runtime只做动态部分，稳定文字/图片用native节点叠在上面或下面 | native和Runtime边界必须在开发计划中明确列出 |

**编辑状态硬门禁：**
1. 所有学生/教师可见的**稳定文字、公式、图片、答案、反馈**，在`engineering candidate`前不得为`blocked`
2. `property-only`的Runtime绑定，不能承载题面、正文、核心反馈——这些必须是native `visible`
3. Authoring Inventory中标记为`visible`的实体，**必须有独立的、不与其他visible实体重叠度超过70%的bounds**
4. 如果稳定内容从预期的native `visible`降为Runtime `property-only`，必须停止构建，回到编排阶段取得明确批准，不能只在evidence differences里披露就继续

这个规则足够薄，AI Builder容易执行，校验器也容易检查。

---

### 问题4：开放数学解释和语文证据表达，应采用怎样的"自动规范化+教师接管"模型？

**结论：建立四级判定模型，开放回答默认不硬锁。**

| 判定级别 | 适用场景 | 实现方式 | 导航权限 |
|----------|----------|----------|----------|
| L1: 精确匹配 | 选择题、判断题、有限选项下拉 | 直接字符串/枚举比较 | 可以自动判对错，但错误时教师仍可跳过 |
| L2: 规范化匹配 | 数字答案、坐标、简单公式形态 | 全半角转换、空白修剪、标点统一、括号/逗号容错后再比对 | 可以自动判对错，但必须有重试按钮，教师随时可揭示/继续 |
| L3: 等价匹配 | 代数表达式等价、数学式变形 | 基础表达式解析（不是完整CAS），处理交换律、结合律、0/1/系数简化、分数小数转换 | 自动判"可能正确"给正向反馈，但**不能作为唯一导航门禁**，教师确认或点击继续才能推进 |
| L4: 教师/自评 | 开放解释、语文证据、证明过程、40字结论 | 只做基础长度检查、关键词提示（可选），不判对错 | **永远不硬锁**，学生提交后显示"已记录"，教师选择是否讨论、揭示答案、或继续 |

**硬规则：**
- 没有L3等价能力时，数学开放解释直接降为L4
- 语文的圈画、引用、解释、结论，默认L4
- L3和L4都不能成为"不答对就不能下一幕"的硬门禁——教师永远有最高权限
- 正则和关键词只能用于**提示**（比如"你是不是忘了考虑判别式小于0的情况？"），不能用于**判分**或**阻止导航**

**实现优先级：** 先不做复杂的L3等价引擎，先把L1/L2规范化做好，再把L4"不硬锁"规则强制执行。L3可以后续迭代，没有的时候一律降级到L4。

---

### 问题5：如何用最少门禁发现"脚本要求真实圈画，成品却只是完成按钮"这类语义失真？

**结论：E2E测试必须"模拟真实操作"，禁止直接跳状态。**

**最小门禁规则：**
1. **动作-控件绑定检查**：在呈现脚本中，每个学生动作（圈画、输入、拖放、选择）必须关联一个具体的"交互控件类型"。Builder实现时必须在Authoring Inventory中登记每个动作对应的真实控件（输入框DOM、Canvas拖放zone、圈画层等）。
2. **E2E操作真实化**：自动化测试驱动Player时，**禁止直接调用以下API**：
   - `runtimeKernel.events.emit()` 伪造完成事件
   - `setPresentationState()` 直接切状态
   - Runtime内部暴露的"完成当前步骤"方法
   
   测试必须通过真实的用户输入路径：
   - 文本输入：用DOM input事件往真实输入框里打字
   - 点击：用真实pointer/click事件点对应的按钮/区域
   - 拖放：模拟pointerdown → pointermove → pointerup序列
   - 圈画：模拟canvas上的pointermove轨迹
3. **证据留存检查**：每个要求收集学习证据的STATE，进入下一状态前，Project/Runtime中必须留存对应的证据数据（输入值、圈画坐标、拖放位置），不能只是状态切换。测试验证证据数据存在且不为空。
4. **"完成按钮"陷阱检测**：如果一个SCN的某个STATE只有一个"完成"或"我做好了"按钮，且点击后没有检查任何学生输入/操作就直接推进，校验器直接报警——这种情况必须在开发计划中说明理由。

这个门禁不需要复杂的计算机视觉，只需要在E2E测试框架层设一个"禁用API列表"，以及对交互证据的简单存在性检查。

---

### 问题6：如何建立不厚重、对AI创作友好的响应容量预算？

**结论：用"必答单元×时间系数"的简单公式，给默认保守值。**

**预算模型：**

课件总时长（分钟） ≥ Σ（每个必答响应单元的预计时间）

每个必答响应单元的时间系数：

| 响应类型 | 首次作答 | 一次重试 | 教师讨论/讲解 | 合计 |
|----------|----------|----------|---------------|------|
| 选择题/判断题（单选） | 0.5分钟 | 0.25分钟 | 0.5分钟 | 1.25分钟 |
| 数字/坐标/短公式填空 | 1分钟 | 0.5分钟 | 0.75分钟 | 2.25分钟 |
| 多空填写 | 1.5分钟 | 0.75分钟 | 1分钟 | 3.25分钟 |
| 开放文本解释（≤50字） | 2分钟 | 1分钟（可选） | 1.5分钟 | 4.5分钟 |
| 圈画/标注/拖放配对 | 1.5分钟 | 0.75分钟 | 1分钟 | 3.25分钟 |

**规则：**
1. 编排阶段在合同中就统计必答单元数量和类型，自动计算预计总时长
2. 预计总时长 > 课件声明时长×1.2（20%缓冲）时，校验器警告；预计 > 1.5倍时，阻止进入implementation-ready
3. 教师演示、集体讲授、齐声回答的环节不计入必答响应单元——这些教师自己在课堂上控制节奏
4. AI创作时，如果预算超了，优先建议：(a) 把一些开放题降为教师讨论（不页面采集），(b) 合并或删减非核心必答，(c) 减少重试次数

**默认值（15分钟课）：**
- 最多6-8个必答响应单元
- 其中L4开放题最多1-2个
- 至少留出3分钟教师讲授/总结时间

这个模型很简单，AI Builder算得过来，校验器也容易检查。不需要精准到秒，只要能拦住"15分钟塞21个输入框"这种明显过载就行。

---

### 问题7：engineering candidate的最低HTML行为证据应该包括哪些？

**结论：分成3级，每级明确证据清单。**

| 等级 | 最低证据要求 | 谁签发 |
|------|-------------|--------|
| `pipeline:passed` | Project Schema有效、引用闭合、文件存在、黄金路径走通、保存重开不丢数据、HTML/PDF/PPTX导出文件存在 | 自动化校验器 |
| `engineering candidate` | 达到pipeline:passed，加：<br>1. 每幕截图中教师控制器可见、位于右上角/底部（非指定安全区）、按钮DOM可点击点中<br>2. 每幕在错误/空白状态下，教师"揭示"和"继续"按钮可点击，点击后确实推进<br>3. E2E测试通过真实控件完成所有必答交互，没有直接跳状态<br>4. L1/L2答案容错矩阵测试通过（标准答案+1个等价变体+1个近错）<br>5. Authoring Inventory中所有标记visible的实体有独立bounds<br>6. 容量预算在合理范围内 | 自动化校验器（带真实Player渲染和交互） |
| `art candidate` | engineering candidate，加：视觉排版、动画流畅度、内容校对、学科细节审查 | 人类（可以是AI辅助视觉检查后推荐） |
| `accepted` | 真实课堂试用、教师确认可用 | 指定的人类审阅人 |

**关键点：**
- `engineering candidate`只能由自动化的、带真实Player的行为测试签发，不能只靠静态Schema检查
- 教师控制可达性测试必须在每一幕的每一个关键STATE都做（初始态、错误态、完成态），不能只测第一幕初始态
- PDF/PPTX在pipeline:passed阶段只要求：能打开、页数正确、主要文字可读、静态帧有意义、差异报告真实——不要求对象级编辑
- 从`pipeline:passed`到`engineering candidate`是最大的门槛跨越，现在这一步太松了

---

### 问题8：哪些问题必须先修编辑器产品，哪些可以通过Builder和校验器解决？

| 问题 | 必须先修产品 | Builder/校验器可缓解 |
|------|-------------|---------------------|
| 教师控制器被scene DOM overlay遮挡 | ✅ 必须给控制器独立全局DOM平面 | —— 配置修复只能解决数学那节课，不能解决架构问题 |
| 控制器配置不一致（有节点但controls=none） | 🔶 editorStore.ensureTeacherController()需要补全修复逻辑 | ✅ Builder创建项目时不要绕过默认逻辑 |
| 过度Runtime化导致无法编辑 | 🔶 长期需要提升Runtime Authoring的画布内编辑能力（bounds上报、可视化选中） | ✅ 短期通过载体选择门禁+Inventory几何校验，强制稳定内容用native |
| 答案判定不可靠+死锁 | 🔶 长期需要L3等价匹配引擎、Runtime互动组件库提供标准化输入控件 | ✅ 短期强制执行四级判定模型，L3/L4不硬锁，教师永远能继续 |
| E2E测试直接跳状态 | 🔶 测试框架需要加"禁用API"层 | ✅ 在validate_v8_case.py脚本中检查测试代码是否用了禁用API |
| 容量超预算 | —— 不需要产品改动 | ✅ 编排阶段加预算统计，校验器拦截 |
| 开放题不硬锁 | 🔶 Player需要保证教师控制器按钮即使在导航被规则阻止时也能触发"教师强制继续" | ✅ Builder在写交互规则时，每个导航阻止规则都必须配一个教师绕过路径 |

**修复顺序建议：**
1. **第一周（P0产品）**：教师控制器移到独立DOM层，确保永远在最上层；修复ensureTeacherController；加"教师强制继续"逻辑
2. **第一周（P0编排/Builder）**：更新Skill合同/脚本模板，补充四个必填契约；更新carrier-selection明确默认归属规则；Builder创建项目不绕过默认控制器配置
3. **第二周（P0校验）**：实现engineering candidate的行为门禁——控制器截图/点击测试、逃生路径测试、真实交互E2E、Inventory几何校验、容量预算检查
4. **第三周及以后（P1）**：答案规范化层L1/L2实现；Runtime Authoring的bounds上报能力；视觉QA工具增强；L3等价引擎（可选）

---

## 四、P0必须立即实施的修复（继续创作前）

### 4.1 产品架构修复（最高优先级）

1. **教师控制器独立DOM平面**
   - 修改[PlayerApp.ts](file:///C:/Users/74755/Documents/HTML课件编辑器/src/player/PlayerApp.ts)，在stage最后创建z=1000的`lesson-global-controls`容器
   - 新建（或改造）TeacherController的DOM渲染器，读取Project中TeacherControllerNode配置，渲染为DOM按钮
   - 按钮点击直接调用PlayerApp的nextScene()/previousScene()/replayScene()等方法，绕过scene内的interaction规则（教师权威）
   - 保留现有Phaser TeacherController渲染给编辑器内画布编辑使用（编辑模式下可以继续用Canvas渲染），播放模式用DOM层
   - 位置同步：监听canvas缩放/对齐，用transform把DOM控制器对齐到画布坐标系

2. **配置不一致自动修复**
   - 修改`ensureTeacherController()`：如果检测到globalLayer中有teacher-controller节点，但`playback.controls !== 'canvas'`，自动修正为`canvas`
   - Player加载课件时做同样的sanity check，确保存量坏课件在新播放器中自动修复
   - Builder创建项目时，**必须使用`createProject({includeDefaultController: true})`默认路径**，禁止先false再加节点；如果确实需要自定义控制器，创建后必须确保controls配置一致

3. **教师逃生路径硬保证**
   - PlayerApp中，教师控制器的"上一幕/下一幕/重播/重新开始"按钮，**永远可用**，即使当前scene的navigation规则返回blocked
   - 增加一个"强制继续"（揭示答案并跳过）按钮？不，现有"下一幕"就是——教师点下一幕必须能走，不需要额外按钮。需要改的是：当控制器触发导航时，不执行scene级的blocking规则检查，教师权限最高
   - Runtime的`navigation:blocked`事件只用于给学生显示提示，不能阻止教师控制器的操作

### 4.2 编排契约补充

更新[01-courseware-contract.md](file:///C:/Users/74755/Documents/HTML课件编辑器/.agents/skills/orchestrate-courseware/assets/case-templates/01-courseware-contract.md)模板，强制包含以下章节：

1. **响应容量预算表**
   - 列出所有必答响应单元（ID、类型、对应CNT-*）
   - 自动计算预计总时长，对比课件声明时长
   - 超预算时必须注明哪些单元被裁剪或转为教师讨论

2. **答案判定职责矩阵**
   - 对每个有答案/产出的CNT-*，标记判定级别（L1/L2/L3/L4）
   - 明确哪些是自动判定、哪些需要教师确认、哪些只记录不判分
   - 所有L4项必须明确说明"不作为导航硬门禁"

3. **编辑性要求声明**
   - 列出哪些内容必须是画布可编辑（题面、核心反馈、教师提示、关键公式）
   - 列出哪些内容允许Runtime property-only（动态参数、实时反馈模板）
   - 列出哪些内容允许Runtime黑箱（连续动画、算法可视化）

4. **教师控制与逃生路径确认**
   - 确认每一幕都有教师控制器
   - 确认每一幕的每个STATE（尤其是错误态）都有教师揭示/跳过路径
   - 确认未完成时教师可以选择带进度继续

### 4.3 Builder与载体选择规则收紧

更新[carrier-selection.md](file:///C:/Users/74755/Documents/HTML课件编辑器/.agents/skills/build-project-v8-courseware/references/carrier-selection.md)：

- 把之前的"内容类别归属表"作为硬规则，不是建议
- 增加"载体降级审批"：如果某类默认native的内容必须用Runtime（有充分理由），必须在development-plan中明确记录理由，并回到编排阶段取得批准
- Authoring Inventory的`visible`定义收紧：必须有独立可测量bounds，重叠度<70%，否则不能标visible

### 4.4 最小硬门禁实现

在`validate_v8_case.py`和相关校验脚本中增加以下检查（不厚重，都是静态/轻量交互检查）：

1. **控制器一致性检查**：有teacher-controller节点 ⇔ playback.controls === 'canvas'
2. **逃生路径存在性检查**：每个STATE的转换规则中，必须至少有一条不依赖学生答案正确的教师路径
3. **Inventory几何检查**：所有visible实体必须有bounds，同scene下visible实体两两重叠度<70%
4. **判定级别检查**：标记为L3/L4的答案，不能成为navigation规则的唯一前置条件
5. **容量预算检查**：预计总时长 ≤ 声明时长×1.5
6. **E2E测试白名单**：提供允许调用的Player API列表，测试代码中如果出现直接setPresentationState/emit完成事件的，警告或失败
7. **每幕控制器截图验证**：Player在capture模式下加载每幕初始态，检查DOM中控制器容器可见，getBoundingClientRect()在视口内

---

## 五、P1可并行改进项

### 5.1 答案规范化层

实现一个轻量的共享答案评估工具模块（不需要一开始就做CAS）：
- `normalizeTextAnswer(input)`：全半角转换、空白修剪、标点统一、大小写折叠
- `normalizeNumberAnswer(input)`：解析数字、分数、小数，处理"等于"、"大约"等前缀
- `normalizeCoordinate(input)`：解析(x,y)格式，处理全半角括号/逗号、空格
- `checkKeywordHints(input, keywords)`：返回命中的关键词用于提示，但不返回true/false判分

这个模块放在`src/shared/answerEvaluation.ts`，Builder生成Runtime代码时统一调用，禁止各课例自己写正则判分。

### 5.2 Runtime Authoring增强

- Runtime需要向编辑器上报每个注册的authoring target的真实bounds（当前viewport中的rect）
- 编辑器可以在画布上显示这些bounds的半透明覆盖，点击时选中对应target打开属性面板
- 这让Runtime的`property-only`实体有更清晰的可视化入口，但不要求第一版做到"画布内拖动编辑"

### 5.3 课件健康检查CLI

写一个轻量的node/python脚本，加载`.h5lesson`后输出健康报告：
- 控制器状态
- 各场景native/runtime比例
- 自动判定答案数量和级别分布
- 预计响应容量
- 潜在导航死锁（没有教师绕过的规则）

AI Builder生成完课例后可以先跑这个自查，再提交完整校验。

### 5.4 证据分级与manifest更新

在`evidence-manifest.json`和Project的pipelineStatus中明确区分：
- `schemaCheck: passed/failed`
- `exportCheck: passed/failed`
- `teacherControlCheck: passed/failed`
- `interactionCheck: passed/failed`
- `authoringCheck: passed/failed`
- `capacityCheck: passed/failed`

`engineering candidate`要求上述所有Check都是passed，而不是笼统的一个pipelineStatus。

---

## 六、不建议采取的方案及理由

| 方案 | 不建议原因 |
|------|-----------|
| "再补几条Skill文案就能解决" | 现有Skill原则是对的，问题是没有可执行的验证门禁。文案写得再漂亮，Builder还是会走捷径，除非有校验器拦着 |
| "规定Runtime绑定不能超过X%" | 不同课型差异太大——数学动态函数图象课Runtime比例天然高，语文阅读课应该几乎全native。按内容类别比按比例更精准 |
| "为了PDF/PPTX兼容限制HTML能力" | PDF/PPTX只是静态兼容输出，不应该反向主导HTML主产品的交互设计和编辑体验。静态格式保证内容可读、差异诚实即可 |
| "引入重量级计算机代数系统(CAS)做数学等价" | 15分钟课件场景不需要，成本高、复杂度大、还可能判错。基础表达式规范化足够用，复杂开放题直接走L4教师判定 |
| "把教师控制器完全移到编辑器壳层/浏览器外" | 控制器是课件的一部分——教师可以在编辑器里调整它的位置、按钮、颜色、是否折叠，这些配置要保存在课件里。只改渲染层到独立DOM，数据模型不动 |
| "一次性重构所有Runtime交互为native组件" | 成本太高，没有必要。Runtime作为"一次性复杂场景"的一等载体是合理设计，只要把稳定内容收回native就行。不要因噎废食 |
| "给每个开放题加AI语义判分" | 课堂场景下AI判分不可靠，且会引入网络依赖、延迟、隐私问题。L4开放题就应该是教师主导，不要迷信自动化 |
| "等W2课例改好再继续" | 不需要等课例。先修架构和门禁，再用新门禁重新评估和修课例——门禁先立起来，后面的创作就不会再出同类问题 |

---

## 七、需要补充的信息与后续行动

### 7.1 需要确认/调查的点

1. **Runtime Authoring的bounds上报能力**：当前Runtime API 2是否支持authoring target上报自己的DOM/Canvas bounds？如果不支持，需要在Runtime API中加这个能力，但这是P1。
2. **编辑器画布中TeacherController的编辑方式**：当前教师控制器在编辑器里是作为Phaser节点选中拖动吗？改成播放模式DOM渲染后，编辑器模式下的编辑体验需要保留。
3. **存量课件数量与兼容性优先级**：需要确认现在有多少存量坏课件，自动修复逻辑的测试范围。
4. **E2E测试框架当前能力**：现有测试能不能模拟真实pointer/keyboard事件，还是只能调用API？需要确认后再设计"真实交互"门禁的实现方式。
5. **component packages现状**：是否有可复用的标准化输入框、选择题、拖放组件？如果有，Builder应该优先用组件而不是从零写Runtime。

### 7.2 建议后续行动顺序

| 阶段 | 时间 | 内容 |
|------|------|------|
| 第一阶段 | 1-2天 | 确认本方案，对齐P0范围；教师控制器DOM层技术方案验证 |
| 第二阶段 | 3-5天 | 实现P0产品修复：控制器DOM层、配置自动修复、教师权威导航；更新Skill文档模板 |
| 第三阶段 | 3-5天 | 实现P0校验门禁：控制器检查、逃生路径检查、Inventory几何检查、容量检查、E2E禁用API |
| 第四阶段 | 2-3天 | 用新门禁重新跑W2两个课例，确认门禁能捕获问题；输出修复指导 |
| 第五阶段 | 并行 | P1项：答案规范化层、健康检查CLI、Runtime bounds上报 |

### 7.3 成功标准

1. 新的Player播放任何课件时，教师控制器**永远可见、永远在最上层、永远可点击**——不管场景里有什么全屏Runtime
2. 教师在任何状态下点"下一幕"或"重播"都**不会被死锁**——教师选择就是最终决定
3. 新的Builder生成课例时，题面、正文、稳定反馈默认是native TextNode，在编辑器里可以直接点选编辑
4. 一个"15分钟塞21个输入框"或"开放题正则判错就锁死"的课例，会在校验阶段被明确阻止，拿不到`engineering candidate`
5. E2E测试必须真的往输入框里打字、真的点击按钮，不能直接跳状态
6. 两个W2课例用新门禁跑，会明确失败并指出具体问题，不会再"管线通过但教师不能用"

---

## 八、总结

这次问题的本质不是"AI写代码能力不行"，也不是"Skill写得不够详细"，而是**创作链的反馈环断了**：上游编排没有冻结对结果质量最关键的几个约束，Builder在没有硬门禁的情况下选择了最省事的实现（全扔Runtime、正则硬判），校验只检查了"工程合法性"而不是"教学可用性"，直到用户真实体验才发现问题。

重构方案遵循三个原则：
1. **最小充分**：不做大重构，数据模型基本不动，只补最关键的架构缺陷和契约缺口
2. **门禁优先**：先把"什么不能通过"的规则立起来，AI Builder在硬门禁约束下自然会选择更合理的实现
3. **教师主权**：教师控制和教师判断永远有最高优先级，这是课堂教学工具的底线，不能被学生端交互规则或自动化判定架空

不需要追求"AI创作100%完美"，只需要做到"AI创作的课件在通过门禁后，不会出现教师打不开、点不动、被锁死、改不了的阻断性问题"，剩下的视觉和体验优化留给`art candidate`和人类`accepted`阶段。

---

*报告结束*
