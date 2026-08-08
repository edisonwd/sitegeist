/**
 * Shared session-building utilities used by both foreground (sidepanel)
 * and background (offscreen) scheduled task execution paths.
 */

export interface CumulativeUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
}

interface MessageLike {
	role: string;
	content?: unknown;
	usage?: CumulativeUsage;
}

const PREVIEW_MAX_LENGTH = 2048;

/** Format a scheduled task session title with a status tag. */
export function formatScheduledTaskTitle(taskName: string, status: string, timestamp?: string): string {
	const ts = timestamp ?? new Date().toISOString();
	return `${taskName} [${status}] - ${ts}`;
}

/** Calculate cumulative token usage from assistant messages. */
export function calculateCumulativeUsage(messages: MessageLike[]): CumulativeUsage {
	const usage: CumulativeUsage = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};

	for (const msg of messages) {
		if (msg.role === "assistant" && msg.usage) {
			const u = msg.usage;
			usage.input += u.input || 0;
			usage.output += u.output || 0;
			usage.cacheRead += u.cacheRead || 0;
			usage.cacheWrite += u.cacheWrite || 0;
			usage.totalTokens += (u.input || 0) + (u.output || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0);
			if (u.cost) {
				usage.cost.input += u.cost.input || 0;
				usage.cost.output += u.cost.output || 0;
				usage.cost.cacheRead += u.cost.cacheRead || 0;
				usage.cost.cacheWrite += u.cost.cacheWrite || 0;
				usage.cost.total += u.cost.total || 0;
			}
		}
	}

	return usage;
}

/** Generate a preview string (up to 2KB) from conversation messages. */
export function generateSessionPreview(messages: MessageLike[]): string {
	let preview = "";
	for (const msg of messages) {
		if (preview.length >= PREVIEW_MAX_LENGTH) break;
		if (msg.role === "user") {
			const text = extractTextContent(msg.content, false);
			if (text) preview += `${text}\n`;
		} else if (msg.role === "assistant") {
			const text = extractTextContent(msg.content, true);
			if (text) preview += `${text}\n`;
		}
	}
	return preview.substring(0, PREVIEW_MAX_LENGTH);
}

/** Extract text from message content (string or content blocks array). */
function extractTextContent(content: unknown, includeThinking: boolean): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	const blocks = content.filter((block: { type?: string }) => {
		if (block.type === "text") return true;
		if (includeThinking && block.type === "thinking") return true;
		return false;
	});

	return blocks
		.map((block: { type?: string; text?: string; thinking?: string }) => {
			if (block.type === "text") return block.text || "";
			if (block.type === "thinking") return block.thinking || "";
			return "";
		})
		.join("\n");
}
