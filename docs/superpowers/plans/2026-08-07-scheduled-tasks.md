# 定时任务实施计划

**目标：** 为 sitegeist 添加定时任务系统，允许用户调度任意 Agent 网页操作在指定时间或按周期性计划执行。

**架构：** Chrome `alarms` API 在 Service Worker 中驱动调度。任务优先在打开的 Sidepanel 中前台执行（带流式 UI），无 Sidepanel 时回退到 Offscreen Document 后台执行。任务元数据持久化在 IndexedDB 中（`ScheduleStore`），执行历史复用现有 `sessions` 存储系统。

**技术栈：** Chrome MV3（alarms, offscreen, notifications, power）、IndexedDB（现有 `Store` / `IndexedDBStorageBackend`）、`@earendil-works/pi-agent-core` Agent、`@earendil-works/pi-ai` 模型系统、Lit UI 组件、现有 i18n 系统。

---

## 文件结构

### 新增文件
- `src/scheduler/types.ts` — 共享类型：`ScheduleConfig`、`ScheduledTask`、`TaskExecutionResult`、alarm 工具函数
- `src/scheduler/cron-parser.ts` — 5 字段 cron 表达式解析器、下次触发时间计算、可读化函数
- `src/scheduler/schedule-store.ts` — `ScheduledTask` 记录的 IndexedDB Store
- `src/scheduler/db-config.ts` — 调度器 Store schema 配置（确保 Service Worker 和 Sidepanel schema 一致）
- `src/scheduler/notifications.ts` — Chrome 通知发送及通知-session 映射管理
- `src/offscreen/offscreen.ts` — Offscreen Document JS：接收任务配置，构建并运行 Agent
- `src/dialogs/ScheduledTasksTab.ts` — 任务列表标签页（`SettingsTab`）
- `src/dialogs/TaskEditorDialog.ts` — 创建/编辑任务表单（`DialogBase`）
- `src/dialogs/ScheduledTaskHistoryDialog.ts` — 执行历史视图（`DialogBase`），基于 sessions 系统

### 修改文件
- `src/storage/app-storage.ts` — 注册 `ScheduleStore`，IndexedDB 版本升至 5
- `src/background.ts` — 添加 alarm 监听器、调度逻辑、执行队列、前台/后台执行、启动恢复
- `src/sidepanel.ts` — 添加 `ScheduledTasksTab` 到设置面板、前台任务执行处理
- `src/utils/i18n-extension.ts` — 添加定时任务 UI 的 i18n 键
- `src/web-ui/storage/types.ts` — `SessionMetadata` 添加 `source` 和 `taskId` 可选字段
- `scripts/build.mjs` — 添加 `offscreen` 入口点
- `static/manifest.chrome.json` — 添加 `alarms`、`offscreen`、`notifications`、`power` 权限

---

### Task 1: 数据类型

**文件：**
- 创建：`src/scheduler/types.ts`

- [ ] **步骤 1：创建类型文件**

```typescript
// src/scheduler/types.ts

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";

export type ScheduleConfig =
	| { type: "once"; at: string }
	| { type: "interval"; minutes: number }
	| { type: "cron"; expression: string };

export interface ScheduledTask {
	id: string;
	name: string;
	description: string;
	promptTemplate: string;
	schedule: ScheduleConfig;
	executionMode: "silent" | "visible";
	model?: Model<any>;
	targetUrl?: string;
	enabled: boolean;
	lastRunAt?: string;
	lastRunStatus?: "success" | "failed" | "timeout";
	lastSessionId?: string;
	nextRunAt?: string;
	createdAt: string;
	updatedAt: string;
}

export interface TaskExecutionResult {
	status: "success" | "failed" | "timeout";
	error?: string;
	summary?: string;
	agentMessages: AgentMessage[];
}

export const ALARM_PREFIX = "scheduled-task:";

export function alarmNameForTask(taskId: string): string {
	return `${ALARM_PREFIX}${taskId}`;
}

export function taskIdFromAlarmName(alarmName: string): string | null {
	if (!alarmName.startsWith(ALARM_PREFIX)) return null;
	return alarmName.slice(ALARM_PREFIX.length);
}
```

**关键设计点：**
- `model` 字段为可选，允许每个任务指定不同的 AI 模型
- `lastSessionId` 用于快速跳转到最近执行的会话
- `TaskExecutionResult` 用于进程间传递执行结果（非持久化类型）
- 执行历史复用 sessions 系统，无需独立的 `TaskExecutionLog` 类型

- [ ] **步骤 2：验证类型编译**

运行：`npx tsc --noEmit`
预期：无 `src/scheduler/types.ts` 相关错误

---

### Task 2: Cron 解析器

**文件：**
- 创建：`src/scheduler/cron-parser.ts`

- [ ] **步骤 1：创建 cron 解析器**

5 字段 cron 解析器（分钟、小时、日期、月份、星期），支持范围（`1-5`）、列表（`1,3,5`）、步进（`*/2`）和通配符（`*`）。无秒字段，无特殊字符。

