# W3 Windows / 离线可移植性工程验证记录（2026-08-13）

> 历史证据。同机 `engineering candidate`，不是当前发布 Gate。

## 1. 结论

本轮把 W3 中可由当前 Windows 主机自动证明的“应用复制、工程移动、组件断源、自包含离线交付、文档启动合同”补成了真实工程验证。结果为 **`engineering candidate`**，不是 W3 完成、不是内部正式版 `accepted`。

自动化已经证明：

- 当前 `win-unpacked` 的 126 个文件、526,075,288 字节被复制到系统临时隔离目录后，全部相对路径、长度和逐文件 SHA-256 一致；目录清单 SHA-256 为 `2B1D31D082E6DA03DE267B7BB970E5755151BD04E51CBF1FC6ED0E474E51D7D0`；
- 复制后的目录版实际 `execPath`、`appPath`、`cwd` 和 `userData` 都位于隔离树，明确配置的外部组件目录不存在；应用仍可启动并打开移动后的 Project V8，工程组件卡和画布实例均可见，外部网络请求为 0；
- Portable EXE 复制前后 SHA-256 均为 `1B7EEF6445F098FBDE974607C8EC7DC25300C155FA228E03DE65B10DECC68E32`；复制后的 EXE 从隔离 `cwd/profile` 启动，加载 `courseware-editor://app/index.html`，未暴露 Node 全局，外部资源为 0；
- 验证器先把 `.h5component` 放入只存在于系统临时目录的唯一外部组件源，再用正式导入/Project V8 API 嵌入工程；随后移动 `.h5lesson`、删除该组件源和作者原路径，再使用正式解析器重开、修改、重存、再次重开；`com.example.sample-counter@4.0.0` 的 manifest、runtime 和 `contentSha256` 均由工程归档恢复；
- 删除组件源后生成的单 HTML 与网页包均从另一个移动目录通过 Edge `file://` 打开，计数器从 0 响应一次点击变为 1，page error、console error、HTTP(S)/WSS 请求均为 0；
- README、用户指南、`启动课件编辑器.cmd`、`package.json` 的 `start/build:desktop` 和 `package-lock.json` 之间的 Windows 源码启动合同静态一致。

以下门禁仍未完成，自动化没有替代或冒充：

- 尚未在**另一台真正干净的 Windows 10/11 x64** 上，从无 `node_modules` 状态按文档执行首次 `npm ci`、双击入口、可见启动和基础人工操作；同机系统临时目录隔离只能证明路径独立，不能证明另一台机器的权限、安全软件、字体、驱动或环境差异；
- W2 两个全新冷启动课例尚未得到有效人类决策、真实成品和人工 `accepted`，因此 W3 产品验收不得完成；
- 本轮只核对了启动文档合同和可移植性相关说明，不替代全仓 README、用户指南、开发规范、Skill 与示例的最终语义审计；
- 可见画面已由自动化截图并经 AI 复核，可作为可读的工程证据；尚未由指定内部审阅人授予 `art candidate` 或 `accepted`。

## 2. 权威实现与运行入口

- `scripts/verify-w3-windows-portability.ts`：真实 W3 隔离验证器；构建/移动工程、删除临时组件源、生成离线发布物、复制并启动 Windows 目录版与 Portable、输出机器报告和截图。
- `scripts/windowsPortabilityEvidence.ts`：逐文件 SHA-256 目录清单、复制等价性和 Windows 绝对路径泄漏检查。
- `tests/unit/windowsPortabilityEvidence.test.ts`：目录内容篡改、缺失/多余文件和大小写/斜杠路径泄漏的回归测试。
- `package.json`：新增 `npm run verify:w3-portability`，先构建当前 Player，再执行真实验证器。
- 机器报告：`release/verification/w3-portability/report.json`。

验证器只删除自身通过 `mkdtemp` 创建的系统临时树。成功后默认清理该树；设置 `W3_KEEP_ISOLATED_WORKSPACE=1` 才会保留。仓库源码、相邻组件库和用户目录不会被移动或删除。

## 3. 验证序列

```text
源码示例组件字节
  → 复制到系统临时“唯一外部组件源”
  → 正式 importComponentPackage
  → 正式 createProjectArchive（组件文件嵌入 .h5lesson）
  → 工程移到另一目录
  → 删除唯一组件源和作者原工程路径
  → 正式 openProjectArchive + componentPackagesFromArchive
  → 修改标题并再次 createProjectArchive / openProjectArchive
  → 生成单 HTML 与网页包
  → Edge file:// 打开并点击内嵌组件

release/win-unpacked
  → 系统临时目录递归复制
  → 126 文件逐一比对 size + SHA-256
  → 从隔离 cwd/userData 启动
  → 指向明确不存在的组件目录
  → GUI 打开上述移动工程

release/*portable-1.0.0.exe
  → 复制并核对 SHA-256
  → 从隔离 cwd/profile 启动
  → 检查自定义协议、preload 冻结、Node 全局隔离和外部资源
```

这里“删除源目录”不是只改配置或断言 ZIP 中存在组件文件：唯一临时组件源在重开工程前由验证器实际删除，后续重开、重存、发布和运行都发生在源目录不存在的状态。

## 4. 机器证据

