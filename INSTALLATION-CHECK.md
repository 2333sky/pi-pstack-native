# 安装验证

> **历史记录：** 本文件是早期安装测试记录；包名、SDK 版本和结果属于当时的环境。当前安装方式见 [README](README.md)。

2333 0.6.0-preview.1，Node 24.19.0，官方 Pi SDK 1.1.0。

- 在独立 consumer 目录从实际 tgz 安装：PASS。
- SDK 扩展加载：PASS。
- 注册工具：pstack_agents、pstack_workflow、pstack_graph、pstack_worktrees、pstack_verify、pstack_delivery、pstack_context、pstack_program。
- 安装后的 pstack-runner migrate dry-run：PASS（空 Store，不造验证记录）。
- 安装后的公开 JS API 导入：PASS，fingerprint / buildTemplate / ProgramCoordinator 可用。
- CLI 和公开 API 使用 dist JavaScript；Pi 使用 src/extension.ts 的 SDK loader。
- 未执行真实供应商推理、真实 GitHub merge 或远端 CI。详细边界见 ACCEPTANCE.md。