```typescript
// src/scheduler/cron-parser.ts

interface CronField {
	values: Set<number>;
}

function parseField(field: string, min: number, max: number): CronField {
	const values = new Set<number>();

	for (const part of field.split(",")) {
		const stepMatch = part.match(/^(.+)\/(\d+)$/);
		let range: string;
		let step = 1;

		if (stepMatch) {
			range = stepMatch[1];
			step = parseInt(stepMatch[2], 10);
		} else {
			range = part;
		}

		if (range === "*") {
			for (let i = min; i <= max; i += step) values.add(i);
		} else if (range.includes("-")) {
			const [startStr, endStr] = range.split("-");
			const start = parseInt(startStr, 10);
			const end = parseInt(endStr, 10);
			for (let i = start; i <= end; i += step) values.add(i);
		} else {
			const val = parseInt(range, 10);
			if (!Number.isNaN(val) && val >= min && val <= max) values.add(val);
		}
	}

	return { values };
}

export interface ParsedCron {
	minute: CronField;
	hour: CronField;
	dayOfMonth: CronField;
	month: CronField;
	dayOfWeek: CronField;
}

export function parseCron(expression: string): ParsedCron {
	const fields = expression.trim().split(/\s+/);
	if (fields.length !== 5) {
		throw new Error(`Invalid cron expression: expected 5 fields, got ${fields.length}`);
	}

	return {
		minute: parseField(fields[0], 0, 59),
		hour: parseField(fields[1], 0, 23),
		dayOfMonth: parseField(fields[2], 1, 31),
		month: parseField(fields[3], 1, 12),
		dayOfWeek: parseField(fields[4], 0, 6),
	};
}

export function getNextCronTime(expression: string, after: Date = new Date()): Date {
	const cron = parseCron(expression);
	const candidate = new Date(after);
	candidate.setSeconds(0, 0);
	candidate.setMinutes(candidate.getMinutes() + 1);

	const maxIterations = 366 * 24 * 60;
	for (let i = 0; i < maxIterations; i++) {
		if (
			cron.month.values.has(candidate.getMonth() + 1) &&
			cron.dayOfMonth.values.has(candidate.getDate()) &&
			cron.dayOfWeek.values.has(candidate.getDay()) &&
			cron.hour.values.has(candidate.getHours()) &&
			cron.minute.values.has(candidate.getMinutes())
		) {
			return candidate;
		}
		candidate.setMinutes(candidate.getMinutes() + 1);
	}

	throw new Error("Could not find next cron time within a year");
}

export function cronToHumanReadable(expression: string): string {
	try {
		parseCron(expression);
	} catch {
		return expression;
	}

	const fields = expression.trim().split(/\s+/);
	const [minute, hour, dom, , dow] = fields;

	if (minute === "0" && hour === "9" && dom === "*" && dow === "*") return "Every day at 09:00";
	if (minute === "0" && hour === "*" && dom === "*" && dow === "*") return "Every hour";
	if (minute === "0" && dom === "*" && dow === "1") return "Every Monday";
	if (minute === "0" && dom === "1") return "1st of each month";

	return `${minute} ${hour} * * ${dow === "*" ? "every day" : `weekday ${dow}`}`;
}
```

**关键设计点：**
- `getNextCronTime` 用于 cron 类型 alarm 的 `when` 参数计算
- `cronToHumanReadable` 在 UI 中将 cron 表达式显示为可读文本
- cron 类型 alarm 每次触发后需重新计算并注册下次触发的 alarm（一次性 `when`），因为 Chrome alarms API 不直接支持 cron 语义

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

---

### Task 3: ScheduleStore（IndexedDB 存储）

**文件：**
- 创建：`src/scheduler/schedule-store.ts`
- 创建：`src/scheduler/db-config.ts`

- [ ] **步骤 1：创建 Store 和 DB 配置**

```typescript
// src/scheduler/schedule-store.ts

import { Store, type StoreConfig } from "../web-ui/index.js";
import type { ScheduledTask } from "./types.js";

export class ScheduleStore extends Store {
	private readonly storeName = "scheduled_tasks";

	getConfig(): StoreConfig {
		return {
			name: this.storeName,
			keyPath: "id",
			indices: [
				{ name: "enabled", keyPath: "enabled" },
				{ name: "createdAt", keyPath: "createdAt" },
			],
		};
	}

	async get(id: string): Promise<ScheduledTask | null> {
		return this.getBackend().get<ScheduledTask>(this.storeName, id);
	}

	async save(task: ScheduledTask): Promise<void> {
		await this.getBackend().set(this.storeName, task.id, task);
	}

	async delete(id: string): Promise<void> {
		await this.getBackend().delete(this.storeName, id);
	}

	async listAll(): Promise<ScheduledTask[]> {
		const keys = await this.getBackend().keys(this.storeName);
		const tasks = await Promise.all(keys.map((key) => this.getBackend().get<ScheduledTask>(this.storeName, key)));
		return tasks.filter((t): t is ScheduledTask => t !== null);
	}

	async listEnabled(): Promise<ScheduledTask[]> {
		const all = await this.listAll();
		return all.filter((t) => t.enabled);
	}
}
```

