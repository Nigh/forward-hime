import {Context, Logger} from "koishi";

export let logger = new Logger("forward-hime");
logger.level = Logger.INFO;

export function loggerInit(ctx: Context) {
	logger = ctx.logger("forward-hime");
}
