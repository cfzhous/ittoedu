HANDOFF
- task: R0-B
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 只读操作真实 V8 App（Vite 壳 + 已运行 Electron 未能连 CDP）。已填 `V8_CAPABILITY_LEDGER.md` 的「V8 真实入口/操作」与「R0 基线」列，并追加 7 条 f272756 可达但原表未列的能力。无产品源码改动。未发现必须阻断 R0 的产品回归；若干桌面对话框与 Phaser 指针操作为任务环境受阻，不是 `baseline-fail`。
- owned files changed: `docs/tasks/v8-to-v9-rebuild/handoffs/R0-B.md`；`docs/tasks/v8-to-v9-rebuild/artifacts/V8_CAPABILITY_LEDGER.md`；`docs/tasks/v8-to-v9-rebuild/artifacts/R0_B_EVIDENCE_INDEX.md`。产品 worktree 仅新增未跟踪证据目录 `output/r0-baseline-evidence/`（不提交任务包）。
- donor files/functions consulted: 只读对照入口标签（`TopToolbar`、`ElementsTab`、`MediaTab`、`RightSidebar`、`App.tsx` desktopApi）。判定一律以实际 UI 点击为准，不用源码存在代替可达。
- focused validation command: 无 Vitest（任务纯审计）。计划目录 `git diff --check -- docs/tasks/v8-to-v9-rebuild`
- validation result: 待本 HANDOFF 末尾 diff check。未跑 typecheck / 全量 test / build / E2E / 视觉基线重捕。
- validation entry / fixture / backend: 产品 worktree 默认 V8 `App` / V8 `ProjectDocument`；操作面为 `http://127.0.0.1:5173/`
- validation proves / does not prove: 证明壳层菜单、场景/状态、文字/公式、图层行、MediaTab 位置、简单/专业动画、控制器属性、当前位置试运行、导出预检在 f272756 真实 UI 可达。不证明 Electron 文件对话框、保存重开、媒体入画布命中、组件实例 props、Phaser 指针八向合同、格式隔离。
- narrow UI smoke, if authorized: 本任务的验证就是逐项真实 UI 操作，见下方清单。
- INTEGRATION_REQUESTS: 无
- DECISION_REQUESTS: 无（置顶/置底与自定义右键在 f272756 **未找到**独立入口，记入账本交 R0-G，不自行改总纲）
- remaining risks / untested full checks: 未跑 typecheck、全量 Vitest、build、E2E、三视口视觉回归。Electron 未带 remote debugging，打开/保存/另存/恢复/整课预览窗口/媒体与组件文件选择未在桌面完成。框选、画布平移、方向键位移、图层列表拖排、Delete/剪切、组件 props/variant 未做成。
- rollback point: 删除计划侧本 HANDOFF / 账本 R0 列改动 / 证据索引；产品 worktree 可删 `output/r0-baseline-evidence/`。不 reset/clean 已有修改。
- execution state: lane_candidate
- integration state: n/a
- quality state: unverified
- canonical product worktree: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild`
- exact baseline SHA: `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- launch command/result: 复用 R0-A 已运行的 `npm run dev`；Vite `http://127.0.0.1:5173/` 标题「未命名课件 - 互动课件编辑器」。Electron `--app-path` 指向产品 worktree，userData 仍为共享 `ittoedu-courseware-editor`。未重启、未 npm ci/test/build。
- V8 capability inventory summary: 见下方计数与账本。核心壳层、场景/状态、文字竖排与自适应宽度、公式、图层锁定隐藏复制、简单出现动画、专业 InteractionEditor、Runtime 模板、全局控制器属性、当前位置试运行、导出预检为 `baseline-pass` 或入口通过。桌面对话框类与媒体入画布为 `受阻`。无 `baseline-fail`。
- baseline screenshots/video locations: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild\output\r0-baseline-evidence\` ；索引 `docs/tasks/v8-to-v9-rebuild/artifacts/R0_B_EVIDENCE_INDEX.md`
- format/recovery isolation result: n/a，交 R0-D
- teacher decision: 待 R0-G

## 操作面与限制

- cursor-ide-browser 无法建标签页；改用 agent-browser 打开同一 Vite 地址。
- `agent-browser --auto-connect` 失败：已运行 Electron 无 `--remote-debugging-port`，禁止重启故桌面对话框一律 `受阻`。
- 不得把本结果写成 `art candidate` 或 `accepted`。

## 必查清单（通过 / 回归 / 未找到 / 受阻）

计数口径：把任务卡子弹拆成可点选动作。`回归` = 产品坏了（`baseline-fail`）。环境限制不算回归。

| 项 | 结果 | 事实 |
|---|---|---|
| 新建 | 通过 | 启动即为未命名课件；误触新建后状态「已创建新课件」 |
| 打开 | 受阻 | 按钮可达；Vite 正确报「桌面功能不可用」；Electron 对话框未连上 |
| 保存 | 受阻 | 同上 |
| 另存 | 受阻 | 专业顶栏与简洁「更多」均有入口；写文件未做 |
| 恢复 | 受阻 | 本会话未弹出恢复框；读 recovery 需 desktopAPI |
| 最近工程 | 通过 | 「最近」菜单打开，空态「还没有最近工程」 |
| 试运行 | 通过 | 「当前位置试运行」进入 Player iframe |
| 发布 | 未找到 | 无独立「发布」按钮；交付走导出 |
| scene 新增 | 通过 | 新增场景 2，场景 1 仍在 |
| scene 复制 | 通过 | 「场景 1 副本」 |
| scene 重命名 | 通过 | 改为「副本重命名」 |
| scene 排序 | 通过 | 拖排后副本到顶部 |
| scene 删除 | 通过 | 确认框「删除场景？」后剩 2 个 |
| 命名状态 | 通过 | 「状态 2」改名为「讲解态」 |
| override | 通过 | 「初始，…4 项覆盖」 |
| 单选 | 通过 | 选中文本/公式/矩形/控制器 |
| 多选 | 通过 | Ctrl+A「已选 2 个图层」 |
| 框选 | 未执行 | 未完成空白处拖框 |
| 拖动 | 受阻 | Phaser 手柄非 DOM；坐标拖一次误触新建 |
| 八向缩放 | 受阻 | 八个手柄可见且属性宽高可改；指针八向未稳定完成 |
| 旋转 | 通过 | 属性 15°，截图可见旋转柄与倾斜文字 |
| 方向键 | 未执行 | 已按 ArrowRight，状态栏无位移确认 |
| zoom | 通过 | 100% → 110% → 适合窗口 |
| pan | 未执行 | 提示空格/中键/Ctrl+滚轮，未实际平移 |
| 文字双击 | 通过 | 「编辑局部文字格式」打开画布 contenteditable |
| IME/中文 | 通过 | 写入「基线核验中文」（非系统 composition 探针） |
| 选区局部格式 | 通过 | 局部加粗等工具条可达并点击 |
| 竖排 | 通过 | 「竖排（列从右向左）」 |
| 自适应宽度 | 通过 | 竖排后「宽」禁用，溢出「自动增宽」 |
| 公式 | 通过 | 插入并打开公式属性编辑器 |
| 媒体库入口 | 通过 | 元素内嵌 MediaTab，非顶级页签 |
| 声音库入口 | 通过 | 同一 MediaTab 声音库 0 + 全局声音设置 |
| 图片/视频入画布 | 受阻 | 导入走 desktopAPI |
| 媒体命中/属性 | 受阻 | 无导入素材 |
| 试听与引用 | 受阻 | 无声音素材 |
| 图层紧凑行 | 通过 | 单行显隐/锁/复制/删除 |
| 图层拖排 | 未执行 | 手柄与文案存在，未拖成 |
| 图层上/下移按钮 | 未找到 | 无独立「上移一层」；dnd 提示用拖 |
| 置顶/置底 | 未找到 | f272756 UI 无该标签按钮 |
| 锁定 | 通过 | 按钮变为「解锁图层」 |
| 隐藏 | 通过 | 「显示图层」变为未勾选 |
| 图层复制 | 通过 | 「已复制“文本”」，插入错开 |
| 图层删除入口 | 通过 | 行内删除按钮可达（未确认删光） |
| 简单出现动画 | 通过 | 淡入 |
| 专业自动化 | 通过 | 模板后「2 条非点击规则」 |
| InteractionEditor | 通过 | 专业「互动与动画」整页 |
| Component 导入 | 受阻 | 外部导入需桌面；内置库 0 |
| Component 插入/替换/props | 受阻 | 无可加入的包 |
| Runtime 作者入口 | 通过 | 「已创建场景运行时模板」API 2 |
| 控制器外观 | 通过 | 画布底部教师控制台 |
| 控制器选择 | 通过 | 「添加或定位教师控制器」 |
| 控制器八向指针 | 受阻 | 见拖缩录像，未形成稳定合同 |
| 控制器主题 | 通过 | 背景/强调/文字/圆角/按钮动作 |
| 控制器折叠 | 通过 | 试运行「收起教师控制器」 |
| 运行态动作 | 通过 | iframe 内上一/下一/目录/重播/声音/全屏 |
| 快捷键 | 通过 | Ctrl+A/C/V |
| 右键菜单 | 未找到 | 画布右键无自定义菜单 |
| 剪贴板 | 通过 | 复制 2 层、粘贴后 4 个节点 |
| 焦点保护 | 通过 | 局部编辑时部分快捷键被挡；Ctrl+A 仍会退出编辑 |
| 整课预览 | 受阻 | 桌面功能不可用 |
| 导出入口 | 通过 | 四格式菜单 + 预检对话框 |

**计数：通过 40 · 回归 0 · 未找到 4 · 受阻 13 · 未执行 4**

未找到：独立发布按钮、图层置顶/置底、图层独立上/下移按钮、自定义右键菜单。
受阻：打开/保存/另存/恢复、媒体入画布与命中属性试听、组件导入插入、整课预览、画布指针拖与八向、控制器指针八向（环境/自动化，非产品回归）。
未执行：框选、pan、方向键位移确认、图层列表拖排。

## 必须阻断 R0 的回归？

否。没有 `baseline-fail`。空组件目录、桌面对话框失败、指针误触新建都是本任务「不得重启 Electron / Vite 无 desktopAPI / Phaser 非 DOM 手柄」造成的受阻，不是 f272756 相对自身的能力消失。置顶/置底与自定义右键是基线事实缺口，交给 R0-G，不在本任务改产品。
