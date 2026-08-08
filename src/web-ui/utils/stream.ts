import type {
	Api,
	AssistantMessage,
	AssistantMessageEventStream,
	Context,
	Model,
	ProviderStreams,
	SimpleStreamOptions,
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

/**
 * API registry mapping api identifiers to lazy provider stream factories.
 * Dispatches streamSimple/complete based on model.api, supporting both
 * builtin and custom providers (e.g. Ollama, local servers).
 */
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

export function streamSimple<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	return getApiStreams(model.api).streamSimple(model, context, options);
}

export async function complete<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: SimpleStreamOptions,
): Promise<AssistantMessage> {
	const stream = getApiStreams(model.api).streamSimple(model, context, options);
	return stream.result();
}
