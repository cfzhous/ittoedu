# 组件库收敛与画布文字编辑验证记录

> 日期：2026-08-13
>
> 历史证据。组件数量与许可阻断以当时为准；工程格式现为 Course Project V9。
>
> 基线：`a2e9d3b` 上的当时未提交主仓工作树；相邻组件仓提交 `b124dd5`
>
> 状态：软件管线与组件矩阵为 `engineering candidate`；组件仍非发布就绪，视觉结果尚未达到人工 `accepted`
>
> 范围：内置组件目录、通用视觉组件收敛、组件画布文字编辑、无弹窗导入、四格式矩阵与组件仓版本化

## 1. 结论

组件库已由“两个语文学科组件 + 七个单用途视觉组件”收敛为四个职责清楚的组件：

1. 语文朗读标注；
2. 汉语拼音标注；
3. 文字视觉容器，在属性栏切换透明玻璃、磨砂玻璃、便利贴、撕纸和文件夹；
4. 图片装饰容器，在属性栏切换笔刷和贴纸。

原七个视觉组件的 ID、源码目录、包和来源不明位图已删除，不提供别名、迁移器或旧工程兼容。两个新视觉组件用 CSS/SVG 独立实现，避免继续携带旧素材与重复 Runtime。新外部组件在用户选定后直接校验并加入工程，不再弹出导入确认或成功摘要；会覆盖工程既有执行代码的更新/替换仍保留版本、文件和 SHA-256 审阅。

四个组件所有稳定、可见且可编辑的文字均已暴露画布级编辑目标。真实隐藏 Electron 矩阵使用画布双击完成四类组件文字修改，并从属性栏切换两个视觉组件的样式；保存重开、缩略图、Player、单 HTML、网页包、PDF 和 PPTX 均通过。

## 2. 当前组件合同

| 组件 | 版本 | ZIP SHA-256 | canonical content SHA-256 | 画布文字键 |
|---|---:|---|---|---|
| `com.ittoedu.language.reading-annotation` | 1.1.0 | `b4b7b1104ff390f675811e4ca7460042b28f00aaa9f40614a4f79e56f00cb82a` | `c837cde9d48f1191f295534e1dd88e7d076af07ebf5db9ef3473fb87bd47da29` | `content.title`、`content.markup`、`content.pauseSymbol`、三个图例键 |
| `com.ittoedu.language.pinyin-annotation` | 1.2.0 | `9c18a0d9ca01bdd9d6c1e9353d46158dff20af5f842c26697c95454fcc6c911d` | `9df532eca5988ec7625b1c37c9997cda1903a9ae6c0fea2cddd83b87c544114b` | `content.title`、`content.pairs`、显示/隐藏按钮文字 |
| `com.ittoedu.visual.text-container` | 1.0.0 | `f38781f797361dfd5afbda56958b824a5e95156f637befbf75ede57cf1edf7b1` | `ad22d728a0e8da30e2fa2a6cb00c52eb5109a30643a9cb675f1a779a559de07c` | `content.eyebrow`、`content.title`、`content.body`、`content.steps` |
| `com.ittoedu.visual.image-frame` | 1.0.0 | `b436247ab0a923643eb50f302c914bb71a2d88cd13ac5c41573638dfb067531a` | `26f5f3c537887d5d598fa50e41edb9d85c7efed906a2f2ca068cc886fa9272cd` | `content.caption` |

`content.alt` 是图片无障碍说明，不是画面可见文字，继续只在属性栏编辑。样式切换是组件属性，不生成新的组件 ID：

- 文字视觉容器：`transparent-glass`、`frosted-glass`、`sticky-note`、`torn-paper`、`file-folder`；
- 图片装饰容器：`brush`、`sticker`。

组件属性控件现在都有显式可访问名称；自动化和辅助技术可以按“视觉样式”等标签稳定定位，而不依赖隐式 label 拼接选项文字。

## 3. 断代与仓库边界

本轮按“尚未投产、旧课例和组件可丢弃”的授权执行硬断：

- 删除七个旧视觉包及其源码和位图；
- 旧组件 ID 不保留别名，不写迁移分支；
- 旧 `.h5lesson` 若引用这些 ID，直接视为需重建的废弃工程；
- 组件仓构建脚本只产出当前四包；
- 主仓目录验证器、矩阵生成器、AI 能力快照和测试只接受当前四包。

