# ittoedu 两套 Skill 重构｜联合决策基线 V1

> 状态：工作草案，用于用户、ChatGPT 与 Codex 共同迭代。  
> 依据：当前 `orchestrate-courseware`、`build-project-v8-courseware`，以及 W2 数学/语文失败课例的合同、脚本、开发计划、Authoring Inventory、Builder、工程和证据。  
> 原则：不新增无必要阶段；优先把关键要求变成可执行合同与硬门禁，而不是继续增加 Skill 文案。

---

## 1. 核心判断

当前两套 Skill 已经包含许多正确原则：

- 教学合同与逐场景脚本先于技术实现；
- Runtime 是一次性复杂场景的一等载体；
- Authoring Inventory 使用稳定绑定；
- 先做风险纵切；
- 真实 Player、编辑闭环和四格式证据；
- 自动化不能授予 `accepted`。

W2 失败的关键不是原则完全错误，而是：

1. 上游合同没有冻结“哪些证据必须数字采集、谁有判定权、多少响应在时长内可完成、稳定内容需要怎样的编辑体验”；
2. 呈现脚本的学生动作仍主要是自然语言，Builder 可以用“完成/错误按钮切状态”替代真实圈画、输入或拖放；
3. Builder 的载体选择只检查内容是否有 binding，没有检查画布目标是否独立、布局是否可调整、全屏 Runtime 是否遮挡全局控制；
4. 证据系统证明了文件、截图、状态和一条黄金路径存在，却没有证明教师控制、逃生路径、真实动作、判题容错和容量成立；
5. `engineering candidate` 的机器门槛过低；
6. TeacherController 的工程不变量和 Player 渲染平面存在产品级缺陷，不能仅靠 Skill 文案解决。

---

## 2. P0：继续生成新课例前必须解决

### P0-A｜教师控制产品不变量

必须修复编辑器/Player：

1. `playback.controls === "canvas"` 与至少一个可用 `TeacherControllerNode` 保持一致；
2. 工程存在控制器但 `controls === "none"` 时：
   - Headless Project Validation 报阻断错误；
   - `ensureTeacherController()` 必须修复 controls，而不只是定位已有节点；
3. `controls === "canvas"` 但无控制器时：
   - 新建/修复入口自动补齐；
   - 正式校验阻断；
4. TeacherController 必须位于独立的最高操作平面，不得被全屏 scene DOM Runtime overlay 覆盖；
5. 每幕真实 Player E2E 验证：
   - 可见；
   - 未被遮挡；
   - 可点击；
   - 上一幕、下一幕、重播、重开真实生效；
   - 键盘/翻页笔语义无回归。

建议保持 Project 中的 `TeacherControllerNode` 作为作者真相，但在 Player 中渲染到独立 top control plane；不要仅依赖 Phaser Canvas depth 解决跨 DOM 平面遮挡。

### P0-B｜四个跨 Skill 的可执行合同

不新增独立文档，直接写入现有：

- `01-courseware-contract.md`
- `02-presentation-script.md`
- `03-development-plan.md`
- `authoring-inventory.json`
- `evidence-manifest.json`

四个合同为：

1. **Evidence / Response Contract**
2. **Assessment Authority Contract**
3. **Authoring Outcome Contract**
4. **Required Action / Teacher Escape Contract**

### P0-C｜行为证据与视觉证据分离

- 允许通过 `setPresentationState()` 生成确定视觉帧；
- 但该截图只能标记为 `visual-frame`；
- 任何脚本要求的圈画、拖放、输入、参数改变、排序或选择，必须由真实控件操作形成 `behavioral-path`；
- 不能用直接切状态、测试专用“完成”按钮或内部 API 冒充学生行为。

### P0-D｜候选等级重定义

建议状态：

```text
pipeline-passed
  文件、Schema、构建、导出和基础证据通过

behavior-verified
  教师控制、真实动作、错误恢复、判题矩阵和编辑闭环通过

engineering candidate
  pipeline-passed + behavior-verified + 全幕可达 + 无 P0 blocker

art candidate
  视觉、排版、节奏和整课 contact sheet 达到内部候选

accepted
  指定人类对精确 scope 明确验收
```