机器报告状态：`engineering-candidate`，Windows `win32-x64`，Node `v24.14.0`，应用 `ittoedu Courseware Editor 1.0.0`。

| 证据 | 字节 | SHA-256 / 结果 |
| --- | ---: | --- |
| 移动并重存的 `.h5lesson` | 18,000 | `06482B16054CBA43A97AE4576ABAA6758342632F63CA41C5116170153039EAE5` |
| 移动后的单 HTML | 1,706,243 | `2CD74136D7A576735C04848DC0D88464A6E98A1A2B9EE5FD8B13136F609ED6ED` |
| 移动后的网页包 ZIP | 475,908 | `F913408E9EAC20C0BB078349CC4A0987CEB723BDF57B92BBDFB630A41D67157C` |
| 单 HTML 点击后截图 | 49,885 | `4215159F3056D277AE3CE5F9B7B2D2D2320B23067789248D5DBB97C58CA37820` |
| 网页包点击后截图 | 49,885 | `4215159F3056D277AE3CE5F9B7B2D2D2320B23067789248D5DBB97C58CA37820` |
| 复制目录版打开移动工程截图 | 335,426 | `0FA4DEDF0A05A6DAA4FB41CCF3D7DB4435B02DE6B97C4C324158C60B061BC603` |
| 目录版复制清单 | 126 文件 / 526,075,288 字节 | `2B1D31D082E6DA03DE267B7BB970E5755151BD04E51CBF1FC6ED0E474E51D7D0` |
| Portable.exe 复制前后 | 103,768,206 字节 | `1B7EEF6445F098FBDE974607C8EC7DC25300C155FA228E03DE65B10DECC68E32` |

持久证据位于 `release/verification/w3-portability/`：

- `report.json`
- `moved-self-contained.h5lesson`
- `moved-offline.html`
- `moved-web-package.zip`
- `moved-single-html.png`
- `moved-web-package.png`
- `moved-unpacked-opened-project.png`

`release/` 是本地构建证据目录且不随源码提交；可复现的权威入口是脚本、测试和本记录，不能只凭某次本地制品宣称通过。

## 5. 实际命令与结果

2026-08-13 在当前工作树执行：

1. `npm run --silent typecheck`
   - 结果：退出码 0；Renderer/Player、Main/Preload 与 E2E 三配置类型检查通过。
2. `npx vitest run tests/unit/windowsPortabilityEvidence.test.ts`
   - 结果：1 个测试文件、2 项测试全部通过。
3. `npm run --silent verify:w3-portability`
   - 结果：退出码 0；Player 生产构建通过；7/7 项真实隔离检查通过；系统临时隔离树在报告写入后清理。
4. `npm run --silent validate:project -- release/verification/w3-portability/moved-self-contained.h5lesson`
   - 结果：`status: valid`，Project V8、1 场景、1 个组件包；Project Health 和单 HTML/网页包/PDF/PPTX 预检均为 0 error / 0 warning / 0 info。
5. `git diff --check -- scripts/windowsPortabilityEvidence.ts scripts/verify-w3-windows-portability.ts tests/unit/windowsPortabilityEvidence.test.ts package.json`
   - 结果：退出码 0。

本记录没有重跑全量 Vitest、Electron E2E 或 Windows 打包；它复用当前已存在且通过的 1.0.0 `release/win-unpacked` 和 Portable 候选，并专门补足此前缺失的移动/断源证据。全量软件门禁仍以最近一次全量验证记录和最终 W3 复验为准。

## 6. W3 门禁映射

| W3 门禁 | 本轮证据 | 当前状态 |
| --- | --- | --- |
| 一台干净内部 Windows 按文档启动 | 文档/CMD/package/lockfile 静态一致；同机隔离目录版与 Portable 均真实启动 | **部分完成**；仍需另一台干净 Windows 人工执行 |
| Project V8 移动、重开、重存 | 删除组件源后两次正式解析，移动后修改并重存；`validate:project` 通过 | **自动化通过** |
| 本地组件库断开后工程完整 | 唯一临时组件源实际删除；manifest/runtime/hash 从 `.h5lesson` 恢复；复制后的 GUI 可见 | **自动化通过** |
| 单 HTML、网页包移动和离线打开 | Edge `file://`，真实组件点击，page/console/network 均为 0 | **自动化通过** |
| PDF/PPTX 全链路 | 本轮工程预检为绿色；既有发布验证有真实 PDF/PPTX | **本轮未重新导出**；最终 W3 仍需合并全量证据 |
| 两个冷启动课例人工 `accepted` | 无 | **未完成，硬门禁** |
| 文档只描述正式版真实能力 | 只核对 Windows 启动与可移植性相关合同 | **部分完成**；仍需全仓最终语义审计 |
| 内部正式版人工产品验收 | 自动化明确限制为 `engineering candidate` | **未完成，硬门禁** |

因此，本轮已经关闭 W3 的“同机工程/应用可移植性自动化证据缺口”，但不能关闭 W3 里程碑。下一步仍是：完成 W2 两课例并取得人工 `accepted`；在另一台真正干净的 Windows 上按文档完成首次启动与可见冒烟；合并全量构建/E2E/四格式/文档审计后由指定人类签署内部正式版结果。
