import {randomUUID} from "crypto";
import {appendFile, mkdir, readFile, readdir, rm} from "fs/promises";
import {join} from "path";

import {Context} from "koishi";

import {logger} from "./logger";

const RETENTION_DAYS = 7;
const FILE_PATTERN = /^\d{4}-\d{2}-\d{2}\.jsonl$/;

let root = "";
let writeQueue = Promise.resolve();
let lastCleanupDate = "";

export interface DiagnosticEvent {
	traceId: string;
	phase: string;
	[key: string]: unknown;
}

export function createTraceId() {
	return randomUUID();
}

export function diagnosticFilename(value: unknown) {
	if (typeof value !== "string" || /^https?:\/\//i.test(value)) return undefined;

	return value
		.replace(/[?#].*$/, "")
		.split(/[\\/]/)
		.pop()
		?.slice(0, 120);
}

export function diagnosticMime(value: unknown) {
	return typeof value === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(value)
		? value
		: undefined;
}

function utcDate(timestamp = Date.now()) {
	return new Date(timestamp).toISOString().slice(0, 10);
}

async function cleanup(date: string) {
	if (date === lastCleanupDate) return;
	const cutoff = Date.parse(`${date}T00:00:00.000Z`) - (RETENTION_DAYS - 1) * 86400000;

	for (const filename of await readdir(root)) {
		if (!FILE_PATTERN.test(filename)) continue;
		if (Date.parse(`${filename.slice(0, 10)}T00:00:00.000Z`) < cutoff) {
			await rm(join(root, filename), {force: true});
		}
	}
	lastCleanupDate = date;
}

export function diagnosticsInit(ctx: Context) {
	root = join(ctx.baseDir, "data", "forward-hime");
	writeQueue = Promise.resolve();
	lastCleanupDate = "";
	writeQueue = writeQueue
		.then(async () => {
			await mkdir(root, {recursive: true});
			await cleanup(utcDate());
		})
		.catch((error) => logger.warn("failed to initialize diagnostic log", error));
}

export function writeDiagnostic(event: DiagnosticEvent) {
	const timestamp = new Date().toISOString();
	const date = timestamp.slice(0, 10);
	const line = JSON.stringify({timestamp, ...event}) + "\n";

	writeQueue = writeQueue
		.then(async () => {
			await mkdir(root, {recursive: true});
			await cleanup(date);
			await appendFile(join(root, `${date}.jsonl`), line, "utf8");
		})
		.catch((error) => logger.warn("failed to write diagnostic log", error));
}

export async function readDiagnosticLogs() {
	await writeQueue;
	const cutoff = new Date(
		Date.parse(`${utcDate()}T00:00:00.000Z`) - (RETENTION_DAYS - 1) * 86400000,
	)
		.toISOString()
		.slice(0, 10);
	const files = (await readdir(root).catch(() => []))
		.filter(
			(filename) => FILE_PATTERN.test(filename) && filename.slice(0, 10) >= cutoff,
		)
		.sort();
	const contents = await Promise.all(
		files.map((filename) => readFile(join(root, filename), "utf8")),
	);

	return contents.join("");
}

export function sanitizeError(error: unknown) {
	const value = error as {
		name?: unknown;
		message?: unknown;
		code?: unknown;
		status?: unknown;
	};
	const message = typeof value?.message === "string" ? value.message : String(error);

	const lowerMessage = message.toLowerCase();
	let summary = "request failed";

	if (lowerMessage.includes("timeout") || lowerMessage.includes("timed out")) {
		summary = "request timed out";
	} else if (
		lowerMessage.includes("denied") ||
		lowerMessage.includes("401") ||
		lowerMessage.includes("403")
	) {
		summary = "request denied";
	} else if (lowerMessage.includes("not found") || lowerMessage.includes("404")) {
		summary = "resource not found";
	} else if (lowerMessage.includes("too large")) {
		summary = "media exceeds size limit";
	} else if (
		lowerMessage.includes("network") ||
		lowerMessage.includes("econn") ||
		lowerMessage.includes("enotfound")
	) {
		summary = "network error";
	} else if (lowerMessage.includes("empty media")) {
		summary = "empty media payload";
	}

	return {
		name:
			typeof value?.name === "string" && /^[a-z][\w.-]{0,63}$/i.test(value.name)
				? value.name
				: "Error",
		code:
			(typeof value?.code === "string" && /^[\w.-]{1,64}$/.test(value.code)) ||
			typeof value?.code === "number"
				? value.code
				: undefined,
		httpStatus:
			typeof value?.status === "number"
				? value.status
				: Number(/\bstatus\s+(\d{3})\b/i.exec(message)?.[1]) || undefined,
		summary,
	};
}
