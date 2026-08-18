# Project V8 Headless 构建

先读取 `artifacts/ai-capabilities/index.json.headlessBuild`，再按需打开它列出的真实入口。入口变化时以生成契约和源码为准，不手抄兼容层。

初建流程：

1. 用 `createProject`/`createScene`/节点工厂建立稳定 ID；
2. 公式使用当前 `createFormulaNode` 与结构化 AST，不用字符串或图片替代；
3. 用当前 Project Schema 解析完整工程；
4. 组件包通过 `importComponentPackage` 校验并嵌入；
5. 用 `createProjectArchive` 生成 `.h5lesson`；
6. 立即 `openProjectArchive` 回读，并运行 `validate:project`。

Case-specific `implementation/build.ts` 可以硬编码已批准的本课内容，但不得建立低能力中间 DSL。Builder 只服务首次可复现生成；人工编辑后使用 `patch.ts` 读取实际归档，按稳定 scene/node/binding ID 修改最小范围，Schema 通过后另存，再核对未触及对象 ID 与哈希。

不要用版本号替换冒充迁移，不生成 Project V1–V7 字段，也不直接依赖未受信组件源码。
