# 定时任务设计文档

## 概述

sitegeist 的通用任务调度系统，允许用户调度任意 Agent 网页操作（导航、填写表单、提取数据、执行 JS 等）在指定时间或按周期性计划执行。任务元数据持久化在 IndexedDB 中，通过 Chrome alarms API 触发调度，支持两种执行模式：前台（Sidepanel 带流式 UI）和后台（Offscreen Document 回退）。

## 架构

```
用户 Side Panel                    Background (Service Worker)              执行层
+---------------+                 +----------------------+               +------------------------+
| Scheduled     |--创建任务------->| Scheduler             |               | 前台: Sidepanel Agent  |
| Tasks Tab     |<--管理列表-------| (alarm CRUD)          |--alarm 触发-->| (带流式 UI 输出)       |
|               |                 |                      |               |                        |
| Task Editor   |                 | IndexedDB 直连        |--前台优先---->| 后台: Offscreen Agent  |
|               |                 | (任务/会话读写)        |--回退-------->| (无 UI, 后台运行)      |
| History       |                 |                      |               |                        |
| Dialog        |                 | 通知管理器             |<-任务结果-----| 操作目标标签页         |
+---------------+                 +----------------------+               +------------------------+
```

**核心流程：**

1. 用户在 Side Panel 设置面板的"定时任务"标签页中创建/编辑任务（自然语言描述 + 调度规则）
2. 保存时通过 `chrome.runtime.sendMessage` 通知 Service Worker 注册 `chrome.alarms.create()`；任务元数据写入 IndexedDB
3. Alarm 触发 -> Service Worker 收到 `chrome.alarms.onAlarm` 回调
4. Service Worker **优先尝试前台执行**：检查是否有打开的 Sidepanel，若有则发送任务消息，Sidepanel 创建会话并以流式方式运行 Agent
5. **若无 Sidepanel 打开**：回退到 Offscreen Document 执行，Service Worker 创建目标标签页和 Offscreen Document，Offscreen 内运行 Agent
6. 执行完成后：结果写入 IndexedDB 的 sessions 存储（同一套会话系统），发送 Chrome 通知，清理标签页和 Offscreen Document

**关键设计决策：**

- **前台优先策略**：有 Sidepanel 打开时优先在 Sidepanel 中执行（用户可实时看到 Agent 流式输出），无 Sidepanel 时才回退到 Offscreen Document
- **串行执行队列**：同一时间只执行一个定时任务（`isExecuting` + `pendingQueue`），避免资源争用
- **Service Worker 独立访问 IndexedDB**：background.ts 直接打开 IndexedDB 连接（绕过 Store 抽象层），使其可独立于 Sidepanel 运行
- **Service Worker 重启恢复**：启动时从 IndexedDB 读取所有启用任务并恢复 alarm 注册

## 数据模型

### ScheduledTask（任务元数据，存储在 IndexedDB `scheduled_tasks` 表）

```typescript
interface ScheduledTask {
  id: string;                    // UUID
  name: string;                  // 用户自定义任务名称
  description: string;           // 自然语言任务描述（用户可编辑）
  promptTemplate: string;        // 传递给 Agent 的完整提示词（基于 description + 系统上下文）

  // 调度规则
  schedule: ScheduleConfig;

  // 执行配置
  executionMode: "silent" | "visible";  // silent（后台标签页）/ visible（前台标签页）
  model?: Model<any>;                    // 可选的指定 AI 模型（不设置则使用上次选择的模型）
  targetUrl?: string;                    // 可选的目标 URL（Agent 从此 URL 开始操作）

  // 状态
  enabled: boolean;
  lastRunAt?: string;            // ISO 时间戳
  lastRunStatus?: "success" | "failed" | "timeout";
  lastSessionId?: string;        // 最近一次执行产生的会话 ID
  nextRunAt?: string;            // ISO 时间戳
  createdAt: string;
  updatedAt: string;
}

type ScheduleConfig =
  | { type: "once"; at: string }           // ISO 时间戳，一次性执行
  | { type: "interval"; minutes: number }  // 每 N 分钟执行一次（最少 1 分钟）
  | { type: "cron"; expression: string };  // 简化的 5 字段 cron 表达式
```

### TaskExecutionResult（执行结果，进程间传递用）

