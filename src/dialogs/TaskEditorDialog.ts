import type { Model } from "@earendil-works/pi-ai";
import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { DialogBase } from "@mariozechner/mini-lit/dist/DialogBase.js";
import { Input } from "@mariozechner/mini-lit/dist/Input.js";
import i18n from "@mariozechner/mini-lit/dist/i18n.js";
import { Label } from "@mariozechner/mini-lit/dist/Label.js";
import { html, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import type { ScheduleConfig, ScheduledTask } from "../scheduler/types.js";
import "../utils/i18n-extension.js";
import { ModelSelector } from "../web-ui/dialogs/ModelSelector.js";

type TaskSaveCallback = (task: ScheduledTask) => Promise<void>;

const CRON_PRESETS: { label: string; expression: string }[] = [
	{ label: "Every day at 9:00", expression: "0 9 * * *" },
	{ label: "Every hour", expression: "0 * * * *" },
	{ label: "Every Monday at 9:00", expression: "0 9 * * 1" },
	{ label: "Every 1st of month at 9:00", expression: "0 9 1 * *" },
];

function isoToLocalDatetime(isoString: string): string {
	const date = new Date(isoString);
	const offset = date.getTimezoneOffset();
	const local = new Date(date.getTime() - offset * 60000);
	return local.toISOString().slice(0, 16);
}

export class TaskEditorDialog extends DialogBase {
	protected modalWidth = "min(600px, 90vw)";
	protected modalHeight = "min(700px, 85vh)";

	@state() private name = "";
	@state() private description = "";
	@state() private targetUrl = "";
	@state() private scheduleType: "once" | "interval" | "cron" = "once";
	@state() private onceAt = "";
	@state() private intervalMinutes = 60;
	@state() private cronExpression = "0 9 * * *";
	@state() private executionMode: "silent" | "visible" = "silent";
	@state() private selectedModel: Model<any> | null = null;
	@state() private showAdvanced = false;
	@state() private promptTemplate = "";

	private existingTask: ScheduledTask | null = null;
	private saveCallback: TaskSaveCallback | null = null;

	static async open(task: ScheduledTask | null, onSave: TaskSaveCallback): Promise<void> {
		const dialog = new TaskEditorDialog();
		dialog.existingTask = task;
		dialog.saveCallback = onSave;

		if (task) {
			dialog.name = task.name;
			dialog.description = task.description;
			dialog.targetUrl = task.targetUrl || "";
			dialog.scheduleType = task.schedule.type;
			dialog.executionMode = task.executionMode;
			dialog.selectedModel = task.model ?? null;
			dialog.promptTemplate = task.promptTemplate !== task.description ? task.promptTemplate : "";

			switch (task.schedule.type) {
				case "once":
					dialog.onceAt = isoToLocalDatetime(task.schedule.at);
					break;
				case "interval":
					dialog.intervalMinutes = task.schedule.minutes;
					break;
				case "cron":
					dialog.cronExpression = task.schedule.expression;
					break;
			}
		} else {
			const now = new Date();
			now.setHours(now.getHours() + 1, 0, 0, 0);
			dialog.onceAt = isoToLocalDatetime(now.toISOString());
		}

		document.body.appendChild(dialog);
		dialog.open();
		dialog.requestUpdate();
	}

	private buildSchedule(): ScheduleConfig {
		switch (this.scheduleType) {
			case "once":
				return { type: "once", at: new Date(this.onceAt).toISOString() };
			case "interval":
				return { type: "interval", minutes: this.intervalMinutes };
			case "cron":
				return { type: "cron", expression: this.cronExpression };
		}
	}

	private openModelSelector(): void {
		ModelSelector.open(this.selectedModel, (model) => {
			this.selectedModel = model;
		});
	}

	private async handleSave(): Promise<void> {
		if (!this.name.trim() || !this.description.trim()) return;

		const now = new Date().toISOString();
		const finalPrompt =
			this.showAdvanced && this.promptTemplate.trim() ? this.promptTemplate.trim() : this.description.trim();

		const task: ScheduledTask = {
			id: this.existingTask?.id || crypto.randomUUID(),
			name: this.name.trim(),
			description: this.description.trim(),
			promptTemplate: finalPrompt,
			schedule: this.buildSchedule(),
			executionMode: this.executionMode,
			model: this.selectedModel ?? undefined,
			targetUrl: this.targetUrl.trim() || undefined,
			enabled: this.existingTask?.enabled ?? true,
			lastRunAt: this.existingTask?.lastRunAt,
			lastRunStatus: this.existingTask?.lastRunStatus,
			nextRunAt: this.existingTask?.nextRunAt,
			createdAt: this.existingTask?.createdAt || now,
			updatedAt: now,
		};

		if (this.saveCallback) {
			await this.saveCallback(task);
		}
		this.close();
	}

	private modelLabel(): string {
		if (!this.selectedModel) return i18n("Default (last used)");
		return this.selectedModel.name || this.selectedModel.id;
	}

	protected override renderContent(): TemplateResult {
		return html`
			<div class="flex flex-col h-full overflow-hidden">
				<div class="p-6 flex-shrink-0 border-b border-border">
					<h2 class="text-lg font-semibold text-foreground">
						${this.existingTask ? i18n("Edit Task") : i18n("New Task")}
					</h2>
				</div>

				<div class="flex-1 overflow-y-auto p-6 space-y-5">
					<div>
						${Label({ children: i18n("Task Name") })}
						${Input({
							value: this.name,
							placeholder: "Daily article publish",
							onInput: (e: Event) => {
								this.name = (e.target as HTMLInputElement).value;
							},
						})}
					</div>

					<div>
						${Label({ children: i18n("Description") })}
						<textarea
							class="w-full min-h-[100px] rounded-md border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
							.value=${this.description}
							@input=${(e: Event) => {
								this.description = (e.target as HTMLTextAreaElement).value;
							}}
						></textarea>
						<p class="text-xs text-muted-foreground mt-1">${i18n("Use natural language to describe what the task should do")}</p>
					</div>

					<div>
						${Label({ children: i18n("Target URL") })}
						${Input({
							value: this.targetUrl,
							placeholder: "https://example.com",
							onInput: (e: Event) => {
								this.targetUrl = (e.target as HTMLInputElement).value;
							},
						})}
						<p class="text-xs text-muted-foreground mt-1">${i18n("Target URL (optional, opens in task tab)")}</p>
					</div>

					<div>
						${Label({ children: i18n("Schedule") })}
						<div class="flex gap-4 mt-2">
							<label class="flex items-center gap-2 cursor-pointer">
								<input type="radio" name="schedule" .checked=${this.scheduleType === "once"}
									@change=${() => {
										this.scheduleType = "once";
									}}
									class="accent-primary" />
								<span class="text-sm">${i18n("Run Once")}</span>
							</label>
							<label class="flex items-center gap-2 cursor-pointer">
								<input type="radio" name="schedule" .checked=${this.scheduleType === "interval"}
									@change=${() => {
										this.scheduleType = "interval";
									}}
									class="accent-primary" />
								<span class="text-sm">${i18n("Interval")}</span>
							</label>
							<label class="flex items-center gap-2 cursor-pointer">
								<input type="radio" name="schedule" .checked=${this.scheduleType === "cron"}
									@change=${() => {
										this.scheduleType = "cron";
									}}
									class="accent-primary" />
								<span class="text-sm">${i18n("Cron")}</span>
							</label>
						</div>

						<div class="mt-3">
							${
								this.scheduleType === "once"
									? html`
								${Label({ children: i18n("At:") })}
								<input type="datetime-local"
									class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
									.value=${this.onceAt}
									@input=${(e: Event) => {
										this.onceAt = (e.target as HTMLInputElement).value;
									}} />
								<p class="text-xs text-muted-foreground mt-1">${i18n("Task will run at the specified time")}</p>
							`
									: ""
							}

							${
								this.scheduleType === "interval"
									? html`
								${Label({ children: i18n("Every (minutes):") })}
								${Input({
									type: "number",
									value: String(this.intervalMinutes),
									onInput: (e: Event) => {
										this.intervalMinutes = Math.max(
											1,
											parseInt((e.target as HTMLInputElement).value, 10) || 1,
										);
									},
								})}
								<p class="text-xs text-muted-foreground mt-1">${i18n("Minimum interval is 1 minute")}</p>
							`
									: ""
							}

							${
								this.scheduleType === "cron"
									? html`
								<div class="space-y-2">
									<div class="flex flex-wrap gap-2">
										${CRON_PRESETS.map(
											(preset) => html`
											<button
												class="text-xs px-2 py-1 rounded border border-border hover:bg-muted transition-colors"
												@click=${() => {
													this.cronExpression = preset.expression;
												}}>
												${preset.label}
											</button>
										`,
										)}
									</div>
									${Label({ children: i18n("Cron Expression:") })}
									${Input({
										value: this.cronExpression,
										placeholder: "0 9 * * 1",
										onInput: (e: Event) => {
											this.cronExpression = (e.target as HTMLInputElement).value;
										},
									})}
									<p class="text-xs text-muted-foreground">min hour day month weekday</p>
								</div>
							`
									: ""
							}
						</div>
					</div>

					<div>
						${Label({ children: i18n("Model") })}
						<div class="flex items-center gap-3 mt-2">
							<button
								class="flex-1 flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
								@click=${() => this.openModelSelector()}>
								<span class="truncate ${this.selectedModel ? "text-foreground" : "text-muted-foreground"}">
									${this.modelLabel()}
								</span>
								<span class="text-xs text-primary ml-2 flex-shrink-0">${i18n("Select")}</span>
							</button>
							${
								this.selectedModel
									? html`
								<button
									class="text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
									@click=${() => {
										this.selectedModel = null;
									}}
									title=${i18n("Reset to default")}>
									${i18n("Reset")}
								</button>
							`
									: ""
							}
						</div>
						<p class="text-xs text-muted-foreground mt-1">
							${i18n("Choose which AI model to use for this task. Default uses the last selected model.")}
						</p>
					</div>

					<div>
						${Label({ children: i18n("Execution Mode") })}
						<div class="flex gap-4 mt-2">
							<label class="flex items-center gap-2 cursor-pointer">
								<input type="radio" name="mode" .checked=${this.executionMode === "silent"}
									@change=${() => {
										this.executionMode = "silent";
									}}
									class="accent-primary" />
								<span class="text-sm">${i18n("Silent")}</span>
							</label>
							<label class="flex items-center gap-2 cursor-pointer">
								<input type="radio" name="mode" .checked=${this.executionMode === "visible"}
									@change=${() => {
										this.executionMode = "visible";
									}}
									class="accent-primary" />
								<span class="text-sm">${i18n("Visible")}</span>
							</label>
						</div>
						<p class="text-xs text-muted-foreground mt-1">
							${
								this.executionMode === "silent"
									? i18n("Silent mode runs the task in a background tab")
									: i18n("Visible mode runs the task in a foreground tab")
							}
						</p>
					</div>

					<div>
						<button
							class="text-xs text-primary hover:underline"
							@click=${() => {
								this.showAdvanced = !this.showAdvanced;
							}}>
							${this.showAdvanced ? "Hide Advanced" : "Show Advanced"}
						</button>
						${
							this.showAdvanced
								? html`
							<div class="mt-2">
								${Label({ children: i18n("Prompt Template") })}
								<textarea
									class="w-full min-h-[80px] rounded-md border border-border bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
									.value=${this.promptTemplate || this.description}
									@input=${(e: Event) => {
										this.promptTemplate = (e.target as HTMLTextAreaElement).value;
									}}
								></textarea>
								<p class="text-xs text-muted-foreground mt-1">${i18n("Advanced: override the default prompt template for this task.")}</p>
								${
									this.promptTemplate
										? html`
									<button
										class="text-xs text-muted-foreground hover:text-foreground mt-1"
										@click=${() => {
											this.promptTemplate = "";
										}}>
										Reset to description
									</button>
								`
										: ""
								}
							</div>
						`
								: ""
						}
					</div>
				</div>

				<div class="p-6 flex-shrink-0 border-t border-border flex justify-end gap-3">
					${Button({
						variant: "outline",
						children: i18n("Cancel"),
						onClick: () => this.close(),
					})}
					${Button({
						variant: "default",
						children: i18n("Save Task"),
						onClick: () => this.handleSave(),
						disabled: !this.name.trim() || !this.description.trim(),
					})}
				</div>
			</div>
		`;
	}
}

customElements.define("task-editor-dialog", TaskEditorDialog);