若不希望增加状态值，至少要求 `engineering candidate` 必须同时满足 `behaviorGates.status === "passed"`。

---

## 3. Skill 1：orchestrate-courseware 的精确修改

### 3.1 保留当前主流程

默认：

```text
输入诊断
→ 课程设计合同批准
→ 逐场景/状态呈现脚本批准
→ implementation-ready
```

不恢复独立 Content Spec、Implementation Handoff 或默认视觉阶段。

### 3.2 课程设计合同新增最小响应预算

每个需要学习证据的响应项登记：

```yaml
responseId: RESP-001
evidenceRef: EVD-001
mode: digital-required
responseType: short-text
required: true
firstAttemptSeconds: 25
retrySeconds: 15
teacherDiscussionSeconds: 20
```

`mode`：

```text
digital-required
digital-optional
oral-check
paper-work
teacher-observed
discussion-only
```

课程总预算至少计算：

```text
阅读/观察
+ 必答响应首次作答
+ 一次合理重试
+ 教师检查/讨论
+ 场景过渡
```

不能继续用“各阶段分钟相加”证明容量。超过总时长时必须缩减响应、改为纸笔/口头证据或重新批准时长。

### 3.3 冻结判定权威

每个数字响应项必须声明：

```yaml
evaluation:
  authority: finite-auto
  navigationGate: hard
  teacherOverride: true
```

`authority` 只允许：

```text
finite-auto
normalized-auto
symbolic-equivalence
teacher
self-check
peer-check
none
```

规则：

- 有限选项可自动硬判；
- 只需大小写、空白、全半角、标点归一化的短答案可 `normalized-auto`；
- 数学表达只有存在可靠等价引擎时才使用 `symbolic-equivalence`；
- 开放数学解释、语文证据表达、概括和论证默认 `teacher | self-check | peer-check`；
- 不可靠的开放回答不得成为唯一导航硬门禁；
- 任何硬门禁都必须有教师揭示、跳过或带未完成继续。

### 3.4 冻结结果级编辑要求

不指定 Native 或 Runtime，只规定结果：

```yaml
authoringRequirement:
  contentRef: CNT-001.title
  access: direct-canvas
  layoutAdjustment: required
  styleAdjustment: basic
```

`access`：

```text
direct-canvas
authoring-view
structured-property
developer-only
```

通用默认：

- 稳定标题、题面、正文、标签、反馈、教师提示和公式：至少 `direct-canvas | authoring-view | structured-property`；
- 需要教师经常移动、缩放或重新排版的内容：必须 `direct-canvas | authoring-view`；
- 复杂动态图形和算法内部可 `developer-only`；
- 若实现只能从批准的 `direct-canvas` 降为 `structured-property`，必须返回上游取得明确取舍。

### 3.5 显式冻结产品能力假设

课程合同必须标注：

```text
single-device
teacher-display
individual-device
multi-user-aggregation
networked-classroom
```

凡脚本要求班级分布、错误人数、多人同步或云端数据时，必须确认产品能力；当前未实现则删除、降为教师观察或阻断，不允许 Builder 临时伪造。

### 3.6 呈现脚本新增 Required Action

每幕登记机器可追踪的真实动作：

```yaml
actionId: ACT-S2-003
actor: student
kind: circle-text
target: 片段 C 中“不变”证据
evidenceProduced: RESP-006
requiredForCompletion: true
```

`kind` 例：

```text
click
select
text-input
formula-input
drag
sort
circle-text
highlight
parameter-change
oral
paper
teacher-command
```

每个动作同时说明：

- 操作前必须可见信息；
- 真实控件/行为；
- 产生何种证据；
- 是否导航硬门禁；
- 错误、重试、揭示；
- 教师逃生路径。

---

## 4. Skill 2：build-project-v8-courseware 的精确修改

### 4.1 载体选择从“能否实现”改为“双合同”

每幕先同时检查：

1. **Experience Fit**
   - 视觉和互动质量；
   - 连续性；
   - 实现效率；
   - 生命周期与捕获。

