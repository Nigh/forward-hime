import {Schema} from "koishi";

export interface ForwardNode {
	Platform: string;
	Guild: string;
	BotID: string;
	note?: string;
}

export interface ConfigSet {
	DefaultDecorator: {
		Prefix: string;
		Newline: boolean;
	};
	DefaultFallbackMsgPrefix: string;
	MediaRelay: {
		Enabled: boolean;
		CacheMinutes: number;
		RequestTimeoutSec: number;
		MaxFileSizeMB: number;
	};
	ForwardTimeoutSec: number;
	CacheTimeout: number;
	ForwardGroups: {
		Nodes: ForwardNode[];
	}[];
}

export const createConfig = () =>
	Schema.intersect([
		Schema.object({
			CacheTimeout: Schema.number()
				.description("消息缓存时间（分钟）- 影响跨平台删除与回复等功能")
				.default(120)
				.min(120)
				.max(1440 * 7),
		}).description("消息缓存"),
		Schema.object({
			DefaultDecorator: Schema.object({
				Prefix: Schema.string()
					.description("转发前缀")
					.default("${username} 转发自 ${platform}："),
				Newline: Schema.boolean().description("是否换行").default(true),
			}).description("默认装饰器"),
			DefaultFallbackMsgPrefix: Schema.string()
				.description("默认Fallback消息前缀")
				.default("[消息降级] "),
			ForwardTimeoutSec: Schema.number()
				.description("转发总超时时间（秒）- 含媒体下载与发送，超时则降级")
				.default(30)
				.min(5)
				.max(120),
			MediaRelay: Schema.object({
				Enabled: Schema.boolean()
					.description("启用媒体中转（下载后再转发）")
					.default(true),
				CacheMinutes: Schema.number()
					.description("媒体暂存时间（分钟）")
					.default(10)
					.min(1)
					.max(180),
				RequestTimeoutSec: Schema.number()
					.description("媒体下载超时时间（秒）")
					.default(15)
					.min(3)
					.max(120),
				MaxFileSizeMB: Schema.number()
					.description("允许中转的媒体最大大小（MB）")
					.default(20)
					.min(1)
					.max(200),
			}).description("媒体中转"),
		}).description("转发格式"),
		Schema.object({
			ForwardGroups: Schema.array(
				Schema.object({
					Note: Schema.string().description("互通组备注"),
					Nodes: Schema.array(
						Schema.object({
							Platform: Schema.string()
								.role("")
								.required()
								.description("平台"),
							Guild: Schema.string().required().description("频道ID"),
							BotID: Schema.string().required().description("机器人ID"),
						}),
					)
						.role("table")
						.description("转发节点"),
				}),
			).description("互通转发组"),
		}).description("互通组"),
	]) as Schema<ConfigSet>;
