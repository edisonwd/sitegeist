import { ScheduleStore } from "../scheduler/schedule-store.js";
import {
	AppStorage as BaseAppStorage,
	CustomProvidersStore,
	getAppStorage,
	IndexedDBStorageBackend,
	ProviderKeysStore,
	SessionsStore,
	SettingsStore,
} from "../web-ui/index.js";
import { CostStore } from "./stores/cost-store.js";
import { SitegeistSessionsStore } from "./stores/sessions-store.js";
import { SkillsStore } from "./stores/skills-store.js";

export class SitegeistAppStorage extends BaseAppStorage {
	readonly skills: SkillsStore;
	readonly costs: CostStore;
	readonly schedule: ScheduleStore;

	constructor() {
		const settings = new SettingsStore();
		const providerKeys = new ProviderKeysStore();
		const sessions = new SitegeistSessionsStore();
		const customProviders = new CustomProvidersStore();
		const skills = new SkillsStore();
		const costs = new CostStore();
		const schedule = new ScheduleStore();

		const configs = [
			settings.getConfig(),
			SessionsStore.getMetadataConfig(),
			providerKeys.getConfig(),
			customProviders.getConfig(),
			sessions.getConfig(),
			skills.getConfig(),
			costs.getConfig(),
			schedule.getConfig(),
		];

		const backend = new IndexedDBStorageBackend({
			dbName: "sitegeist-storage",
			version: 5,
			stores: configs,
		});

		settings.setBackend(backend);
		providerKeys.setBackend(backend);
		customProviders.setBackend(backend);
		sessions.setBackend(backend);
		skills.setBackend(backend);
		costs.setBackend(backend);
		schedule.setBackend(backend);

		super(settings, providerKeys, sessions, customProviders, backend);

		this.skills = skills;
		this.costs = costs;
		this.schedule = schedule;
	}
}

export function getSitegeistStorage(): SitegeistAppStorage {
	return getAppStorage() as SitegeistAppStorage;
}
