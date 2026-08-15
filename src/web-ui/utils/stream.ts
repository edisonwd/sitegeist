import {
	type Api,
	type AssistantMessage,
	type AssistantMessageEvent,
	type AssistantMessageEventStream,
	type Context,
	calculateCost,
	createAssistantMessageEventStream,
	type Model,
	type ProviderStreams,
	type SimpleStreamOptions,
	type Usage,
} from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { azureOpenAIResponsesApi } from "@earendil-works/pi-ai/api/azure-openai-responses.lazy";
import { bedrockConverseStreamApi } from "@earendil-works/pi-ai/api/bedrock-converse-stream.lazy";
import { googleGenerativeAIApi } from "@earendil-works/pi-ai/api/google-generative-ai.lazy";
import { googleVertexApi } from "@earendil-works/pi-ai/api/google-vertex.lazy";
import { mistralConversationsApi } from "@earendil-works/pi-ai/api/mistral-conversations.lazy";
import { openAICodexResponsesApi } from "@earendil-works/pi-ai/api/openai-codex-responses.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { piMessagesApi } from "@earendil-works/pi-ai/api/pi-messages.lazy";

const apiFactories = new Map<string, () => ProviderStreams>([
	["anthropic-messages", anthropicMessagesApi],
	["azure-openai-responses", azureOpenAIResponsesApi],
	["bedrock-converse-stream", bedrockConverseStreamApi],
	["google-generative-ai", googleGenerativeAIApi],
	["google-vertex", googleVertexApi],
	["mistral-conversations", mistralConversationsApi],
	["openai-codex-responses", openAICodexResponsesApi],
	["openai-completions", openAICompletionsApi],
	["openai-responses", openAIResponsesApi],
	["pi-messages", piMessagesApi],
]);

function getApiStreams(api: string): ProviderStreams {
	const factory = apiFactories.get(api);
	if (!factory) {
		throw new Error(`No API implementation registered for api: ${api}`);
	}
	return factory();
}

function hasUsageData(message: AssistantMessage): boolean {
	const usage = message.usage;
	if (!usage) return false;
	return usage.input > 0 || usage.output > 0 || usage.cacheRead > 0 || usage.cacheWrite > 0;
}

function estimateTokens(text: string): number {
	if (!text) return 0;
	let cjkCount = 0;
	let otherCount = 0;
	for (const char of text) {
		const code = char.codePointAt(0) || 0;
		if (
			(code >= 0x4e00 && code <= 0x9fff) ||
			(code >= 0x3400 && code <= 0x4dbf) ||
			(code >= 0xf900 && code <= 0xfaff) ||
			(code >= 0x3040 && code <= 0x309f) ||
			(code >= 0x30a0 && code <= 0x30ff) ||
			(code >= 0xac00 && code <= 0xd7af) ||
			(code >= 0xff00 && code <= 0xffef)
		) {
			cjkCount++;
		} else if (code > 32) {
			otherCount++;
		}
	}
	return Math.ceil(cjkCount / 1.5 + otherCount / 4);
}

function extractMessageText(message: AssistantMessage): string {
	let text = "";
	for (const block of message.content) {
		if (block.type === "text" && block.text) {
			text += block.text;
		} else if (block.type === "thinking" && block.thinking) {
			text += block.thinking;
		} else if (block.type === "toolCall") {
			text += block.name || "";
			if (block.args) {
				text += typeof block.args === "string" ? block.args : JSON.stringify(block.args);
			}
		}
	}
	return text;
}

function estimateUsage(message: AssistantMessage): Usage {
	const outputText = extractMessageText(message);
	const outputTokens = estimateTokens(outputText);
	return {
		input: 0,
		output: outputTokens,
		cacheRead: 0,
		cacheWrite: 0,
		reasoning: 0,
		totalTokens: outputTokens,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function wrapStreamWithCostFallback<TApi extends Api>(
	model: Model<TApi>,
	originalStream: AssistantMessageEventStream,
): AssistantMessageEventStream {
	const hasCostRates =
		model.cost &&
		(model.cost.input > 0 || model.cost.output > 0 || model.cost.cacheRead > 0 || model.cost.cacheWrite > 0);

	if (!hasCostRates) {
		return originalStream;
	}

	const wrappedStream = createAssistantMessageEventStream();

	(async () => {
		try {
			for await (const event of originalStream) {
				if (event.type === "done" || event.type === "error") {
					const message = event.type === "done" ? event.message : event.error;
					if (!hasUsageData(message)) {
						const estimatedUsage = estimateUsage(message);
						calculateCost(model, estimatedUsage);
						message.usage = estimatedUsage;
					} else if (message.usage) {
						calculateCost(model, message.usage);
					}
					wrappedStream.push(event as AssistantMessageEvent);
				} else {
					wrappedStream.push(event as AssistantMessageEvent);
				}
			}
		} catch {
			wrappedStream.end();
		}
	})();

	return wrappedStream;
}

export function streamSimple<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const originalStream = getApiStreams(model.api).streamSimple(model, context, options);
	return wrapStreamWithCostFallback(model, originalStream);
}

export async function complete<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: SimpleStreamOptions,
): Promise<AssistantMessage> {
	const stream = streamSimple(model, context, options);
	return stream.result();
}