```typescript
// src/scheduler/db-config.ts

export const SCHEDULE_STORE_NAME = "scheduled_tasks";

export interface StoreSchema {
	name: string;
	keyPath: string;
	indices: { name: string; keyPath: string; unique?: boolean }[];
}

export const SCHEDULER_STORES: StoreSchema[] = [
	{
		name: SCHEDULE_STORE_NAME,
		keyPath: "id",
		indices: [
			{ name: "enabled", keyPath: "enabled" },
			{ name: "createdAt", keyPath: "createdAt" },
		],
	},
];
```

**关键设计点：**
- `ScheduleStore` 继承现有 `Store` 基类，复用 `IndexedDBStorageBackend`
- `db-config.ts` 导出 schema 配置供 Service Worker 和 Sidepanel 共享，确保 schema 一致性
- Store 名称为 `scheduled_tasks`

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

---

### Task 4: 注册 Store 并升级 IndexedDB 版本

**文件：**
- 修改：`src/storage/app-storage.ts`

- [ ] **步骤 1：在 SitegeistAppStorage 中注册 ScheduleStore**

```typescript
// src/storage/app-storage.ts

import { ScheduleStore } from "../scheduler/schedule-store.js";
// ... 其他 imports ...

export class SitegeistAppStorage extends BaseAppStorage {
	readonly skills: SkillsStore;
	readonly costs: CostStore;
	readonly schedule: ScheduleStore;

	constructor() {
		// ... 现有 store 实例化 ...
		const schedule = new ScheduleStore();

		const configs = [
			// ... 现有 configs ...
			schedule.getConfig(),
		];

		const backend = new IndexedDBStorageBackend({
			dbName: "sitegeist-storage",
			version: 5,   // 从之前的版本升至 5
			stores: configs,
		});

		// ... 现有 setBackend 调用 ...
		schedule.setBackend(backend);

		// ... 现有 super() 调用 ...

		this.schedule = schedule;
	}
}
```

**关键设计点：**
- IndexedDB 版本升至 5，`onupgradeneeded` 会自动创建新的 `scheduled_tasks` 表
- `schedule` 作为 `SitegeistAppStorage` 的公开属性，UI 组件通过 `getSitegeistStorage().schedule` 访问

- [ ] **步骤 2：运行 check.sh**

运行：`./check.sh`
预期：所有检查通过

---

### Task 5: 通知工具

**文件：**
- 创建：`src/scheduler/notifications.ts`

- [ ] **步骤 1：创建通知发送函数**

```typescript
// src/scheduler/notifications.ts

const NOTIFICATION_SESSION_MAP_KEY = "notification_session_map";

export async function sendTaskNotification(
	taskName: string,
	status: "success" | "failed" | "timeout",
	error?: string,
	sessionId?: string,
): Promise<void> {
	let title: string;
	let message: string;

	switch (status) {
		case "success":
			title = `Task completed: ${taskName}`;
			message = "Task finished successfully.";
			break;
		case "failed":
			title = `Task failed: ${taskName}`;
			message = error || "Task encountered an error.";
			break;
		case "timeout":
			title = `Task timed out: ${taskName}`;
			message = "Task exceeded the 10-minute time limit.";
			break;
		default:
			return;
	}

	const notificationId = `task-result-${sessionId || crypto.randomUUID()}`;

	// 存储通知 ID -> sessionId 映射供点击处理使用
	if (sessionId) {
		try {
			const data = await chrome.storage.session.get(NOTIFICATION_SESSION_MAP_KEY);
			const map: Record<string, string> = (data[NOTIFICATION_SESSION_MAP_KEY] as Record<string, string>) || {};
			map[notificationId] = sessionId;
			await chrome.storage.session.set({ [NOTIFICATION_SESSION_MAP_KEY]: map });
		} catch {
			// storage.session 可能不可用
		}
	}

	try {
		await chrome.notifications.create(notificationId, {
			type: "basic",
			iconUrl: chrome.runtime.getURL("icon-128.png"),
			title,
			message,
		});
	} catch (err) {
		console.error("[Scheduler] Failed to send notification:", err);
	}
}
```

**关键设计点：**
- 通知 ID 格式 `task-result-${sessionId}` 便于点击时解析
- 映射存储在 `chrome.storage.session`（仅 Service Worker 生命周期内有效）
- `storage.session` 操作包含 try-catch，因其可能不可用

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

---

### Task 6: 添加 Manifest 权限

**文件：**
- 修改：`static/manifest.chrome.json`

- [ ] **步骤 1：添加调度相关权限**

在 `permissions` 数组中添加：

```json
"alarms",
"offscreen",
"notifications",
"power"
```

---

### Task 7: 添加构建入口

**文件：**
- 修改：`scripts/build.mjs`

- [ ] **步骤 1：添加 offscreen 入口点**

在 build 配置的 entries 中添加：

```javascript
offscreen: join(packageRoot, "src/offscreen/offscreen.ts"),
```

构建生成 `offscreen.js`，供 `offscreen.html` 加载。

---

### Task 8: Offscreen Document Agent 运行时

**文件：**
- 创建：`src/offscreen/offscreen.ts`

- [ ] **步骤 1：创建 Offscreen Document 执行逻辑**

