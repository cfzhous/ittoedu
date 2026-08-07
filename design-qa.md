# Design QA：高中数学动点问题核心联动样片

## Comparison Target

- Source visual truth: `docs/courseware-pilots/math-motion/references/linked-graph-reference.png`
- Browser-rendered implementation: `output/math-motion-sample/evidence/linked-proved.png`
- State: `scene_linked_graph / linked_proved`，`t = 2`，`S = 6`
- CSS viewport: `1280 × 720`
- Device scale factor: `1`
- Source pixels: `1672 × 941`，仅为并排审阅按 `1280 × 720` 归一化；没有裁掉内容。
- Implementation pixels: `1280 × 720`，与 CSS viewport 及目标密度 1:1。
- Full-view comparison: `output/math-motion-sample/evidence/linked-graph-comparison.png`
- Focused comparison: `output/math-motion-sample/evidence/linked-graph-focus-comparison.png`
- Normalization record: `output/math-motion-sample/evidence/visual-evidence-metadata.json`

## Findings

当前对照没有仍需修复的 P0、P1 或 P2 问题。

- 视觉主体与层级：标题、运动关系、面积函数、几何位置、面积区域、函数图象和时间控制都在首屏可见；视线从左侧关系式到右侧几何、再到下方图象，因果链清楚。
- 数学真相优先的有意差异：源图把阴影画成 `△PBQ`，却用 `AP` 与 `BQ` 得到 `S(t)=6t-1.5t²`。实现改画与公式一致的 `△APQ`，并明确标注目标面积。这是必要纠错，不是视觉回归。
- 字体与排版：中文使用本地系统黑体，数学使用 `Cambria Math/Cambria/Times New Roman` 回退；标题、正文、数学式和辅助标签的层级稳定，没有溢出、截断或错误换行。实现比概念稿更克制地缩小辅助文字，为三时刻检查点留出空间，但核心公式和结论仍是最高视觉权重。
- 间距与布局节奏：保持暖白开放画布、纵向学习路径和分区留白，没有引入统一页眉、页码、大卡片或固定底栏模板。实现把图象放在几何下方而不是横跨左下，以容纳可验证的三时刻检查和确认动作；在 1280×720 下没有重叠或裁切，属于已批准教学证据所需的可接受布局调整。
- 色彩与视觉 token：近黑正文、群青变量、橙红目标量、浅灰辅助线与暖白纸面与源图一致；禁用态、完成态和焦点色仍保持可辨识对比。
- 图像与素材质量：成品没有嵌入概念图、远程图片、远程字体或装饰性替代资产。几何与函数图象是由同一数学模型驱动的功能性数据可视化，使用矢量 DOM/SVG 是正确承载，不是用代码仿造源图中的装饰图片。
- 文案与内容：指令明确要求观察 `0、2、4`，完成反馈明确保留 `Smax = 6, t = 2`；没有把有限候选中的结构化证明夸大为自由书写证明。
- 结论揭示：`linked_explore` 只显示拖动所得的当前值 `S(t)`，不标注 `Smax = 6`；完成三个关键时刻并确认峰值后，`linked_proved` 才揭示最大值结论。
- 状态与交互：实际浏览器完成 `0 → 4 → 2 → 确认`，`linked.mastered` 成功进入 `linked_proved`。方向键等价路径使用 `End / Home / PageUp / Arrow` 控制，原生 range 有可见焦点和动态 `aria-valuetext`；完成按钮可用 Enter 触发。
- 可访问性：range、button、`aria-label`、`aria-live`、焦点轮廓、暂停/捕获禁用语义和 `prefers-reduced-motion` 均存在。实际浏览器控制台没有 error 或 warning。
- 图标：课程主体没有装饰图标；右下角只保留折叠式教师控制器入口，静态导出排除该控件。没有图标家族不一致问题。

## Comparison History

### Iteration 1 — blocked

- [P2] `t = 0` 时 `Q` 与 `C` 标签发生碰撞。
- [P2] 图象横轴刻度、键盘提示和滑杆在底部区域过密。
- [P1] Player 宿主中的默认键盘事件不能作为稳定的自动化证据，方向键路径缺少组件自身的确定处理。

Fixes made:

- 根据 `Q` 的纵向位置切换标签上下方位，消除端点碰撞。
- 上移图象坐标系，重新分配刻度、提示和滑杆的垂直空间，并提高键盘提示字号。
- 在组件内显式实现 `ArrowLeft/Right/Up/Down`、`Home/End`、`PageUp/PageDown`，阻断宿主翻页冒泡，并为 Enter/Space 确认提供确定路径。

Post-fix evidence:

- `output/math-motion-sample/evidence/linked-explore.png`
- `output/math-motion-sample/evidence/linked-proved.png`
- `output/math-motion-sample/evidence/linked-graph-comparison.png`
- `output/math-motion-sample/evidence/linked-graph-focus-comparison.png`

### Iteration 2 — passed

相同 1280×720 视口、相同 `linked_proved` 状态的完整画面与核心区域复核未发现新的 P0/P1/P2 问题。源图的错误阴影没有被复制；实际画面仍保留其解析图谱层级、配色和开放画布语言。

### Iteration 3 — human gate passed after correction

- [P1] 人工门禁指出探索态不应直接给出 `Smax = 6`，否则确认动作失去认知意义。

Fix made:

- 将图象峰值标签绑定到 `linked_proved` / mastered 状态；探索态仍允许学生拖到 `t = 2` 并自然读出当前值 `S = 6`，但不提前命名为最大值。
- 增加组件回归断言，并分别重拍实际浏览器探索态与完成态，确认结论只在确认后出现。

Post-fix evidence:

- `output/math-motion-sample/evidence/linked-explore.png`
- `output/math-motion-sample/evidence/linked-proved.png`

## Open Questions

- 人工样片门禁已通过，所附修正已经落实并复核。自动构建生成的 `CoursewareEvidenceManifestV1.result.status` 仍保持 `pending`，避免构建脚本冒充人工签署；门禁事实记录在本 QA 与课例编排记录中。
- 样片阶段没有把短录屏和 PPTX 渲染设为必需证据；它们在七幕整课 `outcome-review` 前必须补齐。

## Implementation Checklist

- [x] 修复端点标签碰撞与图象控制区密度。
- [x] 完成指针输入逻辑、确定键盘等价路径与可访问反馈。
- [x] 以实际完成态生成组件缩略图，不使用概念图占位。
- [x] 生成完整与局部并排对照，并保留密度归一化记录。
- [x] 将自动结果保持为 `pending`，不冒充人工接受。
- [x] 探索态不提前揭示最大值结论，确认后再显示 `Smax = 6`。

## Follow-up Polish

- [P3] 整课扩展时可评估把完成态的 `t = 2` 再放大一级，进一步接近概念图的讲评聚焦感；当前字号清晰，不阻断样片门禁。
- [P3] 整课静态导出完成后再统一检查教师控制器折叠入口与各幕构图的视觉干扰，不应提前抽象成统一底栏。

final result: passed
