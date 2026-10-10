---
name: setup-pstack
description: "Configure pi-pstack-native role-to-model routing using the models available in the current Pi session. Use for /setup-pstack or changing pstack model choices."
---
# Setup pstack

Run `/setup-pstack` in an interactive Pi session.

The command reads the model catalog already available to Pi, asks for one selector per role, and writes:

```text
~/.pi/agent/pstack-native/models.json
```

Roles currently configured:

- worker
- architect
- reviewer
- verifier
- synthesizer
- integrator
- poteto-agent

`inherit-parent` and `auto` use the parent Pi model. An explicit selector uses `provider/model` and is validated against the current Pi model registry when the child starts.

The setup command also selects one child reasoning level for all roles: `inherit-parent`, `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. `inherit-parent` uses the current Pi session level. An explicit level is checked against the resolved child model; unsupported levels fail closed and ask you to rerun setup.

Use cheaper/faster models for broad scouts or routine workers only when their error rate is acceptable. Keep stronger reasoning for architecture, skeptical review, and synthesis when those decisions are consequential.

The child reasoning level is global for pstack children in this release, not per-role. The chosen value and role model map live together in `models.json`.

After setup, `/pstack-runtime` shows runtime status and `/pstack-agents` shows the actual model recorded for child runs.