```typescript
interface TaskExecutionResult {
  status: "success" | "failed" | "timeout";
  error?: string;                // 失败原因
  summary?: string;              // 简要总结
  agentMessages: AgentMessage[]; // Agent 对话消息列表
}
```

### 执行历史（复用现有 sessions 存储系统）

执行历史**不使用独立的存储表**，而是复用现有的 `sessions` 和 `sessions-metadata` IndexedDB 表。每次任务执行创建一个会话记录，通过以下字段区分：

- `source: "scheduled"` — 标记为定时任务产生的会话
- `taskId: string` — 关联的 ScheduledTask.id
- 会话标题格式：`{任务名} [{状态}] - {时间}`（成功时省略状态标签）

`SessionMetadata` 扩展字段：

```typescript
interface SessionMetadata {
  // ... 现有字段 ...
  source?: string;     // "scheduled" 表示定时任务产生的会话
  taskId?: string;     // 关联的定时任务 ID
}
```

**设计说明：**

- `promptTemplate` 与 `description` 分离：`description` 面向用户，`promptTemplate` 是实际传递给 Agent 的指令，支持用户微调
- `ScheduleConfig` 使用联合类型支持三种调度模式
- `model` 字段允许每个任务指定不同的 AI 模型，未设置时使用系统默认模型
- `lastSessionId` 用于快速跳转到最近一次执行的会话详情
- 执行历史复用 sessions 系统，用户可在会话列表中查看所有定时任务的执行记录，点击即可查看完整 Agent 对话

## 调度机制

### Alarm 命名规则

每个定时任务对应一个 `chrome.alarms.Alarm`，命名格式：`scheduled-task:${taskId}`。Service Worker 收到 `onAlarm` 时解析 alarm 名称获取任务 ID。

### 调度生命周期

```
创建任务
  |-- schedule.type === "once"
  |     chrome.alarms.create(`scheduled-task:${id}`, { when: new Date(schedule.at).getTime() })
  |     * 若时间已过期则拒绝创建
  |
  |-- schedule.type === "interval"
  |     chrome.alarms.create(`scheduled-task:${id}`, { periodInMinutes: Math.max(minutes, 1) })
  |
  +-- schedule.type === "cron"
        解析 cron 表达式，计算下次触发时间
        chrome.alarms.create(`scheduled-task:${id}`, { when: nextTime.getTime() })

Alarm 触发
  |-- 检查 isExecuting
  |     若正在执行 -> 加入 pendingQueue
  |     否则 -> executeTaskById(taskId)
  |
  |-- 前台执行（有 Sidepanel）
  |     创建目标标签页 -> 发送 execute-scheduled-task 消息到 Sidepanel
  |     Sidepanel 创建会话 -> 运行 Agent（带流式 UI）
  |     完成后通过 scheduled-task-complete 消息回传结果
  |
  +-- 后台执行（无 Sidepanel，回退到 Offscreen）
        创建目标标签页 -> 创建/复用 Offscreen Document
        发送 execute-task 消息到 Offscreen -> Offscreen 运行 Agent
        完成后通过 task-result 消息回传结果

执行后处理
  |-- 更新任务状态（lastRunAt, lastRunStatus, lastSessionId）
  |-- 更新调度
  |     once -> 清除 alarm
  |     cron -> 计算并注册下次触发的 alarm
  |     interval -> 由 Chrome 自动周期触发，无需处理
  |-- 发送 Chrome 通知
  |-- 释放 power keepAwake
  |-- 处理 pendingQueue 中的下一个任务
```

### Service Worker 启动恢复

Service Worker 启动时调用 `restoreAlarms()`：
1. 直接打开 IndexedDB 连接读取所有任务
2. 过滤出 `enabled === true` 的任务
3. 对每个启用任务检查 alarm 是否已存在
4. 若不存在则重新注册

## 执行流程详解

### 前台执行（Sidepanel）

