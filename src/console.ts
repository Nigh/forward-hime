import {Context} from "koishi";
import {resolve} from "path";

import {readDiagnosticLogs} from "./diagnostics";

interface ConsoleService {
	addEntry(entry: {dev: string; prod: string}): void;
	addListener(
		event: string,
		listener: () => Promise<string>,
		options: {authority: number},
	): void;
}

export function consoleInit(ctx: Context) {
	ctx.inject(["console"], (ctx) => {
		const console = (ctx as unknown as {console: ConsoleService}).console;

		console.addListener("forward-hime:get-diagnostics", readDiagnosticLogs, {
			authority: 4,
		});
		console.addEntry({
			dev: resolve(__dirname, "../client/index.ts"),
			prod: resolve(__dirname, "client"),
		});
	});
}
