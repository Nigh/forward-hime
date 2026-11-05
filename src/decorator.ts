import {Context, Session, Element, h} from "koishi";

import {msgCacheFindByKey, msgCacheGetLocalIDByUUID} from "./cache";
import {ConfigSet, ForwardNode} from "./config";
import * as decorator from "./decorators";
import {logger} from "./logger";
import {MsgUUIDFromSession} from "./message";
import {relayForwardContent, relayInit} from "./relay";
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

export function decoratorInit(ctx: Context, cfg: ConfigSet) {
	defaultPrefix = cfg.DefaultDecorator.Prefix;
	defaultPrefixNewline = cfg.DefaultDecorator.Newline;
	defaultFallback = cfg.DefaultFallbackMsgPrefix;
	relayInit(ctx, cfg);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

interface DiscordSnapshot {
	content?: string;
	attachments?: {
		url: string;
		proxy_url?: string;
		filename: string;
		content_type?: string;
		width?: number;
		height?: number;
		size?: number;
	}[];
	embeds?: {
		image?: {url: string; proxy_url?: string};
		thumbnail?: {url: string; proxy_url?: string};
		video?: {url: string; proxy_url?: string};
	}[];
	sticker_items?: {id: string; name: string; format_type: number}[];
}

function discordForwardMessage(session: Session) {
	if (session.platform !== "discord") return;
	// The adapter keeps the gateway payload here but does not decode snapshots.
	const data = session.event?._data?.d as
		| {
				message_reference?: {type?: number};
				message_snapshots?: {message: DiscordSnapshot}[];
		  }
		| undefined;

	return data?.message_reference?.type === 1 ? data : undefined;
}

function discordSnapshotContent(message: DiscordSnapshot): Element[] {
	const content: Element[] = [];

	if (message.content) content.push(h.text(message.content));
	for (const attachment of message.attachments ?? []) {
		const type = attachment.content_type;
		const visual = attachment.width && attachment.height;
		const element =
			visual && type?.startsWith("image/")
				? "img"
				: visual && type?.startsWith("video/")
					? "video"
					: type?.startsWith("audio/")
						? "audio"
						: "file";

		content.push(
			h(element, {
				src: attachment.url,
				proxy_url: attachment.proxy_url,
				file: attachment.filename,
				type,
				width: attachment.width,
				height: attachment.height,
				size: attachment.size,
			}),
		);
	}
	for (const embed of message.embeds ?? []) {
		for (const media of [embed.image, embed.thumbnail]) {
			if (media) {
				content.push(h.image(media.url, {proxy_url: media.proxy_url}));
			}
		}
		if (embed.video) {
			content.push(
				h("video", {
					src: embed.video.url,
					proxy_url: embed.video.proxy_url,
				}),
			);
		}
	}
	for (const sticker of message.sticker_items ?? []) {
		content.push(
			h("sticker", sticker, [
				h.image(
					`https://media.discordapp.net/stickers/${sticker.id}.webp?size=160`,
				),
			]),
		);
	}

	return content;
}

export function defaultMiddleware(session: Session) {
	const head: Element[] = [h("span", renderTemplate(defaultPrefix, session))];

	if (defaultPrefixNewline) {
		head.push(h("br"));
	}

	const content =
		session.platform === "discord"
			? session.elements
					.concat(
						(discordForwardMessage(session)?.message_snapshots ?? []).flatMap(
							(snapshot) => discordSnapshotContent(snapshot.message),
						),
					)
					.map((element) =>
						element.type === "record"
							? h("audio", element.attrs, element.children)
							: element,
					)
			: session.elements;

	return {head: head, content} as ForwardMsg;
}

// Filter before adding the forwarding prefix or writing message mappings.
export function isForwardableMessage(session: Session): boolean {
	const data = session.event?._data;

	if (session.platform === "telegram") {
		const message =
			data?.message ??
			data?.channel_post ??
			data?.edited_message ??
			data?.edited_channel_post;

		// Telegram service messages share the ordinary message event. Accept user
		// payloads rather than maintaining an ever-growing list of service fields.
		if (
			message &&
			![
				"text",
				"animation",
				"audio",
				"document",
				"paid_media",
				"photo",
				"sticker",
				"story",
				"video",
				"video_note",
				"voice",
				"contact",
				"dice",
				"game",
				"poll",
				"venue",
				"location",
				"invoice",
			].some((key) => message[key] != null)
		) {
			return false;
		}
	}
	if (
		session.platform === "discord" &&
		data?.d?.type != null &&
		![0, 19, 20, 23].includes(data.d.type)
	) {
		// Default, reply, chat input command, context menu command.
		return false;
	}

	function hasContent(elements: Element[]): boolean {
		return elements.some((element) => {
			if (element.type === "text") return Boolean(element.attrs.content?.trim());
			if (["quote", "br"].includes(element.type)) return false;
			if (element.children.length) return hasContent(element.children);

			return ![
				"span",
				"p",
				"b",
				"strong",
				"i",
				"em",
				"u",
				"s",
				"del",
				"code",
				"pre",
				"spl",
				"a",
			].includes(element.type);
		});
	}

	return hasContent(defaultMiddleware(session).content);
}

const localDecorators = [atTranslator, quoteTranslator];

const msgMiddleCache: FMsgCache[] = [];

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
	const _platform_in = decorator[session.platform];

	if (_platform_in && typeof _platform_in.Middleware === "function") {
		return _platform_in.Middleware(session);
	}

	return defaultMiddleware(session);
}

