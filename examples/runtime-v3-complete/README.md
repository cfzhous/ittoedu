# Project V7 + Runtime API 1 / 组件 API 3 兼容示例

这个目录是一份可读、可重新生成、可直接打开的 Editor 1.6.0 / Project V7 运行时与组件协议样例。Project V7 同时支持原生节点、命名状态、场景/全局声明式交互、事件驱动元素入场/退场、顺序/并行动作步骤、结构化教师控制器、场景/全局运行时和组件等承载方式；本例集中覆盖其中四种运行时兼容路径：

> 命名说明：目录、生成文件前缀 `runtime-v3` 和第一场景“认识 V3”是历史播放器代际的样例名，不代表自由运行时使用 Runtime API 3。该工程中的三份自由运行时明确使用 Runtime API 1，全局组件使用 Component API 3；新运行时与新组件应分别使用 Runtime API 2 和 Component API 4。

新生成物必须直接写 V7。Editor 可自动迁移 V1–V6 工程；V6 节点 `animation` 会转成 `node.activated → node.enter` 自动化规则，但构建脚本不应主动生成旧格式再依赖迁移。

- 原生节点：标题、说明、图形和可替换 SVG 图片；
- `scene.runtime`：两个只服务当前场景的一次性互动；
- `globalRuntime`：跨场景 HUD、事件、课程状态和导航守卫；
- V3 全局组件：普通翻页不重建的课程控制条。

示例没有额外放置场景组件，因为前两页互动没有复用价值；这正是“效果优先、按价值组件化”的用法。构建脚本生成 Project V7，并显式包含每场景 `interactions`、课程级 `globalInteractions`、`media` 与 `playback`；由于示例自身带有 V3 全局控制条，`playback.controls` 设为 `none`，避免出现第二套控制器。因此本例不用来证明默认 `scene.open-picker` UI；该能力应在保留默认 canvas 控制器的新工程中单独验收。

在 Editor 1.6.0 中，简洁模式用于常用图文编辑和单元素出现动画；本例涉及运行时与完整映射，验收时应切换专业模式。选中节点后的“属性/交互”只显示该节点点击规则；右侧“规则”Tab 显示场景/状态进入、节点激活、动画完成、音视频/组件/运行时事件规则。每个动作步骤可用 `after-previous` / `with-previous` 排列顺序与并行，并设局部延迟。运行时可只负责复杂判定并调用 `ctx.emit()`，再由规则执行可编辑的入场/退场、状态、媒体或导航动作。

中央“当前位置试运行”直接从当前场景和当前命名状态启动本例（选中基础场景时使用当前场景初始状态），通过 Blob sandbox iframe 隔离运行，启动失败会显示原因和重试入口。顶部“整课预览”则在独立窗口中从第一场景开始，用于完整流程验收。

> 重要边界：本例最初用于验证自由运行时、事件、生命周期、导航守卫和静态捕获，第二场景仍保留“整块 DOM 题面由 `scene.runtime` 创建”的兼容夹具。它不是新课件的推荐稳定视觉结构。新制作的题目、答错、答对、完成等稳定画面必须改用原生节点和 `scene.presentation.states`，运行时只负责判定、过渡和状态切换。完整创作要求以 [`docs/AI_COURSEWARE_AUTHORING.md`](../../docs/AI_COURSEWARE_AUTHORING.md) 为准。

> 本例也不是 Editor 1.6.0 全部界面能力的展示课件：它不专门演示默认场景目录、控制器折叠、完整的入场/退场编排、组件包替换/删除、素材库复用或工程检查。那些能力应在编辑器自身验收矩阵中验证；本目录继续保持为 Runtime API 1 与 V3 组件 API 3 的兼容夹具。

> 兼容不等于推荐继续生产旧协议。Runtime API 1 的 `renderMode` 保留历史提示语义和宽上下文，Component API 3 也保留历史 Phaser 上下文及生命周期；只有 Runtime API 2 / Component API 4 才把 `renderMode` 作为严格能力声明并提供当前完整的显隐、暂停、确定性捕获生命周期。

## 文件结构

```text
runtime-v3-complete/
├── README.md
├── project.json                         # 构建脚本生成的完整 Project V7 数据
├── runtimes/
│   ├── global-runtime.js               # 全局 HUD、事件、状态、守卫
│   ├── scene-intro-runtime.js          # 绑定原生节点并播放 Phaser Tween
│   └── scene-challenge-runtime.js      # DOM 选择互动
├── components/global-controls/
│   ├── manifest.json                   # V3 + supportedScopes: [global]
│   └── runtime.js                      # 持久控制条；使用 scope/events/courseState
├── assets/
│   ├── learning-orbit.svg              # 可替换原生图片
│   └── *-fallback.svg                  # 从可编辑文案生成的静态后备画面
├── runtime-v3-global-controls.h5component
├── runtime-v3-complete-example.h5lesson
└── runtime-v3-complete-example.html
```

`project.json`、`assets/*.svg`、两个 ZIP 包和单 HTML 都由 [`scripts/build-runtime-v3-example.ts`](../../scripts/build-runtime-v3-example.ts) 生成。运行时和组件源码是源文件，不会从生成物反向提取。

