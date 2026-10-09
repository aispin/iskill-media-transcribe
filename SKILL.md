---
name: iskill-media-transcribe
summary: 把视频 URL 或本地音视频文件，转成 mp4 + mp3 + srt/json 字幕。含视频号（元宝 cookie）一等公民支持。
description: 当用户想把视频（网页链接/本地文件）或音频文件，批量或单条转成「音轨 mp3 + 带时间戳字幕 srt/json」时使用。典型触发词：视频转字幕、mp4 转 mp3、语音转文字、视频号下载转写、本地录音转 srt、media transcribe。支持视频 URL 下载（含微信视频号需元宝登录态）、本地视频规整为 mp4、本地音频规整、本地 Whisper 转写（VoiceBox 主引擎，不外传音频）。
---

# iskill-media-transcribe

把「一个视频 / 一段音频」变成规整的三件套：

| 输入 | 产出 |
|---|---|
| 视频 URL（YouTube / Bilibili / 微信视频号 / …） | `<id>.mp4` + `<id>.mp3` + `<id>.srt` + `<id>.json` |
| 本地视频文件（mp4/mov/mkv/webm/…） | `<名>.mp4`（规整）+ `<名>.mp3` + `<名>.srt` + `<名>.json` |
| 本地音频文件（mp3/m4a/wav/flac/…） | `<名>.mp3`（规整）+ `<名>.srt` + `<名>.json`（无 mp4） |

所有转写**本地完成、音频不出机器**（VoiceBox / whisper）。

## 字幕时间戳说明（重要）

- **带逐句时间戳的 srt** 需要引擎返回分句时间。本机装了 **whisper CLI（推荐 `mlx-whisper`）** 时，`auto` 会优先用它，`srt/vtt` 即含精确逐句时间轴。
- **仅 VoiceBox** 时它只回纯文本（其 MCP 不支持 segment/word 时间戳），`srt` 会**退化为单块时间轴**（整段一个时间轴），命令行会给出提示。此时可 `--engine voicebox` 只取文本，或装 whisper CLI 解锁逐句时间戳。

## 快速开始

```bash
# 单条：视频号链接 → 元宝 cookie 配方（一等公民）
node scripts/video-transcribe.mjs one "https://weixin.qq.com/sph/XXXX" --weixin --out ./out

# 单条：本地视频
node scripts/video-transcribe.mjs one ./lecture.mov --out ./out

# 单条：本地音频
node scripts/video-transcribe.mjs one ./voice.m4a --out ./out

# 批量：目录
node scripts/video-transcribe.mjs batch --dir ./videos --out ./out

# 只看本机能力
node scripts/video-transcribe.mjs caps
```

## 命令

- `one <url|本地路径>`：端到端（取片→抽音→转写）。
- `download <url>`：只下载并泛化、不转写（视频→mp4，音频→mp3）。等价于 `one` 跳过转写阶段，想要纯素材时用它，而不是加 `--download-only` 参数。
- `batch --list <file>`：文件每行一个 url 或本地路径。
- `batch --dir <dir>`：目录下所有音视频文件。
- `download <url>`：仅取片泛化，**不转写**。视频 URL → mp4；音频 URL → mp3。`download --list <file>` 批量（每行一个 URL）。
- `audio <文件>`：仅抽音轨/规整（→ mp3）。
- `transcribe <mp3>`：仅转写（→ srt + json）。
- `caps`：引擎体检。

## 选项

- `--out <dir>` 输出目录（默认 `./out`）
- `--cookies <file>` netscape cookie 文件（需登录站点）
- `--cookies-from-browser <chrome|firefox|…>` 临时取浏览器 cookie
- `--weixin` **视频号专用一等公民**：读取元宝(tencent.com)会话 cookie（查找顺序：`$WEIXIN_COOKIE_FILE` → `~/.iskill-weixin-cookies.txt` 用户级推荐 → `./weixin_cookies.txt`）
- `--lang <code>` 转写语言（默认 `zh`）
- `--formats <csv>` 字幕格式（默认 `srt,json`；可 `srt,vtt,json,txt`）
- `--engine <auto|voicebox|whisper|voicestudio>`
- `--retries <n>` 下载重试（默认 8）
- `--spacing <ms>` 批量条目间错峰（默认 3000，扛 CDN 限频）
- `--force` 重处理已有产物

## 依赖（外部，需自行安装；脚本不打包）

1. **yt-dlp**（含 `yt-dlp-patch` 以支持微信视频号）—— 放在 managed Python venv：
   `/Users/lv/.workbuddy/binaries/python/envs/default/bin/yt-dlp`
2. **ffmpeg**（brew 安装即可：Apple Silicon `/opt/homebrew/bin/ffmpeg`、Intel `/usr/local/bin/ffmpeg`，或 PATH 内任意 ffmpeg；脚本探测链=PATH → 两条 brew 路径）
3. **VoiceBox** 本地 Whisper 应用（默认 `http://127.0.0.1:17493`，主转写引擎，中文最佳）
4. **whisper CLI**（兜底；`mlx-whisper` 在 Apple Silicon 上最快、中文好）—— 可选
5. Node 22（managed）

## 视频号（微信）下载配方（一等公民 `--weixin`）

视频号 `sph` 链接必须带**元宝(tencent.com)会话**才能解析（个人微信网页版 `wx.qq.com` 不行）。一次性准备：

```bash
# 1) Chrome 打开 https://yuanbao.tencent.com 用微信扫码登录
# 2) 导出 cookie（netscape 格式，推荐用户级路径、跨 agent 通用）：
yt-dlp --cookies-from-browser chrome --cookies ~/.iskill-weixin-cookies.txt https://example.com
# 3) 之后直接：
node scripts/video-transcribe.mjs one "https://weixin.qq.com/sph/XXXX" --weixin
```

cookie 过期后重跑第 2 步即可。

## 运行须知

- **大文件下载需有网络、且不被沙箱掐断**：在本机直接跑即可；若在 WorkBuddy 自动化里跑，需允许出网（大文件下载可能被隔离沙箱中断，留 `.part`）。
- 默认字幕 `srt + json`。若引擎只回纯文本（无分句时间戳），`srt` 退化为单块时间轴；装 `whisper CLI` 可得精确逐句时间戳。
- 文件名一律用 `id/名` 短名，避免长标题触发 macOS 255 字节文件名上限。

## 依赖同步

本仓库 `promo-page/assets/{app.js,style.css,icons.js}` 是 [iskill-promo-page](https://github.com/aispin/iskill-promo-page)
模板引擎的 vendored 副本（锁定版本见 `package.json` 的 `iskillDeps`），**不要手改**——
去真源仓库改并升 `@iskill-version`，再用 iskill-dep-sync 同步回来。本机未装该工具时，先安装：对 agent 说「请帮我安装 Skill：aispin/iskill-dep-sync」，或按下方自举命令现场拉取：

```bash
T="$HOME/.workbuddy/skills/iskill-dep-sync/scripts/skill-deps.mjs"
[ -f "$T" ] || { TMP="$(mktemp -d)"; curl -fsSL "https://raw.githubusercontent.com/aispin/iskill-dep-sync/HEAD/scripts/skill-deps.mjs" -o "$TMP/skill-deps.mjs"; T="$TMP/skill-deps.mjs"; }
node "$T" check "$(pwd)"     # 漂移检测；node "$T" sync "$(pwd)" 恢复/升级；node "$T" env "$(pwd)" 冷启动自检
```
