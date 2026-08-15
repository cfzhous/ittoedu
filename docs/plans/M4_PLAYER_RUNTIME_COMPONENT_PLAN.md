# M4：Player、Runtime、Component 与课程逻辑

> PARENT: [`COURSEWARE_DEVELOPMENT_PLAN.md`](../../COURSEWARE_DEVELOPMENT_PLAN.md)
> PREREQUISITE: 见根计划 §4.5 任务板（T-PSES/T-CTRL/T-RT/T-COMP/T-CSTATE 全部 integrated）
> STATUS: closed（Gate 通过于 2026-08-15，最终 SHA `7f04a8a`）
> OUTCOME: 编辑 snapshot、课程运行会话和动态载体具有完整且单一的运行合同

本文件只细化 M4，不重新定义 M3 的作者 UI 或 M5/M6 的表面编辑器。

## 1. 目标边界

M4 解决“编辑器能表达，但真实 Player 尚未完整兑现”的问题：

- Published Course V2 成为 Slide 试运行与发布的共同运行真相。
- Runtime API 2/3 和 Component API 4 从加载到释放全链成立。
- location、state、guard、controller、互动、媒体与课程重启只有一个动作 owner。
- 运行时状态、capture 和 checkpoint 不回写工程历史。

## 2. 任务单元

A–E 对应根任务板 T-PSES / T-CTRL / T-RT / T-COMP / T-CSTATE：T-PSES、T-RT、T-COMP 三者相互并行，并可与 M3 在途任务前置并行；T-CTRL 依赖 T-PSES；T-CSTATE 依赖 T-PSES 与 T-CTRL。owns 与派发状态以根计划 §4.5 为准。

### M4-A：统一 Published Slide 会话生命周期

- Published App 创建、切换和销毁当前 Slide interaction session。
- DOM/Canvas 激活事件统一成稳定 layer item 事件。
- scene enter/exit、presentation enter/exit、计时、媒体和 motion completion 按协议发布。
- 异步 action 必须真实 await；不能把 Promise 包装成永远成功的 boolean。
- 导航或状态切换失败必须停止后续依赖动作并产生教师可理解错误。

### M4-B：教师控制器运行合同

先在 Slide 闭合，再供 Flow/Spatial 复用：

- `collapsible`、`defaultCollapsed`、进度显示。
- session-only 拖动与 Alt+方向键移动，不改项目 frame/history。
- previous、next、go、replay、restart 的整课 location 语义。
- 场景目录、静音、全屏及其当前状态标签。
- 点击与拖动互斥；收起后的真实命中区域不能仍是完整面板。
- destroy/recreate 清理会话 offset/collapse；课程 restart 恢复项目默认值。
- `playback.controls: none` 不显示控制器；任何模式都不恢复画布外旧导航。

优先复用：

- `src/shared/teacherControllerLayout.ts`
- `src/player/teacherControllerRuntimeSession.ts`
- `src/player/ScenePickerOverlay.ts`
- `src/player/PublishedCourseApp.ts`
- `src/player/surfaces/slide/SlideSurfaceHost.ts`

### M4-C：Runtime API 2/3

- 版本协商、加载、消息路由、资源访问、错误隔离和 destroy。
- 作者目标、hit field、状态热更新、capture/checkpoint。
- API 2/3 兼容路径都有真实测试，不能只保留类型声明。
- Runtime 内容不通过巨型构建脚本字符串维护；原 DeveloperTab 是正式编辑入口。

### M4-D：Component API 4

- package、版本、manifest、runtime、props、preset 和资源加载。
- 同一 package 多版本冲突显式拒绝，不暗选版本。
- 作者目标和通用属性与统一图层一致。
- props 更新与 hot update 不重建无关运行实例。
- 静态 fallback、thumbnail 和真实运行画面各有明确职责。

### M4-E：课程状态与恢复

- CourseLocation、presentation state、guard 与 controller action 使用同一课程状态。
- replay 只重放当前语义单元；restart 重置整课会话。
- mute/fullscreen/picker 是会话状态，不写 archive。
- capture/checkpoint 恢复时不制造 editor history 或 dirty。
- Trial、Full Preview、Published HTML 各自隔离，销毁后无订阅、音频或 DOM 泄漏。

## 3. M4 Gate

代表性双场景 Slide 必须真实完成：状态互动、前后导航、目录、收展、session 移动、重播、整课重启、静音、全屏、Runtime 2/3、Component 4、销毁重建。

项目对象和发布 payload 在运行前后保持不变；运行会话重建后恢复项目默认状态。HTML 不包含 `.course-nav`。

验证遵循根计划 L3，只保留一条代表性 Published/Trial E2E；Runtime、Component 和教师控制器分别用定向单测保护，不重复跑多个等价 Electron 流程。

## 4. 明确不做

- 不在 M4 重建 Flow/Spatial 编辑 UI。
- 不复制 Phaser `renderTeacherController` 作为第二套 DOM 控制器；共享纯 layout/session 逻辑，保留薄适配器。
- 不让 Published App、Surface Host 和 Runtime 同时执行同一个教师动作。
- 不把会话 offset、mute、fullscreen 或 checkpoint 写回 Course Project。
