import type { AgentMessage } from "@earendil-works/pi-agent-core";

export type ScheduleConfig =
	| { type: "once"; at: string }
	| { type: "interval"; minutes: number }
	| { type: "cron"; expression: string };

export interface ScheduledTask {
	id: string;
	name: string;
	description: string;
	promptTemplate: string;
	schedule: ScheduleConfig;
	executionMode: "silent" | "visible";
	targetUrl?: string;
	enabled: boolean;
	lastRunAt?: string;
	lastRunStatus?: "success" | "failed" | "timeout";
	nextRunAt?: string;
	createdAt: string;
	updatedAt: string;
}

export interface TaskExecutionLog {
	id: string;
	taskId: string;
	startedAt: string;
	finishedAt?: string;
	status: "running" | "success" | "failed" | "timeout";
	error?: string;
	summary?: string;
	agentMessages: AgentMessage[];
}

export interface TaskExecutionResult {
	status: "success" | "failed" | "timeout";
	error?: string;
	summary?: string;
	agentMessages: AgentMessage[];
}

export const ALARM_PREFIX = "scheduled-task:";

export function alarmNameForTask(taskId: string): string {
	return `${ALARM_PREFIX}${taskId}`;
}

export function taskIdFromAlarmName(alarmName: string): string | null {
	if (!alarmName.startsWith(ALARM_PREFIX)) return null;
	return alarmName.slice(ALARM_PREFIX.length);
}
