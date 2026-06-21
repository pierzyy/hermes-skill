---
name: spec-driven-streamlit-rewrite
description: 基于 github/spec-kit + cosmicpython 架构方法论的 Streamlit 应用规范化重写流程。Constitution → Spec → Plan → Tasks 四步规划，Repository + Service Layer + DI 分层架构。
---

# Spec-Driven Streamlit 重写方法论

## 适用场景

- Streamlit 单体应用拆解（2858 行 → 分层多文件）
- 任何需要规范围化开发的 Python 项目
- 旧系统重写而不丢失生产可运行性

## 四步规划体系

### Step 0: Constitution（宪章）
文件: `.hermes/plans/<项目名>/constitution.md`

定义项目的 8-10 条核心开发原则：
- CP-001: 分层分离（3-Tier / MVC）
- CP-002: 每页面独立文件（≤300 行）
- CP-003: Repository 模式封装数据层
- CP-004: 状态管理可追溯
- CP-005: 缓存策略显式声明
- CP-006: 每页面三态覆盖（正常/空/错误）
- CP-007: 向后兼容（旧文件不动，新分支开发）
- CP-008: 测试先行（可选）

### Step 1: Spec（规格说明书）
文件: `.hermes/plans/<项目名>/spec.md`

**核心结构**：
- **用户故事**（10+ 个，P1/P2/P3 优先级）
- **验收场景**（每次 3-5 个 Given/When/Then）
- **独立测试**（每个故事完成后即可作为独立 MVP 验证）
- **成功标准**（可度量的指标）
- **边界条件**（空数据/错误/离线等场景）
- **假设**（合理的默认假设）

关键规范：
- 每个 P1 故事完成后是可工作的 MVP，不等全部完成
- `[NEEDS CLARIFICATION]` 标记所有不确定项
- 边界条件必须包含：空态、错误态、边界值、异常流程

### Step 2: Plan（实施计划）
文件: `.hermes/plans/<项目名>/plan.md`

**核心结构**：
- **技术上下文**（语言/框架/数据库/缓存）
- **宪章检查**（每条原则是否被满足）
- **项目结构树**（精确到文件名）
- **依赖方向图**（箭头 = 引用方向，禁止循环引用）
- **页面通信机制**（状态共享方案）
- **与现有架构集成**（旧文件保留、数据层复用）
- **复杂度追踪**（违反宪章的决策需要记录理由）
- **风险点**（影响 + 缓解措施）

### Step 3: Tasks（任务分解）
文件: `.hermes/plans/<项目名>/tasks.md`

**结构**：
- **Phase 0: 骨架** — 目录创建、入口文件、配置
- **Phase 1: 数据层** — Repository + 组件库（Foundation）
- **Phase 2+: 用户故事** — 按 P1/P2/P3 分组
- **最后 Phase: 集成验证** — 逐页对比旧版

每个任务行格式（从 spec-kit tasks-template 改编）：
```
| [P] | ID | [US] | 任务描述 | 文件路径 |
```
- `[P]` = 可与其他行并行
- `[US]` = 所属用户故事编号

关键设计：
- 每个 Phase 后设 **Checkpoint**
- Checkpoint 是可运行的里程碑
- Foundation 阶段是阻塞性前置条件

## 架构模式（来自 cosmicpython）

### 3-Tier 分层

```
pages/  (展示层)    → 只负责渲染和事件
    ↓
lib/    (服务层)    → Repository + 状态 + 缓存
    ↓
domain/ (领域层)    → 纯 Python，零框架依赖
```

### Repository 模式（来自 cosmicpython §2）

```python
class AbstractRepository(abc.ABC):
    @abc.abstractmethod
    def get(self, id): ...
    @abc.abstractmethod
    def add(self, entity): ...

class SqliteRepository(AbstractRepository):
    # 真实实现
    def get(self, id):
        return sqlite3.connect(...)

class FakeRepository(AbstractRepository):
    # 测试用，无需数据库
    def __init__(self, data=None):
        self._data = data or {}
    def get(self, id):
        return self._data.get(id)
```

### 状态管理集中化

```python
# lib/state.py — 所有 session_state key 集中控制
_KEYS = {}  # 全局注册表

def register(key, default=None):
    _KEYS[key] = default
    return key

# 使用
SELECTED_PID = register("portfolio_selected_pid", 9)
PORTFOLIO_DETAIL = register("portfolio_detail_pid", None)
EDITOR_VERSION = register("portfolio_editor_version", 0)

# 页面中调用
st.session_state.get(SELECTED_PID)  # 不会拼错
```

## 实战应用：星环投顾 Streamlit 重写

- **分支**: `rewrite/streamlit-v2`（main 保持生产可运行）
- **规划文档**: `.hermes/plans/streamlit-rewrite/`（4 文件：constitution/spec/plan/tasks）
- **10 个用户故事**: P1(组合管理3个) → P2(首页/温度/雷达/诊断4个) → P3(基金库/决策/日志3个)
- **50 个任务 / 5 Phase**, 总估算 ~115min
- **Phase 0 骨架**: `app/` 目录 13 文件 887 行，main.py + pages/ + lib/ + domain/ + assets/style.css
- **启动方式**: `streamlit run app/main.py`，st.navigation 两页面切换
- **铁律**: 每步可见效果，先搭空壳框架再填真实数据。旧 streamlit_app.py 不动

## 设计模式推荐（来自 faif/python-patterns）

| 模式 | 用途 | 评级 |
|------|------|:----:|
| **3-Tier / MVC** | 核心架构分层 | ★★★ |
| **Facade** | 封装复杂数据流为统一接口 | ★★★ |
| **Proxy** | API 缓存代理（避免重复请求） | ★★★ |
| **Strategy** | 页面布局/筛选策略可替换 | ★★★ |
| **Publish-Subscribe** | 跨页面组件通信 | ★★★ |
| **Decorator** | `@st.cache_data` 本身就是装饰器 | ★★★ |
| **Specification** | 复杂筛选条件链式组合 | ★★★★★（数据应用） |
| **Borg** | 全局状态共享替代方案 | ★★★ |
