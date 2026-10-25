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
| `MediaRelay.ImageCompression.Enabled` | `true` | 启用中转图片 JPEG 压缩 |
| `MediaRelay.ImageCompression.InputSizeMB` | `2` | 图片超过此体积才压缩（MiB） |
| `MediaRelay.ImageCompression.TargetSizeMB` | `1` | 压缩后 JPEG 的最大体积（MiB） |
| `ForwardTimeoutSec` | `60` | 慢转发告警阈值（秒）；仍等待结果，避免重复发送 |
| `CacheTimeout` | `120` | 消息映射缓存（分钟，≥120）；影响删除 / 引用 |

平台侧有额外处理（如 onebot 的 at / 表情 / 合并转发，kook 无图时补透明图）；通用路径走默认装饰器。

图片压缩配置位于 WebUI 的「媒体中转 / 图片压缩」。旧配置缺少这些字段时仍使用默认值：启用媒体中转后，超过 **2 MiB** 的图片转为不超过 **1 MiB** 的 JPEG（1 MiB = 1024 × 1024 字节）。远程链接和 data URL 图片均经过同一处理，嵌套内容中的图片也适用；未超过门限、关闭图片压缩或关闭媒体中转时不转换。文件、视频和音频不受图片压缩影响。

JPEG 使用质量 80；必要时持续缩小分辨率，直到满足目标体积，不会把仍超目标的图片标记为压缩成功。GIF 和其他多帧动画保留原始字节及格式，不做 JPEG 压缩；视频、音频和文件同样不压缩。静态图片转换时透明背景铺白，自动应用图片方向。图片仍受 `MaxFileSizeMB` 下载上限约束；损坏、不受支持或无法满足目标体积的静态图片报告压缩失败，使用现有媒体失败降级流程，不静默发送未压缩原图。中转缓存保存处理后的图片，配置重新加载时清空，避免继续复用旧设置的结果。

日志中的长 base64 内容显示为 `[base64 length=xxxx]`，不改变实际转发的数据。

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
