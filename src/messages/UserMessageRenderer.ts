import { icon } from "@mariozechner/mini-lit";
import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { Check, Copy } from "lucide";
import type { Attachment, MessageRenderer } from "../web-ui/index.js";
import { registerMessageRenderer, type UserMessageWithAttachments } from "../web-ui/index.js";
import { i18n } from "../web-ui/utils/i18n.js";

/**
 * Custom user message component for Sitegeist with fancy pill styling.
 * Duplicates the web-ui UserMessage but with our custom styling.
 */
@customElement("sitegeist-user-message")
export class SitegeistUserMessage extends LitElement {
	@property({ type: Object }) message!: UserMessageWithAttachments;

	protected override createRenderRoot(): HTMLElement | DocumentFragment {
		return this;
	}

	override connectedCallback(): void {
		super.connectedCallback();
		this.style.display = "block";
	}

	@state() private copied = false;

	private getTextContent(): string {
		return typeof this.message.content === "string"
			? this.message.content
			: (this.message.content.find((c) => c.type === "text") as { type: "text"; text: string } | undefined)?.text ||
					"";
	}

	private async handleCopy() {
		const text = this.getTextContent();
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
			this.copied = true;
			setTimeout(() => {
				this.copied = false;
			}, 2000);
		} catch {
			const textarea = document.createElement("textarea");
			textarea.value = text;
			textarea.style.position = "fixed";
			textarea.style.opacity = "0";
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand("copy");
			document.body.removeChild(textarea);
			this.copied = true;
			setTimeout(() => {
				this.copied = false;
			}, 2000);
		}
	}

	override render() {
		const content = this.getTextContent();

		return html`
			<div class="flex justify-start ml-4">
				<div class="user-message-container py-2 px-4 rounded-xl">
					<markdown-block .content=${content}></markdown-block>
					${
						this.message.attachments && this.message.attachments.length > 0
							? html`
								<div class="mt-3 flex flex-wrap gap-2">
									${this.message.attachments.map(
										(attachment: Attachment) =>
											html` <attachment-tile .attachment=${attachment}></attachment-tile> `,
									)}
								</div>
							`
							: ""
					}
					${
						content
							? html`
								<div class="mt-1 flex justify-end">
									<button
										class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
										title=${this.copied ? i18n("Copied!") : i18n("Copy")}
										@click=${this.handleCopy}
									>
										${this.copied ? icon(Check, "xs") : icon(Copy, "xs")}
									</button>
								</div>
							`
							: ""
					}
				</div>
			</div>
		`;
	}
}

export function createUserMessageRenderer(): MessageRenderer<UserMessageWithAttachments> {
	return {
		render: (message) => {
			return html`<sitegeist-user-message .message=${message}></sitegeist-user-message>`;
		},
	};
}

export function registerUserMessageRenderer() {
	registerMessageRenderer("user", createUserMessageRenderer());
}
