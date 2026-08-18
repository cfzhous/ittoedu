# 教学呈现脚本

- 课例 ID：`{{CASE_ID}}`
- 标题：{{TITLE}}
- 路径：`{{PATH_MODE}}`
- 总时长（分钟）：{{DURATION_MINUTES}}
- 状态：draft

## 全课推进与揭示

- 教师/学生控制关系：[待填写]
- 返回、重播、重开与跨场景状态：[待填写]
- 信息逐步释放原则：[待填写]
- HTML 与静态审阅结果的关系：[待填写]

## 场景与状态脚本

### SCN-001 [待填写场景标题]

- 教学目的：[待填写]
- 内容引用：CNT-001
- 目标与证据：OBJ-001, EVD-001
- 场景用时（分钟）：[待填写]
- 可达状态：STATE-001, STATE-002

#### 初始与操作前可见

- STATE-001 初始画面：[待填写完整主体、文字、题面、定义、图示、控件和层级]
- 第一次操作前必须可见：[待填写完成操作所需的全部信息]

#### 教师与学生动作

- 教师动作：[待填写；没有时明确写“无”]
- 学生动作：[待填写]
- 动作目的：[待填写其如何服务目标、误概念修复或证据]

#### 即时反馈、错误与恢复

| 条件 | 即时可见反馈 | 恢复/重试/下一步 |
| --- | --- | --- |
| [待填写成功、错误、未完成或教师揭示条件] | [待填写] | [待填写] |

#### 稳定状态与转换

- STATE-002 稳定结果：[待填写]
- 状态转换与返回路径：[待填写]
- 转入下一场景：[待填写]

#### 信息释放与教师视角

- 初态隐藏与禁止提前给出：[待填写]
- 触发后出现：[待填写]
- 学生视角：[待填写]
- 教师检查点/控制：[待填写；没有时明确写“无”]

#### 媒体、声音与关键运动

- 媒体/声音：[待填写；没有时明确写“无”]
- 表达教学因果的运动：[待填写；没有时明确写“无”]
- 仅装饰运动：[待填写；没有时明确写“无”]

#### 可执行动作与教师逃生

##### ACT-001 [待填写真实学生/教师动作]

- sceneRef: SCN-001
- actor: [待填写 student/teacher/system]
- kind: [待填写 click/select/text-input/formula-input/drag/sort/circle-text/highlight/parameter-change/oral/paper/teacher-command]
- target: [待填写学生或教师实际可见、可操作的对象]
- evidenceProduced: [待填写 RESP-*；不产出证据时写 none]
- requiredForCompletion: [待填写 true/false]
- initiallyHiddenContentRefs: [待填写该幕初态必须隐藏的 CNT-*；无则写 none]
- revealedContentRefs: [待填写该动作完成后显示的上述 CNT-*；无则写 none]
- preActionVisible: [有初态隐藏/揭示引用时必须写 false；否则写操作前必须可见的信息]
- errorBehavior: [待填写错误后的可见结果；不适用写 none]
- retryBehavior: [待填写重试路径；不适用写 none]
- revealBehavior: [待填写揭示路径；不适用写 none]
- stableResult: [待填写完成后的稳定、可复现结果]

##### ESC-001 [待填写本场景教师逃生]

- sceneRef: SCN-001
- stateRefs: STATE-001, STATE-002
- actions: [填写 retry/reveal/continue-incomplete/scene-picker/previous/replay 中至少一项]
- confirmBeforeContinue: [包含 continue-incomplete 时必须 true；否则填写 true/false]
- independentOfCorrectness: true

#### 证据与静态审阅帧

- 学习证据：[待填写]
- 交互前、反馈态、稳定结果态：[待填写]
- HTML 稳定帧：[待填写]
- PDF/PPTX 静态帧及预期差异：[待填写]
