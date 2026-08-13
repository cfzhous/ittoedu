# 导出与证据

验证分层：

- Task：Schema、引用、定向测试、单场景操作与截图；
- 模块：关联场景、生命周期、重复进入、模块 HTML 和静态输出；
- 整课：Capability、类型、测试、必要 E2E、导航、保存重开、离线、HTML、网页包、PDF、PPTX、资源/性能和 contact sheet。

真实编辑闭环至少选择每类承载的关键内容执行：修改 → 保存 → 关闭 → 重开 → Player 更新 → HTML/静态导出更新。Authoring Inventory 与实际入口逐项核对。

PPTX 保留可靠映射的原生对象，并为 Runtime/复杂组件使用经复核的透明/静态快照；记录对象可编辑性和允许差异。PDF 是稳定静态结果。不得整页栅格化后声称对象级兼容。

证据 manifest 记录输入/工程/计划哈希、命令退出码、产物路径与哈希、三帧/contact sheet/录屏、编辑闭环、差异和未实现项。达到候选状态前，`artifacts[].kind` 至少覆盖 `project | html | web-package | pdf | pptx | screenshot | contact-sheet | recording`，且 `pipelineStatus` 为 `passed`；这些条目必须指向路径唯一的真实文件，不用空白占位或同一文本文件冒充多种交付。校验器会核对扩展名与基础文件结构：`.h5lesson` 必须是含根 `project.json` 且声明 Schema V8 的 ZIP，网页包必须含发布必要成员，PPTX 必须是含根关系和 presentation 的 OOXML 包，PDF、图片和录屏必须有可识别的文件/容器标识。这是防伪造的浅层真实性门禁；完整 Project Schema、Project Health 和 Export Preflight 仍由同次证据中的仓库 `validate:project` 命令负责。

候选状态必须声明 `sceneEvidence`，每项为 `{ "sceneId": "...", "sceneType": "interactive | static" }`，并且 sceneId 集合必须与交付的 Project V8 完全一致。`requiredFrames` 中每个交互幕必须分别使用唯一的 screenshot 证据覆盖 `pre-interaction | feedback | stable-result`；每个静态幕覆盖 `static-stable`。一张图或字节相同的图不得重复声称为多个幕/状态证据，contact sheet 仅作整课聚合证据。`placeholder | unusable` 可在尚未产出真实视觉时保持空的 `sceneEvidence` 和 `requiredFrames`。

`validate_evidence.py --json` 会返回当前 `currentAcceptanceScopeSha256`，它确定性绑定结果等级、输入、命令、制品、场景证据、编辑闭环、差异和剩余风险。自动化不得写 `accepted`；指定人类审阅真实成品后，接受记录必须保存该精确 scope hash、审阅人、时间、证据和明确意见。审阅人字段会按 token 和中英文自动化短语检测，`Codex automation`、`ChatGPT`、`AI agent/bot`、“自动化/智能体”等组合均不是人类签署。任何结果等级、证据字节或风险变化都会使旧接受失效。
