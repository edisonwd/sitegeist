import type { TaskExecutionLog } from "./types.js";

export async function sendTaskNotification(taskName: string, log: TaskExecutionLog): Promise<void> {
	let title: string;
	let message: string;

	switch (log.status) {
		case "success":
			title = `Task completed: ${taskName}`;
			message = log.summary || "Task finished successfully.";
			break;
		case "failed":
			title = `Task failed: ${taskName}`;
			message = log.error || "Task encountered an error.";
			break;
		case "timeout":
			title = `Task timed out: ${taskName}`;
			message = "Task exceeded the 10-minute time limit.";
			break;
		default:
			return;
	}

	try {
		await chrome.notifications.create(`task-result-${log.id}`, {
			type: "basic",
			iconUrl: chrome.runtime.getURL("icon-128.png"),
			title,
			message,
		});
	} catch (err) {
		console.error("[Scheduler] Failed to send notification:", err);
	}
}
