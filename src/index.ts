import { Context, Schema, h } from 'koishi'
import {} from '@koishijs/plugin-adapter-kook'
import {} from 'koishi-plugin-binding-id-converter'
import {} from '@koishijs/cache'



export const name = 'multi-platform-message-forwarding'

export const reusable = true

export const inject = {
  optional: [
    'cache'
  ],
}

declare module '@koishijs/cache' {
  interface Tables {
    mpmf_message: string
    mpmf_unity: string[]
  }
}



function generateRandomString(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length))
  }
  return result
}




export const usage = `
### 
`




interface Original_Target {
  Original_Guild: string
  Original_Platform: string
  Original_BotID: string
  Target_Guild: string
  Target_Platform: string
  Target_BotID: string
  note?:string
}







export interface Config {
  Use_Unity_Message_ID: boolean
  Unity_Message_ID_Time : number

  UserName_Package_Format?: string
  ChannelName_Package_Format?: string

  UserName_Setting: boolean
  ChannelName_Setting: boolean
  Nickname_Setting: boolean
  Message_Wrapping_Setting: boolean

  Forward_Mode: string
  Original_Target: Original_Target[]
  OT_EY: {
    Original_Target: Original_Target[]
  }[]

  Which_Platform_Use_getChannel?: {}[]

  KOOK_Use_CardMessage: boolean
  KOOK_CardMessage_USE_MINE: boolean
  KOOK_CardMessage_MY_MESSAGE?: string
}





export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    Use_Unity_Message_ID: Schema.boolean().description('是否使用统一消息ID').default(true),
  }).description('基础设置'),
  Schema.union([
    Schema.object({
      Use_Unity_Message_ID: Schema.const(true),
      Unity_Message_ID_Time: Schema.number().description('统一消息ID的有效期（毫秒）').default(1296000000),
    }),
    Schema.object({}),
  ]),
  Schema.object({
    ChannelName_Setting: Schema.boolean().description('是否在转发消息前加上群聊/频道的名称').default(false),
  }),
  Schema.union([
    Schema.object({
      ChannelName_Setting: Schema.const(true),
      ChannelName_Package_Format: Schema.tuple([String, String]).description('请输入名称左右两旁的封装符号'),
    }),
    Schema.object({}),
  ]),

  Schema.object({
    UserName_Setting: Schema.boolean().description('是否在转发消息前加上用户的名称').default(true),
  }),
  Schema.union([
    Schema.object({
      UserName_Setting: Schema.const(true),
      UserName_Package_Format: Schema.tuple([String, String]).description('请输入名称左右两旁的封装符号').default(['[',']']),
      Nickname_Setting: Schema.boolean().description('是否使用群昵称作为消息开头（如果存在时）').default(true),
    }),
    Schema.object({}),
  ]),

  Schema.object({
    Message_Wrapping_Setting: Schema.boolean().description('是否自动换行消息原文与消息开头').default(false)
  }),

  Schema.object({
    Forward_Mode: Schema.union(['单向转发','双向转发','群聊互联！']).required().description('转发模式').role('radio'),
  }).description('转发设置'),

  Schema.union([
    Schema.object({
      Forward_Mode: Schema.const('单向转发').required(),
      Original_Target: Schema.array(Schema.object({
        Original_Guild: Schema.string().required().description('消息源群聊/频道ID'),
        Original_Platform: Schema.string().required().description('消息源平台'),
        Original_BotID: Schema.string().required().description('消息源机器人ID'),
        Target_Guild: Schema.string().required().description('转发目标群聊/频道ID'),
        Target_Platform: Schema.string().required().description('转发目标平台'),
        Target_BotID: Schema.string().required().description('转发目标机器人ID'),
        note: Schema.string().description('备注')
      })).role('table').description('消息源与转发目标（单向转发）')
    }),

    Schema.object({
      Forward_Mode: Schema.const('双向转发').required(),
      Original_Target: Schema.array(Schema.object({
        Original_Guild: Schema.string().required().description('群聊/频道ID（1）'),
        Original_Platform: Schema.string().required().description('平台（1）'),
        Original_BotID: Schema.string().required().description('机器人ID（1）'),
        Target_Guild: Schema.string().required().description('群聊/频道ID（2）'),
        Target_Platform: Schema.string().required().description('平台（2）'),
        Target_BotID: Schema.string().required().description('机器人ID（2）'),
        note: Schema.string().description('备注')
      })).role('table').description('消息源与转发目标（双向转发）')
    }),

    Schema.object({
      Forward_Mode: Schema.const('群聊互联！').required(),
      OT_EY: Schema.array(Schema.object({
        Original_Target: Schema.array(Schema.object({
          Original_Guild: Schema.string().required().description('群聊/频道ID'),
          Original_Platform: Schema.string().required().description('平台'),
          Original_BotID: Schema.string().required().description('机器人ID'),
          Target_Guild: Schema.string().hidden().default('nothing'),
          Target_Platform: Schema.string().hidden().default('nothing'),
          Target_BotID: Schema.string().hidden().default('nothing'),
          note: Schema.string().description('备注')
        })).role('table').description('消息源与转发目标（群聊互联！）')
      })).description('群聊互联列表')
    })
  ]),

  Schema.object({
    Which_Platform_Use_getChannel: Schema.array(String).role('table').description('哪些平台使用getChannel获取频道名称（无法正常获取频道名称时可尝试添加）').default(['discord'])
  }).description('高级设置'),

  Schema.object({
    KOOK_Use_CardMessage: Schema.boolean().description('是否使用卡片消息').default(false).experimental()
  }).description('平台设置'),

  Schema.union([
    Schema.object({
      KOOK_Use_CardMessage: Schema.const(true).required(),
      KOOK_CardMessage_USE_MINE: Schema.boolean().description('是否自定义卡片消息内容').default(false).hidden()
    }),
    Schema.object({}),
  ]).description('卡片消息设置'),

  Schema.union([
    Schema.object({
      KOOK_CardMessage_USE_MINE: Schema.const(true).required(),
      KOOK_CardMessage_MY_MESSAGE: Schema.string().role('textarea').description('作者写的卡片消息内容太辣鸡了！lz要自己写！（注：自己写的卡片消息内容如果导致koishi崩溃等问题，一律由使用者本人承担）').hidden()
    }),
    Schema.object({}),
  ])
]) as Schema<Config>



