# 动点问题·图式联动实验组件

> 当前定位：流程失败案例 0 的历史实现，仅用于复现和诊断，不是新课件范本。

课程专用 Component API 4 DOM 组件，组件 ID 为 `com.ittoedu.math.motion-function-lab`。它承载旧《让运动变成函数》七幕课的结构化互动与连续联动，不是通用数学模板。整课已被人工拒绝：教学内容规格和呈现脚本不完整、容量与难度不足、组件化范围过大，并存在斜线分数排版错误。后续不得继续扩展本组件来证明新创作工作流有效。

## 课程模式

- `prediction`：锁定课前预测，不即时判对错。
- `constraints`：把常量、变量、范围和目标量分类并修复错误。
- `model`：组装 `AP`、`BQ`、定义域和面积式。
- `linked-graph`：拖动 `t` 联动位置、式与图象；探索态不提前揭示 `Smax`。
- `domain`：识别区间外顶点并改用端点比较。
- `transfer`：把同一结构迁移到矩形面积模型，可按需显示提示。
- `summary`：排列“约束—变量—关系—范围—解释”五步法。

稳定阶段由 Project V8 的命名状态承载；组件发出语义事件，场景规则负责进入修复、提示或完成状态。

## 核心联动

- `phase: linked_explore | linked_proved`
- 拖动原生 HTML range，同一帧更新 `P/Q` 位置、`△APQ` 面积、线段表达式和函数图象。
- 数学真相由 `model` 数值常量推导；母题为 `S(t) = 6t - 1.5t², 0 ≤ t ≤ 4`。
- 学生依次观察 `t = 0, 2, 4`，并在 `t = 2` 确认最大值后发送 `linked.mastered`。

## Props 合同

组件只使用以下顶层字段：

- `mode`
- `phase`
- `model`
- `content`
- `palette`
- `reducedMotion`

全部题面、标签、反馈和按钮文案登记在 `content`。标题与课堂提示由 Project 原生文字节点承载。

## 生命周期与可访问性

实现 `setMode`、`resize`、`updateProps`、`setVisible`、`suspend`、`resume`、`prepareCapture` 和 `destroy`。只有拖动滑杆时合并到 `requestAnimationFrame`；键盘输入即时更新。原生 range 支持方向键，焦点样式清晰，数值和反馈通过 `aria-live` 报读，并尊重 `prefers-reduced-motion`。

## 构建与验证

```powershell
npm run build:math-motion-sample
npm run validate:math-motion-sample
npm run build:math-motion-course
npm run validate:math-motion-course
npm run export:math-motion-course
npm run validate:math-motion-static
npm run finalize:math-motion-course
```

核心样片输出位于 `output/math-motion-sample/`；七幕整课输出位于 `output/math-motion-course/`。`export` 生成 PDF/PPTX，`validate:math-motion-static` 检查页数、可编辑文字、组件快照、对象边界和回渲尺寸。这些命令只复现工程管线，当前结果状态是 `rejected`，不能因自动验证通过改回 `pending` 或 `accepted`。新案例必须使用仓库两个 Courseware Skill 从原始主题冷启动。
