import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {test} from "node:test";
import {build} from "esbuild";

const {h, Logger} = createRequire(import.meta.url)("koishi");

test("message entry skips service and empty messages but forwards user content", async () => {
	const workspace = await mkdtemp(join(process.cwd(), ".test-message-filter-"));
	try {
		const bundle = join(workspace, "index.cjs");
		await build({
			entryPoints: [resolve("src/index.ts")],
			bundle: true,
			platform: "node",
			format: "cjs",
			packages: "external",
			outfile: bundle,
		});
		const {apply, Config} = createRequire(import.meta.url)(bundle);
		const handlers = {};
		const sent = [];
		const mappings = new Map();
		const ctx = {
			baseDir: workspace,
			logger: () => new Logger("filter-test"),
			inject() {},
			on: (name, handler) => {
				handlers[name] = handler;
			},
			cache: {
				set: async (_, key, value) => {
					mappings.set(key, value);
				},
				get: async (_, key) => mappings.get(key),
				delete: async (_, key) => {
					mappings.delete(key);
				},
				entries: async () => mappings.entries(),
			},
			bots: {
				"test:target-bot": {
					sendMessage: async (_, content) => {
						sent.push(content.join(""));
						return [`sent-${sent.length}`];
					},
					deleteMessage: async (_, id) => {
						sent.push(`deleted:${id}`);
					},
				},
			},
		};
		const config = Config({});
		config.MediaRelay.Enabled = false;
		config.ForwardGroups = [
			{
				Nodes: [
					...["telegram", "discord", "onebot", "kook"].map((Platform) => ({
						Platform,
						Guild: "source",
						BotID: "source-bot",
					})),
					{Platform: "test", Guild: "target", BotID: "target-bot"},
				],
			},
		];
		apply(ctx, config);
		let id = 0;
		async function receive(platform, elements, data) {
			const session = {
				platform,
				channelId: "source",
				messageId: String(++id),
				userId: "user",
				username: "user",
				elements,
				event: {_data: data},
			};
			await handlers["message-created"](session);
			await new Promise((resolve) => setTimeout(resolve, 10));
			return session;
		}
		const telegramServices = {
			new_chat_title: "new name",
			new_chat_photo: [{}],
			delete_chat_photo: true,
			new_chat_members: [{}],
			left_chat_member: {},
			pinned_message: {text: "pinned"},
			group_chat_created: true,
			supergroup_chat_created: true,
			channel_chat_created: true,
			migrate_to_chat_id: 123,
			migrate_from_chat_id: 123,
			forum_topic_created: {},
			forum_topic_edited: {},
			forum_topic_closed: {},
			forum_topic_reopened: {},
			video_chat_started: {},
			video_chat_ended: {},
			video_chat_scheduled: {},
			video_chat_participants_invited: {},
			message_auto_delete_timer_changed: {},
			successful_payment: {},
			boost_added: {},
		};
		for (const [key, value] of Object.entries(telegramServices)) {
			await receive("telegram", [h.text("adapter-generated service text")], {
				message: {[key]: value},
			});
		}
		for (const type of [1, 2, 3, 4, 5, 6, 7, 8, 18, 21]) {
			await receive("discord", [h.text("system message")], {d: {type}});
		}
		for (const platform of ["telegram", "discord", "onebot", "kook"]) {
			await receive(platform, [], undefined);
			await receive(
				platform,
				[h("b", [h.text(" \n")]), h("br"), h("quote", {id: "old"})],
				undefined,
			);
		}
		assert.deepEqual(sent, []);
		assert.equal(mappings.size, 0);
		for (const field of ["message", "channel_post"]) {
			await receive("telegram", [h.text("changed group name")], {
				[field]: {text: "changed group name"},
			});
			await receive("telegram", [h.image("https://example.test/photo.png")], {
				[field]: {photo: [{}]},
			});
		}
		for (const type of [0, 19, 20, 23])
			await receive("discord", [h.text("normal")], {d: {type}});
		await receive("discord", [], {
			d: {
				type: 0,
				message_reference: {type: 1},
				message_snapshots: [{message: {content: "snapshot"}}],
			},
		});
		const source = await receive("onebot", [h.text("normal")]);
		assert.equal(sent.length, 10);
		assert(sent.some((content) => content.includes("snapshot")));
		assert(mappings.has(`source:${source.messageId}`));
		await handlers["message-deleted"](source);
		await new Promise((resolve) => setTimeout(resolve, 10));
		assert(sent.includes("deleted:sent-10"));
	} finally {
		await rm(workspace, {recursive: true, force: true});
	}
});