```typescript
// src/offscreen/offscreen.ts

import { Agent, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { getBuiltinModel } from "@earendil-works/pi-ai/providers/all";
import { browserMessageTransformer } from "../messages/message-transformer.js";
import { SYSTEM_PROMPT } from "../prompts/prompts.js";
import type { ScheduledTask, TaskExecutionResult } from "../scheduler/types.js";
import { createStreamFn } from "../web-ui/index.js";

interface TaskConfig {
	type: "execute-task";
	task: ScheduledTask;
	tabId: number;
	proxyUrl?: string;
}

const TASK_TIMEOUT_MS = 10 * 60 * 1000;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "execute-task") {
		const config = message as TaskConfig;
		executeTask(config.task, config.tabId, config.proxyUrl)
			.then((result) => {
				chrome.runtime.sendMessage({ type: "task-result", result });
				sendResponse({ received: true });
			})
			.catch((error: unknown) => {
				const result: TaskExecutionResult = {
					status: "failed",
					error: error instanceof Error ? error.message : String(error),
					agentMessages: [],
				};
				chrome.runtime.sendMessage({ type: "task-result", result });
				sendResponse({ received: true });
			});
		return true;
	}
});

async function executeTask(task: ScheduledTask, _tabId: number, proxyUrl?: string): Promise<TaskExecutionResult> {
	const agentMessages: AgentMessage[] = [];

	try {
		const model = task.model ?? getBuiltinModel("anthropic" as any, "claude-sonnet-4-6" as any);

		const agent = new Agent({
			initialState: {
				systemPrompt: buildSchedulerSystemPrompt(task),
				model,
				thinkingLevel: "medium",
				messages: [],
				tools: [],
			},
			convertToLlm: browserMessageTransformer,
			toolExecution: "sequential",
			streamFn: createStreamFn(async (): Promise<string | undefined> => proxyUrl),
			getApiKey: async (provider: string) => requestApiKey(provider),
		});

		agent.subscribe((event: AgentEvent) => {
			if (event.type === "message_end") {
				agentMessages.push(event.message);
			}
		});

		await agent.prompt(task.promptTemplate);
		const result = await waitForAgentCompletion(agent, TASK_TIMEOUT_MS);

		return { status: result, agentMessages };
	} catch (error: unknown) {
		return {
			status: "failed",
			error: error instanceof Error ? error.message : String(error),
			agentMessages,
		};
	}
}

function requestApiKey(provider: string): Promise<string | undefined> {
	return new Promise((resolve) => {
		chrome.runtime.sendMessage({ type: "get-api-key", provider }, (response) => {
			resolve(response?.apiKey as string | undefined);
		});
	});
}

function buildSchedulerSystemPrompt(task: ScheduledTask): string {
	return `${SYSTEM_PROMPT}\n\nYou are executing a scheduled task. The target tab is already open. Follow these instructions precisely and report what you accomplished:\n\n${task.description}`;
}

function waitForAgentCompletion(agent: Agent, timeoutMs: number): Promise<"success" | "timeout"> {
	return new Promise((resolve, reject) => {
		let settled = false;

		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				unsub();
				agent.abort();
				resolve("timeout");
			}
		}, timeoutMs);

		const unsub = agent.subscribe((event: AgentEvent) => {
			if (event.type === "agent_end" && !settled) {
				settled = true;
				clearTimeout(timer);
				unsub();

				const lastAssistant = [...event.messages]
					.reverse()
					.find((m: AgentMessage) => m.role === "assistant") as any;

				if (lastAssistant?.stopReason === "error") {
					reject(new Error(lastAssistant.errorMessage || "Agent error"));
				} else {
					resolve("success");
				}
			}
		});
	});
}
```

**关键设计点：**
- Offscreen Document 通过 `chrome.runtime.onMessage` 监听 `execute-task` 消息
- API Key 通过 `get-api-key` 消息向 Service Worker 请求（Offscreen 无法直接访问存储的凭据）
- `waitForAgentCompletion` 监听 `agent_end` 事件，支持超时（10 分钟）
- 执行结果通过 `task-result` 消息回传给 Service Worker

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

---

### Task 9: Background Service Worker 调度逻辑

**文件：**
- 修改：`src/background.ts`

- [ ] **步骤 1：添加 imports 和核心变量**

```typescript
import { getNextCronTime } from "./scheduler/cron-parser.js";
import { sendTaskNotification } from "./scheduler/notifications.js";
import type { ScheduledTask, TaskExecutionResult } from "./scheduler/types.js";
import { alarmNameForTask, taskIdFromAlarmName } from "./scheduler/types.js";

const SCHEDULE_STORE_NAME = "scheduled_tasks";
let isExecuting = false;
const pendingQueue: string[] = [];
```

- [ ] **步骤 2：添加 alarm 监听器**

```typescript
chrome.alarms.onAlarm.addListener(async (alarm: chrome.alarms.Alarm) => {
	const taskId = taskIdFromAlarmName(alarm.name);
	if (!taskId) return;

	if (isExecuting) {
		pendingQueue.push(taskId);
		return;
	}

	await executeTaskById(taskId);
});
```

- [ ] **步骤 3：添加消息处理器**

处理来自 Sidepanel 和 Offscreen 的消息：

