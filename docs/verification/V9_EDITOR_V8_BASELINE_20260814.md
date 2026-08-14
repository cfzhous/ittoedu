# V8 前端原地升级 V9：G01 工程基线

> 采集日期：2026-08-14（Asia/Shanghai）
>
> Git 基线：`3e41ec058627d38c4b9f5439b454cc72331e1485`
>
> G01 执行父提交：`1559f0d1833e09f3c5c867aeb59bb00367339455`
>
> 分支：`codex/v9-editor-v8-base`
>
> 结论：`PASS / engineering baseline`；本记录不代表视觉、交互或教师验收。

## 环境预检

- `git merge-base --is-ancestor 3e41ec058627d38c4b9f5439b454cc72331e1485 HEAD`：退出码 `0`。
- `npm ls --depth=0`：退出码 `0`，`package.json` 声明的直接依赖完整，无 extraneous/missing 报告。
- 执行前 Git 工作区干净；未运行 `npm install` 或 `npm ci`。

## 固定命令与结果

| 能力 | 精确命令 | 退出码 | 实际结果 |
|---|---|---:|---|
| TypeScript | `npm run typecheck` | 0 | renderer、electron、e2e 三套 TypeScript 检查通过；2.489 秒 |
| Unit / integration | `npm test` | 0 | Vitest `142` files / `899` tests 全部通过；Agent Kit `8` tests 全部通过；22.487 秒 |
| Player build | `npm run build:player` | 0 | Vite 转换 `158` modules；生成 `dist-player/player.iife.js`；1.791 秒 |
| Renderer build | `npm run build:renderer` | 0 | Vite 转换 `2056` modules；生成 renderer HTML/CSS/JS；3.600 秒 |
| Electron build | `npm run build:electron` | 0 | `tsc -p tsconfig.electron.json` 通过；0.925 秒 |
| Archive / publish contracts | `npx vitest run tests/unit/courseStateAndArchive.test.ts tests/unit/coursePublishPipeline.test.ts tests/unit/courseProjectProtocol.test.ts` | 0 | `3` files / `24` tests 全部通过；2.510 秒 |

## 本次新构建产物证据

| 产物 | Bytes | SHA-256 |
|---|---:|---|
| `dist-player/player.iife.js` | 1,877,532 | `47c3dda40320bece740b833f2e1b01cca0fc948b1bad15dd657fc9ea7c52d358` |
| `dist-renderer/index.html` | 958 | `85246cc1043daa8b0a30f5a3434fdfbdf85c3390c3ab35fdfb1c915a2ddcb352` |
| `dist-electron/main/index.js` | 4,481 | `42a92b80a1f04991397a3aeb8d6597ed345ec2fcbaff60624625398370d92dc9` |
| `dist-electron/preload/index.js` | 7,036 | `552a1fca2def3d26b017c51589cb6f4b1003a30deb2afe0c5b1991d5cbf5b68b` |

Renderer 主 bundle 为 `dist-renderer/assets/index-CwyrJT5R.js`，大小 `4,714,660` bytes；CSS 为 `dist-renderer/assets/index-Dpbw9PKc.css`，大小 `91,924` bytes。

## 非阻塞基线告警

- Player 构建报告：`inlineDynamicImports` 因 `codeSplitting: false` 被忽略。
- Renderer 构建报告两个 ineffective dynamic import：`src/player/RuntimeHost.ts` 与 `src/player/renderNode.ts` 同时被静态导入。
- Renderer 主 chunk 超过 Vite 的 500 kB 提示阈值。

这些是 `3e41ec0` 基线的可复现构建告警，本卡不修改配置或实现，也不把告警升级为本轮阻塞。

## 范围边界

G01 没有运行 Electron 真实鼠标、截图、archive 文件落盘重开或完整 E2E；这些证据分别由 G02、V05 和后续 Gate 负责。自动化全绿只证明当前基线可构建、现有测试合同可运行，不改变计划中的 `CURRENT_PRODUCT_STATUS: unusable`。
