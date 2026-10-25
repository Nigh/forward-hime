import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {test} from "node:test";
import {inspect} from "node:util";

import {build} from "esbuild";
const {Logger} = createRequire(import.meta.url)("koishi");

test("redacts media base64 at the shared logger without changing messages or errors", async () => {
	const workspace = await mkdtemp(join(process.cwd(), ".test-logger-"));
	const bundle = join(workspace, "logger.cjs");
	const originalTargets = Logger.targets;
	const records = [];
	Logger.targets = [
		{
			colors: false,
			levels: {base: Logger.DEBUG},
			record: (record) => records.push(record),
		},
	];

	try {
		await build({
			entryPoints: [resolve("src/logger.ts")],
			bundle: true,
			platform: "node",
			format: "cjs",
			packages: "external",
			outfile: bundle,
		});
		const logging = createRequire(import.meta.url)(bundle);
		const payload = "QUJD".repeat(4000) + "==";
		const dataUri = `data:image/png;charset=utf-8;base64,${payload}`;
		const base64Uri = `base64://${payload}`;
		const marker = `[base64 length=${payload.length}]`;

		logging.logger.info(`before init: ${dataUri}`);
		assert.equal(records.at(-1).content, `before init: ${marker}`);

		const backend = new Logger("forward-hime:test", {source: "test"});
		logging.loggerInit({logger: () => backend});
		for (const type of ["success", "error", "info", "warn", "debug"]) {
			logging.logger[type](`first ${dataUri}; second ${base64Uri}`);
			assert.equal(records.at(-1).type, type);
			assert.equal(records.at(-1).content, `first ${marker}; second ${marker}`);
			assert.equal(records.at(-1).name, "forward-hime:test");
			assert.deepEqual(records.at(-1).meta, {source: "test"});
		}

		const message = Object.freeze({
			elements: Object.freeze([
				Object.freeze({type: "img", attrs: Object.freeze({src: dataUri})}),
			]),
			attachment: base64Uri,
		});
		logging.logger.debug("session", message);
		assert(records.at(-1).content.includes(marker));
		assert(!records.at(-1).content.includes("QUJD"));
		assert.equal(message.elements[0].attrs.src, dataUri);
		assert.equal(message.attachment, base64Uri);

		const cause = new Error(`upload ${base64Uri}`);
		const error = new Error(`request ${dataUri}`, {cause});
		error.request = message;
		const originalStack = error.stack;
		logging.logger.error(error);
		assert(records.at(-1).content.includes("Error: request " + marker));
		assert(records.at(-1).content.includes("Error: upload " + marker));
		assert(!records.at(-1).content.includes("QUJD"));
		assert.equal(error.stack, originalStack);
		assert.equal(error.cause, cause);
		assert.equal(error.request, message);
		assert.equal(cause.message, `upload ${base64Uri}`);

		logging.logger.error(`ERROR:<MessageSend> ${error}`);
		assert.equal(
			records.at(-1).content,
			`ERROR:<MessageSend> Error: request ${marker}`,
		);
		logging.logger.info("json %j", {src: dataUri});
		assert.equal(records.at(-1).content, `json {"src":"${marker}"}`);
		logging.logger.info("100% complete; literal %s");
		assert.equal(records.at(-1).content, "100% complete; literal %s");
		logging.logger.info("unchanged https://example.test/image.png", 42);
		assert.equal(
			records.at(-1).content,
			"unchanged https://example.test/image.png 42",
		);

		const circular = {src: base64Uri};
		circular.self = circular;
		logging.logger.warn(circular);
		assert(records.at(-1).content.includes(marker));
		assert(records.at(-1).content.includes("[Circular"));
		assert.equal(circular.self, circular);
		assert.equal(circular.src, base64Uri);

		const count = records.length;
		Logger.targets[0].levels.base = Logger.INFO;
		logging.logger.debug({
			[inspect.custom]() {
				throw new Error("disabled debug log must not inspect payload");
			},
		});
		assert.equal(records.length, count);
	} finally {
		Logger.targets = originalTargets;
		await rm(workspace, {recursive: true, force: true});
	}
});
