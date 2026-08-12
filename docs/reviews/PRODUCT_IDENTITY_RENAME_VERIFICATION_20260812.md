# ittoedu 产品身份断代与 Headless 自检验证记录

> 当前性说明：本文冻结 2026-08-12 的十三组件身份断代批次。组件库随后已收敛为四包；当前组件数量、ID、哈希、画布文字编辑和矩阵证据以 [组件库收敛验证记录](COMPONENT_LIBRARY_CONSOLIDATION_VERIFICATION_20260813.md) 为准。本文中的九包/七个视觉容器数据只作历史追溯。

> 日期：2026-08-12
>
> 基线提交：`a2e9d3b` 上的本轮未提交工作树
>
> 当前状态：软件管线签发为 `engineering candidate`；不是课件成品 `accepted`，也不是对外发布许可
>
> 范围：产品身份、Windows 身份与制品、组件命名空间、组件内容完整性、AI 能力门禁、Headless 工程自检、后台自动化及文档同步

## 1. 验证结论

本轮已完成 ittoedu 身份断代和 AI 自检闭环：正式产品不再以 Phaser 命名；公司、应用 ID、Windows 制品、数据/临时路径和当前 13 个组件 ID 均切换到 ittoedu；Project V8 含组件归档新增 canonical 内容哈希；AI 可用纯命令行读取完整 `.h5lesson`，获得 Schema、Project Health 和四格式预检结果。

同一冻结代码已通过 127 个 Vitest 文件 / 799 项测试、隐藏 Electron E2E 27/27、桌面生产构建、Windows 打包和 16 项真实发布制品核验。自动化窗口始终隐藏，不抢占用户桌面。

结论仍限定为 `engineering candidate`，原因有两项：

1. 九个目录组件仍是 `experimental`，许可证、素材来源或维护人未闭环，不能随正式产品发布；
2. 旧本地数据与历史发布目录已精确定位，但本次执行环境禁止删除，P7 卫生清理尚待人工完成。

## 2. 冻结产品身份

| 项目 | 当前值 |
| --- | --- |
| 中文产品名 | 互动课件编辑器 |
| 英文产品名 | ittoedu Courseware Editor |
| npm 包 | `ittoedu-courseware-editor@1.0.0` |
| Windows App ID | `com.ittoedu.courseware-editor` |
| Windows ProductName | `ittoedu Courseware Editor` |
| 可执行文件 | `ittoedu-courseware-editor.exe` |
| Portable | `ittoedu-courseware-editor-portable-1.0.0.exe` |
| 用户数据目录 | `%APPDATA%\ittoedu-courseware-editor` |
| E2E 临时目录 | `%TEMP%\ittoedu-courseware-editor-e2e` |
| 第一方组件命名空间 | `com.ittoedu.*` |

Phaser 仍是 Player 原生 2D 渲染和透明编辑交互层的内部依赖。技术类型、源码导入、运行时能力和技术说明中的 `Phaser` 应保留；它不再作为产品、公司、路径或发布物品牌。

## 3. 实现结果

### 3.1 能力生成门禁

- `check:ai-capabilities` 继续把任何漂移视为失败，但会区分“能力生成物过期”和“仅来源溯源证据过期”；检查路径只读。
- `verify` 顺序固定为能力门禁、三配置类型检查、单元/集成测试、隐藏 E2E、桌面构建。
- 最终能力索引为 5,558 bytes，低于 16,384 bytes 上限；组件目录状态可被按需发现。

### 3.2 身份与路径断代

- 应用名、公司、AppUserModelID、构建制品、诊断文件、预览/PDF 临时目录、文档标题、PPTX/PDF 元数据和 Skill 安装来源均切换到 ittoedu。
- 正常启动强制使用新的用户数据目录；显式 `--user-data-dir` 只保留给隔离测试/验证。产品不会读取、复制或迁移旧目录。
- Player IIFE 全局名改为中性的 `CoursewarePlayer`；真实 Phaser 技术能力不作品牌替换。

### 3.3 组件身份与完整性

