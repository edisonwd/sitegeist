import { Agent, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai/compat";
import { browserMessageTransformer } from "../messages/message-transformer.js";
import { isOAuthCredentials, resolveApiKey } from "../oauth/index.js";
import { SYSTEM_PROMPT } from "../prompts/prompts.js";
import type { ScheduledTask, TaskExecutionResult } from "../scheduler/types.js";
import { createStreamFn } from "../web-ui/index.js";

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
			streamFn: createStreamFn(async (): Promise<string | undefined> => {
				const data = await chrome.storage.local.get(["proxy_enabled", "proxy_url"]);
				const enabled = data.proxy_enabled as boolean | undefined;
				const url = data.proxy_url as string | undefined;
				return enabled ? url : undefined;
			}),
			getApiKey: async (provider: string) => {
				return resolveApiKeyFromStorage(provider, storage);
			},
		});

		agent.subscribe((event: AgentEvent) => {
			if (event.type === "message_end") {
				agentMessages.push(event.message);
			}
		});

		await agent.prompt(task.promptTemplate);

		const result = await waitForAgentCompletion(agent, TASK_TIMEOUT_MS);

		return {
			status: result,
			agentMessages,
		};
	} catch (error: unknown) {
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
	return getModel("anthropic" as any, "claude-sonnet-4-6" as any);
}

async function resolveApiKeyFromStorage(
	provider: string,
	storage: chrome.storage.StorageArea,
): Promise<string | undefined> {
	const key = `provider_key_${provider}`;
	const data = await storage.get([key]);
	const stored = data[key] as string | undefined;
	if (!stored) return undefined;

	const proxyData = await storage.get(["proxy_enabled", "proxy_url"]);
	const proxyEnabled = proxyData.proxy_enabled as boolean | undefined;
	const proxyUrl = proxyData.proxy_url as string | undefined;
	const resolvedProxyUrl = proxyEnabled ? proxyUrl : undefined;

	if (isOAuthCredentials(stored)) {
		const storageAdapter = {
			set: async (prov: string, value: string) => {
				await storage.set({ [`provider_key_${prov}`]: value });
			},
		};
		return resolveApiKey(stored, provider, storageAdapter, resolvedProxyUrl);
	}
	return typeof stored === "string" ? stored : undefined;
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
