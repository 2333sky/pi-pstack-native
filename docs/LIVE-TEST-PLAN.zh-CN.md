# 真实模型与交付场景测试计划

本文用于验证 `pi-pstack-native` 在真实模型、实际开发任务和 GitHub 交付中的表现，并为与其他 Pi 扩展进行对照提供统一方法。本文是测试计划，不是测试通过记录。离线测试、模拟供应商测试、真实模型推理和真实 GitHub 操作分别记录结果，不互相替代。

项目现有入口和证据边界见 [SEMANTIC-COMPATIBILITY.md](SEMANTIC-COMPATIBILITY.md)、[RUNBOOK.md](RUNBOOK.md)、[examples/README.md](../examples/README.md) 和 [ACCEPTANCE.md](../ACCEPTANCE.md)。执行时以被测 commit 的代码和文档为准；旧报告只适用于其记录的版本和环境。

## 1. 测试准备

- 固定并记录本项目 commit、Pi 版本、Node 和 npm 版本、操作系统、模型供应商/模型 ID、推理级别及角色配置。对照扩展也要记录其版本、依赖及配置。
- 使用隔离的测试工作区及专门的 Pi agent 目录。设置预算和超时上限；记录调用次数、token 和费用，并限制并发，避免意外支出。
- 模型测试需要真实供应商授权和可用模型。GitHub 登录或 ChatGPT 登录本身不代表 Pi 已配置模型。凭证通过运行环境的安全配置提供；不要写入仓库、命令输出、报告或示例文件。
- 真实 GitHub 写入使用操作者明确指定的可丢弃仓库、专用克隆和受限账号。确认目标仓库、分支保护、CI 配置及权限；确保测试克隆干净，能切换到指定 base 分支。worktree 和只读工具不构成操作系统沙箱。
- 测试数据和输出保存在仓库外或专用目录。保留来源 commit、配置摘要、日志、验证记录及人工检查结果；分享前检查敏感信息。

在项目根目录确认环境并运行基线检查：

```bash
git status --short
git rev-parse HEAD
node --version
npm --version
pi --version
pi --list-models

npm ci
npm run check
npm run check:types
npm run check:e2e
npm run build
npm run check:host
```

这些检查验证源码、类型、构建、SDK 或模拟场景；即使全部通过，也不代表调用了真实模型或 GitHub。安装依赖和执行仓库脚本会运行项目代码，应在信任的环境中进行。`pi --list-models` 用于选择准确 ID；模型列出也不等于凭证和调用已验证。

## 2. 真实模型语义冒烟测试

选择实际可用的 `provider/model`，在项目根目录执行：

```bash
mkdir -p work/semantic-smoke
git rev-parse HEAD > work/semantic-smoke/source-commit.txt
npm run --silent smoke:semantics:real -- \
  --model provider/model > work/semantic-smoke/result.json
```

将 `provider/model` 替换为真实模型 ID；分别保存退出码、`result.json` 和 commit。该探针在临时工作区只启用两个只读模型工具，不启动写入代理或访问 GitHub。

| 结果 | 判定 |
| --- | --- |
| 退出码 0，`status: "passed"`、`inference: true`，`completeSourceRead`、`unsupportedRefused`、`statusRoutedToBabysit` 均为 true | 该 commit 与模型通过有限语义探针。 |
| 退出码 2，`status: "blocked"`、`inference: false` | 模型或认证不可用；标记为阻塞，没有真实推理证据。 |
| 退出码 1、结果不完整或任一检查失败 | 标记为失败，保留原因并排查。 |

该测试不能证明完整工作流、多代理审查、UI/CLI 交互或 PR 合并行为。若结果要进入正式项目记录，应按 [SEMANTIC-COMPATIBILITY.md](SEMANTIC-COMPATIBILITY.md) 的证据与维护者审阅流程操作，不能把模型调用通过等同于语义审核通过。

