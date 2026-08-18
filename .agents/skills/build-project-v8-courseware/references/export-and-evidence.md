# 导出与证据

验证分层：

- Task：Schema、引用、定向测试、单场景操作与截图；
- 模块：关联场景、生命周期、重复进入、模块 HTML 和静态输出；
- 整课：Capability、类型、测试、必要 E2E、导航、保存重开、离线、HTML、网页包、PDF、PPTX、资源/性能和 contact sheet。

真实编辑闭环逐个覆盖每个 required entity：修改 → 保存 → 关闭 → 重开 → Player 更新 → HTML/静态导出更新。Authoring Inventory 与实际入口逐项核对，不按承载类别抽样。

PPTX 保留可靠映射的原生对象，并为 Runtime/复杂组件使用经复核的透明/静态快照；记录对象可编辑性和允许差异。PDF 是稳定静态结果。不得整页栅格化后声称对象级兼容。

Evidence Manifest Schema V2 记录输入/工程/计划/Behavior Spec 哈希、产物路径与哈希、编辑闭环、差异和未实现项。`commands` 是闭合空集；自填 argv/exitCode 不是证据。`engineering candidate` 的 `artifacts[].kind` 至少覆盖 `project | html | web-package | pdf | pptx`，且 `requiredFrames` 必须为空：当前本地 runner 的截图只证明编辑/行为重放，不能自签视觉质量。仓库外可信视觉审阅系统提升 art scope 时再绑定逐幕 screenshot/contact-sheet。只有获批合同明确要求动态录屏证据并派生 `recordingRequired: true` 时才要求 `recording`。另以 `behavior-spec | behavior-report | authoring-inventory | authoring-target-snapshot | authoring-session-report` artifact 绑定 `verification`。真实文件仍须通过容器、扩展名、结构和 SHA-256 检查。

Schema V1 只允许读取历史 `placeholder | unusable` 记录，不能晋级任何候选结果。

候选结果有六个计算门：`teacherControl | teacherEscape | requiredActions | assessmentTolerance | authoringOutcome | responseCapacity`。前五门从 Behavior Spec 的 gateRequirements 与 report 中逐测试、逐步骤、逐断言、逐 witnessed event 与 host receipt 重算；report 自填 `gates` 必须与重算一致。responseCapacity 从 spec 的计时条目重算。authoringOutcome 只认总入口当前复跑的 `editor-authoring-session-v1`：逐 required entity 证明画布选择、修改、保存、重开、Player/HTML 可见变化，并由当前 Project 经 Editor UI 重新导出 HTML、网页包、PDF 与 PPTX。首次生成时四格式逐字节绑定交付 artifact；跨重放时 HTML 仍用原始字节哈希，ZIP/PPTX/PDF 用格式限定、拒绝歧义成员的 canonical fingerprint 忽略各格式唯一获批的时间元数据。receipt 绑定 runner/build/当前输入与交付哈希，不把临时 probe 工程原始哈希当作跨运行权威证明。`editRoundTrips` 仅是纳入 scope 的历史描述字段，不能满足门禁。任一门不通过都不得标记 `engineering candidate`。

`evidence/behavior-report.json` 使用 Schema V2，至少包含 spec/脚本/计划/被测 HTML 哈希，`tests[].{id,gate,status,steps,assertions,witnessedEvents}`、六门 `gates` 和精确 `{passed,failed}` summary。`target.path/hash` 必须与 manifest 中 kind=`html` 的交付 artifact 一致。Validator 不执行 report 中的任意代码，也不接受缺失步骤/断言 ID、伪造 witnessed event 名称或失败测试被汇总成通过。

候选只认 `validate_v8_case --target evidence` 当前运行执行的可信计划：Capability、Project Schema、Inventory、Target Snapshot、Behavior Spec、Formula Markup、Editor build、真实 Editor authoring/export 与 Behavior replay。它以解析后的绝对安全路径运行并返回 `trustedExecution`，适用于外部 case、非 repo cwd 与 Windows 跨盘；Behavior target 必须是本次 UI 重导且与交付 artifact 字节一致的 HTML。Runner 用 dead proxy、外域 resolver NOTFOUND、禁 QUIC/WebTransport/DNS prefetch/background networking、WebRTC 非代理 UDP 禁用、Service Worker block 与 HTTP/WebSocket 监听形成进程级 fail-closed，并要求观察到零外连；这不是 OS 级网络隔离保证。

`engineering candidate` 必须声明 `sceneEvidence`，每项为 `{ "sceneId": "...", "sceneType": "interactive | static" }`，且 sceneId 集合与交付 Project V8 完全一致；它的 `requiredFrames` 固定为空。仓库外可信视觉审阅系统若要提升为 art scope，才应为每个交互幕绑定唯一的 `pre-interaction | feedback | stable-result` 截图、为静态幕绑定 `static-stable`，并核对 runner/provenance、1280×720 与 Project/hash scope；同一图或相同字节不得复用。`placeholder | unusable` 可保持空的 `sceneEvidence` 和 `requiredFrames`。

`validate_evidence.py --json` 会返回当前 `currentAcceptanceScopeSha256`。本地 validator 只做结构验证，不接受自由文本 reviewer 作为可信身份，也不签发 `art candidate | accepted`。仓库外可信审阅系统须用可验证的身份/签名 receipt 提升同一精确 scope；证据字节或风险变化会使旧 receipt 失效。
