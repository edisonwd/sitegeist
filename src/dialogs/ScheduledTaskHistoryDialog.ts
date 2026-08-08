import { icon } from "@mariozechner/mini-lit";
import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { DialogBase } from "@mariozechner/mini-lit/dist/DialogBase.js";
import i18n from "@mariozechner/mini-lit/dist/i18n.js";
import { html, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { ExternalLink } from "lucide";
import type { ScheduledTask } from "../scheduler/types.js";
import { getAppStorage, type SessionMetadata } from "../web-ui/index.js";
import "../utils/i18n-extension.js";

export class ScheduledTaskHistoryDialog extends DialogBase {
	@state() private sessions: SessionMetadata[] = [];
	@state() private loading = true;

	private task: ScheduledTask | null = null;

	static open(task: ScheduledTask): void {
		console.log("[ScheduledTaskHistoryDialog] Opening for task:", task.id, task.name);
		const dialog = new ScheduledTaskHistoryDialog();
		dialog.task = task;
		dialog.open();
		dialog.loadHistory();
	}

	private async loadHistory(): Promise<void> {
		if (!this.task) return;
		console.log("[ScheduledTaskHistoryDialog] Loading history for task:", this.task.id);
		this.loading = true;
		try {
			const storage = getAppStorage();
			const allMetadata = await storage.sessions.getAllMetadata();
			console.log("[ScheduledTaskHistoryDialog] Total sessions:", allMetadata.length);

			// Filter sessions for this specific task
			// Match by taskId (new sessions) or by task name in title (old sessions without taskId)
			this.sessions = allMetadata.filter((s) => {
				if (s.source !== "scheduled") return false;
				// New sessions have taskId field
				if (s.taskId === this.task!.id) return true;
				// Fallback for old sessions: match by task name in title
				if (!s.taskId && s.title.includes(this.task!.name)) return true;
				return false;
			});

			console.log("[ScheduledTaskHistoryDialog] Filtered sessions:", this.sessions.length);

			// Sort by lastModified descending (most recent first)
			this.sessions.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
		} catch (err) {
			console.error("[ScheduledTaskHistoryDialog] Failed to load task history:", err);
			this.sessions = [];
		} finally {
			this.loading = false;
			this.requestUpdate();
		}
	}

	private navigateToSession(sessionId: string): void {
		const url = new URL(window.location.href);
		url.search = `?session=${sessionId}`;
		window.location.href = url.toString();
	}

	private formatDuration(createdAt: string, lastModified: string): string {
		const ms = new Date(lastModified).getTime() - new Date(createdAt).getTime();
		if (ms < 0) return "--";
		const seconds = Math.floor(ms / 1000);
		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${minutes}m ${secs}s`;
	}

	private extractStatusFromTitle(title: string): "success" | "failed" | "timeout" | "running" | "unknown" {
		if (title.includes("[success]")) return "success";
		if (title.includes("[failed]")) return "failed";
		if (title.includes("[timeout]")) return "timeout";
		if (title.includes("[running]")) return "running";
		return "unknown";
	}

	private statusBadge(status: string): { label: string; color: string } {
		switch (status) {
			case "success":
				return { label: i18n("Success"), color: "text-green-600" };
			case "failed":
				return { label: i18n("Failed"), color: "text-red-600" };
			case "timeout":
				return { label: i18n("Timeout"), color: "text-orange-600" };
			case "running":
				return { label: i18n("Running"), color: "text-blue-600" };
			default:
				return { label: status, color: "text-muted-foreground" };
		}
	}

	protected override renderContent(): TemplateResult {
		const taskName = this.task?.name || "";
		const statusCounts = this.sessions.reduce(
			(acc, s) => {
				const status = this.extractStatusFromTitle(s.title);
				acc[status] = (acc[status] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		);

		return html`
			<div class="flex flex-col h-full overflow-hidden">
				<div class="p-6 flex-shrink-0 border-b border-border">
					<h2 class="text-lg font-semibold text-foreground">
						${i18n("Execution History")} - ${taskName}
					</h2>
				</div>

				<div class="flex-1 overflow-y-auto p-6">
					${
						this.loading
							? html`<p class="text-center text-muted-foreground py-12">${i18n("Loading...")}</p>`
							: this.sessions.length === 0
								? html`<p class="text-center text-muted-foreground py-12">${i18n("No execution history")}</p>`
								: html`
								<div class="text-xs text-muted-foreground mb-4">
									${i18n("Total runs")}: ${this.sessions.length}
									${statusCounts.success ? html` &middot; <span class="text-green-600">${i18n("Success")}: ${statusCounts.success}</span>` : ""}
									${statusCounts.failed ? html` &middot; <span class="text-red-600">${i18n("Failed")}: ${statusCounts.failed}</span>` : ""}
									${statusCounts.timeout ? html` &middot; <span class="text-orange-600">${i18n("Timeout")}: ${statusCounts.timeout}</span>` : ""}
								</div>
								<div class="space-y-2">
									${this.sessions.map((session) => {
										const status = this.extractStatusFromTitle(session.title);
										const badge = this.statusBadge(status);
										const duration = this.formatDuration(session.createdAt, session.lastModified);
										return html`
											<div
												class="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
												@click=${() => this.navigateToSession(session.id)}
											>
												<div class="flex-1 min-w-0">
													<div class="text-sm text-foreground">
														${new Date(session.createdAt).toLocaleString()}
													</div>
													<div class="text-xs text-muted-foreground mt-1">
														${i18n("Duration")}: ${duration}
													</div>
												</div>
												<div class="flex items-center gap-2 flex-shrink-0">
													<span class="text-xs font-medium ${badge.color}">${badge.label}</span>
													${Button({
														variant: "ghost",
														size: "sm",
														children: icon(ExternalLink, "sm"),
														onClick: (e: Event) => {
															e.stopPropagation();
															this.navigateToSession(session.id);
														},
														title: i18n("Open Session"),
													})}
												</div>
											</div>
										`;
									})}
								</div>
							`
					}
				</div>
			</div>
		`;
	}
}

customElements.define("scheduled-task-history-dialog", ScheduledTaskHistoryDialog);
