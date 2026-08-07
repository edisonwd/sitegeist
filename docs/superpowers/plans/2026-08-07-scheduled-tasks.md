# Scheduled Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a scheduled task system to sitegeist that lets users schedule any Agent web operation to execute at a specific time or on a recurring schedule.

**Architecture:** Chrome `alarms` API drives scheduling in the Service Worker. Tasks fire into an Offscreen Document that runs the full Agent (reusing sidepanel's tool/model/key logic) against a target tab. Task metadata and execution logs persist in IndexedDB via the existing `Store` pattern.

**Tech Stack:** Chrome MV3 (alarms, offscreen, notifications, power), IndexedDB via existing `Store`/`IndexedDBStorageBackend`, `@earendil-works/pi-agent-core` Agent, Lit for UI components, existing i18n system.

---

## File Structure

### New Files
- `src/scheduler/types.ts` - Shared types: `ScheduleConfig`, `ScheduledTask`, `TaskExecutionLog`, `TaskExecutionResult`
- `src/scheduler/cron-parser.ts` - Minimal 5-field cron expression parser and next-fire-time calculator
- `src/scheduler/schedule-store.ts` - IndexedDB store for `ScheduledTask` records
- `src/scheduler/execution-log-store.ts` - IndexedDB store for `TaskExecutionLog` records
- `src/scheduler/notifications.ts` - Chrome Notification helpers for task results
- `src/offscreen/offscreen.html` - Offscreen Document HTML entry point (static)
- `src/offscreen/offscreen.ts` - Offscreen Document JS: receives task config, builds and runs Agent

### Modified Files
- `src/storage/app-storage.ts` - Register new stores, bump IndexedDB version
- `src/background.ts` - Add alarm listener, scheduler logic, execution queue, recovery on startup
- `scripts/build.mjs` - Add `offscreen` entry point
- `static/manifest.chrome.json` - Add `alarms`, `offscreen`, `notifications`, `power` permissions
- `src/utils/i18n-extension.ts` - Add i18n keys for scheduled tasks UI
- `src/sidepanel.ts` - Add ScheduledTasksTab to settings dialog
- `src/dialogs/ScheduledTasksTab.ts` - Main task list UI (SettingsTab)
- `src/dialogs/TaskEditorDialog.ts` - Create/edit task form (DialogBase)
- `src/dialogs/ExecutionHistoryDialog.ts` - Execution history view (DialogBase)
- `CHANGELOG.md` - Add entry under `[Unreleased]`

---

### Task 1: Data Types

**Files:**
- Create: `src/scheduler/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/scheduler/types.ts

import type { AgentMessage } from "@earendil-works/pi-agent-core";

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
	targetUrl?: string;
	enabled: boolean;
	lastRunAt?: string;
	lastRunStatus?: "success" | "failed" | "timeout";
	nextRunAt?: string;
	createdAt: string;
	updatedAt: string;
}

export interface TaskExecutionLog {
	id: string;
	taskId: string;
	startedAt: string;
	finishedAt?: string;
	status: "running" | "success" | "failed" | "timeout";
	error?: string;
	summary?: string;
	agentMessages: AgentMessage[];
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

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors related to `src/scheduler/types.ts`

- [ ] **Step 3: Commit**

```bash
git add src/scheduler/types.ts
git commit -m "feat: add scheduled task data types"
```

---

### Task 2: Cron Parser

**Files:**
- Create: `src/scheduler/cron-parser.ts`

- [ ] **Step 1: Create the cron parser**

This is a minimal 5-field cron parser (minute, hour, day-of-month, month, day-of-week) supporting ranges (`1-5`), lists (`1,3,5`), steps (`*/2`), and wildcards (`*`). No seconds field, no special characters.

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
			for (let i = min; i <= max; i += step) {
				values.add(i);
			}
		} else if (range.includes("-")) {
			const [startStr, endStr] = range.split("-");
			const start = parseInt(startStr, 10);
			const end = parseInt(endStr, 10);
			for (let i = start; i <= end; i += step) {
				values.add(i);
			}
		} else {
			const val = parseInt(range, 10);
			if (!isNaN(val) && val >= min && val <= max) {
				values.add(val);
			}
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
		const month = candidate.getMonth() + 1;
		const day = candidate.getDate();
		const dow = candidate.getDay();
		const hour = candidate.getHours();
		const minute = candidate.getMinutes();

		if (
			cron.month.values.has(month) &&
			cron.dayOfMonth.values.has(day) &&
			cron.dayOfWeek.values.has(dow) &&
			cron.hour.values.has(hour) &&
			cron.minute.values.has(minute)
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
	const [minute, hour, dom, month, dow] = fields;

	if (minute === "0" && hour === "9" && dom === "*" && month === "*" && dow === "*") {
		return "Every day at 09:00";
	}
	if (minute === "0" && hour === "*" && dom === "*" && month === "*" && dow === "*") {
		return "Every hour";
	}
	if (minute === "0" && dom === "*" && month === "*" && dow === "1") {
		return "Every Monday";
	}
	if (minute === "0" && dom === "1" && month === "*") {
		return "1st of each month";
	}

	return `${minute} ${hour} * * ${dow === "*" ? "every day" : `weekday ${dow}`}`;
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/scheduler/cron-parser.ts
git commit -m "feat: add cron expression parser for scheduled tasks"
```

---

### Task 3: Schedule Store

**Files:**
- Create: `src/scheduler/schedule-store.ts`

- [ ] **Step 1: Create the schedule store**

Follows the same pattern as `SkillsStore` - extends `Store`, defines `getConfig()`, provides domain-specific CRUD methods.

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

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/scheduler/schedule-store.ts
git commit -m "feat: add ScheduleStore for IndexedDB persistence"
```

---

### Task 4: Execution Log Store

**Files:**
- Create: `src/scheduler/execution-log-store.ts`

- [ ] **Step 1: Create the execution log store**

```typescript
// src/scheduler/execution-log-store.ts

import { Store, type StoreConfig } from "../web-ui/index.js";
import type { TaskExecutionLog } from "./types.js";

export class ExecutionLogStore extends Store {
	private readonly storeName = "task_execution_logs";

	getConfig(): StoreConfig {
		return {
			name: this.storeName,
			keyPath: "id",
			indices: [
				{ name: "taskId", keyPath: "taskId" },
				{ name: "startedAt", keyPath: "startedAt" },
			],
		};
	}

	async get(id: string): Promise<TaskExecutionLog | null> {
		return this.getBackend().get<TaskExecutionLog>(this.storeName, id);
	}

	async save(log: TaskExecutionLog): Promise<void> {
		await this.getBackend().set(this.storeName, log.id, log);
	}

	async delete(id: string): Promise<void> {
		await this.getBackend().delete(this.storeName, id);
	}

	async listByTask(taskId: string): Promise<TaskExecutionLog[]> {
		const all = await this.getBackend().getAllFromIndex<TaskExecutionLog>(
			this.storeName,
			"startedAt",
			"desc",
		);
		return all.filter((log) => log.taskId === taskId);
	}

	async listAll(): Promise<TaskExecutionLog[]> {
		return this.getBackend().getAllFromIndex<TaskExecutionLog>(
			this.storeName,
			"startedAt",
			"desc",
		);
	}

	async markStaleAsFailed(timeoutMs: number = 15 * 60 * 1000): Promise<void> {
		const running = (await this.listAll()).filter((log) => log.status === "running");
		const cutoff = Date.now() - timeoutMs;

		for (const log of running) {
			const started = new Date(log.startedAt).getTime();
			if (started < cutoff) {
				log.status = "failed";
				log.error = "Task interrupted (service worker restart or crash)";
				log.finishedAt = new Date().toISOString();
				await this.save(log);
			}
		}
	}
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/scheduler/execution-log-store.ts
git commit -m "feat: add ExecutionLogStore for task run history"
```

---

### Task 5: Wire Stores into AppStorage

**Files:**
- Modify: `src/storage/app-storage.ts`

- [ ] **Step 1: Update AppStorage to include new stores**

The existing `SitegeistAppStorage` constructor needs to instantiate both new stores, gather their configs, bump the IndexedDB version, and wire the backend.

Replace the entire contents of `src/storage/app-storage.ts`:

```typescript
// src/storage/app-storage.ts

import {
	AppStorage as BaseAppStorage,
	CustomProvidersStore,
	getAppStorage,
	IndexedDBStorageBackend,
	ProviderKeysStore,
	SessionsStore,
	SettingsStore,
} from "../web-ui/index.js";
import { CostStore } from "./stores/cost-store.js";
import { SitegeistSessionsStore } from "./stores/sessions-store.js";
import { SkillsStore } from "./stores/skills-store.js";
import { ScheduleStore } from "../scheduler/schedule-store.js";
import { ExecutionLogStore } from "../scheduler/execution-log-store.js";

export class SitegeistAppStorage extends BaseAppStorage {
	readonly skills: SkillsStore;
	readonly costs: CostStore;
	readonly schedule: ScheduleStore;
	readonly executionLogs: ExecutionLogStore;

	constructor() {
		const settings = new SettingsStore();
		const providerKeys = new ProviderKeysStore();
		const sessions = new SitegeistSessionsStore();
		const customProviders = new CustomProvidersStore();
		const skills = new SkillsStore();
		const costs = new CostStore();
		const schedule = new ScheduleStore();
		const executionLogs = new ExecutionLogStore();

		const configs = [
			settings.getConfig(),
			SessionsStore.getMetadataConfig(),
			providerKeys.getConfig(),
			customProviders.getConfig(),
			sessions.getConfig(),
			skills.getConfig(),
			costs.getConfig(),
			schedule.getConfig(),
			executionLogs.getConfig(),
		];

		const backend = new IndexedDBStorageBackend({
			dbName: "sitegeist-storage",
			version: 4,
			stores: configs,
		});

		settings.setBackend(backend);
		providerKeys.setBackend(backend);
		customProviders.setBackend(backend);
		sessions.setBackend(backend);
		skills.setBackend(backend);
		costs.setBackend(backend);
		schedule.setBackend(backend);
		executionLogs.setBackend(backend);

		super(settings, providerKeys, sessions, customProviders, backend);

		this.skills = skills;
		this.costs = costs;
		this.schedule = schedule;
		this.executionLogs = executionLogs;
	}
}

export function getSitegeistStorage(): SitegeistAppStorage {
	return getAppStorage() as SitegeistAppStorage;
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/storage/app-storage.ts
git commit -m "feat: register schedule and execution log stores in AppStorage"
```

---

### Task 6: Manifest Permissions and Offscreen HTML

**Files:**
- Modify: `static/manifest.chrome.json`
- Create: `static/offscreen.html`
- Modify: `scripts/build.mjs`

- [ ] **Step 1: Add permissions to manifest**

In `static/manifest.chrome.json`, add `"alarms"`, `"offscreen"`, `"notifications"`, and `"power"` to the `permissions` array:

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

- [ ] **Step 2: Create offscreen.html**

```html
<!-- static/offscreen.html -->
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script type="module" src="offscreen.js"></script>
</body>
</html>
```

- [ ] **Step 3: Add offscreen entry point to build script**

In `scripts/build.mjs`, add `offscreen` to the `entryPoints` object:

```javascript
const entryPoints = {
    sidepanel: join(packageRoot, "src/sidepanel.ts"),
    background: join(packageRoot, "src/background.ts"),
    offscreen: join(packageRoot, "src/offscreen/offscreen.ts"),
    ...(isDev
        ? {
                debug: join(packageRoot, "src/debug.ts"),
                icons: join(packageRoot, "src/icons.ts"),
            }
        : {}),
};
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds, `dist-chrome/offscreen.html` and `dist-chrome/offscreen.js` are present.

- [ ] **Step 5: Commit**

```bash
git add static/manifest.chrome.json static/offscreen.html scripts/build.mjs
git commit -m "feat: add manifest permissions and offscreen document entry point"
```

---

### Task 7: Notifications Helper

**Files:**
- Create: `src/scheduler/notifications.ts`

- [ ] **Step 1: Create the notifications module**

```typescript
// src/scheduler/notifications.ts

import type { TaskExecutionLog } from "./types.js";

export async function sendTaskNotification(
	taskName: string,
	log: TaskExecutionLog,
): Promise<void> {
	let title: string;
	let message: string;

	switch (log.status) {
		case "success":
			title = `Task completed: ${taskName}`;
			message = log.summary || "Task finished successfully.";
			break;
		case "failed":
			title = `Task failed: ${taskName}`;
			message = log.error || "Task encountered an error.";
			break;
		case "timeout":
			title = `Task timed out: ${taskName}`;
			message = "Task exceeded the 10-minute time limit.";
			break;
		default:
			return;
	}

	try {
		await chrome.notifications.create(`task-result-${log.id}`, {
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

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/scheduler/notifications.ts
git commit -m "feat: add Chrome notification helper for task results"
```

---

### Task 8: Offscreen Document Script

**Files:**
- Create: `src/offscreen/offscreen.ts`

This is the script that runs inside the Offscreen Document. It receives a task config from the Service Worker, builds an Agent, executes it against a target tab, and sends results back.

- [ ] **Step 1: Create offscreen.ts**

This file needs to import the same Agent construction logic used in sidepanel.ts. Rather than duplicating the code, it imports the shared modules directly. The Agent needs: tools (NavigateTool, repl, DebuggerTool, ExtractImageTool), model config from storage, and API key resolution.

```typescript
// src/offscreen/offscreen.ts

import { Agent, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai/compat";
import { createStreamFn } from "../web-ui/index.js";
import { browserMessageTransformer } from "../messages/message-transformer.js";
import { resolveApiKey, isOAuthCredentials } from "../oauth/index.js";
import { SYSTEM_PROMPT } from "../prompts/prompts.js";
import { DebuggerTool } from "../tools/debugger.js";
import { ExtractImageTool } from "../tools/extract-image.js";
import { NavigateTool } from "../tools/navigate.js";
import { createReplTool } from "../tools/repl/repl.js";
import { BrowserJsRuntimeProvider, NavigateRuntimeProvider } from "../tools/repl/runtime-providers.js";
import { NativeInputEventsRuntimeProvider } from "../tools/NativeInputEventsRuntimeProvider.js";
import type { ScheduledTask, TaskExecutionResult } from "../scheduler/types.js";

interface TaskConfig {
	task: ScheduledTask;
}

const TASK_TIMEOUT_MS = 10 * 60 * 1000;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "execute-task") {
		const config = message as TaskConfig;
		executeTask(config.task)
			.then((result) => {
				chrome.runtime.sendMessage({ type: "task-result", result });
				sendResponse({ received: true });
			})
			.catch((error) => {
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

async function executeTask(task: ScheduledTask): Promise<TaskExecutionResult> {
	const tab = await chrome.tabs.create({
		url: task.targetUrl || "about:blank",
		active: task.executionMode === "visible",
	});

	const tabId = tab.id!;
	const agentMessages: AgentMessage[] = [];

	try {
		const storage = chrome.storage.local;

		const model = await resolveModel(storage);

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
			streamFn: createStreamFn(async () => {
				const data = await chrome.storage.local.get(["proxy_enabled", "proxy_url"]);
				return data.proxy_enabled ? data.proxy_url || undefined : undefined;
			}),
			getApiKey: async (provider: string) => {
				return resolveApiKeyFromStorage(provider, storage);
			},
		});

		agent.subscribe((event: AgentEvent) => {
			if (event.type === "message" || event.type === "message_end") {
				agentMessages.push(event.message);
			}
		});

		agent.start(task.promptTemplate);

		const result = await waitForAgentCompletion(agent, TASK_TIMEOUT_MS);

		return {
			status: result,
			agentMessages,
		};
	} catch (error) {
		return {
			status: "failed",
			error: error instanceof Error ? error.message : String(error),
			agentMessages,
		};
	} finally {
		if (task.executionMode === "silent") {
			try {
				await chrome.tabs.remove(tabId);
			} catch {
				// Tab may already be closed
			}
		}
	}
}

function buildSchedulerSystemPrompt(task: ScheduledTask): string {
	return `${SYSTEM_PROMPT}\n\nYou are executing a scheduled task. The target tab is already open. Follow these instructions precisely and report what you accomplished:\n\n${task.description}`;
}

async function resolveModel(storage: chrome.storage.StorageArea): Promise<any> {
	const data = await storage.get(["lastUsedModel"]);
	if (data.lastUsedModel) return data.lastUsedModel;
	return getModel("anthropic", "claude-sonnet-4-6");
}

async function resolveApiKeyFromStorage(
	provider: string,
	storage: chrome.storage.StorageArea,
): Promise<string | undefined> {
	const data = await storage.get([`provider_key_${provider}`]);
	const stored = data[`provider_key_${provider}`];
	if (!stored) return undefined;

	const proxyData = await storage.get(["proxy_enabled", "proxy_url"]);
	const proxyUrl = proxyData.proxy_enabled ? proxyData.proxy_url || undefined : undefined;

	if (isOAuthCredentials(stored)) {
		return resolveApiKey(stored, provider, undefined as any, proxyUrl);
	}
	return typeof stored === "string" ? stored : undefined;
}

function waitForAgentCompletion(agent: Agent, timeoutMs: number): Promise<"success" | "timeout"> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			agent.abort();
			resolve("timeout");
		}, timeoutMs);

		const unsub = agent.subscribe((event: AgentEvent) => {
			if (event.type === "complete") {
				clearTimeout(timer);
				unsub();
				resolve("success");
			}
			if (event.type === "error") {
				clearTimeout(timer);
				unsub();
				reject(new Error((event as any).error || "Agent error"));
			}
		});
	});
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors (may need to adjust imports based on actual export paths from `web-ui/index.js`)

- [ ] **Step 3: Verify build produces offscreen.js**

Run: `npm run build`
Expected: `dist-chrome/offscreen.js` is generated

- [ ] **Step 4: Commit**

```bash
git add src/offscreen/offscreen.ts
git commit -m "feat: add offscreen document script for task execution"
```

---

### Task 9: Background Scheduler

**Files:**
- Modify: `src/background.ts`

This is the core scheduler logic. It handles:
- Alarm creation/update/deletion
- Alarm listener that dispatches task execution
- Execution queue (one task at a time)
- Recovery on Service Worker startup
- Offscreen Document lifecycle management

- [ ] **Step 1: Add scheduler logic to background.ts**

Append the following to the end of `src/background.ts` (after the existing `closeSidepanel` function). Also add the necessary imports at the top.

Add these imports at the top of `src/background.ts`:

```typescript
import { alarmNameForTask, taskIdFromAlarmName } from "./scheduler/types.js";
import { sendTaskNotification } from "./scheduler/notifications.js";
import { getNextCronTime } from "./scheduler/cron-parser.js";
import type { ScheduledTask, TaskExecutionLog, TaskExecutionResult } from "./scheduler/types.js";
```

Add the scheduler state and functions at the end of `src/background.ts`:

```typescript
// ============================================================================
// SCHEDULED TASK SCHEDULER
// ============================================================================

const SCHEDULE_STORE_NAME = "scheduled_tasks";
const EXECUTION_LOG_STORE_NAME = "task_execution_logs";

let isExecuting = false;
const pendingQueue: string[] = [];

// Listen for alarm events
chrome.alarms.onAlarm.addListener(async (alarm: chrome.alarms.Alarm) => {
	const taskId = taskIdFromAlarmName(alarm.name);
	if (!taskId) return;

	console.log(`[Scheduler] Alarm fired for task: ${taskId}`);

	if (isExecuting) {
		console.log(`[Scheduler] Task ${taskId} queued (another task running)`);
		pendingQueue.push(taskId);
		return;
	}

	await executeTaskById(taskId);
});

// Listen for messages from sidepanel for alarm management
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === "register-alarm") {
		registerAlarmForTask(message.task).then(() => {
			sendResponse({ success: true });
		}).catch((err) => {
			sendResponse({ success: false, error: String(err) });
		});
		return true;
	}
	if (message.type === "remove-alarm") {
		removeAlarmForTask(message.taskId).then(() => {
			sendResponse({ success: true });
		}).catch((err) => {
			sendResponse({ success: false, error: String(err) });
		});
		return true;
	}
	return false;
});