## 三个场景

### 01 认识 V3（历史样例文案）

- 原生标题、说明、图形和 SVG 图片都可在编辑器中直接调整；
- `scene.runtime` 通过语义键 `interactionCard` 取得原生卡片句柄；
- 工程中的 `nodeBindings.interactionCard` 指向实际节点 ID；复制场景时编辑器会自动重写 ID，源码不变；
- 点击卡片后运行 Phaser Tween、写入 `courseState.introExplored` 并发出 `runtime:event`；
- 重播本页会重建场景运行时，但课程状态仍在，因此显示另一条已登记反馈。

### 02 场景互动

- 整个题面直接写在 `scene.runtime` 中，用于保留 DOM 运行时兼容与捕获测试；新课件不得照此承载可反复到达的稳定整页 UI；
- 题干、三个选项、初始提示、正误反馈和继续按钮全部来自 `content.values`；
- 全局运行时注册导航守卫，在完成互动前阻止进入总结页；
- 选择正确答案后设置 `courseState.challengePassed`，发出 `challenge:passed`，导航守卫立即放行；
- `localState.attempts` 在重播时重置，`courseState.challengePassed` 保留。

### 03 课程小结

- 仅使用原生节点，说明不是每个场景都需要自由运行时或组件；
- 全局 HUD 和全局控制组件仍是启动时创建的同一实例；
- “重播本页”只重建场景作用域；“重开课程”销毁并重建全局作用域、清空课程状态并返回第一页。

## 场景状态与缩略图边界

本协议样例没有显式创作多组 `scene.presentation.states`；编辑器会为场景补充默认“初始”状态。左侧缩略图使用该默认状态的背景、原生节点和组件，并按层合成已启用场景/全局运行时登记的 `staticFallback`。它不会执行自由运行时或捕获第二场景的实时 DOM 题面；没有后备的已启用运行时会显示“运行时”角标。中央“当前位置试运行”才执行真实 runtime。

这不是缩略图缺陷，而是本例保留旧协议夹具的直接结果，也正说明新课件为什么应把稳定视觉放进命名状态。若要把本例改造成创作模板，应至少建立“题目 / 答错 / 答对 / 完成”状态，设置独立 `initialStateId` / `thumbnailStateId`，再由 `scene.runtime` 调用 `ctx.presentation.setState()` 或 `transitionTo()`。

## Project V7 事件动画边界

动画不再是节点挂载后独立倒计时。在本例上扩展节奏时，应把“选择正确答案后显示反馈”表达为业务事件触发的动作步骤，例如：

```json
{
  "id": "rule_show_feedback",
  "enabled": true,
  "trigger": {
    "type": "runtime.event",
    "scope": "scene",
    "eventName": "challenge:passed"
  },
  "conditions": [],
  "actions": [
    {
      "id": "action_exit_prompt",
      "start": "after-previous",
      "delayMs": 0,
      "action": {
        "type": "node.exit",
        "nodeId": "challenge_prompt",
        "effect": "fade",
        "durationMs": 180,
        "easing": "ease-in"
      }
    },
    {
      "id": "action_enter_feedback",
      "start": "with-previous",
      "delayMs": 80,
      "action": {
        "type": "node.enter",
        "nodeId": "challenge_feedback",
        "effect": "slide",
        "direction": "up",
        "durationMs": 260,
        "easing": "ease-out"
      }
    }
  ]
}
```

`with-previous` 表示与前一步同组并行，其 `delayMs` 仍相对该组的启动点。需要完成后继续时，另建以 `{ "type": "animation.completed", "actionId": "action_enter_feedback" }` 为触发器的规则。节点可设 `playbackInitialVisibility: "hidden"` 以便在互动 Player 中等待入场，但编辑画布、缩略图和 PDF/PPTX 仍按作者稳定可见性显示。本节 JSON 是协议写法说明，不表示兼容夹具已将第二场景稳定 DOM 题面改造为推荐状态结构。

## 全局运行时

[`global-runtime.js`](runtimes/global-runtime.js) 展示 Runtime API 1 兼容表面：

- `ctx.events` 监听 `course:*`、`scene:*`、`runtime:event`、`component:event` 和 `navigation:blocked`；
- `ctx.courseState` 保存已到访场景、挑战状态和组件操作次数；
- `ctx.navigation.guard()` 实现跨场景规则；
- `ctx.dom.overlay` 创建常驻 HUD；
- `ctx.capture.waitUntil()` 等待字体稳定；
- 所有显示文案均通过 `ctx.content.get/all()` 读取。

## V3 全局组件

[`manifest.json`](components/global-controls/manifest.json) 声明：

```json
{
  "schemaVersion": 3,
  "runtimeApiVersion": 3,
  "supportedScopes": ["global"]
}
```

组件运行时：

- 检查可选 `ctx.scope`；
- 通过可选 `ctx.events` 订阅 `scene:enter`，订阅随组件生命周期自动清理；
- 通过可选 `ctx.courseState` 记录跨场景操作次数；
- 调用 `ctx.actions` 执行上一页、重播、下一页和重开；
- 通过 `ctx.emit('control:used', ...)` 向全局运行时上报语义化事件；
- 从 `ctx.props.content` 读取所有显示文字。