1. Service Worker 检查 `openSidepanels` 集合是否有打开的 Sidepanel
2. 创建目标标签页（若有 `targetUrl`）
3. 发送 `execute-scheduled-task` 消息到 Sidepanel，包含 taskId、sessionId、prompt、model 等
4. Sidepanel 接收消息后：
   - 导航到指定会话 URL（`?session=${sessionId}&scheduledTask=${taskId}`）
   - 从 IndexedDB 加载任务元数据
   - 构建系统提示词（`SYSTEM_PROMPT` + 定时任务上下文 + 任务描述）
   - 创建 Agent 实例并运行（带流式 UI 输出）
   - 完成后发送 `scheduled-task-complete` 消息回 Service Worker
5. Service Worker 通过 `pendingForegroundTask` Promise 等待结果，超时 10 分钟

### 后台执行（Offscreen Document）

1. 创建目标标签页（`task.targetUrl` 或 `about:blank`），`active` 取决于 `executionMode`
2. 检查是否已存在 Offscreen Document，若不存在则创建（`offscreen.html`，reason: `WORKERS`）
3. 等待 500ms 确保 Offscreen Document 初始化完成
4. 解析代理配置（`proxy_enabled` / `proxy_url`）
5. 发送 `execute-task` 消息到 Offscreen Document，包含 task、tabId、proxyUrl
6. Offscreen Document：
   - 构建调度器系统提示词
   - 创建 Agent 实例（使用任务指定的 model 或默认模型）
   - 通过 `chrome.runtime.sendMessage` 向 Service Worker 请求 API Key（`get-api-key` 消息）
   - 运行 `agent.prompt(task.promptTemplate)`
   - 监听 `message_end` 和 `agent_end` 事件
   - 完成后发送 `task-result` 消息回 Service Worker
7. Service Worker 监听 `task-result` 消息获取结果，超时 10 分钟
8. silent 模式下清理标签页

## 用户界面

### ScheduledTasksTab（任务列表标签页）

作为 `SettingsTab` 嵌入设置面板中，功能包括：
- 任务列表展示：名称、调度规则、上次执行状态、下次执行时间、使用的模型
- 创建任务：打开 TaskEditorDialog
- 编辑任务：打开 TaskEditorDialog 并预填数据
- 启用/禁用切换：更新任务状态并注册/移除 alarm
- 删除任务：确认后删除任务和对应 alarm
- 查看执行历史：打开 ScheduledTaskHistoryDialog
- 空状态提示："暂无定时任务，创建定时任务以自动化网页操作"

### TaskEditorDialog（任务编辑器对话框）

基于 `DialogBase` 的模态对话框，包含：
- **任务名称**：文本输入框
- **任务描述**：文本区域（自然语言描述）
- **目标 URL**：可选的文本输入框
- **调度类型**：三种模式的切换
  - `once`：日期时间选择器
  - `interval`：分钟数输入（最少 1 分钟）
  - `cron`：预设按钮（每天 9:00、每小时、每周一 9:00、每月 1 号 9:00）+ 表达式输入框
- **模型选择**：通过 ModelSelector 组件选择指定 AI 模型，支持"重置为默认"
- **执行模式**：单选（Silent 后台运行 / Visible 前台运行）
- **高级选项**：可展开区域，支持自定义 `promptTemplate`（默认等于 description，可覆盖；提供"重置为描述"按钮）

### ScheduledTaskHistoryDialog（执行历史对话框）

基于 `DialogBase` 的模态对话框，功能包括：
- 从 `sessions-metadata` 表加载所有 `source === "scheduled"` 且 `taskId` 匹配的会话
- 兼容旧数据：对无 `taskId` 字段的旧会话通过标题中的任务名进行匹配
- 显示统计信息：总执行次数、成功/失败/超时次数
- 每条记录显示：执行时间、状态标签（从标题中的 `[status]` 提取）、执行时长
- 点击记录或"打开会话"按钮：导航到对应会话页面查看完整 Agent 对话

### 通知

使用 Chrome Notification API：
- 任务成功：通知标题 `Task completed: {name}`
- 任务失败：通知标题 `Task failed: {name}`，消息为错误原因
- 任务超时：通知标题 `Task timed out: {name}`
- 通知 ID 格式：`task-result-${sessionId}`
- 通知 ID 与 sessionId 的映射存储在 `chrome.storage.session`（`notification_session_map`）
- 点击通知：打开新标签页加载 `sidepanel.html?session=${sessionId}` 查看执行详情

## Manifest 变更

`static/manifest.chrome.json` 已添加以下权限：

