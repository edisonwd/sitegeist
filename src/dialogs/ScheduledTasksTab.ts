import { i18n } from "@mariozechner/mini-lit";
import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { icon } from "@mariozechner/mini-lit/dist/icons.js";
import { html, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { Clock, History, Pause, Pencil, Play, Plus, Trash2 } from "lucide";
import { cronToHumanReadable } from "../scheduler/cron-parser.js";
import type { ScheduledTask } from "../scheduler/types.js";
import { getSitegeistStorage } from "../storage/app-storage.js";
import { SettingsTab } from "../web-ui/index.js";
import "../utils/i18n-extension.js";
import { ScheduledTaskHistoryDialog } from "./ScheduledTaskHistoryDialog.js";
import { TaskEditorDialog } from "./TaskEditorDialog.js";

export class ScheduledTasksTab extends SettingsTab {
	label = "Scheduled Tasks";
	@state() private tasks: ScheduledTask[] = [];

	getTabName(): string {
		return i18n("Scheduled Tasks");
	}

	override async connectedCallback() {
		super.connectedCallback();
		await this.loadTasks();
	}

	private async loadTasks(): Promise<void> {
		const storage = getSitegeistStorage();
		this.tasks = await storage.schedule.listAll();
		this.tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}

	private async createTask(): Promise<void> {
		await TaskEditorDialog.open(null, async (task) => {
			const storage = getSitegeistStorage();
			await storage.schedule.save(task);
			await chrome.runtime.sendMessage({ type: "register-alarm", task });
			await this.loadTasks();
		});
	}

	private async editTask(task: ScheduledTask): Promise<void> {
		await TaskEditorDialog.open(task, async (updated) => {
			const storage = getSitegeistStorage();
			await storage.schedule.save(updated);
			await chrome.runtime.sendMessage({ type: "remove-alarm", taskId: task.id });
			if (updated.enabled) {
				await chrome.runtime.sendMessage({ type: "register-alarm", task: updated });
			}
			await this.loadTasks();
		});
	}

	private async deleteTask(task: ScheduledTask): Promise<void> {
		if (!confirm(i18n('Delete task "{name}"?').replace("{name}", task.name))) return;

		const storage = getSitegeistStorage();
		await storage.schedule.delete(task.id);
		await chrome.runtime.sendMessage({ type: "remove-alarm", taskId: task.id });
		await this.loadTasks();
	}

	private async toggleEnabled(task: ScheduledTask): Promise<void> {
		const storage = getSitegeistStorage();
		task.enabled = !task.enabled;
		task.updatedAt = new Date().toISOString();
		await storage.schedule.save(task);

		if (task.enabled) {
			await chrome.runtime.sendMessage({ type: "register-alarm", task });
		} else {
			await chrome.runtime.sendMessage({ type: "remove-alarm", taskId: task.id });
		}

		await this.loadTasks();
	}

	private openHistory(task: ScheduledTask): void {
		ScheduledTaskHistoryDialog.open(task);
	}

	private formatSchedule(task: ScheduledTask): string {
		switch (task.schedule.type) {
			case "once":
				return new Date(task.schedule.at).toLocaleString();
			case "interval":
				return `Every ${task.schedule.minutes} min`;
			case "cron":
				return cronToHumanReadable(task.schedule.expression);
		}
	}

	private statusBadge(task: ScheduledTask): TemplateResult {
		if (!task.lastRunStatus) {
			return html`<span class="text-xs text-muted-foreground">--</span>`;
		}

		const colorMap: Record<string, string> = {
			success: "text-green-600",
			failed: "text-red-600",
			timeout: "text-orange-600",
		};
		const color = colorMap[task.lastRunStatus] || "text-muted-foreground";
		const statusMap: Record<string, string> = {
			success: i18n("Success"),
			failed: i18n("Failed"),
			timeout: i18n("Timeout"),
		};
		return html`<span class="text-xs font-medium ${color}">${statusMap[task.lastRunStatus] || task.lastRunStatus}</span>`;
	}

	render(): TemplateResult {
		return html`
			<div class="flex flex-col gap-4">
				<div class="flex items-center justify-between">
					<p class="text-sm text-muted-foreground">
						${this.tasks.length === 0 ? i18n("No scheduled tasks yet") : `${this.tasks.length} task(s)`}
					</p>
					${Button({
						variant: "default",
						size: "sm",
						children: html`${icon(Plus, "sm")} ${i18n("New Task")}`,
						onClick: () => this.createTask(),
					})}
				</div>

				${
					this.tasks.length === 0
						? html`
						<div class="text-center py-12 text-muted-foreground">
							${icon(Clock, "lg")}
							<p class="mt-3 text-sm">${i18n("Create a scheduled task to automate web operations")}</p>
						</div>
					`
						: this.tasks.map(
								(task) => html`
						<div class="border border-border rounded-lg p-4 bg-card">
							<div class="flex items-start justify-between gap-3">
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2">
										<span class="w-2 h-2 rounded-full flex-shrink-0 ${task.enabled ? "bg-green-500" : "bg-gray-400"}"></span>
										<h3 class="font-medium text-foreground truncate">${task.name}</h3>
									</div>
									<div class="mt-1 text-xs text-muted-foreground">
										${this.formatSchedule(task)}
										${task.lastRunAt ? html` &middot; ${i18n("Last run")}: ${this.statusBadge(task)}` : ""}
									</div>
									${
										task.nextRunAt && task.enabled
											? html`<div class="text-xs text-muted-foreground mt-0.5">${i18n("Next run")}: ${new Date(task.nextRunAt).toLocaleString()}</div>`
											: ""
									}
									${
										task.model
											? html`<div class="text-xs text-muted-foreground mt-0.5">${i18n("Model")}: ${task.model.name || task.model.id}</div>`
											: ""
									}
								</div>
								<div class="flex items-center gap-1 flex-shrink-0">
									${Button({
										variant: "ghost",
										size: "sm",
										children: icon(Pencil, "sm"),
										onClick: () => this.editTask(task),
										title: i18n("Edit"),
									})}
									${Button({
										variant: "ghost",
										size: "sm",
										children: icon(History, "sm"),
										onClick: () => this.openHistory(task),
										title: i18n("Execution History"),
									})}
									${Button({
										variant: "ghost",
										size: "sm",
										children: icon(task.enabled ? Pause : Play, "sm"),
										onClick: () => this.toggleEnabled(task),
										title: task.enabled ? i18n("Disable") : i18n("Enable"),
									})}
									${Button({
										variant: "ghost",
										size: "sm",
										children: icon(Trash2, "sm"),
										onClick: () => this.deleteTask(task),
										title: i18n("Delete"),
									})}
								</div>
							</div>
						</div>
					`,
							)
				}
			</div>
		`;
	}
}

customElements.define("scheduled-tasks-tab", ScheduledTasksTab);
