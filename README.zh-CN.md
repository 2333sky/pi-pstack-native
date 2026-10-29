# pi-pstack-native 中文说明

[English](README.md)

pi-pstack-native 是将 [pstack](https://github.com/cursor/plugins/tree/main/pstack) 的工作流适配到 Pi Coding Agent 的扩展。它提供子代理、工作流、Git worktree 隔离和验证记录，适合将复杂任务拆分、执行并检查结果。

本文提供中文使用说明；扩展的命令名、部分界面选项和错误信息目前仍为英文。

项目由社区独立维护，与 Cursor 及上游 pstack 维护者无隶属或背书关系。当前上游源码基线为 pstack 0.15.36；具体兼容范围和未完成的语义审查见 [PARITY.md](PARITY.md) 和 [语义兼容说明](docs/SEMANTIC-COMPATIBILITY.md)。

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

在安装命令后加 `--local` 可仅为当前项目安装；Pi 需要先信任该项目。未固定版本的 Git 来源在更新时跟随仓库默认分支，也可以通过 `@` 后接 Git 标签或提交固定版本。

npm 预览版发布到 `next` 标签后，也可以使用：

```bash
pi install npm:pi-pstack-native@next
```

## 初次使用

在 Pi 会话中运行：

```text
/setup-pstack
```

命令先询问推理预算，再分页展示角色、任务模型和根据当前 Pi 可用模型建议的面板。可以直接保存，也可以只修改某个角色、任务或面板席位；不可用模型和不支持的推理等级会标出，可在向导中修正。已有自定义设置会保留，保存前取消则不写入。一个面板席位对应一个独立子会话；多个席位使用相同模型不代表模型多样性。`inherit-parent` 和 `auto` 使用父会话模型。

保存后，命令会启动一次模型对话，要求代理检查项目是否已有真实应用验证和形式化验证能力，并在缺少时询问是否创建项目本地 Skill。代理被要求在创建前等待同意；后续行为取决于所选模型。

Arena 和 Architect 在有可用异家族模型时使用交叉裁判；否则返回候选，由协调者选择和整合。Interrogate 在隔离工作区执行对抗调查，并由独立会话复跑；协调者仍须核对实际命令证据。详见[模型配置与路由](docs/REFERENCE.md#model-setup-and-routing)。

在 Git 项目中，可以用中文描述任务和验收要求：

```text
/poteto-mode 修复登录按钮的问题，运行相关测试并说明验证结果
```

Poteto Mode 在当前会话中保持开启；使用 `/poteto-mode off` 关闭。也可以让 Pi 用子代理检查代码、实现修改或评审结果。扩展会根据任务和模型的实际调用来执行，不保证每条请求都会启动子代理。

## AI 算法研发

显式运行 `/skill:ml-development <任务>`，可按数据切分、基线、实验、评测和复现组织机器学习研发；例如 `/skill:ml-development 检查当前模型的数据泄漏并建立可复现基线`。普通的 ML 请求不会自动启用此 Skill。它复用已有 Agent 角色；计算资源、数据和训练框架由项目提供，不负责 GPU 预算的强制执行。使用 `/poteto-mode` 时需明确同时要求该 Skill。

详见 [AI 算法研发工作流与开源实践调研](docs/ML-WORKFLOWS.zh-CN.md)。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `/setup-pstack` | 选择推理预算、角色模型、任务覆盖和多模型面板 |
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

子代理是通过 Pi 的 `AgentSession` 创建的独立会话。扩展提供 `worker`、`architect`、`reviewer`、`adversary`、`repro-verifier`、`scout`、`verifier`、`synthesizer`、`integrator`、`poteto-agent` 和 `comment-sicko` 等内置角色。

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

Windows 用户使用真实模型进行了两轮实测：后一轮针对提交 `4d75ea0b`，20 个用例的独立测试全部通过，工作流验收为 13/20。两种指标检查的内容不同；环境和结果边界见 [Windows 真实模型测试记录](docs/WINDOWS-MODEL-TEST.zh-CN.md)。

更多使用和维护资料见[文档目录](docs/README.md)。