```json
"permissions": [
  "storage",
  "unlimitedStorage",
  "activeTab",
  "scripting",
  "sidePanel",
  "userScripts",
  "webNavigation",
  "debugger",
  "declarativeNetRequest",
  "alarms",
  "offscreen",
  "notifications",
  "power"
]
```

## 文件结构

```
src/
  scheduler/
    types.ts                  # ScheduledTask, TaskExecutionResult, ScheduleConfig 类型及 alarm 名称工具函数
    cron-parser.ts            # 5 字段 cron 表达式解析器、下次触发时间计算、可读化
    schedule-store.ts         # IndexedDB Store：ScheduledTask 的 CRUD 操作
    db-config.ts              # 调度器 Store schema 配置（确保前后端一致）
    notifications.ts          # Chrome 通知发送及 session 映射管理
  offscreen/
    offscreen.ts              # Offscreen Document JS：接收任务配置，构建并运行 Agent
  dialogs/
    ScheduledTasksTab.ts      # 任务列表标签页（SettingsTab）
    TaskEditorDialog.ts       # 创建/编辑任务表单（DialogBase）
    ScheduledTaskHistoryDialog.ts  # 执行历史视图（DialogBase），基于 sessions 系统
  storage/
    app-storage.ts            # SitegeistAppStorage 注册 ScheduleStore，IndexedDB 版本 5
  background.ts               # Service Worker：alarm 监听、调度逻辑、执行队列、前台/后台执行、恢复
  sidepanel.ts                # Side Panel：ScheduledTasksTab 集成、前台任务执行处理
scripts/
  build.mjs                   # offscreen 入口点构建配置
static/
  manifest.chrome.json        # 扩展 manifest（alarms, offscreen, notifications, power 权限）
```

## Cron 表达式

简化的 5 字段标准语法：`分钟 小时 日期 月份 星期`。支持范围（`1-5`）、列表（`1,3,5`）、步进（`*/2`）和通配符（`*`）。无秒字段，无特殊字符（`@yearly`、`@weekly` 等）。通过自定义解析器实现（约 100 行），无外部依赖。

提供 `cronToHumanReadable()` 函数将常见表达式转为可读文本（如 `0 9 * * *` → "Every day at 09:00"）。

## 消息协议

各组件间通过 `chrome.runtime.sendMessage` 通信：

| 消息类型 | 发送方 | 接收方 | 用途 |
|---------|--------|--------|------|
| `register-alarm` | Sidepanel | Background | 注册任务的 alarm |
| `remove-alarm` | Sidepanel | Background | 移除任务的 alarm |
| `get-api-key` | Offscreen | Background | 请求指定 provider 的 API Key |
| `execute-scheduled-task` | Background | Sidepanel | 前台执行定时任务 |
| `scheduled-task-complete` | Sidepanel | Background | 前台执行完成回报 |
| `execute-task` | Background | Offscreen | 后台执行定时任务 |
| `task-result` | Offscreen | Background | 后台执行结果回传 |

## 存储架构

### IndexedDB（`sitegeist-storage`，版本 5）

`ScheduleStore` 注册在 `SitegeistAppStorage` 中：

- **Store 名称**：`scheduled_tasks`
- **Key Path**：`id`
- **索引**：`enabled`（布尔值）、`createdAt`（时间戳）
- **操作**：`get`、`save`、`delete`、`listAll`、`listEnabled`

Background 中的 Service Worker 直接操作 IndexedDB（绕过 Store 抽象层），使用独立的 `openSchedulerDB()` 函数打开连接。`onupgradeneeded` 处理器创建所有 Store（包括 sessions、settings 等），确保 Service Worker 可独立于 Sidepanel 运行。

### chrome.storage

- `chrome.storage.local`：存储 API Key（`provider_key_{provider}`）和代理配置（`proxy_enabled`、`proxy_url`）
- `chrome.storage.session`：存储通知 ID 到 sessionId 的映射（`notification_session_map`）

## 构建配置

`scripts/build.mjs` 中添加 `offscreen` 入口点：

```javascript
offscreen: join(packageRoot, "src/offscreen/offscreen.ts")
```

构建生成 `offscreen.js`，由 `offscreen.html`（构建产物）加载。