相邻 `courseware-components` 是组件源码、包、catalog、来源声明和验证 attestation 的独立事实源。本轮已在其本地 `main` 提交为 `b124dd5`（`feat: consolidate visual component catalog`），提交后工作树干净。该仓仍没有远端，因而尚无远端备份或 CI 来源。

## 4. 自动化证据

| 验证 | 结果 |
|---|---|
| `npm run typecheck` | 通过；普通、Electron、E2E 三配置 |
| `npm test` | 127 文件 / 799 项通过 |
| `npm run build:desktop` | 通过 |
| 主仓 `npm run verify:component-catalog` | 通过；4 个 Component API 4 包 |
| 组件仓 `npm run verify` | 通过；4 个包可重现构建且 catalog 哈希匹配 |
| `npm run check:ai-capabilities` | 通过；当前索引 5,557 bytes，组件快照为 4 项 |
| 隐藏组件矩阵 | 2/2 通过，总计约 2.7 分钟；所有 Electron 窗口隐藏、不聚焦 |

矩阵运行事实：

- 4 个组件 / 4 个场景；
- 压力段 25 轮 × 4 场景 = 100 次导航，任一时刻只挂载 1 个组件；
- Player、生成的单 HTML 与网页包均完成离线导航，外部请求和 page error 为 0；
- PDF 4 页，PPTX 4 页；
- catalog UI 多选加入、工程保存重开、四种画布文字编辑及两个视觉样式切换均由真实 UI 路径完成。

本轮只重跑组件专项隐藏 E2E。2026-08-12 的完整隐藏 E2E 27/27 是前一冻结基线，未冒充本轮同工作树的全量结果。

## 5. 证据链与输出

catalog 验证链：

| 项目 | SHA-256 / 值 |
|---|---|
| 矩阵运行证据 | `28605853841840abbad026debb6644fa02950b5e3d585559216856b240c76ba3` |
| 验证前 catalog | `94341c7c35585f35549bc24b1458ba62e1b5d4d2468e783e2b4dc778ac41a7b7` |
| 验证后 catalog | `fedf8315a8a1cc636771760be95931b31dba7f6625b62adc8247d7eebf044573` |
| `verifiedAt` | `2026-08-12T16:46:41.614Z` |

验证后只移除了 `current-v8-full-matrix-unverified`，没有改变包版本或包哈希，也没有解除许可/维护人阻断。

| 输出 | Bytes | SHA-256 |
|---|---:|---|
| 保存重开工程 | 24,363 | `f552f0f413a940e771919ec942145ccf9adde359dedc3dd3c739df8ade36b991` |
| 单 HTML | 1,822,255 | `7fefcc4f11ea3171f72d1f077048e3e9b11e26ad5b4797aa88e717f9bb5c75e8` |
| 网页包 | 489,870 | `1546cb3a38b5272641c03761983bc78c4bbe7ce83023b4a7fbc83f7c1909deab` |
| PDF | 208,573 | `f98590f852ed7fd44ceea6cbabb1010c41600af5ab9e2138453b332d5f426631` |
| PPTX | 469,568 | `f86118f5c416071656191586a1f87a2f3994191d39641b3f75bd6fc5bb148549` |

持久截图：

- `component-library.png`：`9653bdb9571f7f21961a231c749e8095b54498ab41b764584cdcd5bb5a0417d4`；
- `editor-four-component-matrix.png`：`4569bfc26ee5d7755de1d71a641af5573b74ce8c0f1579abfcbf50abb8da894e`；
- `preview-player.png`：`e3b706827db9c2e03459ebafb6ac7164dd0cb1a0411ff59db1a4e6fe5d172b57`。

## 6. 结果质量与剩余门禁

工程管线：`engineering candidate`。目录结构、运行合同、画布编辑、样式选择和四表面技术链已经成立。

用户可见结果：`engineering candidate`，尚未 `accepted`。当前截图已排除空白、破图和旧组件堆叠问题，但仍需真实教师对五种文字外观、两种图片外观、不同内容长度和常见屏幕比例做视觉与操作验收。

四包仍全部为 `experimental`，并保留：

- `license-unverified`；
- `maintainer-unassigned`。

CSS/SVG 独立重做只消除了旧来源不明位图和重复实现，不能替代源码权属、商用许可或维护责任确认。完成这些门禁前，四包不得升级为 candidate/stable，也不进入正式 Windows 发布范围。
