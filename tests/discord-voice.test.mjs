import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {test} from "node:test";

import {build} from "esbuild";

const {h} = createRequire(import.meta.url)("koishi");

test("Discord voice records become audio for forwarding", async () => {
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
		const {defaultMiddleware} = await import(pathToFileURL(bundle));
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
	} finally {
		await rm(workspace, {recursive: true, force: true});
	}
});