- 四个主仓示例组件和九个相邻目录组件全部使用新的 `com.ittoedu.*` ID，旧 ID 不保留别名、迁移表或兼容分支。
- 常规外部组件和内置库多选导入在用户选定后直接校验并加入工程，不再弹出确认或成功摘要；成功写入状态栏，部分失败使用可关闭错误提示。会覆盖既有代码的更新/替换仍保留版本、来源与哈希审阅。
- 每个嵌入组件同时记录两种哈希：`sha256` 锁定原始 `.h5component` ZIP 字节，`contentSha256` 对安全相对路径及解包字节作稳定 canonical SHA-256。
- `contentSha256` 不受 ZIP 压缩、条目顺序和时间戳影响；任一嵌入文件、路径或额外文件变化都会改变它。它不是数字签名、许可证或权属证明。
- 组件矩阵 fixture 在每次 E2E 前强制重建；缺失或陈旧的 ignored fixture 不再静默跳过，也不能拖到 Electron 启动后才失败。

### 3.4 Headless 工程自检

公开命令：

```powershell
npm run --silent validate:project -- <file.h5lesson>
```

命令只读，不启动 Electron、不执行运行时代码、不做真实导出。标准输出是稳定 JSON；不可读/Schema 失败的人类摘要写入标准错误。退出码：

- `0`：完成校验且没有 `error`；
- `1`：归档可读，但 Health 或任一目标预检含 `error`；
- `2`：输入、归档或 Schema 无法完成校验。

结果包含结构化 Schema issues、Project Health、HTML/网页包/PDF/PPTX 四个预检和真实资源/组件上下文。Node 环境中的确定性字宽只产生“估算”警告，不单独阻断；真实浏览器 Canvas 仍可产生确定性溢出错误，最终画面必须经过真实导出和人工像素复核。

## 4. 有意的兼容性决策

用户已明确授权当前尚未投产，旧课例和组件可丢弃，并要求尽可能减少未来负担。因此本轮把 `contentSha256` 设为 Project V8 / PublishedLesson V1 含组件归档的必填字段，没有升高 Schema 版本，也没有增加迁移器。

这是有意的同版本硬断，而不是兼容性遗漏：此前生成、含组件且没有 `contentSha256` 的 V8 归档会被直接拒绝；它们必须用当前组件包重建。无组件工程不受该字段影响。文档、样例、四个主仓包和九包矩阵均已按新合同重建。

## 5. 自动化与制品证据

| 验证项 | 结果 |
| --- | --- |
| `npm run check:ai-capabilities` | 通过 |
| 三配置 TypeScript | 通过 |
| `npm test` | 127 文件 / 799 项通过 |
| `COURSEWARE_E2E_BACKGROUND=1 npm run test:e2e` | 27/27 通过；组件矩阵 2、编辑器 24、render-host 1 |
| `npm run build:desktop` | 通过 |
| `npm run build` | 通过 |
| `npm run dist:win` | Portable 与 win-unpacked 通过 |
| `npx tsx scripts/verify-release.ts` | 16/16 通过 |
| 无弹窗组件导入增量回归 | 外部组件流程 1/1（47.4 秒）；九组件目录 UI/四格式矩阵 1/1（3.9 分钟） |

组件矩阵运行证据：

- 后台窗口隔离：`true`；
- 9 个组件、9 个场景；
- 压力段 25 轮 × 9 场景 = 225 次导航，任一时刻只挂载 1 个组件；
- 预览、单 HTML、网页包均完成 9 场景导航；外部请求和页面错误均为 0；
- PDF 9 页，PPTX 9 页。

关键证据哈希：

| 证据 | SHA-256 |
| --- | --- |
| `artifacts/ai-capabilities/index.json` | `C64ACE4689A00B8E949E6A233758878D01181D2DE08124842C8EA567FF5B2A48` |
| `artifacts/ai-capabilities/generation-evidence.json` | `F6A1687F87C194CD312ED3FF96AD0B0A075BE6E0598D7B3E456EA86A7B9AF1C1` |
| `matrix-build-evidence.json` | `8359B6428579C8B23A4353EC4F0AD5BAFB1BD513DDF12186C802C46188608C5A` |
| `matrix-runtime-evidence.json` | `4136B13E6847CF5786DA5915B11D0C80A15E0BF63ADFB78F089EA7219D11CAA9` |
| 发布核验报告 | `57FD55D112C34A4F9DDA79216A68017C3245ED361DDA80E354FC72545C164A49` |

