---
name: superpowers-workflow
title: Superpowers 工作流 — 结构化规划+分解执行+验证门控
description: 融合 superpowers-zh 方法论与 decomposition-pipeline 的完整工作流。所有复杂任务（5+ 步骤）必须走此流程：Brainstorm → Plan → Implement(子Agent) → Review → Verify。Pro 规划 + Flash 执行，硬门控防跳步。
tags: [superpowers, brainstorming, planning, decomposition, verification, pro-flash, pipeline, gate-control]
---

# Superpowers Workflow — 结构化规划 + 分解执行 + 验证门控

> 融合 [superpowers-zh](https://github.com/jnMetaCode/superpowers-zh) 方法论与 decomposition-pipeline 的完整工作流。
> **所有复杂任务（预估 5+ 步骤）必须走此流程，不可跳过。**

---

## 核心思想

| 阶段 | 做什么 | 模型 | 门控 | 关联技能 |
|------|--------|------|------|---------|
| **① Brainstorm** | 探索上下文 → 澄清需求 → 设计方案 → 写规格文档 | pro | 🔒 用户批准才能继续 | — |
| **② Plan** | 规格 → JSON 子任务计划（小步骤粒度） | pro | 🔒 规格覆盖度自检 | — |
| **③ Implement** | 子Agent隔离执行 + TDD + 两阶段审查 | flash | 🔒 每任务审查通过 | test-driven-development, requesting-code-review |
| **④ Debug** | 出 bug 时走系统化调试，不做根因调查不许提修复 | flash | 🔒 根因找到才能修 | systematic-debugging |
| **⑤ Review** | 整体代码审查 + 接收反馈处理 | pro | 🔒 问题清零 | requesting-code-review, receiving-code-review |
| **⑥ Finish** | 测试验证 → 收尾选项（合并/PR/保留/丢弃） | flash | 🔒 测试通过才能收尾 | finishing-a-development-branch |
| **⑦ Verify** | 运行验证命令 → 证据输出 | flash | 🔒 证据先行 | — |

---

## 触发条件（强制）

满足以下**任一**条件必须走此工作流：

- [x] 预估需要 5+ 个工具调用
- [x] 涉及代码编写/修改（任意规模）
- [x] 涉及系统部署/配置变更
- [x] 涉及数据采集/处理管线
- [x] 用户明确说"做XX功能/系统/模块"

**唯一例外：** 纯查询类任务（"XX是什么""查一下YY"）可直接回答。

---

## 阶段详解

### ① Brainstorm — 头脑风暴（pro 模型）

**目标：** 在写任何代码之前，把需求变成完整的设计规格。

**流程（9 步检查清单）：**

1. **探索项目上下文** — 检查相关文件、目录结构、最近改动
2. **提出澄清问题** — 每次一个问题，理解目的/约束/成功标准
3. **提出 2-3 种方案** — 附带权衡分析和推荐
4. **分节展示设计** — 每节展示后获得用户批准
5. **编写设计文档** — 保存到 `/opt/data/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
6. **规格自检** — 检查占位符/一致性/范围/模糊性
7. **用户审查书面规格** — 等待批准
8. **过渡到 Plan** — 进入阶段②

**硬门控（HARD-GATE）：** 
- 🔴 在获得用户批准之前，**不得调用任何实现工具**
- 🔴 不得跳过此阶段（即使任务"看起来简单"）
- 🔴 不得同时提出多个问题

**反模式：**
- ❌ "这个太简单了，不需要设计"
- ❌ "我先写代码，边写边想"
- ❌ 一次抛出 3+ 个问题

**输出物：** 设计规格文档（markdown）

---

### ② Plan — 编写计划（pro 模型）

**目标：** 把规格拆成可执行的 JSON 子任务计划。

**关键原则：**

- **小步骤粒度：** 每步 2-5 分钟（写测试→运行→实现→运行→Commit 各一步）
- **禁止占位符：** 每个步骤必须有实际代码、精确命令和预期输出
- **文件结构先行：** 先列出所有要创建/修改的文件及职责

**输出 JSON 格式：**

```json
{
  "analysis": "任务简要分析，判断是否适合分解",
  "architecture": "架构概述（2-3句话）",
  "tech_stack": ["Python 3.13", "NiceGUI", "SQLite"],
  "files_to_modify": [
    {"path": "/opt/data/xxx/main.py", "role": "主入口，修改XX逻辑"}
  ],
  "subtasks": [
    {
      "id": "step-1",
      "goal": "子任务目标描述（精确、可验证）",
      "files": ["/opt/data/xxx/main.py"],
      "steps": [
        "步骤1：编写测试（含代码块）",
        "步骤2：运行测试验证失败（含命令和预期输出）",
        "步骤3：编写实现代码（含代码块）",
        "步骤4：运行测试验证通过（含命令）",
        "步骤5：Commit（含 git 命令）"
      ],
      "independent": true,
      "toolsets": ["terminal", "file"],
      "verification": "验证命令及预期输出"
    }
  ],
  "execution_strategy": "parallel|serial|hybrid",
  "fallback": "如果某步失败，整体降级方案"
}
```

**自检清单：**
- [ ] 规格覆盖度：每个需求都有对应子任务
- [ ] 占位符扫描：无 TODO/待定/占位
- [ ] 类型一致性：文件路径、命令、模型名正确
- [ ] 可构建性：按计划执行能否独立完成

**输出物：** JSON 子任务计划

---

### ③ Implement — 子Agent驱动执行 + TDD + 审查（flash 模型）

**核心模式：** 每个子任务一个全新子Agent，强制 TDD + 两阶段审查。

**流程：**

1. 一次性读取计划，提取所有子任务文本和上下文
2. 对每个子任务：
   - **分派实现子Agent** — 附带完整任务文本 + 上下文 + **强制 TDD 指令**（见 `test-driven-development` skill）
   - 实现者工作：**先写测试 → 看它失败 → 写最少代码 → 看它通过 → 重构** → 返回 DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT
   - **分派审查子Agent** — 使用 `requesting-code-review` skill 的审查模板，验证代码匹配规格（不多不少）+ 代码质量
   - 审查发现问题 → 实现者修复 → 重新审查 → 循环直到通过
3. 所有子任务完成后 → 进入阶段④

**模型选择策略：**

| 任务类型 | 模型 |
|---------|------|
| 机械性实现（1-2文件，清晰规格） | flash |
| 多文件协调/集成 | flash |
| 架构/设计/审查 | pro |

**子Agent Prompt 模板：**

```
你正在实现子任务 [id]：[goal]

## 任务描述
[完整任务文本]

## 上下文
[场景铺设：当前项目结构、相关文件内容摘要]

## 开始之前
有疑问就现在问，不要猜测。

## 你的工作
1. 读取相关文件，理解现有代码
2. 编写测试（如有）
3. 实现代码
4. 运行测试验证
5. 自审：完整性/质量/纪律/测试覆盖
6. 汇报

## 代码组织
- 文件聚焦，单一职责
- 不修改与任务无关的代码

## 力不从心时
- BLOCKED：遇到无法解决的技术阻塞
- NEEDS_CONTEXT：缺少关键信息

## 汇报格式
状态：[DONE|DONE_WITH_CONCERNS|BLOCKED|NEEDS_CONTEXT]
做了什么：[简述]
验证结果：[命令+输出]
```

**审查子Agent Prompt 模板：**

```
审查子任务 [id] 的实现

## 规格合规性检查
- 实现是否与规格匹配（不多不少）
- 不要信任报告，阅读实际代码
- 检查：缺失的需求 / 多余的工作 / 理解偏差

## 代码质量检查
- 单一职责
- 独立可测
- 遵循文件结构
- 文件大小合理

## 输出
状态：[✅ 通过 | ❌ 发现问题]
问题列表：[file:line] 描述
建议：[可选]
```

**并行 vs 串行判断：**

```python
# 无依赖 → 批量并行
if all(t.get("independent", False) for t in subtasks):
    delegate_task(tasks=subtasks, max_iterations=15)

# 有依赖 → 逐个串行
for t in subtasks:
    if t.get("dependent_on"):
        context += f"\n前置结果: {results[t['dependent_on']]}"
    result = delegate_task(goal=t["goal"], context=context, ...)
```

---

### ④ Debug — 系统化调试（flash 模型）

**目标：** 遇到 bug 时，不做根因调查不许提修复方案。

**触发条件：** 测试失败、异常行为、构建失败、任何非预期结果。

**流程（详见 `systematic-debugging` skill）：**

1. **根因调查** — 阅读错误信息、稳定复现、检查近期变更、跟踪数据流
2. **模式分析** — 找到正常示例、对比差异、理解依赖
3. **假设与验证** — 提出单一假设、最小化测试验证
4. **实施修复** — 先写失败测试、实施单一修复、验证通过

**铁律：**
- 🔴 不做根因调查，不许提修复方案
- 🔴 每次只改一个变量
- 🔴 3 次以上修复失败 → 质疑架构，不要继续修

---

### ⑤ Review — 整体审查 + 接收反馈（pro 模型）

**目标：** 所有子任务完成后，做一次整体代码审查，并规范处理审查反馈。

**检查项（详见 `requesting-code-review` skill）：**
- [ ] 所有子任务状态为 DONE
- [ ] 文件修改与计划一致（无多余修改）
- [ ] 代码风格一致（无各子Agent风格冲突）
- [ ] 边界情况覆盖
- [ ] 无遗留调试代码/注释

**接收审查反馈（详见 `receiving-code-review` skill）：**
- 阅读 → 理解 → 验证 → 评估 → 回应 → 实施
- ❌ 禁止敷衍附和（"你说得太对了！"）
- ✅ 用技术理由反驳有误的反馈
- ✅ 行动胜于言辞，直接修复

**输出：** 审查报告（通过/发现问题列表）

---

### ⑥ Finish — 完成开发分支（flash 模型）

**目标：** 所有任务完成并审查通过后，结构化收尾。

**流程（详见 `finishing-a-development-branch` skill）：**

1. **验证测试** — 运行完整测试套件，失败则停止
2. **展示选项** — 让用户选择：
   ```
   1. 在本地合并回 main
   2. 推送并创建 Pull Request
   3. 保持分支现状
   4. 丢弃这项工作
   ```
3. **执行选择** — 合并/PR/保留/丢弃
4. **清理工作区** — 选项 1 和 4 清理，2 和 3 保留

**铁律：**
- 🔴 测试失败不许收尾
- 🔴 丢弃前必须用户确认
- 🔴 不清理用户 PR 迭代还需要的工作区

---

### ⑦ Verify — 验证门控（flash 模型）

**铁律：不运行验证命令，不许宣称完成。**

**5 步门控函数：**

1. **确定：** 什么命令能证明这个结论？
2. **运行：** 执行完整命令
3. **阅读：** 完整输出，检查退出码
4. **验证：** 输出是否支持结论？
5. **只有这时：** 才能做出结论

**红线：**
- ❌ 使用"应该""大概""似乎"
- ❌ 验证前就表达满意
- ❌ 信任子Agent的成功报告而不亲自验证

**验证清单模板：**

```markdown
## 验证报告

### 功能验证
- [ ] 命令: `xxx` → 预期: `yyy` → 实际: `zzz` → ✅/❌

### 回归验证
- [ ] 命令: `xxx` → 预期: `yyy` → 实际: `zzz` → ✅/❌

### 边界验证
- [ ] 命令: `xxx` → 预期: `yyy` → 实际: `zzz` → ✅/❌

### 结论
[通过/未通过] — [证据摘要]
```

---

## 与原有工作流的关系

| | Guarded Deploy | Decomposition Pipeline | **Superpowers Workflow** |
|---|---|---|---|
| 解决什么 | 主 session 不死循环 | token 性价比最大化 | **完整质量闭环** |
| 核心手段 | delegate_task 隔离 | pro 规划 + flash 执行 | **5 阶段门控 + 审查 + 验证** |
| 适用场景 | 任何 MEDIUM+ 任务 | 复杂=5步+的任务 | **所有复杂任务（强制）** |
| 门控 | 无 | 无 | **HARD-GATE × 3** |
| 审查 | 无 | 无 | **子Agent审查 + 整体审查** |
| 验证 | 无 | 无 | **证据先行验证** |

**优先级：** Superpowers Workflow > Decomposition Pipeline > Guarded Deploy

---

## 实战案例

### 案例：修复 Hermes Desktop Tab 切换 Bug

```
① Brainstorm (pro):
   - 探索: main.py/ui/tabs.py/ui/chat.py 代码结构
   - 问题: Tab 点击后主区域不刷新
   - 方案A: ui.navigate.reload() → 断连
   - 方案B: container.clear() + 重建 → 推荐
   - 用户批准方案B

② Plan (pro):
   {
     "subtasks": [
       {"id": "fix-tab-switch", "goal": "用 container.clear() 替代 @ui.refreshable",
        "files": ["main.py"], "independent": true},
       {"id": "fix-poll", "goal": "更新 poll_wrapper 中的 refresh 引用",
        "files": ["main.py"], "dependent_on": "fix-tab-switch"},
       {"id": "verify-tabs", "goal": "浏览器验证4个Tab切换正常",
        "files": [], "dependent_on": "fix-poll"}
     ]
   }

③ Implement (flash):
   - step-1: 子Agent修改 main.py → DONE
   - step-2: 子Agent更新引用 → DONE
   - step-3: 子Agent浏览器验证 → DONE

④ Review (pro):
   - 代码一致性 ✅
   - 无多余修改 ✅

⑤ Verify (flash):
   - curl http://localhost:25602/ → 200 ✅
   - 浏览器快照确认4个Tab ✅
```

---

## 坑 & 经验教训

### 🔥 不要跳过 Brainstorm
- 看似简单的任务跳过设计 → 实现时发现遗漏 → 返工
- ✅ 任何代码修改都先走 Brainstorm

### 🔥 子任务粒度
- 太细（每步 1 个工具调用）→ overhead 大于收益
- 太粗（每步 10+ 工具调用）→ 又回到了单 agent 模式
- ✅ 最佳粒度：每个子任务 3-8 个工具调用

### 🔥 审查不要流于形式
- 子Agent报告 DONE 就跳过审查 → 隐藏 bug
- ✅ 审查子Agent必须阅读实际代码，不信任报告

### 🔥 验证不要偷懒
- "应该能用了" → 上线后发现不行
- ✅ 必须运行验证命令，粘贴输出作为证据

### 🔥 上下文传递
- 子Agent context 太大 → token 浪费
- 子Agent context 太小 → 缺少关键信息
- ✅ 只传该子任务需要的文件内容摘要 + 项目结构概览

---

## 验证方法

任务完成后检查：

1. [ ] 是否走了完整的 7 阶段（Brainstorm → Plan → Implement → Debug → Review → Finish → Verify）
2. [ ] 是否有用户批准的 Brainstorm 记录
3. [ ] 是否有 JSON 子任务计划
4. [ ] 所有子任务是否遵循 TDD（先写测试再写代码）
5. [ ] 所有子任务是否都有审查结果
6. [ ] 如有 bug，是否走了系统化调试（不做根因不许提修复）
7. [ ] 收尾前测试是否全部通过
8. [ ] 是否有验证命令输出作为证据
9. [ ] 总 token 消耗是否合理（pro 占比 < 30%）
