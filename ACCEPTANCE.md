# 2333 0.6.0-preview.1 验收报告

日期：2026-10-10。基线：用户上传的 0.3.4 源码及增强 PRD。交付性质：Preview，未发布到 npm，未操作真实远端 PR。

## 已通过

| 检查 | 结果 | 证明边界 |
|---|---|---|
| `npm run build` | PASS | 编译 JavaScript、声明及 CLI，避免 node_modules 类型剥离限制 |
| `npm run check:types` | PASS | 已安装 TypeScript 和官方 Pi SDK 的严格类型检查 |
| `npm run check:syntax` | PASS | JS/TS 源码语法 |
| `npm run check:package` | PASS | 官方 Pi peer、包策略 |
| `npm run check:parity` | PASS | 51 skills / 23 playbooks 的登记完整性；不是全量 Cursor 行为证明 |
| `npm test` | **94 / 94 PASS** | 原 62 项回归 + 32 项协议、负向及故障测试 |
| `npm run check:host` | PASS | 真实 SDK 的 AgentSession 创建，未执行外部模型推理 |
| 真实 SDK 生命周期 | PASS，包含在测试中 | 真实 AgentSession + 本地 loopback provider；加载 8 个工具，成功、401、取消、恢复 |
| Git / Ledger | PASS | staged / unstaged / untracked / worktree / 仓库隔离 / source 变更 / log 篡改 |
| Shipping | PASS，模拟 Provider | 下层未合并阻断上层；head 变化；TOCTOU；单次授权；远端已 merge 后本地异常的恢复 |
| Program | PASS | 12 Unit 的 pilot / rolling window / Inbox / Store 恢复 / close / orders / pause-resume |
| Crash gate-start | PASS | 验证进程被 SIGKILL 后，不产生通过台账；重新启动能重新验证 |

安装包已在独立 consumer 中安装：真实 Pi SDK 加载 8 个工具通过；编译后 CLI 的 migrate dry-run 通过；公开 JavaScript API 导入通过。结果见 INSTALLATION-CHECK.md。

## 实现范围

实现入口与实际功能见 IMPLEMENTATION.md 的 FR-01 到 FR-09 对应表。使用说明、命令授权和样例见 examples/README.md。新命令默认 opt-in；无完整严格契约、无权限、无当前证据、远端状态未知都阻断，不用 Agent 的自然语言声明生成通过证据。

关键改进：原子协议状态+审计 envelope；工作区与 index 双指纹；验证子进程监督器；严格 report；末端产物重新验收；服务端期望 head 校验；一次性授权；专用 typed DAG 而非模式别名。

## 仍未通过外部发布门槛

- 未执行真实供应商的认证推理任务；没有真实模型成功率、成本对照或 Cursor 优劣数据。
- 未使用真实 GitHub PR 执行 create/merge；CLI adapter 与分支保护的端到端行为须在隔离测试仓库继续验证。
- 20 个真实模型 bug-fix 基准与 runner 已提供，**未运行**。复杂跨模块、Arena、PR 栈的横向真实任务研究仍待追加。
- 未在 Node 22.19 实际运行本次测试；本次环境为 Node 24.19.0。已提供双版本 CI 配置，CI 尚未被远端运行。
- 不能把 allowlist / Git Worktree 当作 OS 沙箱；未进行跨主机租约、百万事件或所有 LFS / submodule 情况的兼容性验收。

这些缺口是使用 Preview 标记的理由。不能把本报告理解为“PRD 所有发布验收条件均已满足”或“所有远端/模型路径已验证”。
