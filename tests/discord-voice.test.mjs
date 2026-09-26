import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {test} from "node:test";

import {build} from "esbuild";

const {h} = createRequire(import.meta.url)("koishi");

test("Discord and OneBot voice messages use the right outgoing elements", async () => {
	const workspace = await mkdtemp(join(process.cwd(), ".test-voice-"));
	const bundle = join(workspace, "decorator.cjs");

	try {
		await build({
			entryPoints: [resolve("src/decorator.ts")],
			bundle: true,
			platform: "node",
			format: "cjs",
			packages: "external",
			outfile: bundle,
		});
		const {defaultMiddleware, MsgDecorator, MsgDecoratorNoRelay} = await import(
			pathToFileURL(bundle)
		);
		const record = h("record", {
			src: "https://cdn.discordapp.com/voice.ogg",
			type: "audio/ogg",
		});
		const session = {platform: "discord", elements: [record]};
		const {content} = defaultMiddleware(session);

		assert.equal(content[0].type, "audio");
		assert.equal(content[0].attrs.src, record.attrs.src);
		assert.equal(content[0].attrs.type, "audio/ogg");
		assert.equal(record.type, "record");
		assert.equal(
			defaultMiddleware({...session, platform: "onebot"}).content[0],
			record,
		);

		const onebotAudio = h("audio", {
			src: "https://example.test/voice.amr",
			file: "voice.amr",
		});
		const onebotSession = {
			platform: "onebot",
			channelId: "1",
			messageId: "2",
			userId: "3",
			username: "sender",
			event: {user: {avatar: ""}},
			elements: [onebotAudio],
		};
		const discordNode = {Platform: "discord", Guild: "4", BotID: "5"};
		const direct = await MsgDecoratorNoRelay(onebotSession, discordNode);

		assert.equal(direct.at(-1).type, "img");
		assert.equal(direct.at(-1).attrs.file, "voice.amr");
		assert.equal(direct.at(-1).attrs.mode, "download");
		assert.equal(direct.at(-1).attrs.src, onebotAudio.attrs.src);

		const originalFetch = globalThis.fetch;

		try {
			globalThis.fetch = async () =>
				new Response(Buffer.from("voice bytes"), {
					headers: {"content-type": "audio/amr"},
				});
			const relayed = await MsgDecorator(onebotSession, discordNode);

			assert.equal(relayed.at(-1).type, "img");
			assert.equal(relayed.at(-1).attrs.file, "voice.amr");
			assert.match(relayed.at(-1).attrs.src, /^data:audio\/amr;base64,/);
		} finally {
			globalThis.fetch = originalFetch;
		}

		const otherPlatform = await MsgDecoratorNoRelay(onebotSession, {
			...discordNode,
			Platform: "telegram",
		});

		assert.equal(otherPlatform.at(-1).type, "audio");
	} finally {
		await rm(workspace, {recursive: true, force: true});
	}
});
