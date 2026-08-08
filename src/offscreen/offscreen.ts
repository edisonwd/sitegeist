import { Agent, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { getBuiltinModel } from "@earendil-works/pi-ai/providers/all";
import { browserMessageTransformer } from "../messages/message-transformer.js";
import type { ScheduledTask, TaskExecutionResult } from "../scheduler/types.js";
import { createStreamFn } from "../web-ui/index.js";
import { OFFSCREEN_SYSTEM_PROMPT, OffscreenBrowserJsTool, OffscreenNavigateTool } from "./offscreen-tools.js";

interface TaskConfig {
	type: "execute-task";
	task: ScheduledTask;
	tabId: number;
	proxyUrl?: string;
}

const TASK_TIMEOUT_MS = 10 * 60 * 1000;

// Signal readiness to background
chrome.runtime.sendMessage({ type: "offscreen-ready" });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type !== "execute-task") {
		return false;
	}

	console.log("[Offscreen] Received execute-task message", { taskId: message.task?.id, tabId: message.tabId });
	const config = message as TaskConfig;
	executeTask(config.task, config.tabId, config.proxyUrl)
		.then((result) => {
			console.log("[Offscreen] Task completed", {
				taskId: config.task.id,
				status: result.status,
				messageCount: result.agentMessages?.length || 0,
			});
			chrome.runtime.sendMessage({ type: "task-result", result });
			sendResponse({ received: true });
		})
		.catch((error: unknown) => {
			console.error("[Offscreen] Task failed with exception:", error);
			const result: TaskExecutionResult = {
				status: "failed",
				error: error instanceof Error ? error.message : String(error),
				agentMessages: [],
			};
			chrome.runtime.sendMessage({ type: "task-result", result });
			sendResponse({ received: true });
		});
	return true;
});

async function executeTask(task: ScheduledTask, tabId: number, proxyUrl?: string): Promise<TaskExecutionResult> {
	console.log("[Offscreen] Starting task execution", { taskId: task.id, name: task.name, hasModel: !!task.model });

	let completionStatus: "success" | "failed" = "success";
	let completionError: string | undefined;
	let agentRef: Agent | null = null;

	try {
		const model = task.model ?? getBuiltinModel("anthropic" as any, "claude-sonnet-4-6" as any);
		console.log("[Offscreen] Using model:", model?.name || model?.id || "unknown");

		const agent = new Agent({
			initialState: {
				systemPrompt: buildSchedulerSystemPrompt(task),
				model,
				thinkingLevel: "medium",
				messages: [],
				tools: [new OffscreenNavigateTool(tabId) as any, new OffscreenBrowserJsTool(tabId) as any],
			},
			convertToLlm: browserMessageTransformer,
			toolExecution: "sequential",
			streamFn: createStreamFn(async (): Promise<string | undefined> => {
				return proxyUrl;
			}),
			getApiKey: async (provider: string) => {
				return requestApiKey(provider);
			},
		});
		agentRef = agent;

		agent.subscribe((event: AgentEvent) => {
			if (event.type === "agent_end") {
				const lastAssistant = [...agent.state.messages]
					.reverse()
					.find((m: AgentMessage) => m.role === "assistant") as { stopReason?: string; errorMessage?: string };
				if (lastAssistant?.stopReason === "error") {
					completionStatus = "failed";
					completionError = lastAssistant.errorMessage || "Agent error";
				}
				console.log("[Offscreen] agent_end: state messages count =", agent.state.messages.length);
			}
		});

		const promptPromise = agent.prompt(task.promptTemplate).then((): TaskExecutionResult => {
			const messages = [...agent.state.messages];
			console.log("[Offscreen] Agent prompt completed", {
				status: completionStatus,
				messageCount: messages.length,
				roles: messages.map((m) => m.role),
			});
			return {
				status: completionStatus,
				error: completionError,
				agentMessages: messages,
			};
		});

		const timeoutPromise = new Promise<TaskExecutionResult>((resolve) => {
			setTimeout(() => {
				console.warn("[Offscreen] Task timeout after 10 minutes");
				agent.abort();
				setTimeout(() => {
					const messages = [...agent.state.messages];
					resolve({
						status: "timeout",
						error: "Task exceeded 10-minute timeout",
						agentMessages: messages,
					});
				}, 500);
			}, TASK_TIMEOUT_MS);
		});

		return await Promise.race([promptPromise, timeoutPromise]);
	} catch (error: unknown) {
		console.error("[Offscreen] Task execution error:", error);
		const fallbackMessages = agentRef ? [...agentRef.state.messages] : [];
		return {
			status: "failed",
			error: error instanceof Error ? error.message : String(error),
			agentMessages: fallbackMessages,
		};
	}
}

function requestApiKey(provider: string): Promise<string | undefined> {
	console.log("[Offscreen] Requesting API key for provider:", provider);
	return new Promise((resolve) => {
		chrome.runtime.sendMessage({ type: "get-api-key", provider }, (response) => {
			const hasKey = !!response?.apiKey;
			console.log("[Offscreen] API key received:", { provider, hasKey });
			resolve(response?.apiKey as string | undefined);
		});
	});
}

function buildSchedulerSystemPrompt(task: ScheduledTask): string {
	return `${OFFSCREEN_SYSTEM_PROMPT}\n\nYou are executing a scheduled task. The target tab is already open. Follow these instructions precisely and report what you accomplished:\n\n${task.description}`;
}
