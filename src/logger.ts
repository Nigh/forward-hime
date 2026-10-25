import {formatWithOptions} from "node:util";

import {Context, Logger} from "koishi";

function redactLogger(output: Logger) {
	for (const [type, level] of [
		["success", Logger.SUCCESS],
		["error", Logger.ERROR],
		["info", Logger.INFO],
		["warn", Logger.WARN],
		["debug", Logger.DEBUG],
	] as const) {
		const write = output[type];

		output[type] = (...args: unknown[]) => {
			const enabled = Logger.targets.some((target) => {
				let configured: Logger.Level = target.levels ?? Logger.levels;

				for (const name of output.name.split(":")) {
					if (typeof configured === "number") break;
					configured = configured[name] ?? configured.base;
				}

				return typeof configured === "number" && configured >= level;
			});

			if (!enabled) {
				return;
			}

			// Format copies only; never change message elements or error payloads.
			const content = formatWithOptions({maxStringLength: Infinity}, ...args);
			const redacted = content.replace(
				/(?:data:[^\s"'<>]*?;base64,|base64:\/\/)([A-Za-z0-9+/_-]*={0,2})/gi,
				(_match, payload: string) => `[base64 length=${payload.length}]`,
			);

			// Keep literal percent signs out of Koishi's second formatting pass.
			write.call(output, "%s", redacted);
		};
	}

	return output;
}

export let logger = redactLogger(new Logger("forward-hime"));
logger.level = Logger.INFO;

export function loggerInit(ctx: Context) {
	logger = redactLogger(ctx.logger("forward-hime"));
}
