import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {test} from "node:test";

import {build} from "esbuild";

test("only falls back when failure occurs before sending", async () => {
	const workspace = await mkdtemp(join(tmpdir(), "forward-hime-message-"));
	const bundle = join(workspace, "message.mjs");
	const events = [];

	try {
		await build({
			entryPoints: [resolve("src/message.ts")],
			bundle: true,
			platform: "node",
			format: "esm",
			packages: "external",
			outfile: bundle,
			plugins: [
				{
					name: "mock-dependencies",
					setup(build) {
						for (const name of [
							"logger",
							"decorator",
							"cache",
							"relay",
							"diagnostics",
						]) {
							build.onResolve(
								{filter: new RegExp(`^\\./${name}$`)},
								() => ({path: name, namespace: "mock"}),
							);
						}
						build.onLoad({filter: /.*/, namespace: "mock"}, ({path}) => ({
							contents: {
								logger: "export const logger = {debug() {}, info() {}, warn() {}, error() {}}",
								decorator: `
								import {MediaRelayError} from "./relay";
								export const MsgDecorator = () => {
									if (globalThis.compressionFails) throw new MediaRelayError("compression failed", false);
									return globalThis.decorationFails ? Promise.reject(new Error("decorate failed")) : Promise.resolve([]);
								};
								export const MsgDecoratorNoRelay = () => Promise.resolve(["uncompressed"]);
								export const MsgDecoratorFallback = () => Promise.resolve(["degraded"]);
								export const MsgDecoratorFallbackReason = MsgDecoratorFallback;
							`,
								cache: "export const msgCache = () => {}",
								relay: "export class MediaRelayError extends Error { constructor(message, allowDirectRetry = true) { super(message); this.allowDirectRetry = allowDirectRetry; } }",
								diagnostics: `
								export const createTraceId = () => "trace";
								export const diagnosticFilename = () => undefined;
								export const diagnosticMime = () => undefined;
								export const sanitizeError = () => ({});
								export const writeDiagnostic = (event) => globalThis.events.push(event);
							`,
							}[path],
							loader: "js",
						}));
					},
				},
			],
		});
		globalThis.events = events;
		const {MessageForward} = await import(pathToFileURL(bundle));
		const node = {Platform: "kook", BotID: "bot", Guild: "target"};
		const session = {
			platform: "onebot",
			channelId: "source",
			messageId: "1",
			elements: [],
		};
		let sends = 0;
		const ctx = {
			bots: {
				"kook:bot": {
					sendMessage: async () => {
						sends++;
						throw new Error("request timed out");
					},
				},
			},
		};

		await MessageForward(ctx, node, session);
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(sends, 1);
		assert(events.some((event) => event.phase === "forward-uncertain"));
		assert(!events.some((event) => event.phase === "forward-degraded"));

		globalThis.decorationFails = true;
		ctx.bots["kook:bot"].sendMessage = async () => {
			sends++;
			return ["fallback-id"];
		};
		await MessageForward(ctx, node, session);
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(sends, 2);
		assert(events.some((event) => event.phase === "forward-degraded"));

		globalThis.decorationFails = false;
		globalThis.compressionFails = true;
		const sentContent = [];
		ctx.bots["kook:bot"].sendMessage = async (_channel, content) => {
			sentContent.push(content);
			return ["degraded-id"];
		};
		await MessageForward(ctx, node, session);
		await new Promise((resolve) => setImmediate(resolve));
		assert.deepEqual(sentContent, [["degraded"]]);
	} finally {
		delete globalThis.events;
		delete globalThis.decorationFails;
		delete globalThis.compressionFails;
		await rm(workspace, {recursive: true, force: true});
	}
});