```typescript
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "register-alarm") {
		registerAlarmForTask(message.task).then(() => sendResponse({ success: true }));
		return true;
	}
	if (message.type === "remove-alarm") {
		removeAlarmForTask(message.taskId).then(() => sendResponse({ success: true }));
		return true;
	}
	if (message.type === "get-api-key") {
		resolveApiKeyForOffscreen(message.provider).then((apiKey) => sendResponse({ apiKey }));
		return true;
	}
	if (message.type === "scheduled-task-complete") {
		handleForegroundTaskComplete(message.taskId, message.sessionId, message.status, message.error)
			.then(() => sendResponse({ success: true }));
		return true;
	}
	return false;
});
```

- [ ] **步骤 4：添加通知点击处理**

```typescript
chrome.notifications.onClicked.addListener(async (notificationId: string) => {
	if (!notificationId.startsWith("task-result-")) return;

	try {
		const data = await chrome.storage.session.get("notification_session_map");
		const map: Record<string, string> = (data.notification_session_map as Record<string, string>) || {};
		const sessionId = map[notificationId];

		if (sessionId) {
			delete map[notificationId];
			await chrome.storage.session.set({ notification_session_map: map });
			const url = chrome.runtime.getURL(`sidepanel.html?session=${sessionId}`);
			await chrome.tabs.create({ url });
		}
	} catch (err) {
		console.error("[Scheduler] Failed to handle notification click:", err);
	}

	try { chrome.notifications.clear(notificationId); } catch { /* ignore */ }
});
```

- [ ] **步骤 5：添加 executeTaskById 核心执行函数**

实现任务加载、会话创建、前台/后台执行选择、执行后处理：

```typescript
async function executeTaskById(taskId: string): Promise<void> {
	isExecuting = true;

	try {
		const task = await getTaskFromStorage(taskId);
		if (!task || !task.enabled) return;

		const sessionId = crypto.randomUUID();

		// 先保存 "running" 状态的会话，确保即使崩溃也有记录
		await saveTaskSession(task, sessionId,
			{ status: "failed", error: "Task interrupted", agentMessages: [] }, "running");

		try { (chrome.power as any)?.requestKeepAwake?.("system"); } catch { /* 可能不可用 */ }

		// 前台优先，回退到 Offscreen
		let result: TaskExecutionResult;
		const foregroundResult = await runTaskInForeground(task, sessionId);
		if (foregroundResult) {
			result = foregroundResult;
		} else {
			result = await runTaskInOffscreen(task);
			await saveTaskSession(task, sessionId, result, result.status);
		}

		// 更新任务状态
		task.lastRunAt = new Date().toISOString();
		task.lastRunStatus = result.status;
		task.lastSessionId = sessionId;
		task.updatedAt = new Date().toISOString();

		// 更新调度
		if (task.schedule.type === "once") {
			await chrome.alarms.clear(alarmNameForTask(task.id));
			task.nextRunAt = undefined;
		} else if (task.schedule.type === "cron") {
			const nextTime = getNextCronTime(task.schedule.expression);
			await chrome.alarms.create(alarmNameForTask(task.id), { when: nextTime.getTime() });
			task.nextRunAt = nextTime.toISOString();
		}

		await saveTask(task);
		await sendTaskNotification(task.name, result.status, result.error, sessionId);
	} finally {
		try { (chrome.power as any)?.releaseKeepAwake?.("system"); } catch { /* ignore */ }
		try { await chrome.offscreen.closeDocument(); } catch { /* 可能已关闭 */ }

		isExecuting = false;

		if (pendingQueue.length > 0) {
			const nextTaskId = pendingQueue.shift()!;
			executeTaskById(nextTaskId);
		}
	}
}
```

- [ ] **步骤 6：添加前台执行函数**

```typescript
async function runTaskInForeground(task: ScheduledTask, sessionId: string): Promise<TaskExecutionResult | null> {
	if (openSidepanels.size === 0) return null;

	let tabId: number | undefined;
	if (task.targetUrl) {
		try {
			const tab = await chrome.tabs.create({ url: task.targetUrl, active: true });
			tabId = tab.id;
		} catch (error) {
			return {
				status: "failed",
				error: `Failed to create target tab: ${error instanceof Error ? error.message : String(error)}`,
				agentMessages: [],
			};
		}
	}

	return new Promise<TaskExecutionResult>((resolve) => {
		const timeout = setTimeout(() => {
			pendingForegroundTask = null;
			resolve({ status: "timeout", error: "Task exceeded 10-minute timeout", agentMessages: [] });
		}, 10 * 60 * 1000);

		pendingForegroundTask = { sessionId, taskId: task.id, resolve, timeout };

		chrome.runtime.sendMessage({
			type: "execute-scheduled-task",
			taskId: task.id,
			sessionId,
			prompt: task.promptTemplate,
			description: task.description,
			model: task.model,
			targetUrl: task.targetUrl,
			tabId,
		}).catch((err: unknown) => {
			clearTimeout(timeout);
			pendingForegroundTask = null;
			resolve({
				status: "failed",
				error: `Failed to send task to sidepanel: ${err instanceof Error ? err.message : String(err)}`,
				agentMessages: [],
			});
		});
	});
}
```

- [ ] **步骤 7：添加后台执行函数**

