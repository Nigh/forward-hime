import {Context} from "koishi";
import {} from "@koishijs/cache";

import {ConfigSet, ForwardNode} from "./config";
import {logger} from "./logger";

export interface MsgCache {
	platform: string;
	bot: string;

	guild: string;
	msgid: string;

	uuid: string;
}

declare module "@koishijs/cache" {
	interface Tables {
		msgCache: MsgCache;
	}
}
let ctx;
let cacheTimeout = 86400 * 1000;

function cacheNotEnabled() {
	if (!ctx.cache) {
		return true;
	}

	return false;
}
export function msgCacheInit(context: Context, cfg: ConfigSet) {
	ctx = context;
	cacheTimeout = 60 * cfg.CacheTimeout * 1000;
}
export async function msgCache(mc: MsgCache) {
	if (cacheNotEnabled()) {
		return;
	}
	const key = mc.guild + ":" + mc.msgid;

	logger.debug(`[message-cache] ${mc.platform} ${key}`);
	await ctx.cache.set("msgCache", key, mc, cacheTimeout);
}

export async function msgCacheDelete(key: string) {
	if (cacheNotEnabled()) {
		return;
	}
	await ctx.cache.delete("msgCache", key);
}

export async function msgCacheFindByKey(key: string) {
	if (cacheNotEnabled()) {
		return;
	}

	return await ctx.cache.get("msgCache", key);
}

export async function msgCacheFindByUUID(uuid: string) {
	if (cacheNotEnabled()) {
		return;
	}
	const caches = await ctx.cache.entries("msgCache");
	const result = [];

	for await (const item of caches) {
		if (item[1].uuid === uuid) {
			result.push(item);
		}
	}

	return result;
}

export async function msgCacheGetLocalIDByUUID(node: ForwardNode, uuid: string) {
	if (cacheNotEnabled()) {
		return;
	}

	const caches = await ctx.cache.entries("msgCache");

	for await (const item of caches) {
		if (
			item[1].uuid === uuid &&
			item[1].platform === node.Platform &&
			item[1].guild === node.Guild &&
			item[1].bot === node.BotID
		) {
			return item[1].msgid;
		}
	}
}
