import { getBuiltinModel } from "@earendil-works/pi-ai/providers/all";
import { isOAuthCredentials, resolveApiKey } from "./oauth/index.js";
import { getNextCronTime } from "./scheduler/cron-parser.js";
import { sendTaskNotification } from "./scheduler/notifications.js";
import type { ScheduledTask, TaskExecutionResult } from "./scheduler/types.js";
import { alarmNameForTask, taskIdFromAlarmName } from "./scheduler/types.js";
import type { LockedSessionsMessage, LockResultMessage, SidepanelToBackgroundMessage } from "./utils/port.js";

// Called when Sitegeist icon is clicked - opens sidepanel for current tab
chrome.action.onClicked.addListener((tab: chrome.tabs.Tab) => {
	const tabId = tab?.id;
	if (tabId && chrome.sidePanel.open) {
		chrome.sidePanel.open({ tabId });
	}
});

// Listen for messages from userScripts (overlay in page)
console.log("[Background] onUserScriptMessage available:", !!chrome.runtime.onUserScriptMessage);
if (chrome.runtime.onUserScriptMessage) {
	chrome.runtime.onUserScriptMessage.addListener((message, sender, sendResponse) => {
		console.log("[Background] Received userScript message:", message, "from:", sender);
		if (message.type === "abort-repl") {
			// Forward to all open sidepanels (they'll check if they're streaming)
			console.log("[Background] Relaying abort-repl to sidepanels");
			chrome.runtime.sendMessage(message);
			sendResponse({ success: true });
			return true;
		}
	});
	console.log("[Background] onUserScriptMessage listener registered");
} else {
	console.error("[Background] onUserScriptMessage NOT available!");
}

// Storage keys for tracking state (persists across service worker sleep)
const SIDEPANEL_OPEN_KEY = "sidepanel_open_windows";
const SESSION_LOCKS_KEY = "session_locks"; // sessionId -> windowId mapping

// Synchronously readable cache of which sidepanels are open
// Gets populated on startup and updated by port events
let openSidepanels = new Set<number>();

// Initialize cache from storage on startup
chrome.storage.session.get(SIDEPANEL_OPEN_KEY, (data) => {
	openSidepanels = new Set<number>((data[SIDEPANEL_OPEN_KEY] as number[]) || []);
	console.log("[Background] Initialized openSidepanels cache:", Array.from(openSidepanels));
});

// Handle port connections from sidepanels
chrome.runtime.onConnect.addListener((port: chrome.runtime.Port) => {
	// Port name format: "sidepanel:${windowId}"
	const match = /^sidepanel:(\d+)$/.exec(port.name);
	if (!match) return;

	const windowId = Number(match[1]);

	// Update cache synchronously
	openSidepanels.add(windowId);

	// Mark sidepanel as open in persistent storage (survives service worker sleep)
	chrome.storage.session.get(SIDEPANEL_OPEN_KEY, (data) => {
		const openWindows = new Set<number>((data[SIDEPANEL_OPEN_KEY] as number[]) || []);
		openWindows.add(windowId);
		chrome.storage.session.set({ [SIDEPANEL_OPEN_KEY]: Array.from(openWindows) });
	});

	port.onMessage.addListener((msg: SidepanelToBackgroundMessage) => {
		if (msg.type === "acquireLock") {
			const { sessionId, windowId: reqWindowId } = msg;

			// Read current locks from persistent storage
			chrome.storage.session.get(SESSION_LOCKS_KEY, (data) => {
				const sessionLocks: Record<string, number> = (data[SESSION_LOCKS_KEY] as Record<string, number>) || {};
				const ownerWindowId = sessionLocks[sessionId];
				const ownerSidepanelOpen = ownerWindowId !== undefined && openSidepanels.has(ownerWindowId);

				// Grant lock if: no owner, owner sidepanel closed, or requesting window is owner
				const success = !ownerWindowId || !ownerSidepanelOpen || ownerWindowId === reqWindowId;

				const response: LockResultMessage = success
					? {
							type: "lockResult",
							sessionId,
							success: true,
						}
					: {
							type: "lockResult",
							sessionId,
							success: false,
							ownerWindowId,
						};

				if (success) {
					// Update locks in storage
					sessionLocks[sessionId] = reqWindowId;
					chrome.storage.session.set({ [SESSION_LOCKS_KEY]: sessionLocks });
				}

				port.postMessage(response);
			});
		} else if (msg.type === "getLockedSessions") {
			// Read current locks from persistent storage
			chrome.storage.session.get(SESSION_LOCKS_KEY, (data) => {
				const locks: Record<string, number> = (data[SESSION_LOCKS_KEY] as Record<string, number>) || {};
				const response: LockedSessionsMessage = {
					type: "lockedSessions",
					locks,
				};
				port.postMessage(response);
			});
		}
	});

	port.onDisconnect.addListener(() => {
		closeSidepanel(windowId, false);
	});
});

