# R0-B 体验证据索引

> owner：R0-B
> 基线：`C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` @ `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
> 操作面：Vite 壳 `http://127.0.0.1:5173/`（agent-browser `--session r0b --headed`）
> Electron：已从产品 worktree 运行，但启动时无 `--remote-debugging-port`；本任务禁止杀进程/重启，故未能连接桌面 CDP
> 证据目录（产品 worktree，不提交任务包）：`C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild\output\r0-baseline-evidence\`

这些截图/录像只用于资格审查，不定义新的像素 baseline。

## 关键五张 + 控制器录像

| 用途 | 文件 | 实际看到的内容 |
|---|---|---|
| 完整主界面 | `01-main-shell.png` | 简洁模式整壳：顶栏、场景/全局层、1280×720 白画布、底部教师控制台、元素常用/媒体、场景状态、状态栏「已创建新课件」 |
| MediaTab | `05-mediatab.png` | 专业模式「元素 → 媒体」内嵌 MediaTab：导入图片/声音/视频、全局声音设置、声音库 0、视频素材 0、图片素材 0 |
| 动画/互动入口 | `03-animation-interaction.png`、`03b-interaction-editor.png` | 简洁「出现动画」淡入/滑入/缩放；专业 InteractionEditor 场景规则、模板「进入场景后依次出现」、规则列表 |
| 图层/属性 | `04-layers-properties.png` | 紧凑图层行（显隐/锁/复制/删除）、画布文字八向手柄+旋转柄、竖排中文「基线核验中文」、教师控制台 |
| 控制器 | `06-controller-properties.png` | 已选「教师控制器」：几何、全局挂载/逐场景可见范围、主题、折叠、按钮动作、上移/下移 |
| 控制器拖缩录像 | `07-controller-resize.webm` | 尝试指针拖缩；过程中误触导致工程被新建重置，不能单独当作稳定八向合同 |

## 补充证据

| 文件 | 用途 |
|---|---|
| `02-open-desktop-error.png` | 在 Vite 壳点击「打开」后的正确拒绝：桌面功能不可用，需 `ittoedu-courseware-editor.exe` |
| `08-after-reset.png` | 指针拖缩误触后的全新工程，证明「新建」内存路径会回到空白课件 |

## 操作环境限制

- cursor-ide-browser 当时无法创建/导航标签页；改用 agent-browser 打开同一 Vite 地址。
- 已运行 Electron 无 CDP 端口（只监听 Vite `5173`）。保存/打开/另存/恢复/整课预览窗口/媒体文件选择/组件目录均未在真实桌面对话框中完成。
- Phaser 选择手柄不是 DOM 节点；坐标拖一次曾点到「新建」。画布指针八向/框选/平移因此记为受阻或未执行，不是源码缺失。
