# 课程设计合同

- 课例 ID：`{{CASE_ID}}`
- 标题：{{TITLE}}
- 路径：`{{PATH_MODE}}`
- 总时长（分钟）：{{DURATION_MINUTES}}
- 状态：draft

## 受众、场景与时间

- 年级/水平：[待填写]
- 先修知识：[待填写]
- 使用场景与语言：[待填写]
- 教师与学生控制关系：[待填写]
- 时间模型：[待填写阅读、思考、操作、反馈、修复和总结时间]

## 产品能力剖面

- single-device: required
- single-deviceFallback: none
- single-deviceDecisionRef: none
- teacher-display: required
- teacher-displayFallback: none
- teacher-displayDecisionRef: none
- offline: required
- offlineFallback: none
- offlineDecisionRef: none
- multi-user-aggregation: not-required
- multi-user-aggregationFallback: teacher-observed
- multi-user-aggregationDecisionRef: none

## 学习目标与证据

### OBJ-001 [待填写可观察目标]

- 内容边界：[待填写]
- 对应证据：EVD-001

### EVD-001 [待填写学习证据]

- 学生行为：[待填写]
- 成功标准：[待填写]
- 不能证明学习的表面行为：[待填写]

## 内容边界与教学序列

- 必须覆盖：[待填写]
- 明确不覆盖：[待填写]
- 关键困难或误概念：[待填写]

### STG-001 [待填写教学阶段]

- 目的：[待填写]
- 学生任务：[待填写]
- 证据：EVD-001
- 预计用时（分钟）：[待填写]

## 精确内容

{{EXACT_CONTENT_SECTION}}

## 响应、判定与容量

### RESP-001 [待填写可观察响应]

- evidenceRef: EVD-001
- contentRef: CNT-001
- mode: [待填写 digital-required/digital-optional/oral-check/paper-work/teacher-observed/discussion-only]
- responseType: [待填写 choice/normalized-short/gesture/open-text/oral/paper/drag/sort/circle-text/highlight/parameter-change]
- requiredForProgress: [待填写 true/false]
- firstAttemptSeconds: [待填写非负整数]
- retrySeconds: [待填写非负整数]
- teacherDiscussionSeconds: [待填写非负整数]
- authority: [待填写 finite-auto/normalized-auto/human]
- navigationGate: [待填写 hard/soft/none]
- teacherOverrideRef: [待填写 ESC-*；没有时写 none]
- evaluatorCapabilityRef: [自动判定填写稳定能力/组件引用；human 写 none]
- toleranceCaseRefs: [自动判定填写 TOL-* 引用；human 写 none 并删除其容差行]
- capacityOverrideDecisionRef: [低于类型政策下限时填写已回答且 scopeRefs 含本 RESP-*#capacity 的 DEC-*；否则写 none]

## 自动判定容差矩阵

| toleranceCaseId | responseRef | category | input | expected |
| --- | --- | --- | --- | --- |
| TOL-001 | RESP-001 | canonical-correct | [待填写精确输入] | pass |
| TOL-002 | RESP-001 | correct-variant-1 | [待填写精确输入] | pass |
| TOL-003 | RESP-001 | correct-variant-2 | [待填写精确输入] | pass |
| TOL-004 | RESP-001 | blank | [待填写精确输入；空输入可写 EMPTY] | fail |
| TOL-005 | RESP-001 | typical-near-miss | [待填写精确输入] | fail |
| TOL-006 | RESP-001 | substring-false-positive | [待填写精确输入] | fail |

## 响应容量汇总

- capacityPolicyVersion: 1
- readingObservationSeconds: [待填写阅读、观察、思考和讲解总秒数]
- sceneTransitionSeconds: [待填写场景切换与设备操作总秒数]

## 编辑结果合同

### AUTH-001 [待填写需要维护的内容结果]

- contentRef: CNT-001
- access: [待填写 direct-canvas/authoring-view/structured-property/developer-only]
- layoutAdjustment: [待填写 required/optional/none]
- styleAdjustment: [待填写 required/basic/none]
- requiredForAcceptance: [待填写 true/false]

## 评价、反馈与约束

- 评价与反馈总原则：[待填写]
- 安全、版权、离线与交付约束：[待填写]
- 必须保留或禁止改写的表述：[待填写]

## 来源与假设

| 来源 ID | 标题/位置 | 权威级别 | 版本/日期 | 用途 |
| --- | --- | --- | --- | --- |
| SRC-001 | [待填写] | authoritative/guidance/reference | [待填写] | [待填写] |

- 已采用的安全默认值或假设：[待填写；没有时明确写“无”]
- 冲突与剩余事实风险：[待填写；没有时明确写“无”]