// Listen for task results from Offscreen Document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === "task-result" && sender.documentLifecycle === "active") {
		// This is handled in executeTaskById via the offscreen message channel
		return false;
	}
	return false;
});

async function executeTaskById(taskId: string): Promise<void> {
	isExecuting = true;

	try {
		const task = await getTaskFromStorage(taskId);
		if (!task) {
			console.error(`[Scheduler] Task ${taskId} not found`);
			return;
		}
		if (!task.enabled) {
			console.log(`[Scheduler] Task ${taskId} is disabled, skipping`);
			return;
		}

		const logId = crypto.randomUUID();
		const log: TaskExecutionLog = {
			id: logId,
			taskId,
			startedAt: new Date().toISOString(),
			status: "running",
			agentMessages: [],
		};
		await saveExecutionLog(log);

		try {
			(chrome.power as any)?.requestKeepAwake?.("system");
		} catch {}

		const result = await runTaskInOffscreen(task);

		log.status = result.status;
		log.error = result.error;
		log.summary = result.summary;
		log.agentMessages = result.agentMessages;
		log.finishedAt = new Date().toISOString();
		await saveExecutionLog(log);

		task.lastRunAt = new Date().toISOString();
		task.lastRunStatus = result.status;
		task.updatedAt = new Date().toISOString();

		if (task.schedule.type === "once") {
			task.enabled = false;
		} else if (task.schedule.type === "cron") {
			const nextTime = getNextCronTime(task.schedule.expression);
			task.nextRunAt = nextTime.toISOString();
			await updateCronAlarm(task, nextTime);
		}

		await saveTask(task);
		await sendTaskNotification(task.name, log);
	} catch (error) {
		console.error(`[Scheduler] Error executing task ${taskId}:`, error);
	} finally {
		try {
			(chrome.power as any)?.releaseKeepAwake?.();
		} catch {}

		try {
			await chrome.offscreen.closeDocument();
		} catch {}

		isExecuting = false;

		if (pendingQueue.length > 0) {
			const nextTaskId = pendingQueue.shift()!;
			console.log(`[Scheduler] Processing queued task: ${nextTaskId}`);
			executeTaskById(nextTaskId);
		}
	}
}

