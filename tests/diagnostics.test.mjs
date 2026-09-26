import assert from "node:assert/strict";
import {mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {test} from "node:test";

import {build} from "esbuild";

test("writes JSONL, rotates by UTC day, prunes old files, and redacts errors", async () => {
	const workspace = await mkdtemp(join(process.cwd(), ".test-diagnostics-"));
	const baseDir = await mkdtemp(join(tmpdir(), "forward-hime-"));
	const root = join(baseDir, "data", "forward-hime");
	const bundle = join(workspace, "diagnostics.mjs");

	try {
		await build({
			entryPoints: [resolve("src/diagnostics.ts")],
			bundle: true,
			platform: "node",
			format: "esm",
			packages: "external",
			outfile: bundle,
			plugins: [
				{
					name: "mock-koishi-logger",
					setup(build) {
						build.onResolve({filter: /^\.\/logger$/}, () => ({
							path: "logger",
							namespace: "mock",
						}));
						build.onLoad({filter: /.*/, namespace: "mock"}, () => ({
							contents: "export const logger = { warn() {} }",
							loader: "js",
						}));
					},
				},
			],
		});
		const diagnostics = await import(pathToFileURL(bundle));
		await mkdir(root, {recursive: true});
		const now = new Date();
		const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
		const expired = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
		await writeFile(join(root, `${yesterday}.jsonl`), '{"timestamp":"yesterday"}\n');
		await writeFile(join(root, `${expired}.jsonl`), "expired\n");
		diagnostics.diagnosticsInit({baseDir});

		const traceId = diagnostics.createTraceId();
		diagnostics.writeDiagnostic({traceId, phase: "send-result", status: "success"});
		const first = (await diagnostics.readDiagnosticLogs()).trim().split("\n");
		assert.equal(first.length, 2);
		assert(first.some((line) => JSON.parse(line).traceId === traceId));
		await assert.rejects(readFile(join(root, `${expired}.jsonl`)));

		const original = Date.prototype.toISOString;
		Date.prototype.toISOString = function () {
			return original.call(new Date(this.getTime() + 86400000));
		};
		try {
			diagnostics.writeDiagnostic({
				traceId,
				phase: "send-result",
				status: "success",
			});
		} finally {
			Date.prototype.toISOString = original;
		}
		assert.equal(
			(await diagnostics.readDiagnosticLogs()).trim().split("\n").length,
			3,
		);

		const error = diagnostics.sanitizeError(
			new Error("bad response https://host.test/private?token=secret"),
		);
		assert.equal(error.summary, "request failed");
		assert(!JSON.stringify(error).includes("host.test"));
	} finally {
		await Promise.all([
			rm(workspace, {recursive: true, force: true}),
			rm(baseDir, {recursive: true, force: true}),
		]);
	}
});