// Clean up locks when entire window closes (belt-and-suspenders)
chrome.windows.onRemoved.addListener((windowId: number) => {
	closeSidepanel(windowId, false);
});

// Handle keyboard shortcut - toggle sidepanel open/close
chrome.commands.onCommand.addListener((command: string, sender?: chrome.tabs.Tab) => {
	if (command === "toggle-sidepanel") {
		if (!sender?.windowId) {
			console.log("[Background] Cannot toggle sidepanel: sender windowId not available");
			return;
		}

		const windowId = sender.windowId;

		// Check synchronous cache (populated from storage on startup and updated by port events)
		if (openSidepanels.has(windowId)) {
			// Sidepanel is open - close it using Chrome 141+ API
			closeSidepanel(windowId);
		} else {
			// Sidepanel is closed - open it
			chrome.sidePanel.open({ windowId });
		}
	}
});

function closeSidepanel(windowId: number, callCloseOnSidePanelAPI: boolean = true) {
	if (callCloseOnSidePanelAPI) {
		(chrome.sidePanel as any).close({ windowId });
	}

	// Update cache synchronously
	openSidepanels.delete(windowId);

	// Clean up storage state (same logic as onDisconnect)
	chrome.storage.session.get([SESSION_LOCKS_KEY, SIDEPANEL_OPEN_KEY], (data) => {
		// Release session locks for this window
		const sessionLocks: Record<string, number> = (data[SESSION_LOCKS_KEY] as Record<string, number>) || {};
		for (const sessionId in sessionLocks) {
			if (sessionLocks[sessionId] === windowId) {
				delete sessionLocks[sessionId];
			}
		}

		// Mark sidepanel as closed
		const openWindows = new Set<number>((data[SIDEPANEL_OPEN_KEY] as number[]) || []);
		openWindows.delete(windowId);

		// Save both updates atomically
		chrome.storage.session.set({
			[SESSION_LOCKS_KEY]: sessionLocks,
			[SIDEPANEL_OPEN_KEY]: Array.from(openWindows),
		});
	});
}

// ============================================================================
// SCHEDULED TASK SCHEDULER
// ============================================================================

const SCHEDULE_STORE_NAME = "scheduled_tasks";

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
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "register-alarm") {
		registerAlarmForTask(message.task)
			.then(() => {
				sendResponse({ success: true });
			})
			.catch((err: unknown) => {
				sendResponse({ success: false, error: String(err) });
			});
		return true;
	}
	if (message.type === "remove-alarm") {
		removeAlarmForTask(message.taskId)
			.then(() => {
				sendResponse({ success: true });
			})
			.catch((err: unknown) => {
				sendResponse({ success: false, error: String(err) });
			});
		return true;
	}
	if (message.type === "get-api-key") {
		console.log("[Scheduler] API key request for provider:", message.provider);
		resolveApiKeyForOffscreen(message.provider)
			.then((apiKey) => {
				console.log("[Scheduler] API key resolved:", { provider: message.provider, hasKey: !!apiKey });
				sendResponse({ apiKey });
			})
			.catch((err) => {
				console.error("[Scheduler] Failed to resolve API key:", err);
				sendResponse({ apiKey: undefined });
			});
		return true;
	}
	if (message.type === "scheduled-task-complete") {
		console.log("[Scheduler] Task completion reported:", {
			taskId: message.taskId,
			sessionId: message.sessionId,
			status: message.status,
		});
		handleForegroundTaskComplete(message.taskId, message.sessionId, message.status, message.error)
			.then(() => {
				sendResponse({ success: true });
			})
			.catch((err: unknown) => {
				sendResponse({ success: false, error: String(err) });
			});
		return true;
	}
	return false;
});

