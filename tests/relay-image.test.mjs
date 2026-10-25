import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {mkdtemp, rm} from "node:fs/promises";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {test} from "node:test";
import {pathToFileURL} from "node:url";

import {build} from "esbuild";
import sharp from "sharp";

const {h} = createRequire(import.meta.url)("koishi");
const MiB = 1024 * 1024;

function payload(element) {
	return Buffer.from(element.attrs.src.split(",")[1], "base64");
}

test("image relay enforces JPEG targets, defaults, cache and failure semantics", async () => {
	const workspace = await mkdtemp(join(process.cwd(), ".test-image-"));
	const originalFetch = globalThis.fetch;

	try {
		const bundle = join(workspace, "relay.cjs");
		await build({
			entryPoints: [resolve("src/relay.ts")],
			bundle: true,
			platform: "node",
			format: "cjs",
			packages: "external",
			outfile: bundle,
		});
		const {relayForwardContent, relayInit, MediaRelayError} = await import(
			pathToFileURL(bundle)
		);
		const initialize = (ImageCompression) =>
			relayInit(
				{on() {}},
				{
					MediaRelay: {
						Enabled: true,
						CacheMinutes: 10,
						RequestTimeoutSec: 15,
						MaxFileSizeMB: 20,
						...(ImageCompression && {ImageCompression}),
					},
				},
			);
		const image = await sharp(randomBytes(1600 * 1600 * 3), {
			raw: {width: 1600, height: 1600, channels: 3},
		})
			.png()
			.toBuffer();
		assert.ok(image.length > 2 * MiB);
		let downloads = 0;
		globalThis.fetch = async () => {
			downloads++;
			return new Response(image, {headers: {"content-type": "image/png"}});
		};
		const incoming = h("image", {url: "https://example.test/image"});

		// Old saved configs without new fields still compress by default.
		initialize();
		const [compressed] = await relayForwardContent([incoming]);
		assert.match(compressed.attrs.src, /^data:image\/jpeg;base64,/);
		assert.ok(payload(compressed).length <= MiB);
		const metadata = await sharp(payload(compressed)).metadata();
		assert.equal(metadata.format, "jpeg");
		assert.ok(metadata.width < 1600);
		const [cached] = await relayForwardContent([incoming]);
		assert.equal(cached.attrs.src, compressed.attrs.src);
		assert.equal(downloads, 1);

		// Reinitialization invalidates compressed cache when settings change.
		initialize({Enabled: false});
		const [disabled] = await relayForwardContent([incoming]);
		assert.match(disabled.attrs.src, /^data:image\/png;base64,/);
		assert.deepEqual(payload(disabled), image);
		assert.equal(downloads, 2);
		initialize({InputSizeMB: image.length / MiB});
		const [atThreshold] = await relayForwardContent([incoming]);
		assert.deepEqual(payload(atThreshold), image);

		// Native fetch covers data URLs too, including nested image elements.
		globalThis.fetch = originalFetch;
		initialize({TargetSizeMB: 0.03});
		const [nested] = await relayForwardContent([
			h("p", [h.image(image, "image/png")]),
		]);
		const small = nested.children[0];
		assert.match(small.attrs.src, /^data:image\/jpeg;base64,/);
		assert.ok(payload(small).length <= Math.floor(0.03 * MiB));

		// Below-threshold images keep bytes and MIME unchanged.
		const tiny = await sharp({
			create: {width: 2, height: 2, channels: 4, background: "#00000000"},
		})
			.png()
			.toBuffer();
		initialize();
		const [untouched] = await relayForwardContent([h.image(tiny, "image/png")]);
		assert.deepEqual(payload(untouched), tiny);
		initialize({InputSizeMB: 0.000001});
		const [flattened] = await relayForwardContent([h.image(tiny, "image/png")]);
		const {data, info} = await sharp(payload(flattened))
			.raw()
			.toBuffer({resolveWithObject: true});
		assert.equal(info.channels, 3);
		assert.ok(data.every((channel) => channel === 255));

		const animation = Buffer.from(
			"47494638396101000100800000000000ffffff" +
				"21f90400010000002c0000000001000100000202440100" +
				"21f90400010000002c00000000010001000002024c01003b",
			"hex",
		);
		assert.equal((await sharp(animation, {animated: true}).metadata()).pages, 2);
		for (const mime of ["image/gif", "application/octet-stream"]) {
			const [unchanged] = await relayForwardContent([h.image(animation, mime)]);
			assert.deepEqual(payload(unchanged), animation);
			assert.ok(unchanged.attrs.src.startsWith(`data:${mime};base64,`));
			assert.equal(
				(await sharp(payload(unchanged), {animated: true}).metadata()).pages,
				2,
			);
		}
		const animatedWebp = await sharp(animation, {animated: true}).webp().toBuffer();
		const [unchangedWebp] = await relayForwardContent([
			h.image(animatedWebp, "image/webp"),
		]);
		assert.deepEqual(payload(unchangedWebp), animatedWebp);
		assert.equal(
			(await sharp(payload(unchangedWebp), {animated: true}).metadata()).pages,
			2,
		);

		// Non-images are never decoded or compressed, even above the threshold.
		const opaque = Buffer.alloc(2 * MiB + 1, 42);
		initialize();
		for (const kind of ["file", "video", "audio"]) {
			const [element] = await relayForwardContent([
				h(kind, {
					src: `data:application/octet-stream;base64,${opaque.toString("base64")}`,
				}),
			]);
			assert.deepEqual(payload(element), opaque);
		}
		await assert.rejects(
			relayForwardContent([h.image(opaque, "image/png")]),
			(error) =>
				error instanceof MediaRelayError &&
				!error.allowDirectRetry &&
				error.userMessage.includes("图片压缩失败"),
		);
		initialize({InputSizeMB: 0.000001, TargetSizeMB: 0.000001});
		await assert.rejects(
			relayForwardContent([h.image(tiny, "image/png")]),
			MediaRelayError,
		);

		// Compression failure fallback must not leak nested original images.
		const decoratorBundle = join(workspace, "decorator.cjs");
		await build({
			entryPoints: [resolve("src/decorator.ts")],
			bundle: true,
			platform: "node",
			format: "cjs",
			packages: "external",
			outfile: decoratorBundle,
		});
		const {MsgDecoratorFallbackReason} = await import(pathToFileURL(decoratorBundle));
		const original = h("p", [
			h("text", {content: "caption"}),
			h("image", {src: "data:image/png;base64,AAAA"}),
		]);
		const degraded = await MsgDecoratorFallbackReason(
			{platform: "test", elements: [original]},
			{Platform: "test"},
			"图片压缩失败",
		);
		const rendered = degraded.join("");
		assert.ok(rendered.includes("caption"));
		assert.ok(rendered.includes("[image]"));
		assert.ok(!rendered.includes("base64"));
		assert.equal(original.children[1].type, "image");
	} finally {
		globalThis.fetch = originalFetch;
		await rm(workspace, {recursive: true, force: true});
	}
});