```typescript
async function runTaskInOffscreen(task: ScheduledTask): Promise<TaskExecutionResult> {
	// 创建目标标签页
	let tabId: number;
	try {
		const tab = await chrome.tabs.create({
			url: task.targetUrl || "about:blank",
			active: task.executionMode === "visible",
		});
		tabId = tab.id!;
	} catch (error) {
		return {
			status: "failed",
			error: `Failed to create tab: ${error instanceof Error ? error.message : String(error)}`,
			agentMessages: [],
		};
	}

	// 确保 Offscreen Document 存在
	try {
		const existingContexts = await chrome.runtime.getContexts({
			contextTypes: ["OFFSCREEN_DOCUMENT"] as any,
		});
		if (existingContexts.length === 0) {
			await chrome.offscreen.createDocument({
				url: "offscreen.html",
				reasons: ["WORKERS"] as any,
				justification: "Scheduled task execution",
			});
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	} catch (error) {
		try { await chrome.tabs.remove(tabId); } catch { /* already closed */ }
		return {
			status: "failed",
			error: `Failed to create offscreen document: ${error instanceof Error ? error.message : String(error)}`,
			agentMessages: [],
		};
	}

	// 解析代理配置
	const proxyData = await chrome.storage.local.get(["proxy_enabled", "proxy_url"]);
	const resolvedProxyUrl = (proxyData.proxy_enabled as boolean) ? proxyData.proxy_url as string : undefined;

	// 发送任务并等待结果
	return new Promise<TaskExecutionResult>((resolve) => {
		const timeout = setTimeout(() => {
			chrome.runtime.onMessage.removeListener(listener);
			cleanupTab();
			resolve({ status: "timeout", error: "Task exceeded 10-minute timeout", agentMessages: [] });
		}, 10 * 60 * 1000);

		function cleanupTab(): void {
			if (task.executionMode === "silent") {
				chrome.tabs.remove(tabId).catch(() => {});
			}
		}

		function listener(message: any) {
			if (message.type === "task-result") {
				clearTimeout(timeout);
				chrome.runtime.onMessage.removeListener(listener);
				cleanupTab();
				resolve(message.result as TaskExecutionResult);
			}
		}

		chrome.runtime.onMessage.addListener(listener);

		chrome.runtime.sendMessage({ type: "execute-task", task, tabId, proxyUrl: resolvedProxyUrl })
			.catch((err: unknown) => {
				clearTimeout(timeout);
				chrome.runtime.onMessage.removeListener(listener);
				cleanupTab();
				resolve({
					status: "failed",
					error: `Failed to send task to offscreen: ${err instanceof Error ? err.message : String(err)}`,
					agentMessages: [],
				});
			});
	});
}
```

- [ ] **步骤 8：添加会话持久化函数**

`saveTaskSession` 将执行结果写入 sessions 和 sessions-metadata 表：

- 构建消息数组（确保 user 消息在前，追加 error 消息）
- 生成会话标题：`{任务名} [{状态}] - {时间}`
- 计算累计 usage（从 assistant 消息中提取）
- 生成预览文本（前 2KB 的对话内容）
- 写入 `sessions`（完整数据）和 `sessions-metadata`（元数据）两个表
- 元数据包含 `source: "scheduled"` 和 `taskId` 用于历史过滤

- [ ] **步骤 9：添加 alarm 管理函数**

```typescript
async function registerAlarmForTask(task: ScheduledTask): Promise<void> {
	const name = alarmNameForTask(task.id);

	switch (task.schedule.type) {
		case "once": {
			const when = new Date(task.schedule.at).getTime();
			if (when <= Date.now()) return; // 拒绝过去时间
			await chrome.alarms.create(name, { when });
			task.nextRunAt = task.schedule.at;
			break;
		}
		case "interval": {
			await chrome.alarms.create(name, { periodInMinutes: Math.max(task.schedule.minutes, 1) });
			const alarm = await chrome.alarms.get(name);
			if (alarm?.scheduledTime) task.nextRunAt = new Date(alarm.scheduledTime).toISOString();
			break;
		}
		case "cron": {
			const nextTime = getNextCronTime(task.schedule.expression);
			await chrome.alarms.create(name, { when: nextTime.getTime() });
			task.nextRunAt = nextTime.toISOString();
			break;
		}
	}

	await saveTask(task);
}

async function removeAlarmForTask(taskId: string): Promise<void> {
	await chrome.alarms.clear(alarmNameForTask(taskId));
}
```

- [ ] **步骤 10：添加启动恢复逻辑**

```typescript
async function restoreAlarms(): Promise<void> {
	try {
		const db = await openSchedulerDB();
		const tasks: ScheduledTask[] = await new Promise((resolve) => {
			const tx = db.transaction(SCHEDULE_STORE_NAME, "readonly");
			const req = tx.objectStore(SCHEDULE_STORE_NAME).getAll();
			req.onsuccess = () => resolve(req.result || []);
			req.onerror = () => resolve([]);
		});

		const enabledTasks = tasks.filter((t) => t.enabled);
		for (const task of enabledTasks) {
			const existing = await chrome.alarms.get(alarmNameForTask(task.id));
			if (!existing) await registerAlarmForTask(task);
		}
	} catch (error) {
		console.error("[Scheduler] Failed to restore alarms:", error);
	}
}

restoreAlarms().catch((err) => console.error("[Scheduler] Unhandled restore error:", err));
```

