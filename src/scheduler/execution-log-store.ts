import { Store, type StoreConfig } from "../web-ui/index.js";
import type { TaskExecutionLog } from "./types.js";

export class ExecutionLogStore extends Store {
	private readonly storeName = "task_execution_logs";

	getConfig(): StoreConfig {
		return {
			name: this.storeName,
			keyPath: "id",
			indices: [
				{ name: "taskId", keyPath: "taskId" },
				{ name: "startedAt", keyPath: "startedAt" },
			],
		};
	}

	async get(id: string): Promise<TaskExecutionLog | null> {
		return this.getBackend().get<TaskExecutionLog>(this.storeName, id);
	}

	async save(log: TaskExecutionLog): Promise<void> {
		await this.getBackend().set(this.storeName, log.id, log);
	}

	async delete(id: string): Promise<void> {
		await this.getBackend().delete(this.storeName, id);
	}

	async listByTask(taskId: string): Promise<TaskExecutionLog[]> {
		const all = await this.getBackend().getAllFromIndex<TaskExecutionLog>(this.storeName, "startedAt", "desc");
		return all.filter((log) => log.taskId === taskId);
	}

	async listAll(): Promise<TaskExecutionLog[]> {
		return this.getBackend().getAllFromIndex<TaskExecutionLog>(this.storeName, "startedAt", "desc");
	}

	async markStaleAsFailed(timeoutMs: number = 15 * 60 * 1000): Promise<void> {
		const running = (await this.listAll()).filter((log) => log.status === "running");
		const cutoff = Date.now() - timeoutMs;

		for (const log of running) {
			const started = new Date(log.startedAt).getTime();
			if (started < cutoff) {
				log.status = "failed";
				log.error = "Task interrupted (service worker restart or crash)";
				log.finishedAt = new Date().toISOString();
				await this.save(log);
			}
		}
	}
}