`scope/events/courseState` 为可选字段，是为了兼容编辑模式和旧宿主；组件运行时始终判空。

## 离线、捕获与清理

- 三份 Runtime API 1 源码和 Component API 3 入口都是普通浏览器脚本；生成的 `.h5lesson`、`.h5component` 与单 HTML 内联所需代码和素材，不依赖 Node.js、模块加载器、CDN、远程字体或远程 API。
- Runtime API 1 实例使用 `ctx.capture.waitUntil()` 登记字体等有限初始化任务；宿主排空任务后捕获实际 DOM/Phaser 图层，实际快照失败或没有可见结果时再使用由同一内容表生成的 `staticFallback`。本兼容夹具没有伪造 API 2 的 `prepareCapture()`；新建 Canvas/WebGL 内容若需要主动推进确定帧，应使用 Runtime API 2。
- 第一页场景运行时在 `destroy()` 中解除节点和按钮监听、停止 Tween 并移除 DOM；第二页解除全部选项/继续按钮监听并移除 DOM；全局运行时解除导航守卫和事件订阅并移除 HUD。Component API 3 控制条解除 Phaser 指针监听和 `scene:enter` 订阅。
- 普通翻页销毁并重建场景运行时，但保留全局运行时和全局组件；重播只重建当前场景作用域；重开课程会销毁并重建全局作用域。验收时应同时检查交互正确性和监听、Tween、DOM、Phaser 对象没有随切页累积。

## 文字可编辑映射

| 显示文字来源 | 登记位置 | 编辑方式 |
| --- | --- | --- |
| 场景标题、说明、卡片文字 | `TextNode.text` | 画布双击或属性栏 |
| 全局 HUD 的标题、进度、状态和提示 | `globalRuntime.content.values` | 全局运行时文字属性 |
| 两个场景互动的题干、按钮、选项和反馈 | `scene.runtime.content.values` | 场景运行时文字属性 |
| 全局控制条的标题、按钮、状态和场景名 | V3 `props.content` | 组件属性栏递归自动显示 |
| 实际到访数、尝试数、操作次数 | 运行时计算 | 不需要编辑；对应格式模板可编辑 |

运行时源码和组件源码没有最终显示文案的备用硬编码。`assets/*-fallback.svg` 的文字由构建脚本从同一内容表派生，不形成第二套文案来源。

## 生成

在项目根目录执行：

```powershell
npm run build:player
npx tsx scripts/build-runtime-v3-example.ts
```

也可运行 `npm run build:examples` 一次生成项目内全部协议示例。

脚本会：

1. 解析 V3 组件 manifest；
2. 验证三份运行时和组件入口只注册一个匹配定义；
3. 生成静态后备 SVG；
4. 生成 `schemaVersion: 7` 和 Project V7 动作步骤，用当前 Project Schema 校验完整 `project.json`；
5. 生成并重新打开 `.h5lesson` 校验引用和嵌入文件；
6. 使用当前 Player Bundle 生成离线单 HTML。

不需要修改 `package.json`。若缺少 `dist-player/player.iife.js`，脚本会明确提示先执行 `npm run build:player`。

## 手动验收路径

1. 用编辑器打开 `runtime-v3-complete-example.h5lesson`。
2. 在第一页双击原生标题，修改后保存并重新打开。
3. 修改第一页运行时的“互动说明”，预览中确认右侧文案同步。
4. 进入“全局层”，修改控制条任意 `props.content` 文案。
5. 使用中央“当前位置试运行”验收第一页，点击发光卡片；确认出现反馈和继续按钮。
6. 到第二页后先点播放器或全局组件“下一页”；确认全局守卫阻止跳转。
7. 选择“直接写入 scene.runtime”，再进入总结页。
8. 在各页使用全局组件；确认 HUD 中操作次数跨页累积。
9. 点击“重播本页”；确认全局组件和课程状态保留。
10. 点击“重开课程”；确认回到第一页，组件操作次数和课程进度归零。
11. 使用顶部“整课预览”从第一页重复完整流程，再打开单 HTML 重复关键流程；确认不产生外部网络请求。
12. 导出 PDF/PPTX，检查全局/场景运行时的合成画面与静态后备提示。
13. 对照左侧缩略图与中央“当前位置试运行”，确认缩略图表示作者选择的稳定状态，不应用 `playbackInitialVisibility` 或事件动画；实时运行时 DOM 只在试运行模式出现。
14. 另新建一个保留默认 canvas 控制器的三场景工程；点击“场景目录”，确认列出全部场景、当前项高亮，选择后进入目标初始状态且不出现状态选择；Esc、点击外部、折叠或导航应关闭目录。

## 信任边界

`.h5lesson` 中的自由运行时和 `.h5component` 都是可执行浏览器 JavaScript。示例完全离线，不使用 Node.js、远程模块、CDN、远程字体或远程 API。格式校验和 CSP 不等于恶意代码沙箱，只打开可信来源工程。