**关键设计点：**
- `openSchedulerDB()` 直接打开 IndexedDB 连接，绕过 Store 抽象层，使 Service Worker 可独立运行
- `onupgradeneeded` 创建所有 Store（包括 sessions、settings 等），确保与 Sidepanel 的 IndexedDB 版本一致（版本 5）
- 使用 `chrome.power.requestKeepAwake("system")` 防止系统在长时间任务中休眠

- [ ] **步骤 11：验证编译**

运行：`./check.sh`
预期：所有检查通过

---

### Task 10: SessionMetadata 类型扩展

**文件：**
- 修改：`src/web-ui/storage/types.ts`

- [ ] **步骤 1：添加 source 和 taskId 字段**

在 `SessionMetadata` 接口中添加：

```typescript
interface SessionMetadata {
  // ... 现有字段 ...
  /** 会话来源（定时任务为 "scheduled"） */
  source?: string;
  /** 关联的定时任务 ID */
  taskId?: string;
}
```

同步更新 `SessionData`（sessions 表中的完整会话数据）添加相同字段。

---

### Task 11: i18n 国际化

**文件：**
- 修改：`src/utils/i18n-extension.ts`

- [ ] **步骤 1：添加定时任务 UI 的翻译键**

在 `i18nMessages` 接口和对应的语言实现（英语、德语、中文）中添加以下键：

核心翻译键：
- `"Scheduled Tasks"` — 标签页名称
- `"New Task"` / `"Edit Task"` — 编辑器标题
- `"No scheduled tasks yet"` — 空状态
- `"Create a scheduled task to automate web operations"` — 空状态描述
- `"Save Task"` / `"Cancel"` / `"Delete"` / `"Edit"` — 按钮
- `"Enable"` / `"Disable"` — 启用/禁用切换
- `"Execution History"` — 历史视图标题
- `"Success"` / `"Failed"` / `"Timeout"` / `"Running"` — 状态标签
- `"Last run"` / `"Next run"` — 状态信息标签
- `"Model"` / `"Select"` / `"Reset"` / `"Default (last used)"` — 模型选择
- `"Silent"` / `"Visible"` — 执行模式
- `"Once"` / `"Interval"` / `"Cron"` — 调度类型
- `"Cron Expression:"` — Cron 输入标签
- `"Prompt Template"` — 高级选项
- `"Show Advanced"` / `"Hide Advanced"` — 高级选项切换
- `"Reset to description"` — 提示词重置
- `"Open Session"` / `"Duration"` / `"Total runs"` / `"Loading..."` — 历史视图

---

### Task 12: ScheduledTasksTab（任务列表标签页）

**文件：**
- 创建：`src/dialogs/ScheduledTasksTab.ts`

- [ ] **步骤 1：创建 SettingsTab 子类**

继承 `SettingsTab`，功能包括：

- **数据加载**：`connectedCallback` 中从 `getSitegeistStorage().schedule.listAll()` 加载任务
- **创建任务**：打开 `TaskEditorDialog.open(null, onSave)`，保存后通过 `chrome.runtime.sendMessage({ type: "register-alarm", task })` 注册 alarm
- **编辑任务**：打开 `TaskEditorDialog.open(task, onSave)`，保存时先移除旧 alarm 再注册新 alarm
- **删除任务**：确认后删除 IndexedDB 记录并移除 alarm
- **启用/禁用切换**：更新 `enabled` 状态并注册/移除 alarm
- **查看历史**：打开 `ScheduledTaskHistoryDialog.open(task)`
- **列表展示**：每项显示名称、调度规则（通过 `cronToHumanReadable` 格式化）、启用状态指示器、上次运行状态、下次运行时间、使用的模型
- **操作按钮**：编辑（Pencil）、历史（History）、启用/禁用（Play/Pause）、删除（Trash2）
- **空状态**：Clock 图标 + 提示文本

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

---

### Task 13: TaskEditorDialog（任务编辑器）

**文件：**
- 创建：`src/dialogs/TaskEditorDialog.ts`

- [ ] **步骤 1：创建 DialogBase 子类**

继承 `DialogBase`，模态尺寸 `min(600px, 90vw)` x `min(700px, 85vh)`，包含以下表单字段：

- **任务名称**（`Input` 组件）
- **任务描述**（`textarea`，多行文本）
- **目标 URL**（`Input` 组件，可选）
- **调度类型切换**（三个 radio 按钮）：
  - `once`：日期时间输入（`datetime-local`）
  - `interval`：分钟数输入（`number`，min=1），含最小值提示
  - `cron`：预设按钮（`CRON_PRESETS`：每天 9:00、每小时、每周一 9:00、每月 1 号 9:00）+ 表达式输入框
- **模型选择**：通过 `ModelSelector.open()` 打开模型选择器，显示已选模型名称或"Default (last used)"，支持"Reset"重置
- **执行模式**：radio 按钮（Silent / Visible），附说明文本
- **高级选项**：可展开区域
  - `promptTemplate` 文本区域（默认等于 description）
  - "Reset to description" 按钮
- **操作按钮**：Cancel（关闭）+ Save Task（保存，名称和描述不能为空）

**关键实现点：**

