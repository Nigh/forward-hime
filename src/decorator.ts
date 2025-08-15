import {Session, Element, h} from "koishi";
import {ForwardNode} from "./config";
import {MsgUUIDFromSession} from "./message";
import {ConfigSet} from "./config";
import * as decorator from "./decorators";
interface ForwardMsg {
	head: Element[];
	content: Element[];
}

interface FMsgCache {
	UUID: string;
	msg: ForwardMsg;
}

let defaultPrefix = "";
let defaultFallback = "";
let defaultPrefixNewline = true;
export function decoratorInit(cfg: ConfigSet) {
	defaultPrefix = cfg.DefaultDecorator.Prefix;
	defaultPrefixNewline = cfg.DefaultDecorator.Newline;
	defaultFallback = cfg.DefaultFallbackMsgPrefix;
}

function renderTemplate(template: string, data: Record<string, any>): string {
	return template.replace(/\$\{(\w+)\}/g, (_, key) => {
		return data[key] !== undefined ? data[key] : `$\{${key}}`; // 未找到则保留原模板
	});
}

export function defaultDecorator({head, content}: ForwardMsg) {
	let msg: Element[] = [];
	msg = msg.concat(head, content);
	return msg;
}

export function defaultMiddleware(session: Session) {
	let head: Element[] = [h("span", renderTemplate(defaultPrefix, session))];
	if (defaultPrefixNewline) {
		head.push(h("br"));
	}
	return {head: head, content: session.elements} as ForwardMsg;
}

const localDecorators = [atTranslator, quoteTranslator];

let msgMiddleCache: FMsgCache[] = [];
function msgMiddleCacheAppend(msg: FMsgCache) {
	msgMiddleCache.push(msg);
	if (msgMiddleCache.length > 16) {
		msgMiddleCache.shift();
	}
	logger.debug(`[msgMiddleCache]`, msgMiddleCache.length);
}
function msgMiddleCacheFind(uuid: string) {
	for (const item of msgMiddleCache) {
		if (item.UUID === uuid) {
			return item.msg;
		}
	}
	return null;
}

function MsgToMiddleware(session: Session) {
	let elems: ForwardMsg = {head: [], content: []};
	let _platform_in = decorator[session.platform];
	if (_platform_in && typeof _platform_in.Middleware === "function") {
		elems = _platform_in.Middleware(session);
	} else {
		elems = defaultMiddleware(session);
	}
	return elems;
}

export async function MsgMiddlewareCache(session: Session) {
	let elems: ForwardMsg = MsgToMiddleware(session);
	msgMiddleCacheAppend({UUID: MsgUUIDFromSession(session), msg: elems});
	logger.debug(`[msgMiddleCache] CACHED`);
}
export async function MsgDecorator(session: Session, node: ForwardNode) {
	let elems: ForwardMsg;
	let _platform_out = decorator[node.Platform];

	let elemCache = msgMiddleCacheFind(MsgUUIDFromSession(session));
	if (elemCache) {
		logger.debug(`[msgMiddleCache] HIT`);
		elems = elemCache;
	} else {
		logger.debug(`[msgMiddleCache] MISSED`);
		elems = MsgToMiddleware(session);
	}

	for (const fn of localDecorators) {
		elems = (await fn(session, node, elems)) as ForwardMsg;
	}
	if (_platform_out && typeof _platform_out.Decorator === "function") {
		return _platform_out.Decorator(elems);
	} else {
		return defaultDecorator(elems);
	}
}

function defaultDecoratorFallback({head, content}: ForwardMsg) {
	let msg: Element[] = [];
	let newContent: Element[] = [];
	newContent.push(h("span", defaultFallback));
	for (const key in content) {
		if (["img", "audio", "video", "file"].includes(content[key].type)) {
			newContent.push(h("span", ` [${content[key].type}] `));
		} else {
			newContent.push(content[key]);
		}
	}
	msg = msg.concat(head, newContent);
	return msg;
}
export async function MsgDecoratorFallback(session: Session, node: ForwardNode) {
	let elems: ForwardMsg = {head: [], content: []};
	elems = defaultMiddleware(session);
	for (const fn of localDecorators) {
		elems = (await fn(session, node, elems)) as ForwardMsg;
	}
	return defaultDecoratorFallback(elems);
}

async function atTranslator(
	session: Session,
	_: ForwardNode,
	{head, content}: ForwardMsg,
) {
	const newMsg = await new Promise((resolve, reject) => {
		let newContent: Element[] = [];
		for (const key in content) {
			const element = content[key];
			if (element.type === "at") {
				if (element.attrs.id !== session.selfId) {
					// Note: onebot-qq at 无昵称
					newContent.push(
						h("span", `@${element.attrs.name || element.attrs.id}`),
					);
				}
			} else {
				newContent.push(element);
			}
		}
		resolve({head: head, content: newContent} as ForwardMsg);
	});
	return newMsg;
}

import {logger} from "./logger";
import {msgCacheFindByKey, msgCacheGetLocalIDByUUID} from "./cache";
async function quoteTranslator(
	session: Session,
	node: ForwardNode,
	{head, content}: ForwardMsg,
) {
	if (!session.quote || !session.quote.id) {
		return {head: head, content: content} as ForwardMsg;
	}
	const key = session.channelId + ":" + session.quote.id;
	const cache = await msgCacheFindByKey(key);
	if (cache) {
		let msgid = await msgCacheGetLocalIDByUUID(node, cache.uuid);
		if (msgid) {
			let newHead = [h("quote", {id: msgid})].concat(head);
			return {head: newHead, content: content} as ForwardMsg;
		} else {
			logger.error(`[msgCacheGetLocalIDByUUID] ${cache.uuid} not found`);
		}
	}
	return {head: head, content: content} as ForwardMsg;
}
