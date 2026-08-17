# T12 — 最终整合后的唯一全量 Gate

> Wave：5（最后串行执行）
> 唯一授权：本任务可以运行全量 typecheck/test/build/E2E/visual
> 前提：T01–T11（含 T09A/T09B）全部交付

## 1. 目标

对已经整合完成的候选版本一次性运行完整工程验证与真实体验复核。此任务不承接新功能；任何失败先归因并回派给文件 owner，修复者只跑最小测试，然后回到本 Gate 复验。

## 2. 预检

- 工作树不存在未解释的跨 lane 冲突。
- 每个任务 HANDOFF 有 baseline、文件、最小测试和风险。
- 所有 `INTEGRATION_REQUEST` 已关闭。
- UI 参考图和体验清单已冻结，未为适配回归重捕 baseline。
- 测试脚本仍覆盖默认 V9 路径；V8-only preservation 不能代替 V9 E2E。

## 3. 全量自动化顺序

先记录环境、HEAD 与工作树，再执行：

```powershell
npm run verify:full
npx playwright test --config=playwright.config.ts
npm run verify:course-cases
```

`verify:full` 当前应覆盖 capability check、全部 typecheck、全部 unit/component、renderer/electron/player 构建、E2E 准备和 preservation visual。随后显式运行完整 Playwright 集，确保所有 V9 spec 也执行，而不是只跑 V8 preservation。

如果脚本事实已变化，先列出实际展开命令并确认覆盖以下集合，再执行等价命令：

- Agent Kit/capability check；
- renderer/electron/e2e typecheck；
- 全部 Vitest 与 Agent Kit test；
- player/renderer/electron build；
- 全部 V9 Electron/Playwright specs；
- V8 行为/视觉 preservation；
- course cases 与发布/导出校验。

不得并行启动多个会争抢端口、Electron 窗口或生成目录的全量命令。

## 4. 真实体验 Gate

按 `artifacts/FINAL_EXPERIENCE_CHECKLIST.md` 完整执行，至少覆盖：

1. 纯 Slide：多选、右键复制、粘贴、Delete、Undo/Redo、文字双击、保存重开。
2. 全局层：进入、编辑、锁定/隐藏、跨 location 投射、退出后 active location/history 不变。
3. 教师控制台：八向 resize、zoom/pan 对齐、属性折叠、试运行与 Player 一致。
4. 声音：导入、试听、重命名、引用、删除保护、发布播放。
5. 纯 Flow：从空白创建、页面—标题目录、正文编辑、运行态目录三角、导出。
6. 纯 Spatial：从空白创建、世界元素、镜头/路径/关系、控制器 viewport、Player。
7. Mixed：连续切三类 location、课程目录、上一/下一、进度、保存重开与导出。
8. 三视口：壳层几何、长图层、右键浮层、Flow 长文、Spatial chrome 不越界。

自动化通过前不得开始“修图式”视觉验收；真实问题必须回到源码 owner。

## 5. 失败处理

每个失败记录：命令/步骤、首个错误、复现条件、owner、是否跨 lane。然后：

1. 回派给原任务 owner；
2. owner 只跑其最小测试并提交修复 HANDOFF；
3. T10 只处理必要热点接线；
4. 本任务先复跑失败 Gate；
5. 所有失败关闭后，最多再完整运行一次全量自动化，形成最终证据。

禁止通过删除测试、放宽行为图、重捕截图或禁用功能解决失败。

## 6. 判定

- 全量机器 Gate 全绿：`engineering candidate`。
- 体验清单全部通过并有截图/录像：`art candidate`。
- 只有教师明确确认：`accepted`。

任一 V8 已有能力缺失、全局层不可达、三类页面不能从空白创建、Flow 层级错误、控制器错位或声音管理缺失，均不得带已知限制发布。

## 7. 最终报告格式

```md
FINAL_GATE
- baseline / HEAD:
- full commands and durations:
- machine results:
- V9 E2E coverage:
- preservation results:
- experience evidence:
- export artifacts:
- unresolved issues:
- outcome status: engineering candidate | art candidate | accepted
```

## 8. 交付记录

尚未执行。
