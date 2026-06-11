import {Element, h} from "koishi";

import {ConfigSet} from "./config";

interface MediaRelayConfig {
	Enabled: boolean;
	CacheMinutes: number;
	RequestTimeoutSec: number;
	MaxFileSizeMB: number;
}

interface RelayCacheItem {
	expiresAt: number;
	kind: string;
	mime: string;
	buffer: Buffer;
	filename?: string;
}

const DEFAULT_IMAGE_MIME = "image/jpeg";
const DEFAULT_AUDIO_MIME = "audio/mpeg";
const DEFAULT_VIDEO_MIME = "video/mp4";
const DEFAULT_FILE_MIME = "application/octet-stream";

let relayConfig: MediaRelayConfig = {
	Enabled: true,
	CacheMinutes: 10,
	RequestTimeoutSec: 15,
	MaxFileSizeMB: 20,
};

const relayCache = new Map<string, RelayCacheItem>();

export class MediaRelayError extends Error {
	userMessage: string;

	constructor(message: string, userMessage: string) {
		super(message);
		this.name = "MediaRelayError";
		this.userMessage = userMessage;
	}
}

export function relayInit(cfg: ConfigSet) {
	relayConfig = cfg.MediaRelay;
}

function cleanupExpiredRelayCache() {
	const now = Date.now();

	for (const [key, item] of relayCache.entries()) {
		if (item.expiresAt <= now) {
			relayCache.delete(key);
		}
	}
}

function normalizeMediaType(type: string) {
	if (type === "image") {
		return "img";
	}

	return type;
}

function isRelayMediaElement(element: Element) {
	const mediaType = normalizeMediaType(element.type);

	return ["img", "audio", "video", "file"].includes(mediaType);
}

function mediaUrlFromElement(element: Element) {
	if (typeof element.attrs?.src === "string") {
		return element.attrs.src;
	}
	if (typeof element.attrs?.url === "string") {
		return element.attrs.url;
	}

	return "";
}

function pickDefaultMime(kind: string) {
	switch (kind) {
		case "img":
			return DEFAULT_IMAGE_MIME;
		case "audio":
			return DEFAULT_AUDIO_MIME;
		case "video":
			return DEFAULT_VIDEO_MIME;
		default:
			return DEFAULT_FILE_MIME;
	}
}

function pickFilename(element: Element, src: string) {
	const nameAttrs = ["filename", "name", "title", "file"];

	for (const key of nameAttrs) {
		if (typeof element.attrs?.[key] === "string" && element.attrs[key]) {
			return element.attrs[key];
		}
	}
	try {
		const parsed = new URL(src);
		const pathname = parsed.pathname || "";
		const filename = pathname.split("/").filter(Boolean).pop();

		return filename || "relay-file";
	} catch {
		return "relay-file";
	}
}

function getCacheKey(element: Element) {
	const mediaType = normalizeMediaType(element.type);
	const src = mediaUrlFromElement(element);

	return `${mediaType}:${src}`;
}

function relayElementFromCache(item: RelayCacheItem) {
	return createRelayElement(item.kind, item.mime, item.buffer, item.filename);
}

function createRelayElement(
	kind: string,
	mime: string,
	buffer: Buffer,
	filename?: string,
) {
	const helperMap = h as unknown as Record<string, Function>;

	if (kind === "img") {
		return h.image(buffer, mime);
	}
	if (helperMap[kind]) {
		return helperMap[kind](buffer, mime, filename);
	}
	const base64 = buffer.toString("base64");

	return h(kind, {src: `data:${mime};base64,${base64}`, filename});
}

function networkMessageFromError(error: unknown) {
	if (error instanceof MediaRelayError) {
		return error.userMessage;
	}
	if (error instanceof Error) {
		const msg = error.message.toLowerCase();

		if (
			msg.includes("timeout") ||
			msg.includes("timed out") ||
			msg.includes("etimedout")
		) {
			return "网络问题：媒体下载超时，请稍后重试。";
		}
		if (
			msg.includes("enotfound") ||
			msg.includes("econnrefused") ||
			msg.includes("ehostunreach") ||
			msg.includes("network")
		) {
			return "网络问题：无法连接到媒体源站，请稍后重试。";
		}
	}

	return "网络问题：媒体文件暂时无法获取。";
}

async function downloadAndRelay(element: Element): Promise<Element> {
	const kind = normalizeMediaType(element.type);
	const src = mediaUrlFromElement(element);

	if (!src) {
		throw new MediaRelayError(
			`missing media src for ${element.type}`,
			"网络问题：媒体链接缺失，无法完成跨平台转发。",
		);
	}

	cleanupExpiredRelayCache();
	const cacheKey = getCacheKey(element);
	const cacheItem = relayCache.get(cacheKey);

	if (cacheItem) {
		return relayElementFromCache(cacheItem);
	}

	const timeoutSignal =
		typeof AbortSignal.timeout === "function"
			? AbortSignal.timeout(relayConfig.RequestTimeoutSec * 1000)
			: undefined;
	const response = await fetch(src, {signal: timeoutSignal});

	if (!response.ok) {
		const code = response.status;

		if (code === 401 || code === 403) {
			throw new MediaRelayError(
				`media source denied by status ${code}`,
				"网络问题：媒体资源需要授权，当前中转节点无法访问。",
			);
		}
		if (code === 404) {
			throw new MediaRelayError(
				"media source not found",
				"媒体资源已失效或被删除，无法继续转发。",
			);
		}
		if (code >= 500) {
			throw new MediaRelayError(
				`media source server error ${code}`,
				"网络问题：媒体源站暂时不可用，请稍后重试。",
			);
		}
		throw new MediaRelayError(
			`media source response ${code}`,
			"网络问题：媒体下载失败，请稍后重试。",
		);
	}

	const maxBytes = relayConfig.MaxFileSizeMB * 1024 * 1024;
	const contentLength = Number(response.headers.get("content-length") || 0);

	if (contentLength > maxBytes) {
		throw new MediaRelayError(
			`media too large: ${contentLength} > ${maxBytes}`,
			`媒体文件过大（>${relayConfig.MaxFileSizeMB} MB），无法中转发送。`,
		);
	}

	const arrayBuffer = await response.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	if (buffer.length === 0) {
		throw new MediaRelayError(
			"empty media payload",
			"网络问题：媒体文件为空，无法完成转发。",
		);
	}
	if (buffer.length > maxBytes) {
		throw new MediaRelayError(
			`media too large after download: ${buffer.length} > ${maxBytes}`,
			`媒体文件过大（>${relayConfig.MaxFileSizeMB} MB），无法中转发送。`,
		);
	}

	const mime = response.headers.get("content-type") || pickDefaultMime(kind);
	const filename = kind === "file" ? pickFilename(element, src) : undefined;
	const relayed = createRelayElement(kind, mime, buffer, filename);

	relayCache.set(cacheKey, {
		expiresAt: Date.now() + relayConfig.CacheMinutes * 60 * 1000,
		kind,
		mime,
		buffer,
		filename,
	});

	return relayed;
}

export async function relayForwardContent(content: Element[]) {
	if (!relayConfig.Enabled) {
		return content;
	}
	const newContent: Element[] = [];

	for (const element of content) {
		if (!isRelayMediaElement(element)) {
			newContent.push(element);
			continue;
		}
		try {
			newContent.push(await downloadAndRelay(element));
		} catch (error) {
			throw new MediaRelayError(
				error instanceof Error ? error.message : "relay failed",
				networkMessageFromError(error),
			);
		}
	}

	return newContent;
}
