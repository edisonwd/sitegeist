/**
 * Database store configurations for scheduler stores.
 * Used by both background service worker and sidepanel to ensure consistent schema.
 */

export const SCHEDULE_STORE_NAME = "scheduled_tasks";

export interface StoreSchema {
	name: string;
	keyPath: string;
	indices: { name: string; keyPath: string; unique?: boolean }[];
}

export const SCHEDULER_STORES: StoreSchema[] = [
	{
		name: SCHEDULE_STORE_NAME,
		keyPath: "id",
		indices: [
			{ name: "enabled", keyPath: "enabled" },
			{ name: "createdAt", keyPath: "createdAt" },
		],
	},
];
