# T6-NAV HANDOFF

- 范围：在 README / docs 导航与命令表接入 `docs/contracts/` 以及 `generate:contracts` / `check:contracts`；计划口误 12.4→12.5
- 合同是否变化：否
- 分支 / SHA：`cursor/t6-nav-docs-de5c`（前两次工人空跑后由父代理按 T6_NAV.md 机械插入）
- 允许列表外改动（必须空，除非重命名机械 import）：无
- 最小验证命令与结果：
  - `git diff --check`（干净）
  - 四份文件均保留「不宣称 Editor 1.0 已发布 / 须教师 accepted」
- 未验证（交给 T6）：全量 test / typecheck / e2e / desktop
- 停下来的原因（若有）：无
- 下游：T6 冻结切片不必再重写产品故事
