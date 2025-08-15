import {Context, Session} from "koishi";
import {logger} from "./logger";
import {ForwardNode} from "./config";
import {MsgDecorator, MsgDecoratorFallback} from "./decorator";
import {MsgCache, msgCache} from "./cache";

async function MessageSendWithDecorator(
	ctx: Context,
	node: ForwardNode,
	session: Session,
	Deco: Function,
) {
	const uuid = session.channelId + ":" + session.messageId;
	const content = await Deco(session, node);
	await ctx.bots[`${node.Platform}:${node.BotID}`]
		.sendMessage(node.Guild, content)
		.then((res) => {
			let mc = {
				platform: node.Platform,
				bot: node.BotID,
				guild: node.Guild,
				msgid: res[0],
				uuid,
			};
			if (!mc.msgid) {
				throw new Error(`Empty Message ID`);
			} else {
				msgCache(mc);
				logger.debug(`[MessageForward] to ${mc.platform} ${mc.uuid}`);
			}
		})
		.catch((error) => {
			logger.error(
				`ERROR:<MessageSendWithDecorator ${node.Platform}> ctx=${ctx} ${error}`,
			);
			throw error;
		});
}

function sessionTypeArray(session: Session) {
	let contentTypes = "|";
	session.elements.forEach((element) => {
		contentTypes = contentTypes + element.type + "|";
	});
	return contentTypes;
}

export async function MessageForward(ctx: Context, node: ForwardNode, session: Session) {
	if (!botExistsCheck(ctx, node)) {
		return;
	}
	MessageSendWithDecorator(ctx, node, session, MsgDecorator).catch((error) => {
		logger.error(
			`ERROR:<MessageSend ${node.Platform}> ctx=${ctx} ${sessionTypeArray(session)} ${error}`,
		);
		MessageSendWithDecorator(ctx, node, session, MsgDecoratorFallback).catch(
			(error) => {
				logger.error(
					`ERROR:<MessageSendFallback ${node.Platform}> ctx=${ctx} ${sessionTypeArray(session)} ${error}`,
				);
			},
		);
	});
}

export async function MessageDelete(ctx: Context, msg: MsgCache) {
	if (
		!botExistsCheck(ctx, {Platform: msg.platform, BotID: msg.bot, Guild: msg.guild})
	) {
		return;
	}
	await ctx.bots[`${msg.platform}:${msg.bot}`]
		.deleteMessage(msg.guild, msg.msgid)
		.catch((error) => {
			logger.error(`ERROR:<MessageDelete> ${error}`);
		});
}

export async function MessageEdit(ctx: Context, node: ForwardNode, session: Session) {
	if (!botExistsCheck(ctx, node)) {
		return;
	}
	try {
		await ctx.bots[`${node.Platform}:${node.BotID}`].editMessage(
			node.Guild,
			"msgID",
			"new msgContent",
		);
	} catch (error) {
		logger.error(`ERROR:<MessageEdit> ${error}`);
	}
}

function botExistsCheck(ctx: Context, node: ForwardNode) {
	if (ctx.bots[`${node.Platform}:${node.BotID}`] == undefined) {
		logger.error(`ERROR:<BOT not Exist> ${node.Platform}:${node.BotID}`);
		return false;
	}
	return true;
}

export function MsgUUIDFromSession(session: Session) {
	return session.channelId + ":" + session.messageId;
}
