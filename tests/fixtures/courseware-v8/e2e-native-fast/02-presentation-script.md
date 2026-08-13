# 教学呈现脚本

- 课例 ID：`e2e-native-fast`
- 标题：分数意义：整体与等分
- 路径：W1 Builder 自动前向夹具
- 总时长（分钟）：10
- 状态：draft

## 全课推进与揭示

- 教师/学生控制关系：教师进入任务，学生选择并说明
- 返回、重播、重开与跨场景状态：返回保留本次选择，重播和重开清空
- 信息逐步释放原则：先任务，后轮廓提示，最后定义
- HTML 与静态审阅结果的关系：静态帧使用完成态并保留题面

## 场景与状态脚本

### SCN-001 判断四分之一

- 教学目的：诊断整体与等分概念
- 内容引用：CNT-001
- 目标与证据：OBJ-001, EVD-001
- 场景用时（分钟）：10
- 可达状态：STATE-001, STATE-002, STATE-003

#### 初始与操作前可见

- STATE-001 初始画面：显示逐字题面、图 A、图 B 与说明要求
- 第一次操作前必须可见：两个完整整体、分割边界、涂色区域、选择与说明要求

#### 教师与学生动作

- 教师动作：发起比较并邀请说明
- 学生动作：选择图 A 或图 B，再说出整体与等分理由
- 动作目的：生成 EVD-001 的概念证据

#### 即时反馈、错误与恢复

| 条件 | 即时可见反馈 | 恢复/重试/下一步 |
| --- | --- | --- |
| 选择图 A 并提及整体和等分 | 显示“正确：同一个整体被平均分成四份。” | 进入 STATE-003 总结 |
| 选择图 B 或理由缺少等分 | STATE-002 显示“再次作答前，请先圈出同一个整体。” | 允许重试并再次说明 |

#### 稳定状态与转换

- STATE-002 错误修复态：保持原题并显示可操作重试提示
- STATE-003 稳定结果：保留题面并显示完整定义
- 状态转换与返回路径：错误可回初态，成功后可返回检查原选择
- 转入下一场景：本课仅一场景，教师结束总结

#### 信息释放与教师视角

- 初态隐藏与禁止提前给出：正确答案和完整定义
- 触发后出现：错误时先给整体提示，成功后显示完整定义
- 学生视角：始终能看到题面、选择状态和下一步
- 教师检查点/控制：教师可在错误态暂停讨论后允许重试

#### 媒体、声音与关键运动

- 媒体/声音：无
- 表达教学因果的运动：反馈按回答结果出现
- 仅装饰运动：无

#### 可执行动作与教师逃生

##### ACT-001 学生选择能表示四分之一的图形

- sceneRef: SCN-001
- actor: student
- kind: select
- target: 学生可见的图 A 和图 B 选择控件
- evidenceProduced: RESP-001
- requiredForCompletion: true
- preActionVisible: false
- initiallyHiddenContentRefs: CNT-001
- revealedContentRefs: CNT-001
- errorBehavior: 选择图 B 时显示“再次作答前，请先圈出同一个整体。”
- retryBehavior: 保留题面与两个选项，允许学生重新选择
- revealBehavior: 教师可先揭示整体轮廓，再让学生重试
- stableResult: 选择图 A 后保留题面并显示“同一个整体被平均分成四份”的完整定义

##### ESC-001 未完成时的教师逃生路径

- sceneRef: SCN-001
- stateRefs: STATE-001, STATE-002, STATE-003
- actions: retry, reveal, continue-incomplete, scene-picker, previous, replay
- confirmBeforeContinue: true
- independentOfCorrectness: true

#### 证据与静态审阅帧

- 学习证据：选择结果、理由与修复后回答
- 交互前、反馈态、稳定结果态：分别捕获 STATE-001、STATE-002、STATE-003
- HTML 稳定帧：STATE-003
- PDF/PPTX 静态帧及预期差异：STATE-003，无交互但保留题面与结论
