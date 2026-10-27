# pi-pstack-native 中文说明

[English](README.md)

pi-pstack-native 是将 [pstack](https://github.com/cursor/plugins/tree/main/pstack) 的工作流适配到 Pi Coding Agent 的扩展。它提供子代理、工作流、Git worktree 隔离和验证记录，适合将复杂任务拆分、执行并检查结果。

本文提供中文使用说明；扩展的命令名、部分界面选项和错误信息目前仍为英文。

项目由社区独立维护，与 Cursor 及上游 pstack 维护者无隶属或背书关系。当前上游源码基线为 pstack 0.15.32；具体兼容范围和未完成的语义审查见 [PARITY.md](PARITY.md) 和 [语义兼容说明](docs/SEMANTIC-COMPATIBILITY.md)。

## 项目亮点

- **专职子代理**：为实现、代码探索、只读评审和结果整合等任务分配独立 Pi 会话，并按角色配置模型。
- **并行协作**：用工作流表达任务依赖；并行写入可使用独立 Git worktree，再由 integrator 汇总。
- **可恢复执行**：持久化子会话、工作流状态和日志，支持中断后检查和恢复，避免自动重跑已完成节点。
- **可核验结果**：使用任务合同、验证关卡、产物指纹和证据记录，区分代理的完成声明与实际验证结果。
- **pstack 适配**：保留固定上游版本的 Skills 和 playbooks，并明确说明 Pi 平台上的替代方式和不支持的能力。

这些能力用于组织和检查工作，实际结果仍取决于模型、任务、配置和验证证据。

## 安装

需要 Node.js **22.19 或更新版本**、兼容 `@earendil-works/pi-coding-agent` **^1.4.0** 的 Pi，以及已在 Pi 中配置好的模型和凭证。Git 安装还需要 Git。

```bash
pi install git:github.com/2333sky/pi-pstack-native
```

安装后启动或重启 Pi。

更新和卸载：

```bash
pi update git:github.com/2333sky/pi-pstack-native
pi remove git:github.com/2333sky/pi-pstack-native
```

在安装命令后加 `--local` 可仅为当前项目安装；Pi 需要先信任该项目。未固定版本的 Git 来源在更新时跟随仓库默认分支，也可以通过 `@` 后接 Git 标签或提交固定版本。目前没有发布 npm 包。

## 初次使用

在 Pi 会话中运行：

```text
/setup-pstack
```

命令先设置子代理推理等级，再为每个角色选择模型。`inherit-parent` 和 `auto` 模型选项都使用父会话的模型；推理等级的 `inherit-parent` 使用父会话的推理等级。显式等级包括 `off`、`minimal`、`low`、`medium`、`high`、`xhigh` 和 `max`；模型支持情况各不相同。选择不兼容的模型时，设置界面会要求重新选择。任一步取消都不会写入配置。

在 Git 项目中，可以用中文描述任务和验收要求：

```text
/poteto-mode 修复登录按钮的问题，运行相关测试并说明验证结果
```

Poteto Mode 在当前会话中保持开启；使用 `/poteto-mode off` 关闭。也可以让 Pi 用子代理检查代码、实现修改或评审结果。扩展会根据任务和模型的实际调用来执行，不保证每条请求都会启动子代理。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `/setup-pstack` | 选择子代理角色模型和推理等级 |
| `/poteto-mode <任务>` | 开启 Poteto Mode 并执行任务 |
| `/poteto-mode off` | 关闭当前会话的 Poteto Mode |
| `/pstack status`、`/pstack on`、`/pstack off` | 查看或切换 pstack Skill 的发现状态 |
| `/pstack-runtime` | 查看扩展运行时与依赖状态 |
| `/pstack-agents` | 查看当前会话的子代理 |
| `/pstack-workflows` | 查看当前会话的工作流 |
| `/pstack-workflows status <id>` | 查看指定工作流 |
| `/pstack-workflows pause <id>`、`resume <id>`、`cancel <id>` | 暂停、恢复或取消工作流；后两项同样需要以 `/pstack-workflows` 开头 |
| `/pstack-worktrees` | 查看当前会话拥有的 worktree |
| `/pstack-worktrees cleanup <agent-id>` | 清理符合条件的指定子代理 worktree |
| `/pstack-upstream`、`/pstack-parity` | 查看固定的上游版本及清单覆盖状态 |

工作流列表和操作受当前 Pi 会话的归属限制。`/pstack-parity` 的清单覆盖结果不等于完整行为兼容证明。

## 子代理和工作流

子代理是通过 Pi 的 `AgentSession` 创建的独立会话。扩展提供 `worker`、`architect`、`reviewer`、`scout`、`verifier`、`synthesizer`、`integrator`、`poteto-agent` 和 `comment-sicko` 九种内置角色。

可写代理可执行和修改文件；reviewer、scout、verifier 等只读角色使用受限的读取工具。并行写入通常使用独立 worktree，多个写入结果由 integrator 合并后再验证。工作流默认最多同时运行 4 个节点，可在调用时设置为 1–16。

模型可使用 `pstack_agents` 执行单个代理，或使用 `pstack_workflow` 编排有依赖关系的任务。这些是提供给模型的工具，通常不需要手动输入工具参数。是否运行验证、结果是否被接受，取决于任务合同和实际证据；代理回复“完成”本身不等于验证通过。

状态默认保存在 `~/.pi/agent/pstack-native/`，可通过 `PSTACK_NATIVE_HOME` 指定其他目录。模型设置位于该目录下的 `models.json`。重新执行 `/setup-pstack` 会保留已有的 panel 和 workflow 配置。

## 循环任务

```text
/pstack-loop 1h 检查当前任务的进度
/pstack-loop list
/pstack-loop pause <id>
/pstack-loop resume <id>
/pstack-loop stop <id>
```

间隔支持分钟 `m`、小时 `h` 和天 `d`，范围为 1 分钟至 7 天。调度需要活跃的 Pi 宿主；不要把它当作独立云服务或保证断电期间持续执行的任务系统。

## 验证、预算与费用

验证命令需要由操作者在状态目录的 `verification-policy.json` 中授权；缺少或不匹配的命令会被阻断。查看工作流状态及验证记录，确认检查实际运行并通过。配置说明见 [验证协议](docs/PR-PROTOCOL.md) 和 [实时测试计划](docs/LIVE-TEST-PLAN.zh-CN.md)。

扩展支持为工作流或子代理设置 token、费用和时间预算；不设置预算时，不会自动套用 benchmark 的默认 token 上限。模型服务商的配额、上下文窗口和计费规则仍然适用。

仓库中的真实模型 benchmark 默认最多运行 20 个用例，每例上限为 200,000 tokens 和 600 秒，可能产生较高费用。可以先通过 `--limit 1 --max-tokens 50000` 限制测试；该限制只针对 benchmark。`npm run benchmark:smoke` 是离线检查，不调用真实模型。

## 常见问题

- **修改模型配置后提示 `Invalid thinkingLevel`**：检查 `models.json`，将推理等级改为上面列出的有效值，再运行 `/setup-pstack`。
- **指定模型不支持某个推理等级**：在 `/setup-pstack` 中选择支持该等级的模型，或更换等级；也可以选择继承父会话。
- **工作流显示 `blocked`**：查看 `/pstack-workflows status <id>` 和对应验证记录。可能的原因包括验证命令未授权、任务报告不完整、产物变化或预算耗尽；具体以记录为准。
- **Windows 上运行测试遇到符号链接权限错误**：某些安全测试需要创建真实符号链接，可能需要开启开发者模式或使用有相应权限的终端。完整 Windows 测试中也有依赖带换行文件名的用例，Windows 文件系统不支持此类名称。
- **更新 Pi 后遇到旧模块加载错误**：先重启 Pi，让当前进程重新加载已安装的模块。

worktree、文件锁和只读工具不构成操作系统安全沙箱；不可信仓库或指令需要额外的系统隔离。打开、推送或合并远程 PR 等操作需要明确授权。真实模型验证与离线测试、模拟提供商测试是不同证据；当前仓库的维护者语义签署仍待完成。

Windows 用户已使用真实模型完成一组实测，最终 benchmark 为 20/20；被测目录没有记录提交 ID，因此结果不能直接绑定到仓库的某个提交。环境、场景和边界见 [Windows 真实模型测试记录](docs/WINDOWS-MODEL-TEST.zh-CN.md)。

更多使用和维护资料见[文档目录](docs/README.md)。
