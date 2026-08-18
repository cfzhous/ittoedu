# R2 协调者 Gate 记录

> 日期：2026-08-17
> 依据：[R2-Z Slide UI接线](74f8f355-4922-484b-9a77-4bcfc9a3f132) [`handoffs/R2-Z.md`](R2-Z.md)
> 产品 worktree：`C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` @ `f272756`

## 裁决

**不把 R2 标为 `DONE`，不宣称本阶段 `engineering candidate`，不宣称 V9 编辑器可用。**

理由：§10 要求 blocking 请求 `integrated + verified`，且 R2-Z 授权的真实 candidate UI 冒烟受阻（Vite 无 `desktopAPI`；不得增加用户可见注入；不得把正在跑的默认 V8 会话切成 candidate）。定向 Vitest 不能替代该冒烟。

**同时解锁 Wave 3 的非切换任务。** `00_INDEX` 进入条件「R2-Z 通过」解释为：R2-Z 已把同一套 V8 UI 接到 candidate，6 条 R2-Z blocking 请求已接线且定向测试通过。这足够让 R3-A/B/C/D 写纯命令/投影、让 R4-DESIGN / R5-DESIGN 出 UI 合同。它们都不需要默认 backend 切换。

## 账本

下列请求标为 `integrated`，**不**标 `verified`：

- R2SEAM-R2Z-01、R2C-R2Z-01、R2B-R2Z-01、R2E-R2Z-01、R2D-R2Z-01、R2D-R2B-01
- 以及已被 Z 消费的 lane 侧 R2SEAM-R2B/C/D/E-01、R2A-R2SEAM-01、R1Z-R2A-01

`verified` 延至 **R3-Z** 的 candidate UI 冒烟（MediaTab/global/controller 一并实操时再证明画布路径）。不得用 `documented` 关闭。

## 解锁 / 仍锁

| 任务 | 状态 |
|---|---|
| R3-A / R3-B / R3-C / R3-D | `READY` → 立即并行 |
| R4-DESIGN / R5-DESIGN | `READY` → 立即并行；实现仍等 R3-CUT + 设计冻结 |
| R3-Z / R3-G / R3-CUT | 仍锁 |
| 默认 backend | 仍为 V8 |

## 已知缺口（不阻断 R3 lane）

- 公式/形状插入在 candidate 下仍走 V8 `commit`，会被双写拒绝
- Runtime 不出现在 NodesTab
- 图层重命名无 V9 command
- 新媒体导入需要 V9 `assets`（R3-B）
