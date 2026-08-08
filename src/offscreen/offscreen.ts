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

	// Track completion status from agent_end (fires during agent.prompt())
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
		agentRef = agent;

		// Subscribe to agent_end for status detection only.
		// Message collection uses agent.state.messages after prompt() resolves,
		// because agent_end's messages field may not contain the full transcript.
		agent.subscribe((event: AgentEvent) => {
			if (event.type === "agent_end") {
				// Use agent.state.messages which has the complete transcript
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

		// agent.prompt() waits for the entire agent loop to complete
		// (all turns, tool executions, and agent_end event).
		// After it resolves, agent.state.messages contains the complete transcript.
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
				// Wait briefly for agent_end to fire after abort
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
		// Try to salvage any messages collected before the error
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
	return `${SYSTEM_PROMPT}\n\nYou are executing a scheduled task. The target tab is already open. Follow these instructions precisely and report what you accomplished:\n\n${task.description}`;
}
