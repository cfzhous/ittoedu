# T09 — Player、发布与导出一致性

> Wave：2，可与 T05–T08 并行
> 依赖：T02/T03 的稳定动作与课程结构合同
> Surface ownership：Flow host 由 T07，Spatial host 由 T08

## 1. 可见结果

真实 Published Course Player 按统一 location 顺序播放 Slide、Flow、Spatial；教师控制台、场景目录、进度、声音、重播/重置和全局层投射一致；HTML、网页包、PPTX、PDF/DOCX 与编辑工程使用同一 producer 真相。

## 2. 独占文件

- `src/player/PublishedCourseApp.ts`
- `src/player/ScenePickerOverlay.ts`
- `src/player/surfaces/mixed/**`
- `src/player/surfaces/CoursePlayer.ts`
- `src/player/surfaces/slide/**`
- `src/player/AudioManager.ts`
- `src/player/renderTeacherController.ts`
- `src/player/teacherControllerDom.ts`
- `src/player/teacherControllerRuntimeSession.ts`
- `src/player/TeacherEscapeControls.ts`
- `src/renderer/export/course/**`
- 对应 Player/export 单测

不修改 Flow/Spatial host、App/store/editor UI、Schema 或生成目录。

## 3. 必须闭合

### 3.1 跨 surface 导航

- 场景目录按 `locations` 列举三类内容，不再只过滤 `slide-scene`。
- 上一/下一、目录选择和进度按统一 location 顺序；active location 决定 host。
- Mixed 切换时销毁旧 surface 会话，防止事件、音频、selection 或 camera 泄漏。
- 重播/重置只作用当前 location；课程级声音与进度持续一致。

### 3.2 教师控制台运行态

- 动作集与 UI 规范一致，不出现“定位”或控制台内“试运行”。
- 折叠状态与发布配置一致；运行会话临时开合不污染工程。
- Spatial host 获得真实 audio change 与 course progress source；Flow/Slide 同样监听统一课程会话。
- global controller 对适用 location 投射，同一稳定地址不会产生重复动作。

### 3.3 发布/导出

- `buildPublishedCourse` 是 HTML/网页包/Player 的共享 producer。
- global/surface/page/state/world 内容按 owner/visibility 正确物化。
- HTML/网页包资源寻址、Runtime API 2/3、Component API 4 保持兼容。
- PPTX/PDF/打印对不支持的动态内容使用明确静态占位或 warning，不静默丢失。
- Flow DOCX 导出当前 Flow 页面真实语义结构；文件名避免覆盖。
- V8 只经显式导入迁移，不成为发布输入默认格式。

## 4. 不做

- 不改编辑器 UI 或 store 保存链。
- 不把 Runtime/Component 伪装成 Focusky 完成度。
- 不手工修改 `dist-player`、示例 `course.html` 或 output。
- 不运行 build 来证明单元改动。

## 5. 最小验证

```powershell
npx vitest run tests/unit/scenePickerOverlay.test.ts tests/unit/publishedCourseSpatial.test.ts
npx vitest run tests/unit/teacherControllerRuntimeSession.test.ts tests/unit/audioManager.test.ts
npx vitest run tests/unit/coursePublishPipeline.test.ts tests/unit/multiSurfaceExports.test.ts
npx vitest run tests/unit/exportPreflight.test.ts tests/unit/webPackageExport.test.ts
git diff --check -- src/player/PublishedCourseApp.ts src/player/ScenePickerOverlay.ts src/player/surfaces/mixed src/player/surfaces/CoursePlayer.ts src/player/surfaces/slide src/player/AudioManager.ts src/player/renderTeacherController.ts src/player/teacherControllerDom.ts src/player/teacherControllerRuntimeSession.ts src/player/TeacherEscapeControls.ts src/renderer/export/course
```

只运行触及组。禁止 build、typecheck、全量测试、E2E 和生成 artifact。

## 6. 验收

- Mixed 场景目录真实列出三类 location。
- Spatial/Flow/Slide 的控制器声音和进度不再钉死初值。
- 全局层和控制器投射不重复、不丢失、不改变工程。
- 每种导出对相同项目结构有可解释结果。
- 需要 App/store 试运行接线时提交给 T10。

## 7. 交付记录

尚未执行。