// Handle notification clicks - open sidepanel with the associated session
chrome.notifications.onClicked.addListener(async (notificationId: string) => {
	if (!notificationId.startsWith("task-result-")) return;

	try {
		const data = await chrome.storage.session.get("notification_session_map");
		const map: Record<string, string> = (data.notification_session_map as Record<string, string>) || {};
		const sessionId = map[notificationId];

		if (sessionId) {
			// Clean up mapping
			delete map[notificationId];
			await chrome.storage.session.set({ notification_session_map: map });

			// Open sidepanel HTML as a new tab with session parameter
			const url = chrome.runtime.getURL(`sidepanel.html?session=${sessionId}`);
			await chrome.tabs.create({ url });
		}
	} catch (err) {
		console.error("[Scheduler] Failed to handle notification click:", err);
	}

	// Clear the notification
	try {
		chrome.notifications.clear(notificationId);
	} catch {
		// ignore
	}
});

async function executeTaskById(taskId: string): Promise<void> {
	console.log("[Scheduler] Starting task execution:", taskId);
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
		console.log("[Scheduler] Loaded task:", { name: task.name, hasModel: !!task.model });

		const sessionId = crypto.randomUUID();

		// Save initial "running" session so it exists even if the task crashes
		await saveTaskSession(
			task,
			sessionId,
			{ status: "failed", error: "Task interrupted", agentMessages: [] },
			"running",
		);

		try {
			(chrome.power as any)?.requestKeepAwake?.("system");
		} catch {
			// power API may not be available
		}

		// Try foreground execution first (runs in sidepanel with streaming)
		// Fall back to offscreen if no sidepanel is available
		let result: TaskExecutionResult;
		const foregroundResult = await runTaskInForeground(task, sessionId);
		if (foregroundResult) {
			console.log("[Scheduler] Foreground execution completed:", {
				status: foregroundResult.status,
				error: foregroundResult.error,
			});
			result = foregroundResult;
		} else {
			console.log("[Scheduler] No sidepanel available, falling back to offscreen");
			result = await runTaskInOffscreen(task);
			console.log("[Scheduler] Offscreen execution completed:", {
				status: result.status,
				error: result.error,
				messageCount: result.agentMessages?.length || 0,
			});
			// Update session with offscreen results
			await saveTaskSession(task, sessionId, result, result.status);
		}

		task.lastRunAt = new Date().toISOString();
		task.lastRunStatus = result.status;
		task.lastSessionId = sessionId;
		task.updatedAt = new Date().toISOString();

		if (task.schedule.type === "once") {
			task.enabled = false;
		} else if (task.schedule.type === "cron") {
			const nextTime = getNextCronTime(task.schedule.expression);
			task.nextRunAt = nextTime.toISOString();
			await updateCronAlarm(task, nextTime);
		}

		await saveTask(task);
		await sendTaskNotification(task.name, result.status, result.error, sessionId);
	} catch (error) {
		console.error(`[Scheduler] Error executing task ${taskId}:`, error);
	} finally {
		try {
			(chrome.power as any)?.releaseKeepAwake?.();
		} catch {
			// ignore
		}

		try {
			await chrome.offscreen.closeDocument();
		} catch {
			// may already be closed
		}

		isExecuting = false;

		if (pendingQueue.length > 0) {
			const nextTaskId = pendingQueue.shift()!;
			console.log(`[Scheduler] Processing queue task: ${nextTaskId}`);
			executeTaskById(nextTaskId);
		}
	}
}

