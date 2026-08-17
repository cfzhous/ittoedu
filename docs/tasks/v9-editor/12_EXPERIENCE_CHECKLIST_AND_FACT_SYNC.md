# T11 — 体验检查清单与能力事实同步

> Wave：4（串行）
> 依赖：T10 integration candidate
> 性质：事实审计与文档收口，不承接新功能

## 1. 目标

在最终全量 Gate 前，把“需要真实检查什么”整理为可复现清单，并让 README、项目认知索引、Builder Skill 与 Agent Kit 只声明当前真正可达的能力。不得用文档掩盖缺口。

## 2. 允许修改

- 允许新建 `docs/tasks/v9-editor/artifacts/FINAL_EXPERIENCE_CHECKLIST.md`
- `README.md`
- `PROJECT_COGNITION_INDEX.md`
- `.agents/skills/build-courseware-project/SKILL.md`
- Agent Kit / capability 的生成源与生成后的 index（必须保持脚本可复现）
- `00_INDEX.md` 和各任务交付状态

不修改产品代码、Schema、测试期望、视觉 baseline 或根总纲产品决策。

## 3. 事实审计

逐项核对源码、接线和已有定向测试：

- 默认 V9、V8 显式导入边界；
- 三类空白创建与 Pure/Mixed 推导；
- 全局层固定作者入口与 surface shared 可达性；
- Slide 高频能力、Flow 层级/就地编辑/运行目录、Spatial 无限画布；
- 右键、Delete、剪贴板、图层、锁定、隐藏、声音和控制器；
- Mixed Player、发布和导出；
- Runtime API 2/3、Component API 4 的真实边界；
- `courseAiHandoff` / `courseAiPatch` 仍为 internal/reserved、未挂载。

不得写“Focusky 级”“可见 AI”“自动结构编辑”或其他尚未验收能力。

## 4. 最终体验清单

清单至少包含根总纲第 10 节十个交互场景，并补充：

- 四态 1280×720、1366×768、1920×1080 对照参考图；
- 全局层进入/退出不改变 active location/history；
- Flow 运行态目录展开/收起的贴边三角；
- 长图层名称/长列表；
- 控制器八向 resize、属性折叠和 Player 折叠；
- 声音导入、引用保护和发布播放；
- 保存关闭重开后继续编辑；
- V8 导入报告与 V9 新建隔离。

每项预留：工程/样例、步骤、预期、自动化证据、截图/录像、结果、问题 owner。

## 5. 最小验证

```powershell
npm run check:ai-capabilities
git diff --check -- README.md PROJECT_COGNITION_INDEX.md .agents/skills agent-kit docs/tasks/v9-editor
rg -n "projectMode|Focusky|可见 AI|暂不能|全局层" README.md PROJECT_COGNITION_INDEX.md .agents/skills agent-kit docs/tasks/v9-editor
```

只有实际修改能力卡时运行 `check:ai-capabilities`。不启动 build/typecheck/全量 test/E2E/visual。若已有可运行开发实例，可做一条代表性人工抽查；不得为了本任务单独跑全量构建。

## 6. 验收

- 文档声明与当前正式入口一致，无历史计划污染。
- 全局层明确保留；Pure/Mixed 不存 mode。
- Focusky/AI 只作为远期边界，不冒充现有能力。
- T12 可直接按体验清单执行并记录结果。

## 7. 交付记录

尚未执行。