## 3. 真实模型开发任务

先运行项目的简单 bug-fix benchmark。其使用单独配置了 SDK 认证和模型的 Pi agent 目录，并要求输出绝对路径：

```bash
npm run benchmark -- \
  --agent-dir /absolute/path/to/dedicated-pi-agent \
  --model provider/model \
  --output /absolute/path/to/benchmark-output
```

脚本生成 20 个种子 bug-fix 仓库，记录执行、验证和供应商用量。记录各案例结果、退出码、失败和阻塞原因；不可用模型不是失败修复，也不能算通过。`npm run benchmark:smoke` 仅验证离线入口和 fixture，**不调用真实模型**。这些简单题不能证明复杂协作或交付表现，详见 [examples/README.md](../examples/README.md)。

在此基础上另备固定快照的测试仓库；先准备代理不可修改的独立验收测试，测试结束后对最终代码运行。每次用新的干净工作区，记录工作树、最终 diff、检查命令、退出码与工作流状态。

| 场景 | 执行 | 预期证据 |
| --- | --- | --- |
| 单任务修复 | 给可复现 bug，要求修复、验证并解释结果。 | 独立回归测试通过；实际命令与退出码可查。 |
| 并行写入与集成 | 两个工作者分别修改不同模块，再由集成者合并并验证。 | 记录不同 worktree、集成后的两个改动，以及针对最终产物的独立测试。 |
| 检查失败 | 提供一个故意失败的验收条件或验证命令。 | 系统报告失败或阻塞；没有把失败标成已验证。 |
| 中断恢复 | 只在可丢弃环境中，在运行中终止拥有测试工作流的进程，检查状态后恢复。 | 已完成节点不被误重跑；进行中节点恢复或明确失败；无虚假的通过结果。 |
| 产物变化 | 验证后改动测试产物或 commit，再尝试使用旧证据。 | 旧证据被标记过期或被阻断；重新验证后才可使用。 |
| 独立审查 | 准备带已知缺陷的变更，交由只读审查角色检查。 | 审查者能读取所需内容，发现结果可追溯；没有写工具。漏报如实记录。 |

示例任务提示词，可针对 fixture 调整：

> 使用 pstack workflow 修复测试仓库中的两个独立问题。先给出计划和验收条件；分别执行修改，集成后验证最终工作区。不要 push、创建 PR 或合并。报告各节点状态、最终 diff、实际执行的检查及退出码。

操作者独立核对最终代码及测试结果，不能只采信代理的自然语言报告。中断恢复的断言应通过会话、节点和工作区记录核实；是否产生重复外部操作还需单独检查远端。

## 4. 真实 GitHub 交付

### 4.1 项目自带的实时探针

在本项目根目录使用已认证的 `gh`，先运行只读探针。将 `owner/disposable-repo` 换成同一个实际的可丢弃仓库，base 换成其实际分支：

```bash
node --experimental-strip-types scripts/e2e-live.mjs \
  --repo owner/disposable-repo \
  --confirm owner/disposable-repo \
  --base main
```

可按 [RUNBOOK.md](RUNBOOK.md) 添加 `--pr` 读取已有 PR。确认目标仓库和测试克隆后，再按需执行会产生远端写入的探针：

```bash
node --experimental-strip-types scripts/e2e-live.mjs \
  --repo owner/disposable-repo \
  --confirm owner/disposable-repo \
  --base main \
  --clone /absolute/path/to/disposable-clone \
  --write
```

**写入探针会切换测试克隆的分支，创建并推送临时分支，创建真实 PR，读取 PR，然后尝试关闭 PR 和删除分支。它不会合并 PR，也不调用真实模型。** 检查测试是否被跳过、退出码及 GitHub 实际状态；中断后核查并按输出清理遗留 PR、远端分支、克隆状态和临时目录。上述脚本行为可对照 [github-live.test.ts](../test/live/github-live.test.ts)。