// Save or update a session for a scheduled task execution
async function saveTaskSession(
	task: ScheduledTask,
	sessionId: string,
	result: TaskExecutionResult,
	status: "running" | "success" | "failed" | "timeout",
): Promise<void> {
	const db = await openSchedulerDB();
	const now = new Date().toISOString();
	const nowMs = Date.now();

	// Read existing session to preserve createdAt
	let createdAt = now;
	try {
		const existing: { createdAt: string } | null = await new Promise((resolve) => {
			const tx = db.transaction("sessions", "readonly");
			const req = tx.objectStore("sessions").get(sessionId);
			req.onsuccess = () => resolve(req.result ?? null);
			req.onerror = () => resolve(null);
		});
		if (existing?.createdAt) {
			createdAt = existing.createdAt;
		}
	} catch {
		// ignore
	}

	// Build messages array from agent messages
	// agentMessages from offscreen already includes the user message from agent.prompt()
	// via message_end events, so check before prepending
	const agentMsgs = result.agentMessages || [];
	const firstMsgIsUser = agentMsgs.length > 0 && (agentMsgs[0] as { role?: string }).role === "user";

	const messages: unknown[] = [];

	if (!firstMsgIsUser) {
		// Prepend user message in proper AgentMessage format
		messages.push({
			role: "user",
			content: [{ type: "text", text: task.promptTemplate }],
			timestamp: nowMs,
		});
	}

	messages.push(...agentMsgs);

	// If there's an error, append it as an assistant message for visibility
	if (result.error && status !== "running") {
		messages.push({
			role: "assistant",
			content: [{ type: "text", text: `[Task ${status}] ${result.error}` }],
			api: "anthropic-messages",
			provider: "anthropic",
			model: task.model?.id || "claude-sonnet-4-6",
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "error",
			errorMessage: result.error,
			timestamp: nowMs,
		});
	}

	const statusLabel = status === "success" ? "" : ` [${status}]`;
	const title = `${task.name}${statusLabel} - ${now}`;

	console.log(`[Scheduler] Saving session: status=${status}, messages=${messages.length}, title="${title}"`);

	// Calculate cumulative usage from assistant messages
	const usage = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};

	for (const msg of agentMsgs) {
		const m = msg as { role: string; usage?: typeof usage };
		if (m.role === "assistant" && m.usage) {
			usage.input += m.usage.input || 0;
			usage.output += m.usage.output || 0;
			usage.cacheRead += m.usage.cacheRead || 0;
			usage.cacheWrite += m.usage.cacheWrite || 0;
			usage.totalTokens +=
				(m.usage.input || 0) + (m.usage.output || 0) + (m.usage.cacheRead || 0) + (m.usage.cacheWrite || 0);
			if (m.usage.cost) {
				usage.cost.input += m.usage.cost.input || 0;
				usage.cost.output += m.usage.cost.output || 0;
				usage.cost.cacheRead += m.usage.cost.cacheRead || 0;
				usage.cost.cacheWrite += m.usage.cost.cacheWrite || 0;
				usage.cost.total += m.usage.cost.total || 0;
			}
		}
	}

	// Generate preview text (first 2KB of conversation)
	let preview = "";
	for (const msg of messages) {
		if (preview.length >= 2048) break;
		const m = msg as { role: string; content: unknown };
		if (m.role === "user") {
			const content = m.content;
			if (typeof content === "string") {
				preview += `${content}\n`;
			} else if (Array.isArray(content)) {
				preview += content
					.filter((block: { type?: string }) => block.type === "text")
					.map((block: { text?: string }) => block.text || "")
					.join("\n");
				preview += "\n";
			}
		} else if (m.role === "assistant") {
			const content = m.content;
			if (Array.isArray(content)) {
				preview += content
					.filter((block: { type?: string }) => block.type === "text")
					.map((block: { text?: string }) => block.text || "")
					.join("\n");
			}
			preview += "\n";
		}
	}
	preview = preview.substring(0, 2048);

	const sessionData = {
		id: sessionId,
		title,
		model: task.model || getBuiltinModel("anthropic", "claude-sonnet-4-6"),
		thinkingLevel: "medium" as const,
		messages,
		createdAt,
		lastModified: now,
		source: "scheduled",
		taskId: task.id,
	};

	const metadata = {
		id: sessionId,
		title,
		createdAt,
		lastModified: now,
		messageCount: messages.length,
		usage,
		thinkingLevel: "medium" as const,
		preview,
		source: "scheduled",
		taskId: task.id,
	};

	return new Promise((resolve, reject) => {
		const tx = db.transaction(["sessions", "sessions-metadata"], "readwrite");
		tx.objectStore("sessions").put(sessionData);
		tx.objectStore("sessions-metadata").put(metadata);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

// Track pending foreground task completion
let pendingForegroundTask: {
	sessionId: string;
	taskId: string;
	resolve: (result: TaskExecutionResult) => void;
	timeout: ReturnType<typeof setTimeout>;
} | null = null;

async function handleForegroundTaskComplete(
	_taskId: string,
	sessionId: string,
	status: "success" | "failed" | "timeout",
	error?: string,
): Promise<void> {
	if (pendingForegroundTask && pendingForegroundTask.sessionId === sessionId) {
		clearTimeout(pendingForegroundTask.timeout);
		pendingForegroundTask.resolve({
			status,
			error,
			agentMessages: [],
		});
		pendingForegroundTask = null;
	}
}

async function runTaskInForeground(task: ScheduledTask, sessionId: string): Promise<TaskExecutionResult | null> {
	console.log("[Scheduler] Attempting foreground execution for task:", task.name);

	// Check if any sidepanel is open
	if (openSidepanels.size === 0) {
		console.log("[Scheduler] No sidepanel open, cannot run in foreground");
		return null;
	}

	// Create target tab for the task
	let tabId: number | undefined;
	if (task.targetUrl) {
		try {
			const tab = await chrome.tabs.create({
				url: task.targetUrl,
				active: true,
			});
			tabId = tab.id;
			console.log("[Scheduler] Created target tab:", tabId);
		} catch (error) {
			return {
				status: "failed",
				error: `Failed to create target tab: ${error instanceof Error ? error.message : String(error)}`,
				agentMessages: [],
			};
		}
	}

	// Send task to sidepanel for execution
	// The sidepanel will navigate to the session and run the task with streaming
	return new Promise<TaskExecutionResult>((resolve) => {
		const timeout = setTimeout(
			() => {
				console.warn("[Scheduler] Foreground task timeout after 10 minutes");
				pendingForegroundTask = null;
				resolve({
					status: "timeout",
					error: "Task exceeded 10-minute timeout",
					agentMessages: [],
				});
			},
			10 * 60 * 1000,
		);

		pendingForegroundTask = {
			sessionId,
			taskId: task.id,
			resolve,
			timeout,
		};

		// Send message to all sidepanels (the active one will handle it)
		chrome.runtime
			.sendMessage({
				type: "execute-scheduled-task",
				taskId: task.id,
				sessionId,
				prompt: task.promptTemplate,
				description: task.description,
				model: task.model,
				targetUrl: task.targetUrl,
				tabId,
			})
			.catch((err: unknown) => {
				console.error("[Scheduler] Failed to send task to sidepanel:", err);
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

async function runTaskInOffscreen(task: ScheduledTask): Promise<TaskExecutionResult> {
	console.log("[Scheduler] Running task in offscreen document");
	// Create tab in the service worker (chrome.tabs is unavailable in offscreen documents)
	let tabId: number;
	try {
		const tab = await chrome.tabs.create({
			url: task.targetUrl || "about:blank",
			active: task.executionMode === "visible",
		});
		tabId = tab.id!;
		console.log("[Scheduler] Created tab:", tabId);
	} catch (error) {
		return {
			status: "failed",
			error: `Failed to create tab: ${error instanceof Error ? error.message : String(error)}`,
			agentMessages: [],
		};
	}

	// Ensure offscreen document exists
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
			// Give the offscreen document time to initialize
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	} catch (error) {
		// Clean up tab if offscreen document creation fails
		try {
			await chrome.tabs.remove(tabId);
		} catch {
			/* already closed */
		}
		return {
			status: "failed",
			error: `Failed to create offscreen document: ${error instanceof Error ? error.message : String(error)}`,
			agentMessages: [],
		};
	}

	// Resolve proxy config for offscreen
	const proxyData = await chrome.storage.local.get(["proxy_enabled", "proxy_url"]);
	const proxyEnabled = proxyData.proxy_enabled as boolean | undefined;
	const proxyUrlValue = proxyData.proxy_url as string | undefined;
	const resolvedProxyUrl = proxyEnabled ? proxyUrlValue : undefined;

	// Send task to offscreen and wait for result
	return new Promise<TaskExecutionResult>((resolve) => {
		const timeout = setTimeout(
			() => {
				console.warn("[Scheduler] Task timeout after 10 minutes");
				chrome.runtime.onMessage.removeListener(listener);
				cleanupTab();
				resolve({
					status: "timeout",
					error: "Task exceeded 10-minute timeout",
					agentMessages: [],
				});
			},
			10 * 60 * 1000,
		);

		function cleanupTab(): void {
			if (task.executionMode === "silent") {
				chrome.tabs.remove(tabId).catch(() => {
					// Tab may already be closed
				});
			}
		}

		function listener(message: any, _sender: chrome.runtime.MessageSender) {
			if (message.type === "task-result") {
				console.log("[Scheduler] Received task result:", message.result?.status);
				clearTimeout(timeout);
				chrome.runtime.onMessage.removeListener(listener);
				cleanupTab();
				resolve(message.result as TaskExecutionResult);
			}
		}

		chrome.runtime.onMessage.addListener(listener);

		chrome.runtime
			.sendMessage({ type: "execute-task", task, tabId, proxyUrl: resolvedProxyUrl })
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

async function resolveApiKeyForOffscreen(provider: string): Promise<string | undefined> {
	// Read from IndexedDB provider-keys store (same as sidepanel's ProviderKeysStore)
	const stored = await getProviderKeyFromDB(provider);
	if (!stored) {
		// Fall back to custom providers (same logic as sidepanel's getApiKey)
		const customProviders = await getCustomProvidersFromDB();
		const customProvider = customProviders.find((p) => p.name === provider);
		if (customProvider) {
			console.log("[Scheduler] API key found in custom provider:", provider);
			return customProvider.apiKey || "no-key-required";
		}
		console.log("[Scheduler] No key in IndexedDB or custom providers for provider:", provider);
		return undefined;
	}

	const proxyData = await chrome.storage.local.get(["proxy_enabled", "proxy_url"]);
	const proxyEnabled = proxyData.proxy_enabled as boolean | undefined;
	const proxyUrl = proxyData.proxy_url as string | undefined;
	const resolvedProxyUrl = proxyEnabled ? proxyUrl : undefined;

	if (isOAuthCredentials(stored)) {
		const storageAdapter = {
			set: async (prov: string, value: string) => {
				await setProviderKeyInDB(prov, value);
			},
		};
		return resolveApiKey(stored, provider, storageAdapter, resolvedProxyUrl);
	}
	return typeof stored === "string" ? stored : undefined;
}

async function getProviderKeyFromDB(provider: string): Promise<string | null> {
	const db = await openSchedulerDB();
	return new Promise((resolve) => {
		const tx = db.transaction("provider-keys", "readonly");
		const store = tx.objectStore("provider-keys");
		const req = store.get(provider);
		req.onsuccess = () => resolve(req.result ?? null);
		req.onerror = () => resolve(null);
	});
}

async function getCustomProvidersFromDB(): Promise<{ id: string; name: string; apiKey?: string }[]> {
	const db = await openSchedulerDB();
	return new Promise((resolve) => {
		const tx = db.transaction("custom-providers", "readonly");
		const store = tx.objectStore("custom-providers");
		const req = store.getAll();
		req.onsuccess = () => resolve(req.result || []);
		req.onerror = () => resolve([]);
	});
}

async function setProviderKeyInDB(provider: string, value: string): Promise<void> {
	const db = await openSchedulerDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction("provider-keys", "readwrite");
		const store = tx.objectStore("provider-keys");
		store.put(value, provider);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

// IndexedDB direct access for background (bypasses Store abstraction)
// DB version must match src/storage/app-storage.ts (version 5).
// The onupgradeneeded handler creates ALL stores so the background can
// operate independently of the sidepanel's IndexedDBStorageBackend.
const DB_VERSION = 5;
const ALL_STORE_SCHEMAS: { name: string; keyPath?: string; indices: { name: string; keyPath: string }[] }[] = [
	{ name: "settings", indices: [] },
	{ name: "sessions", keyPath: "id", indices: [{ name: "lastModified", keyPath: "lastModified" }] },
	{ name: "sessions-metadata", keyPath: "id", indices: [{ name: "lastModified", keyPath: "lastModified" }] },
	{ name: "provider-keys", indices: [] },
	{ name: "custom-providers", indices: [] },
	{ name: "skills", indices: [] },
	{ name: "daily_costs", keyPath: "date", indices: [{ name: "date", keyPath: "date" }] },
	{
		name: SCHEDULE_STORE_NAME,
		keyPath: "id",
		indices: [
			{ name: "enabled", keyPath: "enabled" },
			{ name: "createdAt", keyPath: "createdAt" },
		],
	},
];

function openSchedulerDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open("sitegeist-storage", DB_VERSION);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
		request.onupgradeneeded = () => {
			const db = request.result;
			for (const schema of ALL_STORE_SCHEMAS) {
				if (!db.objectStoreNames.contains(schema.name)) {
					const opts: IDBObjectStoreParameters = {};
					if (schema.keyPath) opts.keyPath = schema.keyPath;
					const store = db.createObjectStore(schema.name, opts);
					for (const idx of schema.indices) {
						store.createIndex(idx.name, idx.keyPath);
					}
				}
			}
		};
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

async function updateCronAlarm(task: ScheduledTask, nextTime: Date): Promise<void> {
	await chrome.alarms.create(alarmNameForTask(task.id), {
		when: nextTime.getTime(),
	});
}

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
	} catch (error) {
		console.error("[Scheduler] Failed to restore alarms:", error);
	}
}

restoreAlarms().catch((err) => console.error("[Scheduler] Unhandled restore error:", err));
