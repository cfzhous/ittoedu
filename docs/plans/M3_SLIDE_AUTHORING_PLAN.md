# M3：Slide 作者闭环

> PARENT: [`COURSEWARE_DEVELOPMENT_PLAN.md`](../../COURSEWARE_DEVELOPMENT_PLAN.md)
> BASELINE: product `b6d1787875339fff8ba03d80cfbf80187c009caa`
> STATUS: active
> OUTCOME: 原壳内完成可编辑、可运行、可保存重开的 Slide 作者链

本文件只细化 M3。若与根计划、源码或 Schema 冲突，以根计划规定的事实优先级为准。

## 1. 当前起点

已经成立：

- 默认入口使用 Course Project V9，V9 session/history/archive 由原 `editorStore` 单一持有。
- 原 ScenePanel、状态条、Elements、Nodes、Properties 和 Workspace 已接入场景 Native。
- global 与 surface Native 已进入原 Workspace、Nodes、Properties，支持稳定选择、变换、Undo/Redo 和保存重开。
- 编辑态教师控制器是工程内作者对象，按钮不会执行播放动作。
- 工程检查、整课预览、HTML、网页包和基础 PPTX 已接到 V9 producer。

尚未成立：

- Published Slide 尚未完整执行 `scene.interactions`。
- “当前位置试运行”尚未使用独立 Published snapshot 会话。
- image/video、背景、富文本/IME、Runtime/Component 作者目标和互动编辑尚未形成完整 Slide 闭环。

## 2. 任务单元

执行顺序以根计划 §4.5 并行任务板为准；本节只定义各单元的目标与边界，不构成串行链。

### M3-B0：修复壳层上弹与底部黑区（已关闭，2026-08-15）

根因：`ProductApp.tsx` 在 `#root` 与 `.app-shell` 之间的匿名包装 `div` 断开 100% 高度链，壳退化为内容高度（`min-height: 720px` 兜底），视口更高时底部露出窗口背景色，新增元素改变右栏内容高度导致壳纵向跳动。页面无滚动，根节点高度正常。

修复：ProductApp 直接渲染原 App，不引入新壳或第二布局系统。

证据：`v9SlideVerticalSlice` Electron 路径新增 `expectAppShellFillsViewport` 几何断言（添加矩形/公式前后壳与状态栏贴合视口、`scrollY` 为 0）；修复后 1280×720、1366×768、1920×1080 三档视口几何复核通过。工程、history、selection、dirty 与保存语义不变。

### M3-B1：Published Slide 基础互动执行（已关闭，2026-08-15）

闭环：`SlideSurfaceHost` 新增可选 `SlideInteractionSession`（省略即 inert，编辑态 Authoring host 不受影响），playback 模式下为当前场景建/毁 `InteractionEngine`，`#reconcile()` 后重绑 `source === 'scene'` 的稳定 layer item；`setScene`/`setPresentationState` 发出 `scene:enter` 与 `presentation:change`。`PublishedCourseApp` 把 goToScene/next/previous/replay/restart 包成受守卫的同步宿主动作供规则导航。

证据：`slideSurfaceHost.test.ts` 互动会话三例、`coursePublishPipeline.test.ts` 真实 Course Player 点击切状态一例通过；typecheck 与 build:player 绿。

### M3-B2：独立“当前位置试运行”（已关闭，2026-08-15）

闭环：`trialRunOverlay.ts` 从当前 selection 解析 location/state（未知项全部回退），把当前 V9 snapshot 构建为 Published Course V2 payload，经外链 blob 脚本（payload + player bundle）注入独立 overlay iframe——blob 文档继承编辑器 CSP（禁内联脚本、允许 blob: 脚本源），不能复用内联版 standalone HTML。`PublishedCourseApp` 新增 hash `state` 参数，仅作用于首次 `initial-entry` 导航。Workspace 按钮启动/关闭试运行：覆盖层 z-index 高于全部 authoring 层，退出即卸载 iframe 并 revoke blob，不写 Project/history/revision/selection/viewport，换工程或换会话自动清理。

证据：`trialRunOverlay.test.ts` 七例（起点解析五种情形 + blob 结构与 revoke）、`coursePublishPipeline.test.ts` hash 初始状态一例、Electron `v9TrialRun.spec.ts` 全路径（进入试运行→点击 trial-text 切到 state_reveal→dirty 保持 false→退出→添加文本→撤销移除）；全量 vitest 1059 例绿、typecheck 绿、`v9SlideVerticalSlice` 旧断言同步更新（按钮不再禁用、无暂不可用提示）。

### M3-B3：剩余 Native 与画布编辑（拆为 T-IMG / T-TEXT / T-GEST）

并行拆分，owns 与依赖见根计划 §4.5：

1. T-IMG：image/video 的插入、素材引用、稳定选择、通用属性、保存重开；场景背景颜色与背景素材。
2. T-TEXT：text 的正文/富文本/IME 事务；一次编辑只产生一次 history。
3. T-GEST（待 T-IMG、T-TEXT 集成后派发）：formula/shape/media 的已有属性与 Workspace 视觉同步；resize、rotate、多选变换、方向键微调在各 scope/state 下保持一次手势一次 history。

不在本阶段重建 MediaTab 或 Properties；只给原组件增加 V9 窄控制边界。`Workspace.tsx` 等共享热点按根计划 §4.3 串行增量。

### M3-B4：Runtime/Component 作者目标进入统一图层（任务 T-RTGT）

目标：Runtime/Component 的作者目标可在原 Workspace/Nodes/Properties 中命中和编辑。

- 文字目标必须稳定；普通可替换图片目标应稳定。
- `authoringAddress` 跨保存重开不变，临时 hitId 不持久化。
- 编辑态 visual host 与 Phaser proxy 使用同一 V9 只读事实。
- Runtime/Component 仍由其各自运行 Host 管理，不投影成假 Native 保存。
- 尚未支持的专属属性局部禁用，不把整个通用属性区隐藏。

### M3-B5：原互动/开发 UI 接线（任务 T-IUI）

- 原 InteractionEditor、AutomationTab、DeveloperTab、ComponentsTab 逐项接 V9 command。
- 普通教师只看到教学概念；协议和 manifest 只出现在专业开发区。
- 每个可达按钮必须真实执行、明确禁用或明确说明；不能静默写隐藏 V8。
- 构建脚本不再承担编辑器本应提供的常规互动作者能力。

## 3. M3 Gate

必须同时满足：

- 黑区/上弹 P1 已关闭。
- text、formula、shape、image、video、背景和教师控制器可编辑并保存重开。
- scene/surface/global 的统一顺序、状态覆盖、选择与变换成立。
- 基础 Native 点击/状态互动在 Published Slide 与当前位置试运行中成立。
- Runtime/Component 作者目标进入统一图层。
- 原壳无第二 Workspace、第二 Store 或 donor 前端入口。

阶段证据只运行一次：M3 定向测试、typecheck、受影响 build、一条代表性 Electron、`npm test`、反重写门禁；布局代码发生变化时才运行三尺寸 visual。

## 4. M3 明确不做

- 不在本阶段宣称教师控制器完整收展、目录、静音、全屏或跨表面导航；这些属于 M4。
- 不实现 Flow/Spatial 作者能力。
- 不完成 PDF/DOCX 最终导出。
- 不建立新的 command 框架、Provider、插件系统或知识图谱生成器。

## 5. 移交 M4 的条件

只有一个代表性 Slide 能在原壳中完成“创建内容 → 编辑状态/互动 → 当前位置试运行 → 保存 → 完全关闭重开 → 再编辑”，才进入 M4。
