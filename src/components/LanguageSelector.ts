import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { getCurrentLanguage, setLanguage } from "@mariozechner/mini-lit/dist/i18n.js";
import { icon } from "@mariozechner/mini-lit/dist/icons.js";
import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { Globe } from "lucide";

@customElement("sitegeist-language-selector")
export class SitegeistLanguageSelector extends LitElement {
	@state() private currentLanguage = getCurrentLanguage();
	@state() private isOpen = false;

	private languages = [
		{ code: "en", label: "EN" },
		{ code: "de", label: "DE" },
		{ code: "zh", label: "中文" },
	];

	private selectLanguage = (code: string) => {
		if (code !== this.currentLanguage) {
			setLanguage(code);
		}
		this.isOpen = false;
	};

	private toggleDropdown = () => {
		this.isOpen = !this.isOpen;
	};

	private handleClickOutside = (e: Event) => {
		if (!this.contains(e.target as Node)) {
			this.isOpen = false;
		}
	};

	connectedCallback() {
		super.connectedCallback();
		document.addEventListener("click", this.handleClickOutside);
	}

	disconnectedCallback() {
		document.removeEventListener("click", this.handleClickOutside);
		super.disconnectedCallback();
	}

	createRenderRoot() {
		return this;
	}

	render() {
		return html`
			<div class="relative">
				${Button({
					variant: "ghost",
					size: "sm",
					onClick: () => this.toggleDropdown(),
					className: "gap-1.5",
					children: html`
						${icon(Globe, "sm")}
						<span class="text-xs font-medium">${this.currentLanguage.toUpperCase()}</span>
					`,
				})}
				${
					this.isOpen
						? html`
							<div
								class="absolute right-0 mt-1 py-1 bg-popover border border-border rounded-md shadow-lg min-w-[80px] z-50"
							>
								${this.languages.map(
									(lang) => html`
										<button
											class="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors
												${lang.code === this.currentLanguage ? "bg-accent/50 text-accent-foreground font-medium" : ""}"
											@click=${() => this.selectLanguage(lang.code)}
										>
											${lang.label}
										</button>
									`,
								)}
							</div>
						`
						: ""
				}
			</div>
		`;
	}
}
