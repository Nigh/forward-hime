import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {test} from "node:test";

import {build} from "esbuild";

const {Context, h} = createRequire(import.meta.url)("koishi");

test("OneBot URLs retain literal destinations across forwarding paths", async () => {
	const workspace = await mkdtemp(join(process.cwd(), ".test-links-"));
	const bundle = join(workspace, "decorator.cjs");
	const context = new Context();
	try {
		await build({
			entryPoints: [resolve("src/decorator.ts")],
			bundle: true,
			platform: "node",
			format: "cjs",
			packages: "external",
			outfile: bundle,
		});
		const api = await import(pathToFileURL(bundle));
		api.decoratorInit(context, {
			DefaultDecorator: {Prefix: "${platform}", Newline: true},
			DefaultFallbackMsgPrefix: "fallback",
			MediaRelay: {Enabled: false},
		});
		const urls = [
			"https://example.test/a_b?q=x*y&next=%2Ffoo#part_1",
			"http://example.test/a_(b)",
		];
		const text = `链接：${urls[0]}，另一个 ${urls[1]}。普通 *文本* <tag>`;
		for (const avatar of ["", "https://q.qlogo.cn/avatar"]) {
			const session = {
				platform: "onebot",
				channelId: "source",
				messageId: avatar || "plain",
				userId: "user",
				username: "sender",
				event: {user: {avatar}},
				elements: [h.text(text)],
			};
			await api.MsgMiddlewareCache(session);
			for (const Platform of ["discord", "telegram", "onebot"]) {
				for (const method of [
					"MsgDecorator",
					"MsgDecoratorNoRelay",
					"MsgDecoratorFallback",
					"MsgDecoratorFallbackReason",
				]) {
					const output = await api[method](
						session,
						{Platform, Guild: "target", BotID: "bot"},
						"reason",
					);
					const links = h.select(output, "a");
					assert.deepEqual(
						links.map((link) => link.attrs.href),
						urls,
					);
					assert.deepEqual(
						links.map((link) => link.children[0].attrs.content),
						urls,
					);
					assert.equal(
						output
							.slice(method.includes("Fallback") ? 3 : 2)
							.map((element) =>
								element.type === "a"
									? element.attrs.href
									: element.attrs.content,
							)
							.join(""),
						text,
					);
				}
			}
			assert.equal(session.platform, "onebot");
		}
		const original = h.text(text);
		assert.equal(
			api.defaultMiddleware({platform: "discord", elements: [original]}).content[0],
			original,
		);
	} finally {
		await context.stop();
		await rm(workspace, {recursive: true, force: true});
	}
});
