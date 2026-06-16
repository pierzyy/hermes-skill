---
name: hermes-restore-patches
description: 恢复 Hermes 容器重启后丢失的 overlay 补丁文件 + 启动自愈 crond。触发词：恢复补丁、restore、启动AionUi、补丁丢了。
---

# Hermes 补丁恢复

当用户说"恢复补丁"、"restore"、"启动AionUi"、"补丁丢了"或类似指令时，执行：

```bash
bash /opt/data/hermes-custom/start_crond.sh
```

这条命令自动完成全部恢复工作（8个补丁文件 + crond 自愈）。

执行完成后告知用户总结——几项成功/几项失败，然后说"补丁已恢复"即可。

不要额外分析、不要检查文件、不要做多余操作。只运行这一条命令。

## 注意事项

### ACP 工具集修改必须走持久化路径
`hermes-acp` 工具集缺少 `send_message` 工具会导致 AionUi 对话中的 agent 无法发送文件到微信。修复时必须修改**持久化源文件** `/opt/data/hermes-custom/toolsets.py`，而不是 `/opt/hermes/toolsets.py`（overlay 临时层，会被 restore.sh 覆盖）。
验证方式：`grep 'send_message' /opt/hermes/hermes/acp/toolsets.py` — 确认 hermes-acp 工具集中包含 send_message。
