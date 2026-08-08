import type { Model } from "@earendil-works/pi-ai";
import { i18n } from "@mariozechner/mini-lit";
import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { DialogBase } from "@mariozechner/mini-lit/dist/DialogBase.js";
import { Input } from "@mariozechner/mini-lit/dist/Input.js";
import { Label } from "@mariozechner/mini-lit/dist/Label.js";
import { Switch } from "@mariozechner/mini-lit/dist/Switch.js";
import { html, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { getAppStorage } from "../storage/app-storage.js";
import type { CustomProvider } from "../storage/stores/custom-providers-store.js";

export class CustomModelDialog extends DialogBase {
	private provider!: CustomProvider;
	private model?: Model<any>;
	private onSaveCallback?: () => void;

	@state() private modelId = "";
	@state() private modelName = "";
	@state() private contextWindow = "8192";
	@state() private maxTokens = "4096";
	@state() private reasoning = false;
	@state() private vision = false;
	@state() private inputCost = "0";
	@state() private outputCost = "0";
	@state() private cacheReadCost = "0";
	@state() private cacheWriteCost = "0";

	protected modalWidth = "min(600px, 90vw)";
	protected modalHeight = "auto";

	static async open(provider: CustomProvider, model: Model<any> | undefined, onSave?: () => void) {
		const dialog = new CustomModelDialog();
		dialog.provider = provider;
		dialog.model = model;
		dialog.onSaveCallback = onSave;
		document.body.appendChild(dialog);
		dialog.initializeFromModel();
		dialog.open();
		dialog.requestUpdate();
	}

	private initializeFromModel() {
		if (this.model) {
			this.modelId = this.model.id;
			this.modelName = this.model.name;
			this.contextWindow = String(this.model.contextWindow);
			this.maxTokens = String(this.model.maxTokens);
			this.reasoning = this.model.reasoning || false;
			this.vision = this.model.input.includes("image");
			this.inputCost = String(this.model.cost?.input || 0);
			this.outputCost = String(this.model.cost?.output || 0);
			this.cacheReadCost = String(this.model.cost?.cacheRead || 0);
			this.cacheWriteCost = String(this.model.cost?.cacheWrite || 0);
		} else {
			this.modelId = "";
			this.modelName = "";
			this.contextWindow = "8192";
			this.maxTokens = "4096";
			this.reasoning = false;
			this.vision = false;
			this.inputCost = "0";
			this.outputCost = "0";
			this.cacheReadCost = "0";
			this.cacheWriteCost = "0";
		}
	}

	private async save() {
		if (!this.modelId || !this.modelName) {
			alert(i18n("Please fill in all required fields"));
			return;
		}

		try {
			const storage = getAppStorage();
			const inputTypes: string[] = ["text"];
			if (this.vision) inputTypes.push("image");

			const newModel: Model<any> = {
				id: this.modelId,
				name: this.modelName,
				api: this.provider.type as any,
				provider: this.provider.name,
				baseUrl: this.provider.baseUrl,
				reasoning: this.reasoning,
				input: inputTypes,
				cost: {
					input: parseFloat(this.inputCost) || 0,
					output: parseFloat(this.outputCost) || 0,
					cacheRead: parseFloat(this.cacheReadCost) || 0,
					cacheWrite: parseFloat(this.cacheWriteCost) || 0,
				},
				contextWindow: parseInt(this.contextWindow, 10) || 8192,
				maxTokens: parseInt(this.maxTokens, 10) || 4096,
				compat: { supportsDeveloperRole: false },
			};

			// Update provider's models array
			const models = [...(this.provider.models || [])];

			// Remove existing model with same ID if editing
			const existingIndex = models.findIndex((m) => m.id === this.model?.id || m.id === this.modelId);
			if (existingIndex >= 0) {
				models[existingIndex] = newModel;
			} else {
				models.push(newModel);
			}

			await storage.customProviders.set({
				...this.provider,
				models,
			});

			if (this.onSaveCallback) {
				this.onSaveCallback();
			}
			this.close();
		} catch (error) {
			console.error("Failed to save model:", error);
			alert(i18n("Failed to save model"));
		}
	}

	protected override renderContent(): TemplateResult {
		return html`
			<div class="flex flex-col h-full overflow-hidden">
				<div class="p-6 flex-shrink-0 border-b border-border">
					<h2 class="text-lg font-semibold text-foreground">
						${this.model ? i18n("Edit Model") : i18n("Add Model")}
					</h2>
					<p class="text-sm text-muted-foreground mt-1">
						${i18n("Provider")}: ${this.provider.name} (${this.provider.type})
					</p>
				</div>

				<div class="flex-1 overflow-y-auto p-6">
					<div class="flex flex-col gap-4">
						<div class="flex flex-col gap-2">
							${Label({ htmlFor: "model-id", children: i18n("Model ID") })}
							${Input({
								value: this.modelId,
								placeholder: "e.g., gpt-4o-mini",
								onInput: (e: Event) => {
									this.modelId = (e.target as HTMLInputElement).value;
									this.requestUpdate();
								},
							})}
						</div>

						<div class="flex flex-col gap-2">
							${Label({ htmlFor: "model-name", children: i18n("Model Name") })}
							${Input({
								value: this.modelName,
								placeholder: "e.g., GPT-4o Mini",
								onInput: (e: Event) => {
									this.modelName = (e.target as HTMLInputElement).value;
									this.requestUpdate();
								},
							})}
						</div>

						<div class="grid grid-cols-2 gap-4">
							<div class="flex flex-col gap-2">
								${Label({ htmlFor: "context-window", children: i18n("Context Window") })}
								${Input({
									type: "number",
									value: this.contextWindow,
									onInput: (e: Event) => {
										this.contextWindow = (e.target as HTMLInputElement).value;
										this.requestUpdate();
									},
								})}
							</div>
							<div class="flex flex-col gap-2">
								${Label({ htmlFor: "max-tokens", children: i18n("Max Tokens") })}
								${Input({
									type: "number",
									value: this.maxTokens,
									onInput: (e: Event) => {
										this.maxTokens = (e.target as HTMLInputElement).value;
										this.requestUpdate();
									},
								})}
							</div>
						</div>

						<div class="flex flex-col gap-3">
							<div class="flex items-center justify-between">
								${Label({ children: i18n("Reasoning / Thinking") })}
								${Switch({
									checked: this.reasoning,
									onChange: (checked: boolean) => {
										this.reasoning = checked;
										this.requestUpdate();
									},
								})}
							</div>
							<div class="flex items-center justify-between">
								${Label({ children: i18n("Vision / Image Input") })}
								${Switch({
									checked: this.vision,
									onChange: (checked: boolean) => {
										this.vision = checked;
										this.requestUpdate();
									},
								})}
							</div>
						</div>

						<div class="flex flex-col gap-2">
							${Label({ children: i18n("Cost (per 1M tokens)") })}
							<div class="grid grid-cols-2 gap-4">
								<div class="flex flex-col gap-1">
									<span class="text-xs text-muted-foreground">${i18n("Input")}</span>
									${Input({
										type: "number",
										value: this.inputCost,
										onInput: (e: Event) => {
											this.inputCost = (e.target as HTMLInputElement).value;
											this.requestUpdate();
										},
									})}
								</div>
								<div class="flex flex-col gap-1">
									<span class="text-xs text-muted-foreground">${i18n("Output")}</span>
									${Input({
										type: "number",
										value: this.outputCost,
										onInput: (e: Event) => {
											this.outputCost = (e.target as HTMLInputElement).value;
											this.requestUpdate();
										},
									})}
								</div>
								<div class="flex flex-col gap-1">
									<span class="text-xs text-muted-foreground">${i18n("Cache Read")}</span>
									${Input({
										type: "number",
										value: this.cacheReadCost,
										onInput: (e: Event) => {
											this.cacheReadCost = (e.target as HTMLInputElement).value;
											this.requestUpdate();
										},
									})}
								</div>
								<div class="flex flex-col gap-1">
									<span class="text-xs text-muted-foreground">${i18n("Cache Write")}</span>
									${Input({
										type: "number",
										value: this.cacheWriteCost,
										onInput: (e: Event) => {
											this.cacheWriteCost = (e.target as HTMLInputElement).value;
											this.requestUpdate();
										},
									})}
								</div>
							</div>
						</div>
					</div>
				</div>

				<div class="p-6 flex-shrink-0 border-t border-border flex justify-end gap-2">
					${Button({
						onClick: () => this.close(),
						variant: "ghost",
						children: i18n("Cancel"),
					})}
					${Button({
						onClick: () => this.save(),
						variant: "default",
						disabled: !this.modelId || !this.modelName,
						children: i18n("Save"),
					})}
				</div>
			</div>
		`;
	}
}

customElements.define("custom-model-dialog", CustomModelDialog);
