import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {test} from "node:test";

import {build} from "esbuild";

const {h} = createRequire(import.meta.url)("koishi");

test("file relay keeps names and uses Discord's attachment path", async () => {
	const workspace = await mkdtemp(join(process.cwd(), ".test-relay-"));
	const bundle = join(workspace, "relay.cjs");
	const originalFetch = globalThis.fetch;

	try {
		await build({
			entryPoints: [resolve("src/relay.ts")],
			bundle: true,
			platform: "node",
			format: "cjs",
			packages: "external",
			outfile: bundle,
		});
		const {relayForwardContent, relayInit} = await import(pathToFileURL(bundle));
		let fileHandler;
		relayInit(
			{on: (_event, handler) => (fileHandler = handler)},
			{
				MediaRelay: {
					Enabled: true,
					CacheMinutes: 10,
					RequestTimeoutSec: 15,
					MaxFileSizeMB: 20,
				},
			},
		);
		globalThis.fetch = async () =>
			new Response(Buffer.from("solid test"), {
				headers: {"content-type": "application/octet-stream; charset=utf-8"},
			});

		const qqFile = h("file", {
			src: "https://example.test/qq-file",
			name: "QQ-Discord椅子.stl",
		});
		const [discordFile] = await relayForwardContent([qqFile], undefined, undefined, {
			Platform: "discord",
		});
		assert.equal(discordFile.type, "img");
		assert.equal(discordFile.attrs.file, "QQ-Discord椅子.stl");
		assert.equal(discordFile.attrs.filename, "QQ-Discord椅子.stl");
		const [cachedOnebotFile] = await relayForwardContent(
			[qqFile],
			undefined,
			undefined,
			{
				Platform: "onebot",
			},
		);
		assert.equal(cachedOnebotFile.type, "file");

		const incoming = h("file", {
			src: "https://example.test/discord-file",
			file: "Discord-QQ椅子.stl",
		});
		const [onebotFile] = await relayForwardContent([incoming], undefined, undefined, {
			Platform: "onebot",
		});
		assert.equal(onebotFile.type, "file");
		assert.equal(onebotFile.attrs.file, "Discord-QQ椅子.stl");
		assert.equal(onebotFile.attrs.filename, "Discord-QQ椅子.stl");
		assert.equal(onebotFile.attrs.title, "Discord-QQ椅子.stl");
		const telegramFile = fileHandler(onebotFile.attrs.src, onebotFile.attrs);
		assert.equal(telegramFile.filename, "Discord-QQ椅子.stl");
		assert.equal(Buffer.from(telegramFile.data).toString(), "solid test");
	} finally {
		globalThis.fetch = originalFetch;
		await rm(workspace, {recursive: true, force: true});
	}
});