async function runTaskInOffscreen(task: ScheduledTask): Promise<TaskExecutionResult> {
	try {
		const existingContext = await chrome.runtime.getContexts({
			contextTypes: ["OFFSCREEN_DOCUMENT" as any],
		});

		if (existingContext.length === 0) {
			await chrome.offscreen.createDocument({
				url: "offscreen.html",
				reasons: ["WORKERS" as any],
				justification: "Scheduled task execution",
			});
		}
	} catch (error) {
		return {
			status: "failed",
			error: `Failed to create offscreen document: ${error}`,
			agentMessages: [],
		};
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			chrome.runtime.onMessage.removeListener(listener);
			resolve({
				status: "timeout",
				error: "Offscreen document did not respond within 10 minutes",
				agentMessages: [],
			});
		}, 10 * 60 * 1000);

		function listener(message: any) {
			if (message.type === "task-result") {
				clearTimeout(timeout);
				chrome.runtime.onMessage.removeListener(listener);
				resolve(message.result);
			}
		}

		chrome.runtime.onMessage.addListener(listener);

		chrome.runtime.sendMessage({ type: "execute-task", task }).catch((err) => {
			clearTimeout(timeout);
			chrome.runtime.onMessage.removeListener(listener);
			resolve({
				status: "failed",
				error: `Failed to send task to offscreen: ${err}`,
				agentMessages: [],
			});
		});
	});
}

