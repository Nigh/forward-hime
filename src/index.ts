import { Context, Schema, h } from "koishi";
import {} from "@koishijs/plugin-adapter-kook";
import {} from "@koishijs/cache";

export const reusable = true;

export const inject = {
    optional: ["cache"],
};

export const usage = ``;

declare module "@koishijs/cache" {
    interface Tables {
        mpmf_message: string;
        mpmf_unity: string[];
    }
}

interface Forward_Node {
    Platform: string;
    Guild: string;
    BotID: string;
    note?: string;
}

export interface Config {
    ChannelName_Setting: boolean;
    Forward_Groups: {
        Forward_Node: Forward_Node[];
    }[];

    KOOK_Use_CardMessage: boolean;
    KOOK_CardMessage_USE_MINE: boolean;
    KOOK_CardMessage_MY_MESSAGE?: string;
}

export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
        ChannelName_Setting: Schema.boolean()
            .description("是否包含频道名称")
            .default(false),
    }).description("转发格式"),
    Schema.object({
        Forward_Groups: Schema.array(
            Schema.object({
                Forward_Node: Schema.array(
                    Schema.object({
                        Platform: Schema.union([
                            "telegram",
                            "discord",
                            "onebot",
                            "kook",
                            "slack",
                            "qq",
                        ])
                            .role("select")
                            .required()
                            .description("平台"),
                        Guild: Schema.string().required().description("频道ID"),
                        BotID: Schema.string()
                            .required()
                            .description("机器人ID"),
                        note: Schema.string().description("备注"),
                    })
                )
                    .role("table")
                    .description("配置转发节点"),
            })
        ).description("互通转发组"),
    }),

    Schema.object({
        KOOK_Use_CardMessage: Schema.boolean()
            .description("是否使用卡片消息")
            .default(false)
            .experimental(),
    }).description("平台设置"),

    Schema.union([
        Schema.object({
            KOOK_Use_CardMessage: Schema.const(true).required(),
            KOOK_CardMessage_USE_MINE: Schema.boolean()
                .description("是否自定义卡片消息内容")
                .default(false)
                .hidden(),
        }),
        Schema.object({}),
    ]).description("卡片消息设置"),

    Schema.union([
        Schema.object({
            KOOK_CardMessage_USE_MINE: Schema.const(true).required(),
            KOOK_CardMessage_MY_MESSAGE: Schema.string()
                .role("textarea")
                .description(
                    "作者写的卡片消息内容太辣鸡了！lz要自己写！（注：自己写的卡片消息内容如果导致koishi崩溃等问题，一律由使用者本人承担）"
                )
                .hidden(),
        }),
        Schema.object({}),
    ]),
]) as Schema<Config>;