function discordAudioAttachments(
	session: Session,
	node: ForwardNode,
	content: Element[],
) {
	if (session.platform !== "onebot" || node.Platform !== "discord") {
		return content;
	}

	return content.map((element) => {
		if (element.type !== "audio") return element;
		const src = element.attrs.src || element.attrs.url;

		if (typeof src !== "string") return element;
		const name = element.attrs.filename || element.attrs.file;
		const filename =
			typeof name === "string" && /^[^/\\:]+\.[a-z\d]+$/i.test(name)
				? name
				: "voice.bin";

		return h.image(src, {file: filename, mode: "download"});
	});
}

export async function MsgMiddlewareCache(session: Session) {
	const elems: ForwardMsg = MsgToMiddleware(session);

	msgMiddleCacheAppend({UUID: MsgUUIDFromSession(session), msg: elems});
	logger.debug(`[msgMiddleCache] CACHED`);
}
export async function MsgDecorator(
	session: Session,
	node: ForwardNode,
	traceId?: string,
) {
	let elems: ForwardMsg;
	const _platform_out = decorator[node.Platform];

	const elemCache = msgMiddleCacheFind(MsgUUIDFromSession(session));

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
	elems = {
		head: elems.head,
		content: discordAudioAttachments(
			session,
			node,
			await relayForwardContent(elems.content, traceId, session, node),
		),
	};
	if (_platform_out && typeof _platform_out.Decorator === "function") {
		return _platform_out.Decorator(elems);
	} else {
		return defaultDecorator(elems);
	}
}

export async function MsgDecoratorNoRelay(session: Session, node: ForwardNode) {
	let elems: ForwardMsg;
	const _platform_out = decorator[node.Platform];

	const elemCache = msgMiddleCacheFind(MsgUUIDFromSession(session));

	if (elemCache) {
		elems = elemCache;
	} else {
		elems = MsgToMiddleware(session);
	}

	for (const fn of localDecorators) {
		elems = (await fn(session, node, elems)) as ForwardMsg;
	}

	logger.debug(`[MsgDecoratorNoRelay] fallback to direct forward`);
	elems = {
		head: elems.head,
		content: discordAudioAttachments(session, node, elems.content),
	};

	if (_platform_out && typeof _platform_out.Decorator === "function") {
		return _platform_out.Decorator(elems);
	} else {
		return defaultDecorator(elems);
	}
}

function defaultDecoratorFallback({head, content}: ForwardMsg, reason?: string) {
	function replaceMedia(elements: Element[]): Element[] {
		return elements.map((element) => {
			if (["img", "image", "audio", "video", "file"].includes(element.type)) {
				return h("span", ` [${element.type}] `);
			}

			return element.children.length
				? h(element.type, element.attrs, replaceMedia(element.children))
				: element;
		});
	}

	return [
		...replaceMedia(head),
		h("span", reason || defaultFallback),
		...replaceMedia(content),
	];
}
export async function MsgDecoratorFallback(session: Session, node: ForwardNode) {
	let elems = defaultMiddleware(session);

	for (const fn of localDecorators) {
		elems = (await fn(session, node, elems)) as ForwardMsg;
	}

	return defaultDecoratorFallback(elems);
}

export async function MsgDecoratorFallbackReason(
	session: Session,
	node: ForwardNode,
	reason: string,
) {
	let elems = defaultMiddleware(session);

	for (const fn of localDecorators) {
		elems = (await fn(session, node, elems)) as ForwardMsg;
	}

	return defaultDecoratorFallback(elems, reason);
}

async function atTranslator(
	session: Session,
	_: ForwardNode,
	{head, content}: ForwardMsg,
) {
	const newMsg = await new Promise((resolve) => {
		const newContent: Element[] = [];

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

async function quoteTranslator(
	session: Session,
	node: ForwardNode,
	{head, content}: ForwardMsg,
) {
	if (discordForwardMessage(session) || !session.quote || !session.quote.id) {
		return {head: head, content: content} as ForwardMsg;
	}
	const key = session.channelId + ":" + session.quote.id;
	const cache = await msgCacheFindByKey(key);

	if (cache) {
		const msgid = await msgCacheGetLocalIDByUUID(node, cache.uuid);

		if (msgid) {
			const newHead = [h("quote", {id: msgid})].concat(head);

			return {head: newHead, content: content} as ForwardMsg;
		} else {
			logger.error(`[msgCacheGetLocalIDByUUID] ${cache.uuid} not found`);
		}
	}

	return {head: head, content: content} as ForwardMsg;
}