// IndexedDB direct access for background (bypasses Store abstraction)
function openSchedulerDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open("sitegeist-storage", 4);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
		request.onupgradeneeded = () => {};
	});
}

async function getTaskFromStorage(taskId: string): Promise<ScheduledTask | null> {
	const db = await openSchedulerDB();
	return new Promise((resolve) => {
		const tx = db.transaction(SCHEDULE_STORE_NAME, "readonly");
		const store = tx.objectStore(SCHEDULE_STORE_NAME);
		const req = store.get(taskId);
		req.onsuccess = () => resolve(req.result ?? null);
		req.onerror = () => resolve(null);
	});
}

async function saveTask(task: ScheduledTask): Promise<void> {
	const db = await openSchedulerDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(SCHEDULE_STORE_NAME, "readwrite");
		const store = tx.objectStore(SCHEDULE_STORE_NAME);
		store.put(task);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

async function saveExecutionLog(log: TaskExecutionLog): Promise<void> {
	const db = await openSchedulerDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(EXECUTION_LOG_STORE_NAME, "readwrite");
		const store = tx.objectStore(EXECUTION_LOG_STORE_NAME);
		store.put(log);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

async function updateCronAlarm(task: ScheduledTask, nextTime: Date): Promise<void> {
	await chrome.alarms.create(alarmNameForTask(task.id), {
		when: nextTime.getTime(),
		periodInMinutes: 1440,
	});
}

// Public API for sidepanel to create/update/delete alarms
async function registerAlarmForTask(task: ScheduledTask): Promise<void> {
	const name = alarmNameForTask(task.id);

	switch (task.schedule.type) {
		case "once": {
			const when = new Date(task.schedule.at).getTime();
			if (when <= Date.now()) {
				console.warn("[Scheduler] Cannot create alarm for past time");
				return;
			}
			await chrome.alarms.create(name, { when });
			task.nextRunAt = task.schedule.at;
			break;
		}
		case "interval": {
			await chrome.alarms.create(name, { periodInMinutes: Math.max(task.schedule.minutes, 1) });
			const alarm = await chrome.alarms.get(name);
			if (alarm?.scheduledTime) {
				task.nextRunAt = new Date(alarm.scheduledTime).toISOString();
			}
			break;
		}
		case "cron": {
			const nextTime = getNextCronTime(task.schedule.expression);
			await chrome.alarms.create(name, { when: nextTime.getTime(), periodInMinutes: 1440 });
			task.nextRunAt = nextTime.toISOString();
			break;
		}
	}

	await saveTask(task);
}

async function removeAlarmForTask(taskId: string): Promise<void> {
	await chrome.alarms.clear(alarmNameForTask(taskId));
}

// Recovery: restore alarms for all enabled tasks on Service Worker startup
async function restoreAlarms(): Promise<void> {
	try {
		const db = await openSchedulerDB();
		const tasks: ScheduledTask[] = await new Promise((resolve) => {
			const tx = db.transaction(SCHEDULE_STORE_NAME, "readonly");
			const store = tx.objectStore(SCHEDULE_STORE_NAME);
			const req = store.getAll();
			req.onsuccess = () => resolve(req.result || []);
			req.onerror = () => resolve([]);
		});

		const enabledTasks = tasks.filter((t) => t.enabled);
		console.log(`[Scheduler] Restoring alarms for ${enabledTasks.length} enabled tasks`);

		for (const task of enabledTasks) {
			const name = alarmNameForTask(task.id);
			const existing = await chrome.alarms.get(name);
			if (!existing) {
				console.log(`[Scheduler] Restoring alarm for task: ${task.name}`);
				await registerAlarmForTask(task);
			}
		}

		// Mark stale running logs as failed
		const runningLogs: TaskExecutionLog[] = await new Promise((resolve) => {
			const tx = db.transaction(EXECUTION_LOG_STORE_NAME, "readonly");
			const store = tx.objectStore(EXECUTION_LOG_STORE_NAME);
			const req = store.getAll();
			req.onsuccess = () => resolve(req.result || []);
			req.onerror = () => resolve([]);
		});

		const cutoff = Date.now() - 15 * 60 * 1000;
		for (const log of runningLogs) {
			if (log.status === "running" && new Date(log.startedAt).getTime() < cutoff) {
				log.status = "failed";
				log.error = "Task interrupted (service worker restart)";
				log.finishedAt = new Date().toISOString();
				await saveExecutionLog(log);
			}
		}
	} catch (error) {
		console.error("[Scheduler] Failed to restore alarms:", error);
	}
}

restoreAlarms();
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/background.ts
git commit -m "feat: add background scheduler with alarm management and execution queue"
```

---

### Task 10: i18n Keys

**Files:**
- Modify: `src/utils/i18n-extension.ts`

- [ ] **Step 1: Add i18n key declarations**

In `src/utils/i18n-extension.ts`, add the following keys to the English `i18nMessages` interface declaration:

```typescript
// Scheduled Tasks
"Scheduled Tasks": string;
"No scheduled tasks yet": string;
"Create a task to let the Agent complete web operations on schedule.": string;
"New Task": string;
"Edit Task": string;
"Task Name": string;
"Task Description": string;
"Target URL (optional)": string;
"Schedule Rule": string;
"One-time": string;
"Interval": string;
"Cron": string;
"Execution Time": string;
"Every N minutes": string;
"Minimum 1 minute": string;
"Cron Expression": string;
"min hour day month weekday": string;
"Execution Mode": string;
"Silent (background)": string;
"Visible (open tab)": string;
"Save": string;
"Delete task \"{name}\"?": string;
"Enable": string;
"Disable": string;
"Execution History": string;
"View Details": string;
"No execution history": string;
"Last run": string;
"Next run": string;
"Enabled": string;
"Disabled": string;
"Success": string;
"Failed": string;
"Timeout": string;
"Running": string;
"Every day at 09:00": string;
"Every hour": string;
"Every Monday": string;
"1st of each month": string;
```

And add Chinese translations in the `zh` object:

```typescript
"Scheduled Tasks": "定时任务",
"No scheduled tasks yet": "暂无定时任务",
"Create a task to let the Agent complete web operations on schedule.": "创建一个任务，让 Agent 按时帮你完成网页操作。",
"New Task": "新建任务",
"Edit Task": "编辑任务",
"Task Name": "任务名称",
"Task Description": "任务描述",
"Target URL (optional)": "目标网址（可选）",
"Schedule Rule": "调度规则",
"One-time": "一次性",
"Interval": "定时循环",
"Cron": "Cron",
"Execution Time": "执行时间",
"Every N minutes": "每 N 分钟",
"Minimum 1 minute": "最小 1 分钟",
"Cron Expression": "Cron 表达式",
"min hour day month weekday": "分 时 日 月 星期",
"Execution Mode": "执行模式",
"Silent (background)": "静默（后台执行）",
"Visible (open tab)": "可见（打开标签页）",
"Delete task \"{name}\"?": "删除任务「{name}」？",
"Enable": "启用",
"Disable": "暂停",
"Execution History": "执行历史",
"View Details": "查看详情",
"No execution history": "暂无执行历史",
"Last run": "上次运行",
"Next run": "下次运行",
"Enabled": "已启用",
"Disabled": "已暂停",
"Success": "成功",
"Failed": "失败",
"Timeout": "超时",
"Running": "运行中",
"Every day at 09:00": "每天 09:00",
"Every hour": "每小时",
"Every Monday": "每周一",
"1st of each month": "每月 1 号",
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/utils/i18n-extension.ts
git commit -m "feat: add i18n keys for scheduled tasks UI"
```

---

### Task 11: ScheduledTasksTab UI

**Files:**
- Create: `src/dialogs/ScheduledTasksTab.ts`

This is the main task list shown inside the Settings dialog as a tab.

- [ ] **Step 1: Create ScheduledTasksTab**

```typescript
// src/dialogs/ScheduledTasksTab.ts

import { i18n } from "@mariozechner/mini-lit";
import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { icon } from "@mariozechner/mini-lit/dist/icons.js";
import { html, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { Clock, Pause, Play, Trash2, Plus, History } from "lucide";
import { getSitegeistStorage } from "../storage/app-storage.js";
import type { ScheduledTask } from "../scheduler/types.js";
import { alarmNameForTask, taskIdFromAlarmName } from "../scheduler/types.js";
import { SettingsTab } from "../web-ui/index.js";
import { TaskEditorDialog } from "./TaskEditorDialog.js";
import { ExecutionHistoryDialog } from "./ExecutionHistoryDialog.js";
import { cronToHumanReadable } from "../scheduler/cron-parser.js";
import "../utils/i18n-extension.js";

export class ScheduledTasksTab extends SettingsTab {
	@state() private tasks: ScheduledTask[] = [];

	getTabName(): string {
		return i18n("Scheduled Tasks");
	}

	override async connectedCallback() {
		super.connectedCallback();
		await this.loadTasks();
	}

	private async loadTasks(): Promise<void> {
		const storage = getSitegeistStorage();
		this.tasks = await storage.schedule.listAll();
		this.tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}

	private async createTask(): Promise<void> {
		await TaskEditorDialog.open(null, async (task) => {
			const storage = getSitegeistStorage();
			await storage.schedule.save(task);
			await chrome.runtime.sendMessage({ type: "register-alarm", task });
			await this.loadTasks();
		});
	}

	private async editTask(task: ScheduledTask): Promise<void> {
		await TaskEditorDialog.open(task, async (updated) => {
			const storage = getSitegeistStorage();
			await storage.schedule.save(updated);
			await chrome.runtime.sendMessage({ type: "remove-alarm", taskId: task.id });
			if (updated.enabled) {
				await chrome.runtime.sendMessage({ type: "register-alarm", task: updated });
			}
			await this.loadTasks();
		});
	}

	private async deleteTask(task: ScheduledTask): Promise<void> {
		if (!confirm(i18n('Delete task "{name}"?').replace("{name}", task.name))) return;

		const storage = getSitegeistStorage();
		await storage.schedule.delete(task.id);
		await chrome.runtime.sendMessage({ type: "remove-alarm", taskId: task.id });
		await this.loadTasks();
	}

	private async toggleEnabled(task: ScheduledTask): Promise<void> {
		const storage = getSitegeistStorage();
		task.enabled = !task.enabled;
		task.updatedAt = new Date().toISOString();
		await storage.schedule.save(task);

		if (task.enabled) {
			await chrome.runtime.sendMessage({ type: "register-alarm", task });
		} else {
			await chrome.runtime.sendMessage({ type: "remove-alarm", taskId: task.id });
		}

		await this.loadTasks();
	}

	private openHistory(task: ScheduledTask): void {
		ExecutionHistoryDialog.open(task);
	}

	private formatSchedule(task: ScheduledTask): string {
		switch (task.schedule.type) {
			case "once":
				return new Date(task.schedule.at).toLocaleString();
			case "interval":
				return `Every ${task.schedule.minutes} min`;
			case "cron":
				return cronToHumanReadable(task.schedule.expression);
		}
	}

	private statusBadge(task: ScheduledTask): TemplateResult {
		if (!task.lastRunStatus) {
			return html`<span class="text-xs text-muted-foreground">--</span>`;
		}

		const colorMap: Record<string, string> = {
			success: "text-green-600",
			failed: "text-red-600",
			timeout: "text-orange-600",
		};
		const color = colorMap[task.lastRunStatus] || "text-muted-foreground";
		return html`<span class="text-xs font-medium ${color}">${i18n(task.lastRunStatus.charAt(0).toUpperCase() + task.lastRunStatus.slice(1))}</span>`;
	}

	render(): TemplateResult {
		return html`
			<div class="flex flex-col gap-4">
				<div class="flex items-center justify-between">
					<p class="text-sm text-muted-foreground">
						${this.tasks.length === 0
							? i18n("No scheduled tasks yet")
							: `${this.tasks.length} task(s)`}
					</p>
					${Button({
						variant: "primary",
						size: "sm",
						children: html`${icon(Plus, "sm")} ${i18n("New Task")}`,
						onClick: () => this.createTask(),
					})}
				</div>

				${this.tasks.length === 0
					? html`
						<div class="text-center py-12 text-muted-foreground">
							${icon(Clock, "lg")}
							<p class="mt-3 text-sm">${i18n("Create a task to let the Agent complete web operations on schedule.")}</p>
						</div>
					`
					: this.tasks.map((task) => html`
						<div class="border border-border rounded-lg p-4 bg-card">
							<div class="flex items-start justify-between gap-3">
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2">
										<span class="w-2 h-2 rounded-full flex-shrink-0 ${task.enabled ? "bg-green-500" : "bg-gray-400"}"></span>
										<h3 class="font-medium text-foreground truncate">${task.name}</h3>
									</div>
									<div class="mt-1 text-xs text-muted-foreground">
										${this.formatSchedule(task)}
										${task.lastRunAt ? html` · ${i18n("Last run")}: ${this.statusBadge(task)}` : ""}
									</div>
									${task.nextRunAt && task.enabled
										? html`<div class="text-xs text-muted-foreground mt-0.5">${i18n("Next run")}: ${new Date(task.nextRunAt).toLocaleString()}</div>`
										: ""}
								</div>
								<div class="flex items-center gap-1 flex-shrink-0">
									${Button({
										variant: "ghost",
										size: "sm",
										children: icon(History, "sm"),
										onClick: () => this.openHistory(task),
										title: i18n("Execution History"),
									})}
									${Button({
										variant: "ghost",
										size: "sm",
										children: icon(task.enabled ? Pause : Play, "sm"),
										onClick: () => this.toggleEnabled(task),
										title: task.enabled ? i18n("Disable") : i18n("Enable"),
									})}
									${Button({
										variant: "ghost",
										size: "sm",
										children: icon(Trash2, "sm"),
										onClick: () => this.deleteTask(task),
										title: "Delete",
									})}
								</div>
							</div>
						</div>
					`)}
			</div>
		`;
	}
}

customElements.define("scheduled-tasks-tab", ScheduledTasksTab);
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/dialogs/ScheduledTasksTab.ts
git commit -m "feat: add ScheduledTasksTab for task list UI"
```

---

### Task 12: TaskEditorDialog UI

**Files:**
- Create: `src/dialogs/TaskEditorDialog.ts`

- [ ] **Step 1: Create TaskEditorDialog**

```typescript
// src/dialogs/TaskEditorDialog.ts

import { DialogBase } from "@mariozechner/mini-lit/dist/DialogBase.js";
import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { Input } from "@mariozechner/mini-lit/dist/Input.js";
import { Label } from "@mariozechner/mini-lit/dist/Label.js";
import i18n from "@mariozechner/mini-lit/dist/i18n.js";
import { html, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import type { ScheduledTask, ScheduleConfig } from "../scheduler/types.js";
import "../utils/i18n-extension.js";

type TaskSaveCallback = (task: ScheduledTask) => Promise<void>;

const CRON_PRESETS: { label: string; expression: string }[] = [
	{ label: "Every day at 09:00", expression: "0 9 * * *" },
	{ label: "Every hour", expression: "0 * * * *" },
	{ label: "Every Monday at 09:00", expression: "0 9 * * 1" },
	{ label: "1st of each month at 09:00", expression: "0 9 1 * *" },
];

export class TaskEditorDialog extends DialogBase {
	protected modalWidth = "min(600px, 90vw)";
	protected modalHeight = "auto";

	@state() private name = "";
	@state() private description = "";
	@state() private targetUrl = "";
	@state() private scheduleType: "once" | "interval" | "cron" = "once";
	@state() private onceAt = "";
	@state() private intervalMinutes = 60;
	@state() private cronExpression = "0 9 * * *";
	@state() private executionMode: "silent" | "visible" = "silent";
	@state() private showAdvanced = false;
	@state() private promptTemplate = "";

	private existingTask: ScheduledTask | null = null;
	private saveCallback: TaskSaveCallback | null = null;

	static async open(task: ScheduledTask | null, onSave: TaskSaveCallback): Promise<void> {
		const dialog = new TaskEditorDialog();
		dialog.existingTask = task;
		dialog.saveCallback = onSave;

		if (task) {
			dialog.name = task.name;
			dialog.description = task.description;
			dialog.targetUrl = task.targetUrl || "";
			dialog.scheduleType = task.schedule.type;
			dialog.executionMode = task.executionMode;
			dialog.promptTemplate = task.promptTemplate !== task.description ? task.promptTemplate : "";

			switch (task.schedule.type) {
				case "once":
					dialog.onceAt = task.schedule.at;
					break;
				case "interval":
					dialog.intervalMinutes = task.schedule.minutes;
					break;
				case "cron":
					dialog.cronExpression = task.schedule.expression;
					break;
			}
		} else {
			const now = new Date();
			now.setHours(now.getHours() + 1, 0, 0, 0);
			dialog.onceAt = now.toISOString().slice(0, 16);
		}

		document.body.appendChild(dialog);
		dialog.open();
		dialog.requestUpdate();
	}

	private buildSchedule(): ScheduleConfig {
		switch (this.scheduleType) {
			case "once":
				return { type: "once", at: new Date(this.onceAt).toISOString() };
			case "interval":
				return { type: "interval", minutes: this.intervalMinutes };
			case "cron":
				return { type: "cron", expression: this.cronExpression };
		}
	}

	private async handleSave(): Promise<void> {
		if (!this.name.trim() || !this.description.trim()) return;

		const now = new Date().toISOString();
		const finalPrompt = this.showAdvanced && this.promptTemplate.trim()
			? this.promptTemplate.trim()
			: this.description.trim();

		const task: ScheduledTask = {
			id: this.existingTask?.id || crypto.randomUUID(),
			name: this.name.trim(),
			description: this.description.trim(),
			promptTemplate: finalPrompt,
			schedule: this.buildSchedule(),
			executionMode: this.executionMode,
			targetUrl: this.targetUrl.trim() || undefined,
			enabled: this.existingTask?.enabled ?? true,
			lastRunAt: this.existingTask?.lastRunAt,
			lastRunStatus: this.existingTask?.lastRunStatus,
			nextRunAt: this.existingTask?.nextRunAt,
			createdAt: this.existingTask?.createdAt || now,
			updatedAt: now,
		};

		if (this.saveCallback) {
			await this.saveCallback(task);
		}
		this.close();
	}

	protected override renderContent(): TemplateResult {
		return html`
			<div class="flex flex-col h-full overflow-hidden">
				<div class="p-6 flex-shrink-0 border-b border-border">
					<h2 class="text-lg font-semibold text-foreground">
						${this.existingTask ? i18n("Edit Task") : i18n("New Task")}
					</h2>
				</div>

				<div class="flex-1 overflow-y-auto p-6 space-y-5">
					<div>
						${Label({ children: i18n("Task Name") })}
						${Input({
							value: this.name,
							placeholder: "Daily article publish",
							onInput: (e: Event) => { this.name = (e.target as HTMLInputElement).value; },
						})}
					</div>

					<div>
						${Label({ children: i18n("Task Description") })}
						<textarea
							class="w-full min-h-[100px] rounded-md border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
							.value=${this.description}
							@input=${(e: Event) => { this.description = (e.target as HTMLTextAreaElement).value; }}
							placeholder="Open example.com, fill the article editor with today's content, and click Publish..."
						></textarea>
					</div>

					<div>
						${Label({ children: i18n("Target URL (optional)") })}
						${Input({
							value: this.targetUrl,
							placeholder: "https://example.com/editor",
							onInput: (e: Event) => { this.targetUrl = (e.target as HTMLInputElement).value; },
						})}
					</div>

					<div>
						${Label({ children: i18n("Schedule Rule") })}
						<div class="flex gap-4 mt-2">
							<label class="flex items-center gap-2 cursor-pointer">
								<input type="radio" name="schedule" .checked=${this.scheduleType === "once"}
									@change=${() => { this.scheduleType = "once"; }}
									class="accent-primary" />
								<span class="text-sm">${i18n("One-time")}</span>
							</label>
							<label class="flex items-center gap-2 cursor-pointer">
								<input type="radio" name="schedule" .checked=${this.scheduleType === "interval"}
									@change=${() => { this.scheduleType = "interval"; }}
									class="accent-primary" />
								<span class="text-sm">${i18n("Interval")}</span>
							</label>
							<label class="flex items-center gap-2 cursor-pointer">
								<input type="radio" name="schedule" .checked=${this.scheduleType === "cron"}
									@change=${() => { this.scheduleType = "cron"; }}
									class="accent-primary" />
								<span class="text-sm">${i18n("Cron")}</span>
							</label>
						</div>

						<div class="mt-3">
							${this.scheduleType === "once" ? html`
								${Label({ children: i18n("Execution Time") })}
								<input type="datetime-local"
									class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
									.value=${this.onceAt}
									@input=${(e: Event) => { this.onceAt = (e.target as HTMLInputElement).value; }} />
							` : ""}

							${this.scheduleType === "interval" ? html`
								${Label({ children: i18n("Every N minutes") })}
								${Input({
									type: "number",
									value: String(this.intervalMinutes),
									onInput: (e: Event) => {
										this.intervalMinutes = Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1);
									},
								})}
								<p class="text-xs text-muted-foreground mt-1">${i18n("Minimum 1 minute")}</p>
							` : ""}

							${this.scheduleType === "cron" ? html`
								<div class="space-y-2">
									<div class="flex flex-wrap gap-2">
										${CRON_PRESETS.map((preset) => html`
											<button
												class="text-xs px-2 py-1 rounded border border-border hover:bg-muted transition-colors"
												@click=${() => { this.cronExpression = preset.expression; }}>
												${preset.label}
											</button>
										`)}
									</div>
									${Label({ children: i18n("Cron Expression") })}
									${Input({
										value: this.cronExpression,
										placeholder: "0 9 * * 1",
										onInput: (e: Event) => { this.cronExpression = (e.target as HTMLInputElement).value; },
									})}
									<p class="text-xs text-muted-foreground">${i18n("min hour day month weekday")}</p>
								</div>
							` : ""}
						</div>
					</div>

					<div>
						${Label({ children: i18n("Execution Mode") })}
						<div class="flex gap-4 mt-2">
							<label class="flex items-center gap-2 cursor-pointer">
								<input type="radio" name="mode" .checked=${this.executionMode === "silent"}
									@change=${() => { this.executionMode = "silent"; }}
									class="accent-primary" />
								<span class="text-sm">${i18n("Silent (background)")}</span>
							</label>
							<label class="flex items-center gap-2 cursor-pointer">
								<input type="radio" name="mode" .checked=${this.executionMode === "visible"}
									@change=${() => { this.executionMode = "visible"; }}
									class="accent-primary" />
								<span class="text-sm">${i18n("Visible (open tab)")}</span>
							</label>
						</div>
					</div>

					<div>
						<button
							class="text-xs text-primary hover:underline"
							@click=${() => { this.showAdvanced = !this.showAdvanced; }}>
							${this.showAdvanced ? "Hide Advanced" : "Show Advanced"}
						</button>
						${this.showAdvanced ? html`
							<div class="mt-2">
								${Label({ children: "Prompt Template" })}
								<textarea
									class="w-full min-h-[80px] rounded-md border border-border bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
									.value=${this.promptTemplate || this.description}
									@input=${(e: Event) => { this.promptTemplate = (e.target as HTMLTextAreaElement).value; }}
								></textarea>
								${this.promptTemplate ? html`
									<button
										class="text-xs text-muted-foreground hover:text-foreground mt-1"
										@click=${() => { this.promptTemplate = ""; }}>
										Reset to description
									</button>
								` : ""}
							</div>
						` : ""}
					</div>
				</div>

				<div class="p-6 flex-shrink-0 border-t border-border flex justify-end gap-3">
					${Button({
						variant: "outline",
						children: i18n("Cancel"),
						onClick: () => this.close(),
					})}
					${Button({
						variant: "primary",
						children: i18n("Save"),
						onClick: () => this.handleSave(),
						disabled: !this.name.trim() || !this.description.trim(),
					})}
				</div>
			</div>
		`;
	}
}

customElements.define("task-editor-dialog", TaskEditorDialog);
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/dialogs/TaskEditorDialog.ts
git commit -m "feat: add TaskEditorDialog for creating and editing scheduled tasks"
```

---

### Task 13: ExecutionHistoryDialog UI

**Files:**
- Create: `src/dialogs/ExecutionHistoryDialog.ts`

- [ ] **Step 1: Create ExecutionHistoryDialog**

```typescript
// src/dialogs/ExecutionHistoryDialog.ts

import { DialogBase } from "@mariozechner/mini-lit/dist/DialogBase.js";
import i18n from "@mariozechner/mini-lit/dist/i18n.js";
import { html, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { getSitegeistStorage } from "../storage/app-storage.js";
import type { ScheduledTask, TaskExecutionLog } from "../scheduler/types.js";
import "../utils/i18n-extension.js";

export class ExecutionHistoryDialog extends DialogBase {
	protected modalWidth = "min(700px, 90vw)";
	protected modalHeight = "80vh";

	@state() private logs: TaskExecutionLog[] = [];
	@state() private expandedLogId: string | null = null;

	private task: ScheduledTask | null = null;

	static open(task: ScheduledTask): void {
		const dialog = new ExecutionHistoryDialog();
		dialog.task = task;
		document.body.appendChild(dialog);
		dialog.open();
		dialog.loadLogs();
	}

	private async loadLogs(): Promise<void> {
		if (!this.task) return;
		const storage = getSitegeistStorage();
		this.logs = await storage.executionLogs.listByTask(this.task.id);
		this.requestUpdate();
	}

	private toggleExpand(logId: string): void {
		this.expandedLogId = this.expandedLogId === logId ? null : logId;
	}

	private formatDuration(startedAt: string, finishedAt?: string): string {
		if (!finishedAt) return "--";
		const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
	}

	private statusColor(status: string): string {
		switch (status) {
			case "success": return "text-green-600";
			case "failed": return "text-red-600";
			case "timeout": return "text-orange-600";
			case "running": return "text-blue-600";
			default: return "text-muted-foreground";
		}
	}

	protected override renderContent(): TemplateResult {
		const taskName = this.task?.name || "";

		return html`
			<div class="flex flex-col h-full overflow-hidden">
				<div class="p-6 flex-shrink-0 border-b border-border">
					<h2 class="text-lg font-semibold text-foreground">
						${i18n("Execution History")} - ${taskName}
					</h2>
				</div>

				<div class="flex-1 overflow-y-auto p-6">
					${this.logs.length === 0
						? html`<p class="text-center text-muted-foreground py-12">${i18n("No execution history")}</p>`
						: this.logs.map((log) => html`
							<div class="border border-border rounded-lg mb-3 bg-card">
								<div class="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
									@click=${() => this.toggleExpand(log.id)}>
									<div class="flex items-center gap-3">
										<span class="text-sm text-muted-foreground">
											${new Date(log.startedAt).toLocaleString()}
										</span>
										<span class="text-sm font-medium ${this.statusColor(log.status)}">
											${i18n(log.status.charAt(0).toUpperCase() + log.status.slice(1))}
										</span>
									</div>
									<span class="text-xs text-muted-foreground">
										${this.formatDuration(log.startedAt, log.finishedAt)}
									</span>
								</div>

								${this.expandedLogId === log.id ? html`
									<div class="px-4 pb-4 border-t border-border pt-3 space-y-3">
										${log.error ? html`
											<div>
												<div class="text-xs font-medium text-red-600 mb-1">Error</div>
												<p class="text-sm text-muted-foreground">${log.error}</p>
											</div>
										` : ""}

										${log.summary ? html`
											<div>
												<div class="text-xs font-medium text-muted-foreground mb-1">Summary</div>
												<p class="text-sm">${log.summary}</p>
											</div>
										` : ""}

										${log.agentMessages.length > 0 ? html`
											<div>
												<div class="text-xs font-medium text-muted-foreground mb-1">Agent Messages (${log.agentMessages.length})</div>
												<div class="max-h-[200px] overflow-y-auto rounded border border-border p-2 bg-background">
													${log.agentMessages.map((msg) => html`
														<div class="text-xs font-mono mb-1 ${msg.role === "assistant" ? "text-blue-600" : "text-muted-foreground"}">
															[${msg.role}] ${typeof (msg as any).content === "string"
																? (msg as any).content.slice(0, 200)
																: JSON.stringify((msg as any).content).slice(0, 200)}
														</div>
													`)}
												</div>
											</div>
										` : ""}
									</div>
								` : ""}
							</div>
						`)}
				</div>
			</div>
		`;
	}
}

customElements.define("execution-history-dialog", ExecutionHistoryDialog);
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/dialogs/ExecutionHistoryDialog.ts
git commit -m "feat: add ExecutionHistoryDialog for viewing task run history"
```

---

### Task 14: Wire UI into Sidepanel

**Files:**
- Modify: `src/sidepanel.ts`

- [ ] **Step 1: Add ScheduledTasksTab to Settings dialog**

In `src/sidepanel.ts`, add the import near the other dialog imports:

```typescript
import { ScheduledTasksTab } from "./dialogs/ScheduledTasksTab.js";
```

Then in both places where `SettingsDialog.open([...])` is called (around line 187 and line 743), add `new ScheduledTasksTab()` to the tabs array:

```typescript
SettingsDialog.open([
    new ProvidersModelsTab(),
    new ApiKeysOAuthTab(),
    new CostsTab(),
    new SkillsTab(),
    new ScheduledTasksTab(),
    new ProxyTab(),
    new AboutTab(),
]),
```

- [ ] **Step 2: Run check.sh**

Run: `./check.sh`
Expected: All checks pass (formatting, linting, type checking)

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel.ts
git commit -m "feat: add ScheduledTasksTab to settings dialog"
```

---

### Task 15: CHANGELOG and Final Verification

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update CHANGELOG.md**

Add the following under `## [Unreleased]` > `### Added`:

```markdown
- Scheduled tasks: create, edit, and manage timed Agent operations via Settings > Scheduled Tasks
- Support for one-time, interval, and cron-based scheduling
- Silent (background) and visible execution modes
- Execution history with full Agent conversation logs
- Chrome notifications on task completion, failure, or timeout
```

- [ ] **Step 2: Run full check**

Run: `./check.sh`
Expected: All checks pass

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add scheduled tasks changelog entry"
```