2. **Authoring Fit**
   - 内容可编辑；
   - 是否可独立定位；
   - 是否能调整布局/样式；
   - 隐藏内容是否有 Authoring View；
   - 用户批准的编辑等级是否满足。

不设置 Native/Runtime 硬比例。

全屏 Runtime 允许，但满足以下条件：

- 复杂整体构图/连续交互确有价值；
- 不是因为 Builder 图省事；
- 所有稳定人工内容有真实 binding；
- 要求直接画布编辑的内容具有独立可测量目标，不能多个实体共享整幕 bounds；
- TeacherController top plane 无遮挡；
- property-only 的数量和内容类别符合上游批准；
- 复杂开放回答不被 Runtime 正则硬锁。

### 4.2 Authoring Inventory 状态改细

当前 `visible` 过宽，建议改为：

```text
canvas-distinct
canvas-view
property
developer
blocked
```

并增加：

```yaml
contentEditable: true
layoutEditable: true
styleEditable: basic
targetGeometry:
  quality: distinct
  overlapGroup: null
  visibleInView: initial
```

判定：

- `canvas-distinct`：存在内容专属、有限、可见、不过度重叠的画布目标；
- `canvas-view`：切换 Authoring View 后可独立定位；
- `property`：只有稳定属性入口；
- `developer`：仅代码/高级配置可改；
- `blocked`：没有可用入口。

若多个 Runtime 文本都登记为相同整幕 bounds，不得标记 `canvas-distinct`。

### 4.3 Development Plan 新增四张小表

每幕必须有：

1. `Action Map`
   - Script `ACT-*` → 实际控件/事件 → Evidence → E2E 路径。

2. `Assessment Map`
   - `RESP-*` → evaluator → normalization/equivalence → hard/soft/no gate → teacher override。

3. `Teacher Control Map`
   - 控制器可见性、上一幕、下一幕、重播、重开、揭示、带未完成继续。

4. `Authoring Coverage`
   - 上游要求 → 实际载体入口 → 布局/样式能力 → 是否降级。

### 4.4 Runtime 实现硬规则

- 人工文案仍只来自 `content.values`；
- 开放回答若 authority 不是自动类型：
  - 保存学生文本；
  - 显示自检清单、参考证据或教师判断入口；
  - 不用关键词正则决定唯一通过；
- `normalized-auto` 必须有显式归一化器和容错矩阵；
- `symbolic-equivalence` 必须引用当前真实能力，不得以字符串包含替代；
- 每个硬门禁必须有 `teacherOverride`；
- Runtime 不得自行渲染一套覆盖全局教师控制层的顶层操作平面；
- 学生动作必须真正改变证据，不只是点击“错误/完成”进入预设状态。

### 4.5 Task 与验证分离

每个任务的验证分两类：

```text
visualVerification
behaviorVerification
```

视觉验证可以直接定位状态；行为验证必须从脚本初态通过真实操作到达。

风险纵切至少验证：

- 一个真实错误；
- 一次修改/重试；
- 一个稳定结果；
- 教师揭示/跳过或带未完成继续；
- 控制器可见、可点击、无遮挡；
- 重播/重开。

### 4.6 Evidence Manifest 新增 machine-testable gates

建议：

```json
{
  "behaviorGates": {
    "teacherController": "passed",
    "teacherEscape": "passed",
    "requiredActions": "passed",
    "assessmentTolerance": "passed",
    "authoringOutcome": "passed",
    "responseCapacity": "passed"
  }
}
```

`engineering candidate` 必须全部通过。

---

## 5. 最小充分硬门禁

### Gate 1｜教师控制

每幕：

- 控制器在真实截图中可见；
- 通过 hit test 位于可操作顶层；
- 上一幕/下一幕/重播/重开实际执行；
- 任意错误/空白状态可揭示、跳过或带未完成继续。

### Gate 2｜脚本动作真实性

- 每个 required `ACT-*` 至少有一条真实 UI 行为证据；
- 禁止用 `setPresentationState` 作为行为证据；
- 测试专用快捷按钮不能代替教学动作。

### Gate 3｜判定容错

自动判定项必须覆盖：