export function apply(ctx: Context,cfg:Config) {
  if (cfg.Use_Unity_Message_ID === true && ctx.cache){
    var cachechannel: string[] = []
    if (cfg.Forward_Mode === '群聊互联！'){
      cfg.OT_EY.forEach((channels) => {
        channels.Original_Target.forEach((channel) => {
          cachechannel.push(channel.Original_Guild)
        })
      })
    } else if (cfg.Forward_Mode === '双向转发'){
      cfg.Original_Target.forEach((channel) => {
        cachechannel.push(channel.Original_Guild)
        cachechannel.push(channel.Target_Guild)
      })
    } else if (cfg.Forward_Mode === '单向转发'){
      cfg.Original_Target.forEach((channel) => {
        cachechannel.push(channel.Original_Guild)
      })
    }
    ctx.on('message', async (session) => {
      if (cachechannel.includes(session.channelId)){
        if (!(await ctx.cache.get('mpmf_message', `${session.messageId}:${session.channelId}:${session.platform}:${session.selfId}`))){
          const unity_id_create = async() => {
            let unity_id = generateRandomString(20)
            if (await ctx.cache.get('mpmf_unity', unity_id)){
              unity_id_create()
            } else {
              return unity_id
            }
          }
          let unity_id = await unity_id_create()
          await ctx.cache.set('mpmf_message', `${session.messageId}:${session.channelId}:${session.platform}:${session.selfId}`, unity_id, cfg.Unity_Message_ID_Time)
          await ctx.cache.set('mpmf_unity', unity_id, [], cfg.Unity_Message_ID_Time)
        }
      }
    })
    ctx.on('message-deleted', async (session) => {
      if (cachechannel.includes(session.channelId)){
        let unity_id = await ctx.cache.get('mpmf_message', `${session.messageId}:${session.channelId}:${session.platform}:${session.selfId}`)
        if (unity_id){
          let message_list = (await ctx.cache.get('mpmf_unity', unity_id))
          message_list.forEach(async(message) => {
            await ctx.bots[`${message.split(':')[2]}:${message.split(':')[3]}`].deleteMessage(message.split(':')[1], message.split(':')[0])
            await ctx.cache.delete('mpmf_message', message)
            await ctx.cache.delete('mpmf_message', `${session.messageId}:${session.channelId}:${session.platform}:${session.selfId}`)
            await ctx.cache.delete('mpmf_unity', unity_id)
          })
        }
      }
    })
  }


  let pass = []

  ctx.command('TemporaryExclusion <time>', '临时排除转发功能（time单位：毫秒）', { authority: 3 })
  .action(({session} , time) => {
    pass.push(session.channelId)
    let time_num = parseInt(time)
    ctx.setTimeout(() => {
      pass.splice(pass.indexOf(session.channelId),1)
      session.send(`已恢复转发功能`)
    }, time_num)
    session.send(`已临时排除此频道转发功能${time_num}毫秒`)
  })

  ctx.command('CancelTE', '取消临时排除转发功能', { authority: 3 })
  .action(({session}) => {
    if (pass.includes(session.channelId)){
      pass.splice(pass.indexOf(session.channelId),1)
      session.send('已恢复转发功能')
    } else if (!pass.includes(session.channelId)){
      session.send('此频道未排除转发')
    }
  })



  async function Message_Forwarding(Original_Guild : string, Original_Platform : string, Original_BotID: string, Target_Guild : string, Target_Platform : string, Target_BotID: string) {
    ctx.on('message',async (session) => {

      let receive_message_id = session.messageId
      let send_message_id

      if (pass.includes(session.channelId)){
        return
      }
      try {
        if (session.channelId === Original_Guild && session.platform === Original_Platform && session.userId !== Original_BotID && session.userId !== Target_BotID){
          if (cfg.UserName_Setting === true){
            if (cfg.Nickname_Setting === false){
              let userInfo = await session.bot.getGuildMember(session.guildId,session.userId)
              var userName = userInfo.user.name
            } else if (cfg.Nickname_Setting === true){
              var userName = session.username
            }
          }
          if (cfg.ChannelName_Setting === true){
            if (cfg.Which_Platform_Use_getChannel.includes(session.platform)){
              var ChannelName = (await session.bot.getChannel(session.channelId)).name
            } else {
              var ChannelName = session.event.channel.name
            }
          }
          

          let message: any
          if (cfg.KOOK_Use_CardMessage === true && Target_Platform === 'kook'){

            if (cfg.KOOK_CardMessage_USE_MINE === true){
              message = cfg.KOOK_CardMessage_MY_MESSAGE
            } else {
              let MessageStart_ARR = []
              if (ChannelName) {
                MessageStart_ARR.push(`${cfg.ChannelName_Package_Format[0]}${ChannelName}${cfg.ChannelName_Package_Format[1]}`)
              }
              if (userName) {
                MessageStart_ARR.push(`${cfg.UserName_Package_Format[0]}${userName}${cfg.UserName_Package_Format[1]}`)
              }
              let MessageStart = MessageStart_ARR.join(' ')

              if (cfg.Message_Wrapping_Setting === false){
                message = [
                  {
                    "type": "card",
                    "theme": "secondary",
                    "size": "lg",
                    "modules": [
                      {
                        "type": "section",
                        "text": {
                          "type": "kmarkdown",
                          "content": `(font)${MessageStart}(font)[pink]：${session.content}`
                        }
                      }
                    ]
                  }
                ]


              } else {
                message = [
                  {
                    "type": "card",
                    "theme": "secondary",
                    "size": "lg",
                    "modules": [
                      {
                        "type": "section",
                        "text": {
                          "type": "kmarkdown",
                          "content": `(font)${MessageStart}(font)[pink]`
                        }
                      },
                      {
                        "type": "divider"
                      },
                      {
                        "type": "section",
                        "text": {
                          "type": "plain-text",
                          "content": `${session.content}`
                        }
                      }
                    ]
                  }
                ]
              }
            }
            ctx.bots[`kook:${Target_BotID}`].internal.createMessage({
              type: 10,
              target_id: Target_Guild,
              content: JSON.stringify(message)
            })


          } else {
            let messageInfo = []
            if (ChannelName) {
              messageInfo.push(`${cfg.ChannelName_Package_Format[0]}${ChannelName}${cfg.ChannelName_Package_Format[1]}`)
            }
            if (userName) {
              messageInfo.push(`${cfg.UserName_Package_Format[0]}${userName}${cfg.UserName_Package_Format[1]}`)
            }
    
            if (cfg.UserName_Setting === false && cfg.ChannelName_Setting === false){
              messageInfo.push(`${session.content}`)
            } else if (cfg.Message_Wrapping_Setting === false){
              messageInfo.push(`: ${session.content}`)
            } else if (cfg.Message_Wrapping_Setting === true){
              messageInfo.push(`: &#10;${session.content}`)
            }
            message = messageInfo.join('')
            send_message_id = (await ctx.bots[`${Target_Platform}:${Target_BotID}`].sendMessage(Target_Guild,message)).toString()
            if (ctx.cache){
              if (await ctx.cache.get('mpmf_message', `${receive_message_id}:${session.channelId}:${session.platform}:${session.selfId}`)){
                let unity_id = await ctx.cache.get('mpmf_message', `${receive_message_id}:${session.channelId}:${session.platform}:${session.selfId}`)
                let message_list = (await ctx.cache.get('mpmf_unity', unity_id))
                message_list.push(`${send_message_id}:${Target_Guild}:${Target_Platform}:${Target_BotID}`)
                await ctx.cache.set('mpmf_unity', unity_id, message_list, cfg.Unity_Message_ID_Time)
              }
            }
          }
        }
      } catch (error) {
        ctx.logger.error(`消息转发函数错误：${error}`)
      }
    })
  }





  if (cfg.Forward_Mode === '单向转发'){
    try {
      for (let i = 0; i < cfg.Original_Target.length; i++){
        let item = cfg.Original_Target[i]
        Message_Forwarding(
          item.Original_Guild,
          item.Original_Platform,
          item.Original_BotID,
          item.Target_Guild, 
          item.Target_Platform,
          item.Target_BotID
        )
      }
    } catch (error) {
      ctx.logger.error(`单向转发模式错误：${error}`)
    }
  } else if (cfg.Forward_Mode === '双向转发'){
    try {
      for (let i = 0; i < cfg.Original_Target.length; i++){
        let item = cfg.Original_Target[i]
        Message_Forwarding(
          item.Original_Guild,
          item.Original_Platform,
          item.Original_BotID,
          item.Target_Guild,
          item.Target_Platform,
          item.Target_BotID
        )
        Message_Forwarding(
          item.Target_Guild,
          item.Target_Platform,
          item.Target_BotID,
          item.Original_Guild,
          item.Original_Platform,
          item.Original_BotID
        )
      }
    } catch (error) {
      ctx.logger.error(`双向转发模式错误：${error}`)
    }
  } else if (cfg.Forward_Mode === '群聊互联！'){
    try {
      let existingItems = []
      function itemExists(item, array) {
        return array.some(
          existingItem =>
            JSON.stringify(existingItem) === JSON.stringify(item)
        )
      }
      for (let f = 0; f < cfg.OT_EY.length; f++) {
        for (let i = 0; i < cfg.OT_EY[f].Original_Target.length; i++) {
          for (let o = i + 1; o < cfg.OT_EY[f].Original_Target.length; o++) {
            let item_i = cfg.OT_EY[f].Original_Target[i]
            let item_o = cfg.OT_EY[f].Original_Target[o]
            let item_array = {
              Original_Guild: item_i.Original_Guild,
              Original_Platform: item_i.Original_Platform,
              Original_BotID: item_i.Original_BotID,
              Target_Guild: item_o.Original_Guild,
              Target_Platform: item_o.Original_Platform,
              Target_BotID: item_o.Original_BotID
            }
            let reverse_item_array = {
              Original_Guild: item_o.Original_Guild,
              Original_Platform: item_o.Original_Platform,
              Original_BotID: item_o.Original_BotID,
              Target_Guild: item_i.Original_Guild,
              Target_Platform: item_i.Original_Platform,
              Target_BotID: item_i.Original_BotID
            }
            if (!itemExists(item_array, existingItems)) {
              existingItems.push(item_array)
              Message_Forwarding(
                item_i.Original_Guild,
                item_i.Original_Platform,
                item_i.Original_BotID,
                item_o.Original_Guild,
                item_o.Original_Platform,
                item_o.Original_BotID
              )
            }
            if (!itemExists(reverse_item_array, existingItems)) {
              existingItems.push(reverse_item_array)
              Message_Forwarding(
                item_o.Original_Guild,
                item_o.Original_Platform,
                item_o.Original_BotID,
                item_i.Original_Guild,
                item_i.Original_Platform,
                item_i.Original_BotID
              )
            }
          }
        }
      }
    } catch (error) {
      ctx.logger.error(`群聊互联模式错误：${error}`)
    }
  }
}

