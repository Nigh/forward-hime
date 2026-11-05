import assert from "node:assert/strict";
import {once} from "node:events";
import {mkdtemp, rm} from "node:fs/promises";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {test} from "node:test";
import {pathToFileURL} from "node:url";

import {build} from "esbuild";
import sharp from "sharp";

const {Context, HTTP, h} = createRequire(import.meta.url)("koishi");
const payload = (element) => Buffer.from(element.attrs.src.split(",")[1], "base64");

test("media relay resolves Telegram source files before public proxy URLs and preserves Koishi file hooks", async () => {
	const workspace = await mkdtemp(join(process.cwd(), ".test-source-"));
	const context = new Context();
	context.plugin(HTTP);
	const image = await sharp({
		create: {width: 2, height: 2, channels: 3, background: "#123456"},
	}).png().toBuffer();
	const html = "<!DOCTYPE html><html><title>Koishi Console</title></html>";
	let publicDownloads = 0;
	let sourceDownloads = 0;
	const server = createServer((request, response) => {
		if (request.url.startsWith("/api/files/")) {
			sourceDownloads++;
			response.writeHead(200, {"content-type": "image/png"});
			response.end(image);
		} else if (request.url === "/oversize") {
			response.writeHead(200, {
				"content-type": "image/png",
				"content-length": String(2 * 1024 * 1024),
			});
			response.end(image);
		} else if (request.url === "/denied") {
			response.writeHead(403);
			response.end();
		} else if (request.url === "/authenticated" && request.headers.authorization === "Bearer local-test") {
			response.writeHead(200, {"content-type": "image/png"});
			response.end(image);
		} else {
			publicDownloads++;
			response.writeHead(200, {
				"content-type": request.url === "/disguised" ? "application/octet-stream" : "text/html; charset=utf-8",
			});
			response.end(html);
		}
	});

	try {
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		const base = `http://127.0.0.1:${server.address().port}`;
		const bundle = join(workspace, "relay.cjs");
		await build({
			entryPoints: [resolve("src/relay.ts")],
			bundle: true,
			platform: "node",
			format: "cjs",
			packages: "external",
			outfile: bundle,
		});
		const {relayInit, relayForwardContent, MediaRelayError} = await import(pathToFileURL(bundle));
		const initialize = (overrides = {}) => relayInit(context, {
			MediaRelay: {
				Enabled: true,
				CacheMinutes: 10,
				RequestTimeoutSec: 1,
				MaxFileSizeMB: 1,
				ImageCompression: {Enabled: false},
				...overrides,
			},
		});
		initialize();
		const paths = [];
		const bot = {
			server: `${base}/console/telegram/42`,
			async $getFile(path) {
				paths.push(path);
				return context.http.file(`${base}/api/files/${encodeURI(path)}`);
			},
		};
		const session = {platform: "telegram", bot};
		const incoming = [
			h.image(`${bot.server}/photos/first.png`),
			h("p", [h.image(`${bot.server}/photos/second%20%E5%9B%BE.png`)]),
		];

		// This selfUrl serves the console, not the adapter's public file route.
		assert.equal(await (await fetch(incoming[0].attrs.src)).text(), html);
		publicDownloads = 0;
		const forwarded = await relayForwardContent(incoming, undefined, session, {Platform: "telegram"});
		assert.deepEqual(payload(forwarded[0]), image);
		assert.deepEqual(payload(forwarded[1].children[0]), image);
		assert.deepEqual(paths, ["photos/first.png", "photos/second 图.png"]);
		assert.equal(sourceDownloads, 2);
		assert.equal(publicDownloads, 0);
		await relayForwardContent(incoming, undefined, session, {Platform: "discord"});
		assert.equal(sourceDownloads, 2);

		// A matching filename under a different path is not this bot's proxy.
		await assert.rejects(
			relayForwardContent([h.image(`${base}/console/telegram/420/photos/first.png`)], undefined, session),
			(error) => error instanceof MediaRelayError && !error.allowDirectRetry,
		);
		assert.equal(paths.length, 2);

		// Modern Telegram uses internal: URLs. Exercise the installed Satori router.
		context.bots.push({sid: "telegram:43"});
		context.satori.defineInternalRoute("/files/:name", async () => ({
			status: 200,
			headers: new Headers({"content-type": "image/png"}),
			body: image,
		}));
		const [internal] = await relayForwardContent([h.image("internal:telegram/43/files/photo.png")]);
		assert.deepEqual(payload(internal), image);

		let options;
		context.on("http/file", (url, received) => {
			if (url === "asset:photo") {
				options = received;
				return {type: "image/png", filename: "photo.png", data: image};
			}
			if (url === "asset:large") return {type: "image/png", data: Buffer.alloc(2 * 1024 * 1024)};
			if (url === "asset:empty") return {type: "image/png", data: Buffer.alloc(0)};
			if (url === "asset:pending") return new Promise(() => {});
		});
		const [asset] = await relayForwardContent([h.image("asset:photo", {filename: "original.png"})]);
		assert.deepEqual(payload(asset), image);
		assert.equal(options.timeout, 1000);
		assert.equal(options.filename, "original.png");
		context.on("http/fetch-init", (url, init) => {
			if (url.pathname === "/authenticated") init.headers.set("authorization", "Bearer local-test");
		});
		const [authenticated] = await relayForwardContent([h.image(`${base}/authenticated`)]);
		assert.deepEqual(payload(authenticated), image);

		for (const path of ["html", "disguised"]) {
			await assert.rejects(
				relayForwardContent([h.image(`${base}/${path}`)]),
				(error) => error instanceof MediaRelayError && !error.allowDirectRetry && error.userMessage.includes("网页"),
			);
		}
		// A real HTML attachment remains a file, not a rejected image.
		const [attachment] = await relayForwardContent([h("file", {src: `${base}/html`, filename: "page.html"})]);
		assert.equal(payload(attachment).toString(), html);
		await assert.rejects(relayForwardContent([h.image(`${base}/oversize`)]), /media too large:/);
		await assert.rejects(relayForwardContent([h.image("asset:large")]), /media too large after download:/);
		await assert.rejects(relayForwardContent([h.image("asset:empty")]), /empty media payload/);
		await assert.rejects(
			relayForwardContent([h.image(`${base}/denied`)]),
			(error) => error instanceof MediaRelayError && error.userMessage.includes("授权"),
		);
		initialize({RequestTimeoutSec: 0.01});
		await assert.rejects(
			relayForwardContent([h.image("asset:pending")]),
			(error) => error instanceof MediaRelayError && error.userMessage.includes("超时"),
		);
		await assert.rejects(
			relayForwardContent([h.image(`${bot.server}/photos/pending.png`)], undefined, {
				platform: "telegram",
				bot: {...bot, $getFile: () => new Promise(() => {})},
			}),
			(error) => error instanceof MediaRelayError && error.userMessage.includes("超时"),
		);
	} finally {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
		await context.stop();
		await rm(workspace, {recursive: true, force: true});
	}
});
