import { Agent, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai/compat";
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
	}
});

async function executeTask(task: ScheduledTask, _tabId: number, proxyUrl?: string): Promise<TaskExecutionResult> {
	console.log("[Offscreen] Starting task execution", { taskId: task.id, name: task.name, hasModel: !!task.model });
	const agentMessages: AgentMessage[] = [];

	try {
		const model = task.model ?? getModel("anthropic" as any, "claude-sonnet-4-6" as any);
		console.log("[Offscreen] Using model:", model?.name || model?.id || "unknown");

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
				return proxyUrl;
			}),
			getApiKey: async (provider: string) => {
				return requestApiKey(provider);
			},
		});

		agent.subscribe((event: AgentEvent) => {
			console.log("[Offscreen] Agent event:", event.type);
			if (event.type === "message_end") {
				const msg = event.message;
				console.log("[Offscreen] message_end:", {
					role: msg.role,
					contentLength:
						typeof msg.content === "string"
							? msg.content.length
							: Array.isArray(msg.content)
								? msg.content.length
								: 0,
					stopReason: (msg as { stopReason?: string }).stopReason,
				});
				agentMessages.push(event.message);
			}
		});

		console.log("[Offscreen] Sending prompt to agent");
		await agent.prompt(task.promptTemplate);

		console.log("[Offscreen] Waiting for agent completion");
		const result = await waitForAgentCompletion(agent, TASK_TIMEOUT_MS);
		console.log("[Offscreen] Agent completed with status:", result, "messages:", agentMessages.length);

		return {
			status: result,
			agentMessages,
		};
	} catch (error: unknown) {
		console.error("[Offscreen] Task execution error:", error);
		return {
			status: "failed",
			error: error instanceof Error ? error.message : String(error),
			agentMessages,
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
