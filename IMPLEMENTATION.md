# 2333 0.6.0-preview.1：方案与实现边界

> **历史记录：** 本文件记录早期方案和实现边界；当前实现及兼容状态以 [运行时参考](docs/REFERENCE.md) 和 [语义兼容说明](docs/SEMANTIC-COMPATIBILITY.md) 为准。

本包基于用户上传的 0.3.4 源码，参照 2026-10-10 的增强 PRD。沿用 Pi AgentSession 与原 DAG 引擎，不另建调度器。版本使用 Preview：本地行为测试不能替代真实供应商和真实 GitHub 的交付验收。

## 相比 PRD 的改进

1. 新协议对象和审计事件共用一个带 revision 的原子 JSON envelope。短锁、临时文件 fsync、rename 和目录 fsync 形成明确提交边界；验证日志另存，Ledger 引用 checksum，日志缺失或损坏不通过。不宣称多文件事务或远端 exactly-once。
2. 将 Call 的执行完成、当前 Artifact 的确定性验证、TaskReport 的接受与远端交付分别处理。过去节点的 artifact 变 stale，不应导致已经重新验证的后继产物永远无法完成；最终验收检查 DAG 终端产物，前驱验收在派发依赖时检查。
3. Git 指纹包含完整 commit SHA、tree、index tree、源文件字节、可执行位、symlink target、非 ignored untracked 文件。工作树共享 common git dir 身份，不把两个独立仓库的相同 SHA 视为一个产物。带冲突索引、submodule 或无法读取的文件 fail closed。
4. Runner 使用精确 argv allowlist、无 shell、独立环境、截断脱敏日志、超时和父进程连接监督。验证前后检查整个指纹，验证期间发生写入时只会得到 stale。
5. Merge 既重读 Frontier，又通过 `gh pr merge --match-head-commit` 校验期望 head；授权绑定 stack、generation、digest、单个 PR，五分钟有效且请求前消费。远端已 merge、本地记录失败时，恢复读取远端，不重发旧授权。
6. 模型评分不作为机器验收。Arena 的 evaluation / selection、Review findings 和 partition coverage 使用结构化 Report 校验；模型 family 独立性必须显式提供映射，不根据供应商名猜测。

## 实际可用能力

| PRD | 实现入口 | 边界 |
|---|---|---|
| FR-01 Contract | `contracts/brief.ts`；workflow strict / brief；pstack_verify contract/revise | scope 做开始与结束检查；不是操作系统写入沙箱。运行中不允许偷偷改 Brief；停止后显式修订，恢复加载当前版本。 |
| FR-02 Gates | `verification/runner.ts`；command/file/diff/test-report/human-approval/llm-review | 默认没有任何 command 授权。LLM review 仅咨询；人工批准须 CLI 显式操作。JUnit 支持标准 testsuite 属性和简单结果，不支持全部 XML 扩展。 |
| FR-03 Artifact/Ledger | `fingerprint.ts`；verify；ledgerCurrent；invalidation | 指纹失配立即拒绝，历史 Ledger 不覆写；显式 invalidation 事件可审计。只忽略 Git ignore 规则所排除的 untracked；验收关键输入不能放到 ignore 中。 |
| FR-04 Frontier/Shipping | `delivery/*`；pstack_delivery；CLI ship | 首期 GitHub CLI；只合并最低未合并且已验收 PR；默认 dry-run。需要实际仓库 branch protection / merge queue 保证服务端 base/CI/review 的最终约束。 |
| FR-05 Program/Playbooks | ProgramCoordinator、pilot、rolling window、Inbox、close；PR prepare | Program 结束谓词为 all-units-verified。跨 Unit 共同交付须另有 Integrator Workflow；不把独立 Unit 全通过等同于合并产物通过。 |
| FR-06 Templates | buildTemplate / workflow template / plan | Arena、race、partition、Review、autopilot-stack/full 都编译为现有 DAG；失败 panel 明确阻断，不隐藏失败、不自动降级。 |
| FR-07 Models/Budget | models panels/workflows、node thinkingLevel/budget、host usage | fail-closed model selection；运行中监测，预算后不派发新节点。单个已发出的模型响应可能超预算，不能承诺供应商硬计费上限。 |
| FR-08 Context | pstack_context、pstack-handoff | 从 Store 重建索引和 current evidence；可提供 watermark。不是接管 Pi 的自动 compaction，也不以摘要代替事实。 |
| FR-09 Runner | CLI run；SDK explicit agentDir；lease/fencing | 扫描显式 workflow allowlist；凭据缺失 blocked；租约失效暂停派发并请求取消。FileLock 限定本机共享文件系统，不支持跨主机分布式租约。 |
| E10 Quality | 原回归、protocol 故障测试、SDK lifecycle、consumer smoke、20-task benchmark harness | SDK 测试使用真实 SDK + loopback provider。20 个真实模型任务基准已提供，尚未运行，不包含 Cursor 实测对照。 |

## 已知不能从本地测试推导的结论

- 不声称真实 LLM 已成功执行全部复杂任务，也不声称等价于 Cursor Cloud Agent 或私有 API。
- GitHub adapter 的远端调用需 `gh` 与用户授权；本次未使用真实 GitHub token，远端路径由模拟 Provider 覆盖。
- 命令 allowlist 不能证明项目脚本没有恶意行为。严格任务面对不可信代码，应在操作系统/容器沙箱内运行整个 Pi/Runner；不会把本地受限进程伪装为容器隔离。
- symlink target 被纳入快照，外部 target 内容不纳入；file gate 拒绝越界 symlink。Git LFS 工作区 hash 使用实际 checkout 字节；跨机器路径身份和大小写差异不提供全局内容寻址保证。
- 状态锁基于本地文件系统，不保证网络文件系统语义。协议 envelope 随历史增长；当前适合中小型本地项目，未完成百万事件压测。
- 自动 push、force-push、deploy、删除远端分支未提供。开放 PR 以已验收 commit 和实际 remote branch SHA 为前置，授权 CLI 操作仍需远端状态核查。
