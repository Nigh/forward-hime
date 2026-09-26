import {Context, send} from "@koishijs/client";
import {defineComponent, h, inject} from "vue";

export default (ctx: Context) => {
	ctx.slot({
		type: "plugin-details",
		order: -800,
		component: defineComponent({
			setup() {
				const current = inject<{value?: {name?: string; path?: string}}>(
					"manager.settings.current",
				);

				return () => {
					const plugin = current?.value;

					if (
						!plugin ||
						(plugin.name !== "forward-hime" &&
							!plugin.path?.includes("forward-hime"))
					) {
						return null;
					}

					return h(
						"button",
						{
							class: "k-button",
							onClick: async () => {
								const contents = await send(
									"forward-hime:get-diagnostics",
								);
								const url = URL.createObjectURL(
									new Blob([contents], {type: "application/x-ndjson"}),
								);
								const anchor = document.createElement("a");

								anchor.href = url;
								anchor.download = "forward-hime-diagnostics.jsonl";
								anchor.click();
								setTimeout(() => URL.revokeObjectURL(url), 1000);
							},
						},
						"下载诊断日志",
					);
				};
			},
		}),
	});
};
