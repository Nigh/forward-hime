import {Context} from "koishi";
import {createConfig, ConfigSet} from "./config";
import {logger} from "./logger";
import {MessageForward, MessageDelete, MsgUUIDFromSession, MessageEdit} from "./message";
import {MsgMiddlewareCache} from "./decorator";

export const name = `forward hime - 转发姬`;
export const usage = `
# ${name}
## 配置说明
1. 添加 \`互通转发组\`
2. 为添加的 \`互通转发组\` 配置转发节点。每个转发节点对应某个平台的一个频道或群组

注意：当未配置\`cache\`时，跨平台删除、跨平台回复等功能将无法正常工作。
## 特性
- 可以配置多个 \`互通转发组\`，每个 \`互通转发组\` 之间相互独立
- 启用插件后，当一个 \`互通转发组\` 中的任意节点收到消息时，插件会自动将消息转发给**这个**\`互通转发组\`中的其他节点。
---`;
export const reusable = true;

export const inject = {
	optional: ["cache"],
};

export const Config = createConfig();

import {
	MsgCache,
	msgCache,
	msgCacheInit,
	msgCacheDelete,
	msgCacheFindByKey,
	msgCacheFindByUUID,
} from "./cache";

import {decoratorInit} from "./decorator";
export function apply(ctx: Context, cfg: ConfigSet) {
	msgCacheInit(ctx, cfg);
	decoratorInit(cfg);

	ctx.on("message-created", async (session) => {
		const hitGroup = [];
		for (const g in cfg.ForwardGroups) {
			const group = cfg.ForwardGroups[g];
			for (const k in group.Nodes) {
				if (
					group.Nodes[k].Guild === session.channelId &&
					group.Nodes[k].Platform === session.platform &&
					group.Nodes[k].BotID !== session.userId
				) {
					if (!session.channelId || !session.messageId) {
						continue;
					}
					logger.debug(
						"[message-created]",
						session.platform,
						session.channelId + ":" + session.messageId,
					);
					let uuid = MsgUUIDFromSession(session);
					msgCache({
						platform: session.platform,
						bot: group.Nodes[k].BotID,
						guild: session.channelId,
						msgid: session.messageId,
						uuid,
					});
					hitGroup.push(g);
					break;
				}
			}
		}
		if (hitGroup.length > 0) {
			await MsgMiddlewareCache(session);
		}
		for (const g in hitGroup) {
			const group = cfg.ForwardGroups[hitGroup[g]];
			for (const k in group.Nodes) {
				if (group.Nodes[k].Guild !== session.channelId) {
					MessageForward(ctx, group.Nodes[k], session);
				}
			}
		}
	});
	// Note: telegram目前未返回删除事件
	ctx.on("message-deleted", async (session) => {
		const cacheKey = session.channelId + ":" + session.messageId;
		logger.debug("[message-deleted]", cacheKey);

		msgCacheFindByKey(cacheKey).then((res) => {
			if (res) {
				logger.debug("[msgCacheFindByKey]", res);
				msgCacheDelete(cacheKey);
				const uuid = res.uuid;
				msgCacheFindByUUID(uuid).then((res) => {
					if (res) {
						for (const k in res) {
							logger.debug("[message-delete]", res[k][1]);
							msgCacheDelete(res[k][0]).then(() => {
								MessageDelete(ctx, res[k][1]);
							});
						}
					}
				});
			}
		});
	});
	// Note: KOOK消息编辑会改变消息ID
	ctx.on("message-updated", async (session) => {
		logger.debug("[message-updated]", session.messageId, session);
	});
}
