# iskill-media-transcribe

把**视频链接 / 本地视频 / 本地音频**转成规整的三件套：**mp4（规整视频）+ mp3（音轨）+ srt（带时间戳字幕）+ json（结构化转写）**。

所有转写**本地完成、音频不出机器**。

## 安装依赖

```bash
# 1) Python venv（yt-dlp + 视频号插件）
python3 -m venv ~/.workbuddy/binaries/python/envs/default
~/.workbuddy/binaries/python/envs/default/bin/pip install yt-dlp yt-dlp-patch

# 2) ffmpeg
brew install ffmpeg

# 3) VoiceBox（本地 Whisper，主转写引擎）—— 从官网安装并启动
#    https://voicebox.app  （默认监听 http://127.0.0.1:17493）

# 4)（可选）whisper CLI 兜底，能产出精确逐句时间戳
pip install mlx-whisper        # Apple Silicon
# 或
pip install openai-whisper
```

验证：`node scripts/video-transcribe.mjs caps`

## 用法

```bash
# 视频号链接（需先准备元宝 cookie，见下）
node scripts/video-transcribe.mjs one "https://weixin.qq.com/sph/XXXX" --weixin --out ./out

# 普通视频链接
node scripts/video-transcribe.mjs one "https://www.bilibili.com/video/BVxxxx" --out ./out

# 本地视频
node scripts/video-transcribe.mjs one ./lecture.mov --out ./out

# 本地音频（只产出 mp3 + srt + json，无 mp4）
node scripts/video-transcribe.mjs one ./voice.m4a --out ./out

# 批量目录
node scripts/video-transcribe.mjs batch --dir ./videos --out ./out

# 仅某一步
node scripts/video-transcribe.mjs download  "<url>" --weixin        # 仅下载泛化、不转写：视频 URL→mp4，音频 URL→mp3
node scripts/video-transcribe.mjs download --list urls.txt --out ./out   # 批量下载泛化（每行一个 URL）
node scripts/video-transcribe.mjs audio     ./x.mp4
node scripts/video-transcribe.mjs transcribe ./x.mp3 --formats srt,json,vtt
```

## 视频号（微信）下载配方

视频号 `sph` 链接需**元宝(tencent.com)会话**才能解析（个人微信网页版 `wx.qq.com` 不行）。

```bash
# 1) Chrome 打开 https://yuanbao.tencent.com 用微信扫码登录
# 2) 导出 cookie：
yt-dlp --cookies-from-browser chrome --cookies ./weixin_cookies.txt https://example.com
# 3) 使用 --weixin 自动读取该文件：
node scripts/video-transcribe.mjs one "https://weixin.qq.com/sph/XXXX" --weixin
```

可用环境变量 `WEIXIN_COOKIE_FILE` 指定 cookie 路径，默认 `./weixin_cookies.txt`。cookie 过期后重跑第 2 步。

## 故障排查

| 现象 | 原因 / 解决 |
|---|---|
| `yt-dlp 解析失败` | 视频号需 `--weixin`（元宝登录态）；普通站检查链接有效性 |
| 下载只留 `.part` | 大文件被沙箱掐断 → 在本机直接跑（关沙箱/有网络） |
| 转写 `VoiceBox：连不上` | VoiceBox 没启动，去启动它 |
| srt 只有一整块无逐句时间 | 当前引擎只回纯文本（如仅 VoiceBox）。装 `whisper CLI`（mlx-whisper）后 `auto` 会自动改用它，`srt` 即含精确逐句时间戳 |
| 中文转写乱/英文 | VoiceStudio 默认英文模型不稳，已降级为兜底；用 VoiceBox/whisper |

## 设计要点（从实战抽离）

- 下载一律 `-o <id>.%(ext)s` 短名，避免长标题触发 macOS 255 字节文件名上限（`Errno 63`）。
- 视频号元宝桥接偶发 400 → 8 次指数退避 + 批量 3s 错峰。
- 产物只认最终扩展名（`.mp4`/`.mp3`），不靠前缀误认残留。
- VoiceBox 大文件上传不稳 → 走 MCP `audio_path` 直读本地文件。

> 依赖同步：本仓库含 iskill 共享真源的 vendored 副本（清单见 `package.json` 的 `iskillDeps`），**不要手改**。使用前请同时安装 iskill-dep-sync：对 agent 说「请帮我安装 Skill：aispin/iskill-dep-sync」；用法见 SKILL.md「依赖同步」节。
