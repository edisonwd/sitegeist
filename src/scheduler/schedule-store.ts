import { Store, type StoreConfig } from "../web-ui/index.js";
import type { ScheduledTask } from "./types.js";

export class ScheduleStore extends Store {
	private readonly storeName = "scheduled_tasks";

	getConfig(): StoreConfig {
		return {
			name: this.storeName,
			keyPath: "id",
			indices: [
				{ name: "enabled", keyPath: "enabled" },
				{ name: "createdAt", keyPath: "createdAt" },
			],
		};
	}

	async get(id: string): Promise<ScheduledTask | null> {
		return this.getBackend().get<ScheduledTask>(this.storeName, id);
	}

	async save(task: ScheduledTask): Promise<void> {
		await this.getBackend().set(this.storeName, task.id, task);
	}

	async delete(id: string): Promise<void> {
		await this.getBackend().delete(this.storeName, id);
	}

	async listAll(): Promise<ScheduledTask[]> {
		const keys = await this.getBackend().keys(this.storeName);
		const tasks = await Promise.all(keys.map((key) => this.getBackend().get<ScheduledTask>(this.storeName, key)));
		return tasks.filter((t): t is ScheduledTask => t !== null);
	}

	async listEnabled(): Promise<ScheduledTask[]> {
		const all = await this.listAll();
		return all.filter((t) => t.enabled);
	}
}
