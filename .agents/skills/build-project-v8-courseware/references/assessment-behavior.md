# 评估与行为验证

Project V8 的自动评估必须来自获批的 `RESP-*` 合同，而不是在 Runtime 中临时猜答案。每个自动判定项只允许三类：

- `finite-auto`：答案集合有限，显式列出允许值；
- `normalized-auto`：声明归一化、容差和边界样例；
- `human`：只记录响应与证据，由教师判断，不得伪装为自动硬门禁。

实现计划必须把 `RESP-*`、`ACT-*`、`ESC-*`、`AUTH-*` 映射到公开、可观察的 DOM 行为。Runtime 可以在内部计算，但验证只能通过学生/教师实际可操作的控件、可访问文本、属性、URL 和公开 `CustomEvent` 观察结果；不得调用 `window.__*`、Runtime/Store 私有 API、`evaluate()`、坐标点按或直接改状态。

`implementation/behavior-spec.json` 使用 Schema V2：

```json
{
  "schemaVersion": 2,
  "caseId": "CASE-001",
  "coursewareContractSha256": "<sha256>",
  "presentationScriptSha256": "<sha256>",
  "developmentPlanSha256": "<sha256>",
  "assessments": [
    {
      "responseId": "RESP-001",
      "collectionMode": "digital-required",
      "responseType": "normalized-short",
      "mode": "normalized-auto",
      "authority": "system",
      "navigationGate": "soft",
      "teacherOverrideRef": "ESC-001",
      "evaluatorRef": "EVAL-normalized-short-v1",
      "acceptedValues": ["4", "四"],
      "toleranceCaseRefs": ["TOL-001", "TOL-002", "TOL-003", "TOL-004", "TOL-005", "TOL-006"]
    }
  ],
  "responseCapacity": {
    "durationSeconds": 2400,
    "nonResponseSeconds": 600,
    "items": [
      {
        "responseId": "RESP-001",
        "baselineCount": 1,
        "baselineSecondsEach": 45,
        "retryCount": 1,
        "retrySecondsEach": 30,
        "discussionCount": 1,
        "discussionSecondsEach": 90
      }
    ]
  },
  "gateRequirements": {
    "teacherControl": ["BEH-001"],
    "teacherEscape": ["BEH-002"],
    "requiredActions": ["BEH-003"],
    "assessmentTolerance": ["BEH-004", "BEH-005", "BEH-006"],
    "authoringOutcome": ["BEH-007"],
    "responseCapacity": []
  },
  "tests": []
}
```

测试步骤仅使用元素定位器完成 `click | fill | press | select-option | check | drag | wait-visible | reload`。除 `reload` 外都要有 `selector`；`drag` 还要有 `targetSelector`。断言只使用 `visible | hidden | text | value | attribute | count | enabled | url`。选择器必须是稳定、作者可理解的公开 DOM 入口，优先 `role`、可访问名称或 `data-testid`。

自动 `RESP-*` 当前只能由 Runtime context（`dom | phaser | hybrid` renderMode）调用公开 `ctx.assessment.evaluate`；纯 native 或脱离 Runtime 的组件没有已发布的 declarative evaluator action。实现校验用 TypeScript token/调用结构拒绝注释或字符串冒充真实调用；evidence 还必须捕获 Player 在 Runtime mount 前开启的 host-owned 随机会话，按连续 sequence 把 `responseId/evaluatorId/input/acceptedValues/normalizedInput/status/scope/sceneId` 精确绑定到 assessment、TOL 和 `afterStepId`。`responseId: null`、案例自己发出的评估 CustomEvent 或静态源码调用都不能满足该门。

每个 required `ACT-*` 的真实 DOM 事件处理器还必须同步调用 `ctx.evidence.recordAction({ actId, actionKind, responseId?, event })`；因此当前数字 required ACT 必须有 Runtime producer，纯 native 或脱离 Runtime 的组件不能自签该证据。宿主只接受正在分发且 `Event.isTrusted=true` 的事件，并在同一随机会话中写 `action-recorded`；Behavior/Evidence 按 ACT、RESP、scene、action kind、event type 与 `afterStepId` 精确核验。事后重用 Event、合成 Event、案例 CustomEvent 或仅有源码字符串都不能满足 `requiredActions`。每个 witnessed event 必须精确声明 `afterStepId`；公开事件只证明可观察反馈，不替代宿主 receipt。ESC 由 `contractRefs` 绑定 ESC；顶层原生教师控件在同一 host 会话写 `teacher-escape-recorded`，Behavior/Evidence 按连续 sequence 与声明顺序逐项核验 `requested | confirmation-required | completed`、源 scene/state、action、bypass、accepted、可信 click 和 `afterStepId`。案例自己发送的同名 CustomEvent 只能证明 UI 可观察性，不能替代该 receipt。`ACT.initiallyHiddenContentRefs/revealedContentRefs` 派生为同一 `requiredActions` test 的操作前 hidden 与获批动作后 visible 断言，不新增第七门。

当前可达的 host action 正路仅覆盖真实浏览器操作。上游允许的 `oral | paper` 是物理课堂动作，本地 Browser runner 无法观察；evidence/accepted 以 `trusted-physical-action-receipt-v1` 明确 fail-closed，不得用自填 DOM 事件替代。

`oral | paper` 是获批合同可表达的非数字动作，但当前 Browser runner 没有可真实性重放的对应 step，也没有外部教师观察 receipt；因此不能作为 required `ACT-*` 取得本地 `engineering candidate`。在该能力发布前，应把它们设计为非 required 的 teacher-observed/讨论路径，或由仓库外可信审阅系统绑定专用 receipt，不能用 DOM 点击或案例事件冒充。

`assessmentTolerance` 对每个自动 `RESP-*` 至少覆盖 `exact | accepted-variant | rejected` 三种 variant，并通过公开事件或可见反馈证明结果。`human` 判定只使用 `human-recorded` variant，验证响应被记录和教师出口可用，不验证机器给分；其 authority 必须为 `teacher`，且不得填写自动 evaluator/tolerance。

行为执行器输出 Schema V2 report，绑定 spec、呈现脚本、开发计划和被测 HTML 的 SHA-256。report 可以包含方便阅读的 `gates`，但 Evidence Validator 会从 spec 的门禁映射、测试/步骤/断言状态和 witnessed event 重新计算，不接受自填结论。`responseCapacity` 始终由 validator 用 `nonResponseSeconds + Σ(baseline + retry + discussion)` 的各自 count × secondsEach 重算，并要求不超过 `durationSeconds`。

六门全部通过只是 `engineering candidate` 的必要条件。真实视觉证据才可进入 `art candidate`，明确的人类验收才可进入 `accepted`。
