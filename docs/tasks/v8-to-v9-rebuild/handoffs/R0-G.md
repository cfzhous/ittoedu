# R0-G — 基线资格 Gate

> 状态：教师已确认 `f272756` 可作为产品主干（2026-08-17）；R0-B 账本已补交
> 教师决策：**确认**
> R1 协议 Gate 已通过。R0-B 无 `baseline-fail`，不回溯阻断。

## 检查清单

| 项 | 来源 | 结果 |
|---|---|---|
| 唯一产品 worktree 与入口无歧义 | R0-A | 通过：`C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` @ `f27275658c6dfaa12f2ce35cd9368dcdebe99451`；`main.tsx` → `App`；`npm run dev` 打开成熟 V8 壳 |
| V8 核心能力可用，回归已明确 | R0-B | 通过（无 `baseline-fail`）：通过 40 / 回归 0 / 未找到 4 / 受阻 13 / 未执行 4。账本 [`V8_CAPABILITY_LEDGER.md`](../artifacts/V8_CAPABILITY_LEDGER.md)；证据索引 [`R0_B_EVIDENCE_INDEX.md`](../artifacts/R0_B_EVIDENCE_INDEX.md)。打开/保存/媒体导入等受阻是 Vite 无 desktopAPI + Electron 无 CDP，不是产品回归。基线事实缺口（不视为回归、后续不得假装 V8 已有独立按钮）：无独立「发布」、图层无独立置顶/置底/上移一层、画布无自定义右键。保护现有拖排、导出菜单、系统剪贴板快捷键。 |
| 格式/recovery 隔离成立 | R0-D | 通过（定向测试）：独立 userData `ittoedu-courseware-editor-v8-rebuild`；V9 archive/recovery 拒绝并给出可行动错误。当前仍在跑的 Electron 需下次编译启动后才换目录 |
| 供体矩阵和中央热点清楚 | R0-C | 通过：[`artifacts/R0_C_DONOR_MATRIX.md`](../artifacts/R0_C_DONOR_MATRIX.md) |
| 没有把 `14890bb` 或当前 V9 HEAD 当成熟 V8 基线 | R0-A/C | 通过：基线仅 `f272756` |
| 没有运行全量测试或移植 V9 UI | 协调者 | 通过 |

## 教师决定（原文）

2026-08-17：「确认，之后不要频繁问我，自行决定。」

解释为：

1. 确认 `f272756` 可作为产品主干。
2. 后续 R1–R8 的阶段 Gate 由协调者根据任务包证据自行裁决并继续执行；不再为每个 Gate 停下来询问。
3. 产品级 `accepted` 仍只在最终有明确验收时标记；中间不把自动化写成 accepted。

## 冻结

- 产品主干 SHA：`f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- 回退点：删除 worktree `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` 并删除分支 `codex/v8-to-v9-rebuild`；计划目录保持供体角色。
- 下一步：R2-A 进行中。R2-Z 真实 UI 冒烟时再编译启动 Electron（带独立 AppData，必要时加 remote debugging），补做 R0-B 受阻的桌面对话框与指针合同。