Windows 制品：

| 制品 | Bytes | SHA-256 |
| --- | ---: | --- |
| `release/ittoedu-courseware-editor-portable-1.0.0.exe` | 103,768,206 | `1B7EEF6445F098FBDE974607C8EC7DC25300C155FA228E03DE65B10DECC68E32` |
| `release/win-unpacked/ittoedu-courseware-editor.exe` | 225,819,136 | `A80B97EC829BD35EF6F831ACD5A7C7EE14F05F62DC45205D619B3BC622D3F959` |
| `release/win-unpacked/resources/app.asar` | 160,862,538 | `95E9F3E35B110FB415A795069983C20BF9B7297930C2D35CC4B20F639D9579ED` |

发布核验时间为 `2026-08-12T15:15:44.635Z`。16 项覆盖版本/产品名、ASAR、隐藏启动、示例工程和组件、字体、单 HTML、PDF、PPTX、离线教师控制器/键盘翻页、组件交互以及 0 网络请求。`release/verification/report.json` 是制品真相来源。

## 6. 组件发布边界

目录 catalog SHA-256 为 `98fb562647a48580c309135fc0f29cf88a682473b71a50995dccb546be2a4459`。九包的 ZIP 哈希和 canonical 内容哈希与最终矩阵逐项一致；运行证据时间为 `2026-08-12T14:42:38.877Z`。

这只证明技术可重现和跨表面行为成立。目录仍保留以下发布阻断：

- 两个语文组件：许可证未知、维护人未指派；
- 七个视觉容器组件：素材许可证未知、素材来源未验证、维护人未指派；
- 九包全部保持 `experimental`，不得升级为 candidate/stable；
- `C:\Users\74755\Documents\courseware-components` 已在本地 `main` 建立首个提交 `af409af376ef6ba6f5eca8e43c846de2f8115d0f`，源码、九包、catalog、来源声明和 attestation 可以由 Git 恢复；当前尚未配置远端，因此还没有远端备份或 CI 来源。

因此九包不属于本次 Windows 正式发布范围。命名空间改为 ittoedu 不会转移源码、素材或许可证权利。

## 7. P7 本地卫生清理未完成

以下路径已通过只读检查确认仍存在：

```text
C:\Users\74755\AppData\Roaming\phaser-courseware-editor
C:\Users\74755\AppData\Local\Temp\phaser-courseware-editor-preview
C:\Users\74755\AppData\Local\Temp\phaser-courseware-editor-e2e
C:\Users\74755\.agents\skills\.html-courseware-editor-managed-skills.json
C:\Users\74755\Documents\HTML课件编辑器\release-rebuild-363091f
C:\Users\74755\Documents\HTML课件编辑器\output\playwright\component-catalog-matrix\electron-profile-22644
C:\Users\74755\Documents\HTML课件编辑器\output\playwright\component-catalog-matrix\electron-profile-39020
```

仓库 `release/` 同时含本轮 ittoedu 制品和历史调试/失败目录。自动清理曾限定到上述精确路径并先验证目标，但删除动作被当前执行环境策略拒绝，实际未删除任何内容，也没有改用其他 shell 或脚本绕过限制。

人工清理时只能删除这些精确旧路径及 `release/` 中的历史 Phaser/1.6/debug 子项，不得宽泛匹配用户 `.h5lesson`、导出文件或整个用户目录。清理完成前，不要分发整个 `release/`；只使用第 5 节绑定哈希的新 ittoedu 制品。

## 8. 下一步门禁

进入工作流/Skill 开发前依次完成：

1. 人工执行并复核第 7 节精确清理；
2. 为 `courseware-components` 配置经用户确认的远端并推送本地基线提交；未提供远端前不擅自创建或发布仓库；
3. 对九个实验包完成权属、许可证、素材来源和维护人审查，不能证明者删除或独立重做；
4. 由用户批准启动 W1 后，建立 `courseware-cases` 并开发 Project V8 实现 Skill；归档的 V7 Skill 不得恢复为当前入口；
5. 用两个不同学科、不同互动机制的冷启动课例验证“生成 → headless 自查 → 修正 → 四格式真实导出 → 人工验收”闭环。

在两个新课例达到人工 `accepted` 前，软件与课例质量必须继续分开报告。