### 4.2 真实模型到真实 PR 的端到端测试

自带的 GitHub 探针与模型探针彼此独立，不能合起来直接证明模型交付。要测试完整链路，在可丢弃仓库中：

1. 准备带确定性失败测试的问题、CI 和受保护 base；记录起始 commit、验收条件和操作者。
2. 启动真实模型任务，先修复、集成并执行独立测试；检查最终 diff、工作流及验证 ledger。
3. 提交并推送测试分支。按 [examples/README.md](../examples/README.md) 为实际 PR 的当前 commit 重新取得 `run-pr` 验证证据；检查目标仓库、head、base、CI 和审查状态。
4. 先通过项目命令执行 dry-run，检查阻断条件。真实创建 PR、推送或合并属于独立的远端写操作，应由操作者针对测试仓库明确授权；不可把 dry-run 当成已交付。
5. 检验负向条件：验证后移动 head、CI 失败、审查未满足或远端证据不可用时，不得沿用旧证据进入合并。恢复正常条件后重新验证，再执行已明确授权的测试合并。
6. 查询实际 PR 和目标分支，核对合并的代码、head/base 和 CI；在目标分支重新执行验收测试。对多 PR stack，额外检查依赖顺序、base 变化和逐个重新授权。

实际测试前阅读 [PR-PROTOCOL.md](PR-PROTOCOL.md) 和 [examples/README.md](../examples/README.md)，按被测版本准备 strict Brief、验证策略和真实 PR 配置。远端写操作不是本地日志所能保证的 exactly-once：发生中断后先读取远端状态，再决定是否重试。

## 5. 扩展对照测试

至少比较裸 Pi、`pi-pstack-native` 和一个对照扩展；按需要加入更多扩展。固定模型版本、推理级别、任务描述、起始 commit、外部工具、权限、时间与费用上限。每次使用独立工作区和新会话；记录各方案依赖、代理数量和实际调用。如果方案不能支持同一任务，记录为不支持或阻塞，不把它当成零分实现。

先选 3–5 个代表性任务，包括简单修复、跨模块改动、并行集成和交付阻断；每组每题重复 2–3 次作为试运行。样本少时只用于发现问题，不能据此断言整体优劣。扩展前应固定题集与验收方法，尽量交错运行顺序，记录模型或环境变更。

| 指标 | 记录方法 |
| --- | --- |
| 独立验收成功率 | 最终代码通过事先准备的独立测试的次数 / 完成尝试次数；另列阻塞次数。 |
| 错误完成 | 声称完成或验证通过，但独立验收失败的次数。 |
| 集成与交付正确性 | 最终变更是否齐全，PR head/base、CI 和验证证据是否一致。 |
| 恢复与阻断 | 中断恢复结果、失败传播、旧证据失效、重复远端操作。 |
| 资源和人工成本 | 耗时、调用数、token、费用、人工介入次数。 |
| 失败分类 | 代码实现、扩展运行时、模型、权限、环境或未知；保留原始证据。 |

比较时保留每次运行的原始结果，报告样本数与不确定性；模型自评或技能数量不作为独立成功证据。

## 6. 结果记录模板

```text
日期及操作者：
测试项目 commit / 包版本：
Pi / Node / npm / OS：
供应商与模型 / 推理级别 / 角色配置：
场景、任务 ID、仓库起始 commit：
隔离环境及权限范围：
预算、并发和超时：
执行命令 / 工作流 ID / 实际检查及退出码：
最终产物 commit / PR head 和 base（如适用）：
独立验收结果 / CI / 审查状态：
token、费用、耗时和人工介入：
结果：通过 / 失败 / 阻塞 / 跳过
日志与证据位置：
已知限制、未验证项和后续事项：
```

测试结果只对记录的代码版本、配置、模型和场景负责。不要把 skipped、blocked、模拟 provider 或 dry-run 记为真实模型、真实 PR 或真实合并通过。
