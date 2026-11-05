import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {test} from "node:test";

import {build} from "esbuild";

const {h} = createRequire(import.meta.url)("koishi");

// Official adapter keeps gateway input in event._data; snapshots are not decoded:
// https://github.com/satorijs/satori/blob/master/adapters/discord/src/utils.ts
// https://docs.discord.com/developers/resources/message#message-snapshot-object
function forwarded(message, messageId = "forward") {
	return {
		platform: "discord",
		channelId: "destination-channel",
		messageId,
		selfId: "bot",
		elements: [],
		// The adapter also resolves message_reference as a quote, including forwards.
		quote: {id: "original-message"},
		event: {
			_type: "discord",
			_data: {
				t: "MESSAGE_CREATE",
				d: {
					content: "",
					attachments: [],
					embeds: [],
					message_reference: {
						type: 1,
						message_id: "original-message",
						channel_id: "original-channel",
						guild_id: "original-guild",
					},
					message_snapshots: [{message}],
				},
			},
		},
	};
}

test("Discord native forwards extract snapshot content without source metadata", async () => {
	const workspace = await mkdtemp(join(process.cwd(), ".test-discord-forward-"));
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
		const {
			defaultMiddleware,
			MsgMiddlewareCache,
			MsgDecoratorNoRelay,
			MsgDecoratorFallbackReason,
		} = await import(pathToFileURL(bundle));
		const text = "forwarded <tag> & text\nsecond line";
		const textSession = forwarded({content: text});
		const textContent = defaultMiddleware(textSession).content;

		assert.equal(textContent.length, 1);
		assert.equal(textContent[0].type, "text");
		assert.equal(textContent[0].attrs.content, text);
		assert.match(textContent[0].toString(), /&lt;tag&gt; &amp; text/);
		assert.deepEqual(textSession.elements, []);

		await MsgMiddlewareCache(textSession);
		const sent = await MsgDecoratorNoRelay(textSession, {Platform: "test"});
		assert.equal(sent.at(-1).attrs.content, text);
		assert(!sent.some((element) => element.type === "quote"));
		assert.doesNotMatch(sent.join(""), /original-(message|channel|guild)/);

		const attachments = [
			{filename: "photo.png", content_type: "image/png", width: 20, height: 10},
			{filename: "clip.mp4", content_type: "video/mp4", width: 20, height: 10},
			{filename: "voice.ogg", content_type: "audio/ogg"},
			{filename: "notes.txt", content_type: "text/plain"},
		].map((attachment) => ({
			...attachment,
			url: `https://cdn.discordapp.com/attachments/${attachment.filename}`,
			proxy_url: `https://media.discordapp.net/attachments/${attachment.filename}`,
			size: 123,
		}));
		const mediaSession = forwarded({attachments}, "media-forward");
		const media = defaultMiddleware(mediaSession).content;
		assert.deepEqual(media.map((element) => element.type), ["img", "video", "audio", "file"]);
		for (const [index, attachment] of attachments.entries()) {
			assert.equal(media[index].attrs.src, attachment.url);
		}
		const sentMedia = await MsgDecoratorNoRelay(mediaSession, {Platform: "test"});
		assert.deepEqual(sentMedia.slice(-4).map((element) => element.type), ["img", "video", "audio", "file"]);
		assert.deepEqual(
			sentMedia.slice(-4).map((element) => element.attrs.src),
			attachments.map((attachment) => attachment.url),
		);
		const fallback = await MsgDecoratorFallbackReason(
			forwarded({content: text, attachments}, "fallback-forward"),
			{Platform: "test"},
			"media unavailable",
		);
		assert(fallback.some((element) => element.attrs.content === text));
		assert(!fallback.some((element) => element.type === "quote"));
		assert.doesNotMatch(fallback.join(""), /cdn\.discordapp\.com|original-(message|channel|guild)/);

		const embedImage = "https://example.test/embed.png";
		const embedThumbnail = "https://example.test/thumbnail.png";
		const embedVideo = "https://example.test/embed.mp4";
		const embedContent = defaultMiddleware(
			forwarded({
				embeds: [{
					image: {url: embedImage},
					thumbnail: {url: embedThumbnail},
					video: {url: embedVideo},
				}],
			}, "embed-forward"),
		).content;
		assert.deepEqual(
			embedContent.map((element) => [element.type, element.attrs.src]),
			[["img", embedImage], ["img", embedThumbnail], ["video", embedVideo]],
		);

		const ordinary = h.text("ordinary message");
		const ordinaryImage = h.image("https://example.test/photo.png");
		const ordinarySession = {
			platform: "discord",
			elements: [ordinary, ordinaryImage],
			event: {_data: {d: {message_reference: {type: 0}}}},
		};
		const unchanged = defaultMiddleware(ordinarySession).content;
		assert.equal(unchanged[0], ordinary);
		assert.equal(unchanged[1], ordinaryImage);
		assert.equal(defaultMiddleware({...textSession, platform: "telegram"}).content, textSession.elements);
	} finally {
		await rm(workspace, {recursive: true, force: true});
	}
});
