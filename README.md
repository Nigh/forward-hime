<div align="center">
<img src="https://socialify.git.ci/Nigh/forward-hime/image?description=1&logo=https%3A%2F%2Fraw.githubusercontent.com%2FNigh%2Fforward-hime%2Fmain%2Fassets%2Flogo.png&name=1&pattern=Plus&theme=Auto" alt="forward-hime" width="640" height="320" />

# [Koishi](https://koishi.chat) 多群组消息互通插件

[![npm](https://img.shields.io/npm/v/koishi-plugin-forward-hime?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-forward-hime)

</div>

在配置好的「互通转发组」内，把某一平台频道/群组的消息自动转发到同组其他节点。可配置多组，组间互不影响。

## Screenshot

![screenshot](https://github.com/Nigh/forward-hime/assets/1407471/796b4f1c-c828-438c-85e9-71379c6c7e21)

## 安装

在 Koishi WebUI 或桌面应用中打开插件市场，搜索 `forward-hime`，添加并安装。

也可通过 npm：`koishi-plugin-forward-hime`（[npm](https://www.npmjs.com/package/koishi-plugin-forward-hime) / [文档页](https://nigh.github.io/forward-hime/)）。

**建议同时启用 Koishi 的 `cache` 服务**（例如 `@koishijs/cache`）。未配置 `cache` 时，跨平台删除与跨平台回复无法正常工作。

## 配置

### 互通转发组

在插件配置中添加一个或多个 **互通转发组**。每个组包含若干 **转发节点**，节点字段：

| 字段 | 说明 |
|------|------|
| `Platform` | 平台名（如 `onebot`、`kook`） |
| `Guild` | 频道 / 群组 ID |
| `BotID` | 本节点使用的机器人 ID |
| `Note` | 互通组备注（可选） |

启用后：组内任一节点收到消息（且发送者不是配置的 Bot）时，消息会转发到**同组**其他节点。

### 转发格式与媒体

| 配置项 | 默认 | 说明 |
|--------|------|------|
| `DefaultDecorator.Prefix` | `${username} 转发自 ${platform}：` | 转发头模板（`${…}` 取 Session 字段） |
| `DefaultDecorator.Newline` | `true` | 前缀后是否换行 |
| `DefaultFallbackMsgPrefix` | `[消息降级] ` | 媒体/内容降级时的文案前缀 |
| `MediaRelay.Enabled` | `true` | 下载后再转发媒体 |
| `MediaRelay.CacheMinutes` | `10` | 媒体暂存时间 |
| `MediaRelay.RequestTimeoutSec` | `30` | 下载超时 |
| `MediaRelay.MaxFileSizeMB` | `20` | 允许中转的最大体积 |
| `ForwardTimeoutSec` | `60` | 慢转发告警阈值（秒）；仍等待结果，避免重复发送 |
| `CacheTimeout` | `120` | 消息映射缓存（分钟，≥120）；影响删除 / 引用 |

平台侧有额外处理（如 onebot 的 at / 表情 / 合并转发，kook 无图时补透明图）；通用路径走默认装饰器。

## 已知限制

- 消息**编辑**同步尚未实现（`message-updated` 仅日志）
- Telegram 等平台可能不返回删除事件，删除同步依赖平台是否上报
- KOOK 编辑消息会改变消息 ID，编辑相关逻辑不可靠

## 开发

```sh
npm install
npm run build    # tsc 声明 + esbuild → lib/
npm run eslint
npm run format
```

发布：推送匹配 `v*.*.*` 的 tag，由 GitHub Actions Trusted Publishing 发到 npm。细节见 [AGENTS.md](./AGENTS.md)。

## 贡献者

[![contrib](https://contrib.rocks/image?repo=Nigh/forward-hime)](https://github.com/Nigh/forward-hime/graphs/contributors)
