interface CronField {
	values: Set<number>;
}

function parseField(field: string, min: number, max: number): CronField {
	const values = new Set<number>();

	for (const part of field.split(",")) {
		const stepMatch = part.match(/^(.+)\/(\d+)$/);
		let range: string;
		let step = 1;

		if (stepMatch) {
			range = stepMatch[1];
			step = parseInt(stepMatch[2], 10);
		} else {
			range = part;
		}

		if (range === "*") {
			for (let i = min; i <= max; i += step) {
				values.add(i);
			}
		} else if (range.includes("-")) {
			const [startStr, endStr] = range.split("-");
			const start = parseInt(startStr, 10);
			const end = parseInt(endStr, 10);
			for (let i = start; i <= end; i += step) {
				values.add(i);
			}
		} else {
			const val = parseInt(range, 10);
			if (!Number.isNaN(val) && val >= min && val <= max) {
				values.add(val);
			}
		}
	}

	return { values };
}

export interface ParsedCron {
	minute: CronField;
	hour: CronField;
	dayOfMonth: CronField;
	month: CronField;
	dayOfWeek: CronField;
}

export function parseCron(expression: string): ParsedCron {
	const fields = expression.trim().split(/\s+/);
	if (fields.length !== 5) {
		throw new Error(`Invalid cron expression: expected 5 fields, got ${fields.length}`);
	}

	return {
		minute: parseField(fields[0], 0, 59),
		hour: parseField(fields[1], 0, 23),
		dayOfMonth: parseField(fields[2], 1, 31),
		month: parseField(fields[3], 1, 12),
		dayOfWeek: parseField(fields[4], 0, 6),
	};
}

export function getNextCronTime(expression: string, after: Date = new Date()): Date {
	const cron = parseCron(expression);
	const candidate = new Date(after);
	candidate.setSeconds(0, 0);
	candidate.setMinutes(candidate.getMinutes() + 1);

	const maxIterations = 366 * 24 * 60;
	for (let i = 0; i < maxIterations; i++) {
		const month = candidate.getMonth() + 1;
		const day = candidate.getDate();
		const dow = candidate.getDay();
		const hour = candidate.getHours();
		const minute = candidate.getMinutes();

		if (
			cron.month.values.has(month) &&
			cron.dayOfMonth.values.has(day) &&
			cron.dayOfWeek.values.has(dow) &&
			cron.hour.values.has(hour) &&
			cron.minute.values.has(minute)
		) {
			return candidate;
		}

		candidate.setMinutes(candidate.getMinutes() + 1);
	}

	throw new Error("Could not find next cron time within a year");
}

export function cronToHumanReadable(expression: string): string {
	try {
		parseCron(expression);
	} catch {
		return expression;
	}

	const fields = expression.trim().split(/\s+/);
	const [minute, hour, dom, month, dow] = fields;

	if (minute === "0" && hour === "9" && dom === "*" && month === "*" && dow === "*") {
		return "Every day at 09:00";
	}
	if (minute === "0" && hour === "*" && dom === "*" && month === "*" && dow === "*") {
		return "Every hour";
	}
	if (minute === "0" && dom === "*" && month === "*" && dow === "1") {
		return "Every Monday";
	}
	if (minute === "0" && dom === "1" && month === "*") {
		return "1st of each month";
	}

	return `${minute} ${hour} * * ${dow === "*" ? "every day" : `weekday ${dow}`}`;
}