export function apply(ctx: Context, cfg: Config) {
    if (cfg.Use_Unity_Message_ID === true && ctx.cache) {
        var cachechannel: string[] = [];
        cfg.Forward_Groups.forEach((channels) => {
            channels.Forward_Node.forEach((channel) => {
                cachechannel.push(channel.Guild);
            });
        });
    }

    let pass = [];

    ctx.command(
        "TemporaryExclusion <time>",
        "临时排除转发功能（time单位：毫秒）",
        { authority: 3 }
    ).action(({ session }, time) => {
        pass.push(session.channelId);
        let time_num = parseInt(time);
        ctx.setTimeout(() => {
            pass.splice(pass.indexOf(session.channelId), 1);
            session.send(`已恢复转发功能`);
        }, time_num);
        session.send(`已临时排除此频道转发功能${time_num}毫秒`);
    });

    ctx.command("CancelTE", "取消临时排除转发功能", { authority: 3 }).action(
        ({ session }) => {
            if (pass.includes(session.channelId)) {
                pass.splice(pass.indexOf(session.channelId), 1);
                session.send("已恢复转发功能");
            } else if (!pass.includes(session.channelId)) {
                session.send("此频道未排除转发");
            }
        }
    );

    async function Message_Forwarding(
        Guild: string,
        Platform: string,
        BotID: string,
        Target_Guild: string,
        Target_Platform: string,
        Target_BotID: string
    ) {
        ctx.on("message", async (session) => {
            let receive_message_id = session.messageId;
            let send_message_id;

            if (pass.includes(session.channelId)) {
                return;
            }
            try {
                if (
                    session.channelId === Guild &&
                    session.platform === Platform &&
                    session.userId !== BotID &&
                    session.userId !== Target_BotID
                ) {
                    var userName = session.username;
                    if (cfg.ChannelName_Setting === true) {
                        var ChannelName =
                            session.channelName || session.guildName;
                        if (!ChannelName) {
                            if (typeof session.bot.getChannel === "function") {
                                ChannelName = (
                                    await session.bot.getChannel(
                                        session.channelId
                                    )
                                ).name;
                            }
                        }
                    }

                    let message: any;
                    if (
                        cfg.KOOK_Use_CardMessage === true &&
                        Target_Platform === "kook"
                    ) {
                        if (cfg.KOOK_CardMessage_USE_MINE === true) {
                            message = cfg.KOOK_CardMessage_MY_MESSAGE;
                        } else {
                            let MessageStart_ARR = [];
                            if (ChannelName) {
                                MessageStart_ARR.push(`【${ChannelName}】`);
                            }
                            if (userName) {
                                MessageStart_ARR.push(`${userName}`);
                            }
                            let MessageStart = MessageStart_ARR.join(" ");
                            message = [
                                {
                                    type: "card",
                                    theme: "secondary",
                                    size: "lg",
                                    modules: [
                                        {
                                            type: "section",
                                            text: {
                                                type: "kmarkdown",
                                                content: `(font)${MessageStart}(font)[pink]`,
                                            },
                                        },
                                        {
                                            type: "divider",
                                        },
                                        {
                                            type: "section",
                                            text: {
                                                type: "plain-text",
                                                content: `${session.content}`,
                                            },
                                        },
                                    ],
                                },
                            ];
                        }
                        ctx.bots[`kook:${Target_BotID}`].internal.createMessage(
                            {
                                type: 10,
                                target_id: Target_Guild,
                                content: JSON.stringify(message),
                            }
                        );
                    } else {
                        let messageInfo = [];
                        if (ChannelName) {
                            messageInfo.push(`【${ChannelName}】`);
                        }
                        if (userName) {
                            messageInfo.push(`${userName}`);
                        }

                        messageInfo.push(`: &#10;${session.content}`);
                        message = messageInfo.join("");
                        ctx.logger.info(
                            `ctx.bots[${Target_Platform}:${Target_BotID}].sendMessage(${Target_Guild}, ${message})`
                        );
                        send_message_id = (
                            await ctx.bots[
                                `${Target_Platform}:${Target_BotID}`
                            ].sendMessage(Target_Guild, message)
                        ).toString();
                        if (ctx.cache) {
                            if (
                                await ctx.cache.get(
                                    "mpmf_message",
                                    `${receive_message_id}:${session.channelId}:${session.platform}:${session.selfId}`
                                )
                            ) {
                                let unity_id = await ctx.cache.get(
                                    "mpmf_message",
                                    `${receive_message_id}:${session.channelId}:${session.platform}:${session.selfId}`
                                );
                                let message_list = await ctx.cache.get(
                                    "mpmf_unity",
                                    unity_id
                                );
                                message_list.push(
                                    `${send_message_id}:${Target_Guild}:${Target_Platform}:${Target_BotID}`
                                );
                                await ctx.cache.set(
                                    "mpmf_unity",
                                    unity_id,
                                    message_list,
                                    cfg.Unity_Message_ID_Time
                                );
                            }
                        }
                    }
                }
            } catch (error) {
                ctx.logger.error(`ERROR:<Message_Forwarding> ${error}`);
            }
        });
    }

    try {
        let existingItems = [];
        function itemExists(item, array) {
            return array.some(
                (existingItem) =>
                    JSON.stringify(existingItem) === JSON.stringify(item)
            );
        }
        for (let f = 0; f < cfg.Forward_Groups.length; f++) {
            for (
                let i = 0;
                i < cfg.Forward_Groups[f].Forward_Node.length;
                i++
            ) {
                for (
                    let o = i + 1;
                    o < cfg.Forward_Groups[f].Forward_Node.length;
                    o++
                ) {
                    let item_i = cfg.Forward_Groups[f].Forward_Node[i];
                    let item_o = cfg.Forward_Groups[f].Forward_Node[o];
                    let item_array = {
                        Guild: item_i.Guild,
                        Platform: item_i.Platform,
                        BotID: item_i.BotID,
                        Target_Guild: item_o.Guild,
                        Target_Platform: item_o.Platform,
                        Target_BotID: item_o.BotID,
                    };
                    let reverse_item_array = {
                        Guild: item_o.Guild,
                        Platform: item_o.Platform,
                        BotID: item_o.BotID,
                        Target_Guild: item_i.Guild,
                        Target_Platform: item_i.Platform,
                        Target_BotID: item_i.BotID,
                    };
                    if (!itemExists(item_array, existingItems)) {
                        existingItems.push(item_array);
                        Message_Forwarding(
                            item_i.Guild,
                            item_i.Platform,
                            item_i.BotID,
                            item_o.Guild,
                            item_o.Platform,
                            item_o.BotID
                        );
                    }
                    if (!itemExists(reverse_item_array, existingItems)) {
                        existingItems.push(reverse_item_array);
                        Message_Forwarding(
                            item_o.Guild,
                            item_o.Platform,
                            item_o.BotID,
                            item_i.Guild,
                            item_i.Platform,
                            item_i.BotID
                        );
                    }
                }
            }
        }
    } catch (error) {
        ctx.logger.error(`ERROR:<apply> ${error}`);
    }
}