```typescript
// CRON 预设
const CRON_PRESETS = [
  { label: "Every day at 9:00", expression: "0 9 * * *" },
  { label: "Every hour", expression: "0 * * * *" },
  { label: "Every Monday at 9:00", expression: "0 9 * * 1" },
  { label: "Every 1st of month at 9:00", expression: "0 9 1 * *" },
];

// 保存逻辑
private async handleSave(): Promise<void> {
  const finalPrompt = this.showAdvanced && this.promptTemplate.trim()
    ? this.promptTemplate.trim()
    : this.description.trim();

  const task: ScheduledTask = {
    id: this.existingTask?.id || crypto.randomUUID(),
    // ... 其他字段 ...
    promptTemplate: finalPrompt,
    model: this.selectedModel ?? undefined,
  };

  if (this.saveCallback) await this.saveCallback(task);
  this.close();
}
```

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

---

### Task 14: ScheduledTaskHistoryDialog（执行历史对话框）

**文件：**
- 创建：`src/dialogs/ScheduledTaskHistoryDialog.ts`

- [ ] **步骤 1：创建 DialogBase 子类**

继承 `DialogBase`，基于 sessions 系统（非独立存储），功能包括：

- **数据加载**：从 `getAppStorage().sessions.getAllMetadata()` 获取所有会话元数据，过滤 `source === "scheduled"` 且 `taskId` 匹配的记录
- **旧数据兼容**：对无 `taskId` 字段的旧会话，通过标题中包含任务名进行匹配
- **排序**：按 `lastModified` 降序
- **统计信息**：总执行次数、各状态（从标题中 `[status]` 标签提取）的计数
- **记录列表**：每条显示执行时间、状态标签（彩色）、执行时长（从 `createdAt` 到 `lastModified` 计算）
- **导航**：点击记录或 ExternalLink 按钮跳转到 `?session=${sessionId}` 查看完整对话
- **加载状态**：显示 "Loading..." 占位

**关键实现点：**

```typescript
// 从会话标题提取状态
private extractStatusFromTitle(title: string): string {
  if (title.includes("[success]")) return "success";
  if (title.includes("[failed]")) return "failed";
  if (title.includes("[timeout]")) return "timeout";
  if (title.includes("[running]")) return "running";
  return "unknown";
}

// 过滤逻辑
this.sessions = allMetadata.filter((s) => {
  if (s.source !== "scheduled") return false;
  if (s.taskId === this.task!.id) return true;
  // 旧数据回退：通过标题匹配
  if (!s.taskId && s.title.includes(this.task!.name)) return true;
  return false;
});
```

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

---

### Task 15: Sidepanel 集成

**文件：**
- 修改：`src/sidepanel.ts`

- [ ] **步骤 1：导入 ScheduledTasksTab 并添加到设置面板**

```typescript
import { ScheduledTasksTab } from "./dialogs/ScheduledTasksTab.js";
```

在所有 `SettingsDialog.open([...])` 调用中添加 `new ScheduledTasksTab()` 到 tabs 数组。

- [ ] **步骤 2：添加前台任务执行处理**

在 `chrome.runtime.onMessage` 中处理 `execute-scheduled-task` 消息：
- 导航到 `?session=${sessionId}&scheduledTask=${taskId}` URL
- 加载任务元数据，构建系统提示词
- 创建 Agent 实例并运行
- 完成后发送 `scheduled-task-complete` 消息

- [ ] **步骤 3：添加会话加载时的定时任务自动运行**

在会话初始化逻辑中，检测 URL 参数 `scheduledTask`：
- 若会话存在且 Agent 已就绪，自动调用 `runScheduledTask()`
- 若会话不存在，创建新会话后自动运行

- [ ] **步骤 4：在会话元数据保存时附加定时任务信息**

```typescript
// 在保存会话元数据时
metadata.source = "scheduled";
metadata.taskId = scheduledTaskId;
```

- [ ] **步骤 5：运行 check.sh**

运行：`./check.sh`
预期：所有检查通过

---

### Task 16: CHANGELOG 和最终验证

**文件：**
- 修改：`CHANGELOG.md`

- [ ] **步骤 1：更新 CHANGELOG.md**

在 `## [Unreleased]` > `### Added` 下添加：

```markdown
- 定时任务：通过设置 > 定时任务创建、编辑和管理定时 Agent 操作
- 支持一次性、周期性和 cron 三种调度模式
- 前台执行（Sidepanel 流式 UI）和后台执行（Offscreen Document）双模式
- 执行历史复用会话系统，支持查看完整 Agent 对话记录
- Chrome 通知：任务完成、失败或超时时发送通知
- 每个任务可指定独立的 AI 模型
- Service Worker 重启后自动恢复 alarm 注册
```

- [ ] **步骤 2：完整检查**

运行：`./check.sh`
预期：所有检查通过

- [ ] **步骤 3：验证功能**

手动测试流程：
1. 打开设置面板 > 定时任务标签页
2. 创建一个一次性任务（设定 1 分钟后执行）
3. 确认任务在列表中显示正确
4. 等待任务执行，确认收到通知
5. 点击通知或打开执行历史，确认可以查看完整 Agent 对话
6. 测试启用/禁用切换
7. 测试删除任务
