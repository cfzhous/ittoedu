# V8 原编辑器视觉与真实鼠标基线（G02）

日期：2026-08-14

源码基线：`3e41ec058627d38c4b9f5439b454cc72331e1485`

执行父提交：`48dd493377a27dfbfd28850a28bf925e274cd82e`

结论：`PASS`；G02 合同证据可接受，产品总体状态仍为 `unusable`，本记录不代表教师验收。

## 固定状态与取证边界

- 从默认 `ProductApp` 中可见的“旧版 V8 编辑器”按钮进入原 `App/Workspace`，随后以 `?editor=legacy-v8` 重新载入独立干净会话。
- 截图只隐藏 ProductApp 固定悬浮的返回按钮；`App` 后代、布局、项目内容和样式均未改写。
- 三档截图使用同一项目状态：专业模式、场景 1、命名状态“初始”、一个新建文字节点、节点保持选中、缩放 100%、右侧“图层”页签。
- 选择命名状态“初始”是必要的基线前置。若保持 `activePresentationStateId = null` 后直接新增文字，原基线会显示“统一画布启动失败”；该既有行为留给 G03 映射，本卡未改产品。
- 截图会话无页面异常、console error 或外网请求，Runtime 预览一次成功且未使用“重新载入画布”。

## 黄金截图与几何结论

| Viewport | PNG SHA-256 | 原壳高度 | 视觉复核 |
| --- | --- | ---: | --- |
| 1280×720 | `b3fc23c4e973076e1c573ea402957dd5dcf5f61ac3aa3d7d5388eb3f5171cc38` | 720 | 顶栏、左栏、画布、状态条、右栏和底栏完整；无裁切、遮挡或交叠 |
| 1366×768 | `2d5c8dcc8c9f9ed211ca3804bc845e0edf96dabe86c651e5c487d37f1abd0f69` | 720 | 所有原壳区域完整；下方保留原实现产生的 48 px 空白背景 |
| 1920×1080 | `184246d593ddadb867c47ec0f5bc01192be57b57aef20a57b17662e9c4d3a60e` | 720 | 所有原壳区域完整；下方保留原实现产生的 360 px 空白背景 |

协调者已逐张以原始分辨率查看。1366×768 与 1920×1080 中原壳固定为 720 px 高是 `3e` 的真实视觉事实，不是截图裁切；页面本身仍精确等于目标 viewport，且 `scrollWidth/clientWidth`、`scrollHeight/clientHeight`、body 对应尺寸均相等。每个要求矩形均为正尺寸并处于 viewport 内，顶部/主区/底栏、左栏/中央/右栏、画布区/状态条的相邻边界均未交叠。

完整矩形、原生窗口闭环调整轨迹、文件字节数和诊断见 [`geometry.json`](../../tests/contracts/v8-shell-baseline/geometry.json)。三张 PNG 分别为 [`1280x720.png`](../../tests/contracts/v8-shell-baseline/1280x720.png)、[`1366x768.png`](../../tests/contracts/v8-shell-baseline/1366x768.png) 和 [`1920x1080.png`](../../tests/contracts/v8-shell-baseline/1920x1080.png)。

## 真实鼠标选择、拖动与撤销

可见 Electron 窗口上的 Windows 系统级输入链通过：

1. 选中画布文字，属性值为 `X=440, Y=320`。
2. 在真实 Phaser canvas 上从窗口坐标 `(670,335)` 拖到 `(730,375)`。
3. 属性值变为 `X=540.9, Y=387.3`。
4. 点击真实工具栏“撤销（Ctrl+Z）”，属性值恢复为 `X=440, Y=320`，状态显示“已撤销”。

Playwright `page.mouse` 可命中真实 canvas、清除并恢复选择，canvas cursor 也为 `move`，但其 CDP 拖动注入未跨过 Electron/Phaser 的原生拖动链。为避免把测试驱动限制误判为产品缺陷，最终拖动证据使用 Computer Use 的 Windows `SendInput`；没有使用 DOM `dispatchEvent`、样式改写或 Store 直调。结构化证据已写入 `geometry.json.mouseEvidence`，其中同时保留 Playwright 探针结果。

## 质量门结论

- Pipeline status：`engineering candidate / PASS`。
- Outcome status：G02 基线合同由主协调者接受；原 V8 壳可作为后续守护对象，但更高分辨率下固定 720 px 高和空白底部属于已冻结的基线事实。
- 未授予的结论：未把编辑器整体称为可用、art candidate 或教师 accepted。
