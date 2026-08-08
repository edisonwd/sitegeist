const NOTIFICATION_SESSION_MAP_KEY = "notification_session_map";

export async function sendTaskNotification(
	taskName: string,
	status: "success" | "failed" | "timeout",
	error?: string,
	sessionId?: string,
): Promise<void> {
	let title: string;
	let message: string;

	switch (status) {
		case "success":
			title = `Task completed: ${taskName}`;
			message = "Task finished successfully.";
			break;
		case "failed":
			title = `Task failed: ${taskName}`;
			message = error || "Task encountered an error.";
			break;
		case "timeout":
			title = `Task timed out: ${taskName}`;
			message = "Task exceeded the 10-minute time limit.";
			break;
		default:
			return;
	}

	const notificationId = `task-result-${sessionId || crypto.randomUUID()}`;

	// Store notification -> session mapping for click handler
	if (sessionId) {
		try {
			const data = await chrome.storage.session.get(NOTIFICATION_SESSION_MAP_KEY);
			const map: Record<string, string> = (data[NOTIFICATION_SESSION_MAP_KEY] as Record<string, string>) || {};
			map[notificationId] = sessionId;
			await chrome.storage.session.set({ [NOTIFICATION_SESSION_MAP_KEY]: map });
		} catch {
			// storage.session may not be available
		}
	}

	try {
		await chrome.notifications.create(notificationId, {
			type: "basic",
			iconUrl: chrome.runtime.getURL("icon-128.png"),
			title,
			message,
		});
	} catch (err) {
		console.error("[Scheduler] Failed to send notification:", err);
	}
}