- 标准正确；
- 等价正确；
- 全角/半角、空白和标点变体；
- 典型近错；
- 关键词拼接假阳性；
- 空白；
- 教师 override。

### Gate 4｜开放回答不死锁

所有 `teacher | self-check | peer-check` 项：

- 不依赖机器语义通过才能继续；
- 学生文本保留；
- 提供教师/自评入口；
- 教师控制器可接管。

### Gate 5｜编辑结果

对每类载体抽样：

```text
修改
→ 保存
→ 关闭
→ 重开
→ Player 更新
→ HTML 更新
```

且 Inventory 状态与真实入口一致。

### Gate 6｜容量

实现前校验必答响应预算；实现后以真实 E2E 交互耗时做一次合理性回填。超过批准时长则退回上游，不通过“加速自动填写”掩盖。

---

## 6. P1 产品改进

### P1-A｜Runtime Authoring Views / Blueprint

支持隐藏卡片背面、答案态、错误态等稳定内部视图：

```text
Inventory
+ Authoring View
+ Layout Snapshot
+ Stable Patch Binding
```

在此之前，隐藏 Runtime 内容只能标记 `property`；若要求画布调整，必须使用 Hybrid/Component Authoring View 或返回用户取舍。

### P1-B｜共享答案归一化库

先实现轻量：

- Unicode NFKC；
- 全半角标点；
- 空白；
- 大小写；
- 数学负号；
- 常见分隔符；
- 可配置有序/无序列表。

不要把开放语义评估塞进通用正则库。

### P1-C｜Scene Behavior Test Harness

建立场景级测试声明：

```yaml
start: SCN-002/STATE-004
steps:
  - fill ...
  - click ...
  - expect ...
  - teacherOverride ...
```

由统一工具执行并生成证据，减少每个课例手写 Playwright 测试导致的语义漂移。

---

## 7. 不建议采用

1. Native/Runtime 硬比例；
2. 为解决 Runtime 过度使用而重新规定原生节点永远优先；
3. 再增加 Content Spec、Handoff、教学事件等默认文档阶段；
4. 每个场景一个 Task；
5. 用更长正则解决开放回答；
6. 把 PPTX 对象级编辑率设为通用 P0；
7. 只增加 Skill 文案、不修改校验器和证据合同；
8. 在 TeacherController 产品缺陷未修复前继续批量生成新课例。

---

## 8. 实施顺序

### Phase 0｜冻结失败基线

保留当前 W2 数学/语文工程、截图、录屏和证据，不覆盖。

### Phase 1｜产品 P0

- TeacherController 一致性；
- top control plane；
- Headless blocker；
- E2E。

### Phase 2｜Skill 1 合同与校验器

- response/evidence；
- assessment authority；
- authoring requirement；
- action/escape；
- capacity。

### Phase 3｜Skill 2 合同与校验器

- carrier authoring fit；
- Inventory 细分；
- action/assessment/control maps；
- behavioral gates；
- candidate semantics。

### Phase 4｜用原 W2 失败课例回归

不是新建第三个课例。

数学必须证明：

- 控制器可用；
- 容量缩减或改为非数字采集；
- 开放理由不被脆弱正则硬锁；
- 等价表达容错。

语文必须证明：

- 真实圈画/选择/输入，而非“错误/完成”按钮；
- 开放结论不死锁；
- Teacher override；
- 稳定文本的编辑等级符合合同。

### Phase 5｜再做全新冷启动

只有两个失败课例均达到新的 `engineering candidate`，再测试新学科/新机制。

---

## 9. 当前共同工作的下一步

建议下一步按文件逐个重构，而不是让 Codex一次重写全部：

1. 确认本基线中的 P0 与四个合同；
2. 先修改 `orchestrate-courseware` 的 artifact contract、模板与 validate_case；
3. 再修改 `build-project-v8-courseware` 的 plan/inventory/evidence contract 与 validators；
4. 独立完成 TeacherController 产品 P0；
5. 用 W2 两个失败包做回归。

每轮只审一个合同族及其测试，避免 Skill 文案、脚本 Schema、Validator、产品代码同时漂移。
