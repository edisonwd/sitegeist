import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { type SessionData, SessionsStore } from "../../web-ui/index.js";

/**
 * Extended SessionsStore that migrates old tool result messages from output to content format.
 */
export class SitegeistSessionsStore extends SessionsStore {
	async loadSession(id: string): Promise<SessionData | null> {
		const session = await super.loadSession(id);
		if (session) {
			return this.migrateSession(session);
		}
		return session;
	}

	async get(id: string): Promise<SessionData | null> {
		const session = await super.get(id);
		if (session) {
			return this.migrateSession(session);
		}
		return session;
	}

	private migrateSession(session: SessionData): SessionData {
		return {
			...session,
			messages: this.migrateToolResultMessages(session.messages),
		};
	}

	private migrateToolResultMessages(messages: AgentMessage[]): AgentMessage[] {
		return messages.map((msg) => {
			if (msg.role === "toolResult" && "output" in msg && !msg.content) {
				// Old format detected - migrate it
				const { output, ...rest } = msg as any;
				return {
					...rest,
					content: [{ type: "text", text: output }],
				};
			}
			return msg;
		});
	}
}
