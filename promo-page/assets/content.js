/* ============================================================================
 * iskill-media-transcribe · 落地页内容
 * 事实来源：本技能 SKILL.md / README.md / scripts/lib/caps.mjs
 * ==========================================================================*/
window.PROMO = {
  name: "ISKILL-MEDIA-TRANSCRIBE",
  brand: "#2f6bff",
  brand2: "#22d3ee",
  repo: "https://github.com/aispin/iskill-media-transcribe",
  repoLabel: "aispin/iskill-media-transcribe",
  license: "MIT",

  /* lib/audio.mjs、lib/download.mjs 把 /opt/homebrew/bin 拼进 PATH 且用 POSIX 冒号；
     lib/asr.mjs 写死 /Users/lv/... → 仅 macOS */
  platform: "macos",

  lang: {
    /* ── 中文 ───────────────────────────────────────────────────────── */
    zh: {
      meta: {
        title: "ISKILL-MEDIA-TRANSCRIBE · 视频音频一键变 mp3 + 字幕",
        description: "视频链接 / 本地视频 / 本地音频，一条命令转成 mp3 音轨 + 带时间戳的 srt/json 字幕；视频号一等公民，转写全在本地，音频不出机器。"
      },
      a11y: { skip: "跳到主要内容" },
      ui: { copy: "复制", copied: "已复制", failed: "复制失败" },
      nav: { features: "能力", shots: "截图", how: "上手", faq: "问答" },

      hero: {
        badge: "AI 技能",
        titlePre: "视频音频进去，",
        titleAccent: "mp3 + 带时间戳字幕",
        titlePost: "出来",
        sub: "把「一个视频 / 一段音频」变成规整的三件套：mp4（规整视频）+ mp3（音轨）+ srt（带时间戳字幕）+ json（结构化转写）。支持视频号链接（一等公民）、本地视频、本地音频；转写全程本地完成，音频不出机器。",
        ctaPrimary: "复制安装提示词",
        ctaSecondary: "看源码",
        meta1: "本地转写 · 不外传",
        meta2: "视频号一等公民",
        meta3: "MIT 许可"
      },
      terminal: {
        title: "zsh — iskill-media-transcribe",
        lines: [
          [{ t: "$ ", c: "p" }, { t: "node scripts/video-transcribe.mjs caps", c: "k" }],
          [{ t: "yt-dlp      : ", c: "s" }, { t: "✓ ", c: "p" }, { t: "~/.workbuddy/binaries/python/envs/default/bin/yt-dlp", c: "s" }],
          [{ t: "ffmpeg      : ", c: "s" }, { t: "✓ ", c: "p" }, { t: "/opt/homebrew/bin/ffmpeg", c: "s" }],
          [{ t: "VoiceBox    : ", c: "s" }, { t: "✓ ", c: "p" }, { t: "http://127.0.0.1:17493 (ready)", c: "s" }],
          [{ t: "结论：核心链路可用（下载 + 抽音轨 + 转写齐备）。", c: "s" }]
        ]
      },

      stats: [
        { value: "4", label: "产出文件 / 条", note: "视频：mp4 + mp3 + srt + json（纯音频无 mp4）" },
        { value: "0", label: "音频上传", note: "转写全在本地，音频不出机器" },
        { value: "8 × 3s", label: "下载重试 × 批量错峰", note: "默认 --retries 8 / --spacing 3000，扛 CDN 限频" },
        { value: "6", label: "子命令", note: "one / download / batch / audio / transcribe / caps" }
      ],

      compare: {
        eyebrow: "对比",
        title: "以前 vs 现在",
        sub: "",
        before: {
          title: "手工搬运",
          items: [
            "下载、转格式、抽音轨、跑转写，四步四个工具",
            "字幕对不齐时间轴，还要手动切句",
            "视频号链接解析不了，得先想办法把片子弄下来"
          ]
        },
        after: {
          title: "用这个技能",
          items: [
            "一条 one 命令端到端，产出 mp4 + mp3 + srt + json",
            "whisper CLI 在时 auto 优先用它，srt 带精确逐句时间轴",
            "视频号是「一等公民」：--weixin 自动读元宝登录态"
          ]
        }
      },

      features: {
        eyebrow: "能力",
        title: "它能做什么",
        sub: "",
        items: [
          { icon: "camera", title: "视频号一等公民", desc: "--weixin 自动读取元宝（tencent.com）会话 cookie，视频号 sph 链接直接解析下载。" },
          { icon: "terminal", title: "一条命令端到端", desc: "one 把「取片 → 抽音 → 转写」串起来，一次给出全套产物。" },
          { icon: "grid", title: "批量处理", desc: "batch --dir 扫目录下所有音视频，或 --list 每行一个地址，默认 3s 错峰。" },
          { icon: "shield", title: "本地转写", desc: "主引擎 VoiceBox + 兜底 whisper，全程本地跑，音频不出机器。" },
          { icon: "gauge", title: "能力体检", desc: "caps 逐项报告 yt-dlp / ffmpeg / VoiceBox / whisper CLI，一眼看清缺什么。" },
          { icon: "layers", title: "分步可单跑", desc: "download / audio / transcribe 各步独立，只要其中一步就只跑那一步。" }
        ]
      },

      showcase: {
        eyebrow: "实拍",
        title: "看一眼真东西",
        sub: "",
        items: []
      },

      steps: {
        eyebrow: "上手",
        title: "三步跑起来",
        sub: "命令由 agent 跑，你只说要什么、看结果。",
        items: [
          { title: "交给 AI 装", desc: "把这句话粘进对话框，agent 会自己拉代码、读文档，再告诉你用法。", codeKey: "install" },
          { title: "把链接或文件给它", desc: "链接或本地文件都行；依赖（yt-dlp / ffmpeg / 转写引擎）它会先体检，缺什么告诉你。", codeName: "prompt", code: "把这条视频号链接转成带时间戳的字幕，音频单独存一份。" },
          { title: "抽两处对时间轴", desc: "产物是 mp3 + srt + json，你随机抽两句看看字幕对没对上；要接着剪辑就让它把成果交给下游。" }
        ]
      },


      faq: {
        eyebrow: "问答",
        title: "常见问题",
        items: [
          { q: "Windows 或 Linux 能跑吗？", a: "目前<b>仅 macOS</b>。<code>lib/audio.mjs</code>、<code>lib/download.mjs</code> 会把 <code>/opt/homebrew/bin</code> 拼进 PATH 且用 POSIX 冒号分隔，<code>lib/asr.mjs</code> 里还写死了 <code>/Users/lv/...</code> 路径 —— 在 Windows 上会找不到 ffmpeg / yt-dlp 与语音模型。替代方案：在 macOS 上跑；或按 PLATFORM-MATRIX 的建议，把 PATH 拼接改成 <code>path.delimiter</code>、去掉写死路径、给 ffmpeg 探测补上 Windows 候选后再用。" },
          { q: "需要 API key 或联网吗？", a: "转写不需要 API key、也不上传音频，全在本机完成。只有下载「视频 URL」那一步需要出网；纯本地文件可以离线跑。" },
          { q: "为什么字幕只有一整块、没有逐句时间？", a: "当前引擎只回纯文本时（例如只用 VoiceBox），srt 会退化为单块时间轴。装 <code>whisper CLI</code>（Apple Silicon 推荐 <code>mlx-whisper</code>）后，<code>auto</code> 会自动优先用它，srt 即含精确逐句时间轴。" },
          { q: "视频号链接解析失败怎么办？", a: "视频号 <code>sph</code> 链接必须带<b>元宝（tencent.com）会话</b>才能解析（个人微信网页版 <code>wx.qq.com</code> 不行）。先扫码登录 yuanbao.tencent.com，导出 netscape cookie 后用 <code>--weixin</code> 读取。" },
          { q: "下载只留下一个 .part 文件？", a: "大文件下载被隔离沙箱掐断了。在本机直接跑即可，或让自动化放行出网。" },
          { q: "支持哪些输入？", a: "三类：视频 URL（YouTube / Bilibili / 微信视频号等）、本地视频（mp4/mov/mkv/webm…）、本地音频（mp3/m4a/wav/flac…）。纯音频不产出 mp4。" }
        ]
      },

      cta: { title: "把这条视频转了吧", desc: "装好依赖，一条命令拿走 mp3 与带时间戳字幕。", primary: "去 GitHub 看看", secondary: "复制安装提示词" },
      footer: { license: "MIT 许可", madeWith: "由 iskill-promo-page 生成" }
    },

    /* ── English ────────────────────────────────────────────────────── */
    en: {
      meta: {
        title: "ISKILL-MEDIA-TRANSCRIBE · Video and audio into mp3 + timestamped subtitles",
        description: "Turn a video URL, local video, or local audio into an mp3 track plus timestamped srt/json subtitles. WeChat Channels is first-class; transcription runs entirely on-device."
      },
      a11y: { skip: "Skip to content" },
      ui: { copy: "Copy", copied: "Copied", failed: "Copy failed" },
      nav: { features: "Features", shots: "Screens", how: "Get started", faq: "FAQ" },

      hero: {
        badge: "AI skill",
        titlePre: "Video or audio in, ",
        titleAccent: "mp3 + timed subtitles",
        titlePost: " out",
        sub: "Turn a video or a piece of audio into a tidy trio: mp4 (normalised video) + mp3 (audio track) + srt (timestamped subtitles) + json (structured transcript). Supports WeChat Channels links (first-class), local video, and local audio; transcription runs entirely on-device, so your audio never leaves the machine.",
        ctaPrimary: "Copy install prompt",
        ctaSecondary: "View source",
        meta1: "On-device transcription",
        meta2: "WeChat Channels first-class",
        meta3: "MIT licensed"
      },
      terminal: {
        title: "zsh — iskill-media-transcribe",
        lines: [
          [{ t: "$ ", c: "p" }, { t: "node scripts/video-transcribe.mjs caps", c: "k" }],
          [{ t: "yt-dlp      : ", c: "s" }, { t: "✓ ", c: "p" }, { t: "~/.workbuddy/binaries/python/envs/default/bin/yt-dlp", c: "s" }],
          [{ t: "ffmpeg      : ", c: "s" }, { t: "✓ ", c: "p" }, { t: "/opt/homebrew/bin/ffmpeg", c: "s" }],
          [{ t: "VoiceBox    : ", c: "s" }, { t: "✓ ", c: "p" }, { t: "http://127.0.0.1:17493 (ready)", c: "s" }],
          [{ t: "conclusion: core pipeline ready (download + audio + transcribe).", c: "s" }]
        ]
      },

      stats: [
        { value: "4", label: "output files per item", note: "video: mp4 + mp3 + srt + json (audio-only skips mp4)" },
        { value: "0", label: "audio uploads", note: "transcription is fully local; audio never leaves the machine" },
        { value: "8 × 3s", label: "download retries × batch spacing", note: "defaults --retries 8 / --spacing 3000 against CDN rate limits" },
        { value: "6", label: "subcommands", note: "one / download / batch / audio / transcribe / caps" }
      ],

      compare: {
        eyebrow: "Comparison",
        title: "Before vs after",
        sub: "",
        before: {
          title: "Shuffling by hand",
          items: [
            "Download, convert, extract audio, transcribe — four steps, four tools",
            "Subtitles drift off the timeline, then you split lines yourself",
            "WeChat Channels links just fail to resolve"
          ]
        },
        after: {
          title: "With this skill",
          items: [
            "One `one` command end-to-end, producing mp4 + mp3 + srt + json",
            "When whisper CLI is present, auto prefers it and srt gets exact per-line timing",
            "WeChat Channels is first-class: --weixin reads your Yuanbao session"
          ]
        }
      },

      features: {
        eyebrow: "Features",
        title: "What it does",
        sub: "",
        items: [
          { icon: "camera", title: "WeChat Channels, first-class", desc: "--weixin reads the Yuanbao (tencent.com) session cookie so sph links resolve and download directly." },
          { icon: "terminal", title: "One command, end to end", desc: "`one` chains fetch → extract → transcribe and hands you the whole set at once." },
          { icon: "grid", title: "Batch by default", desc: "batch --dir sweeps a folder of media, or --list takes one address per line, spaced 3 s apart." },
          { icon: "shield", title: "On-device transcription", desc: "VoiceBox as the main engine with whisper as fallback — all local, no audio leaves the machine." },
          { icon: "gauge", title: "Capability check", desc: "caps reports yt-dlp / ffmpeg / VoiceBox / whisper CLI one by one, so you see exactly what is missing." },
          { icon: "layers", title: "Step-wise, runnable alone", desc: "download / audio / transcribe stand alone — if you need just one step, run just that step." }
        ]
      },

      showcase: {
        eyebrow: "Screens",
        title: "See the real thing",
        sub: "",
        items: []
      },

      steps: {
        eyebrow: "Get started",
        title: "Up and running in three steps",
        sub: "The agent runs the commands. You say what you want and check the result.",
        items: [
          { title: "Let your agent install it", desc: "Paste the line into the chat — it clones the repo, reads the docs, and tells you how to use it.", codeKey: "install" },
          { title: "Give it a link or a file", desc: "Either works. It checks yt-dlp / ffmpeg / the transcription engine first and tells you what's missing.", codeName: "prompt", code: "Transcribe this WeChat Channels link into timestamped subtitles, and keep the audio separately." },
          { title: "Spot-check the timeline", desc: "You get mp3 + srt + json — skim two lines to see if the timing lines up. Cutting a video next? Let it hand the result downstream." }
        ]
      },


      faq: {
        eyebrow: "FAQ",
        title: "Frequently asked",
        items: [
          { q: "Does it run on Windows or Linux?", a: "<b>macOS only</b> for now. <code>lib/audio.mjs</code> and <code>lib/download.mjs</code> append <code>/opt/homebrew/bin</code> to PATH using the POSIX colon separator, and <code>lib/asr.mjs</code> hard-codes a <code>/Users/lv/...</code> path — on Windows it will fail to find ffmpeg / yt-dlp and the speech model. Alternatives: run it on macOS, or apply the PLATFORM-MATRIX suggestions (switch PATH joining to <code>path.delimiter</code>, drop the hard-coded path, add Windows candidates to ffmpeg detection) first." },
          { q: "Does it need an API key or network?", a: "Transcription needs no API key and uploads nothing — it is all local. Only the \"download a video URL\" step needs network access; purely local files work offline." },
          { q: "Why is my subtitle one single block with no per-line timing?", a: "When the active engine only returns plain text (e.g. VoiceBox alone), srt degrades to a single block. Install <code>whisper CLI</code> (on Apple Silicon, <code>mlx-whisper</code>) and <code>auto</code> will prefer it, giving srt exact per-line timing." },
          { q: "A WeChat Channels link will not resolve?", a: "A Channels <code>sph</code> link needs a <b>Yuanbao (tencent.com) session</b> to resolve (personal WeChat web <code>wx.qq.com</code> does not work). Log in at yuanbao.tencent.com by QR code, export the netscape cookie, then read it with <code>--weixin</code>." },
          { q: "The download left only a .part file?", a: "A large download was cut off by the isolation sandbox. Run it directly on your machine, or let your automation permit outbound network." },
          { q: "What inputs are supported?", a: "Three kinds: video URLs (YouTube / Bilibili / WeChat Channels, …), local video (mp4/mov/mkv/webm…), and local audio (mp3/m4a/wav/flac…). Audio-only input produces no mp4." }
        ]
      },

      cta: { title: "Transcribe that video", desc: "Install the dependencies, then take away mp3 and timestamped subtitles in one command.", primary: "Open on GitHub", secondary: "Copy install prompt" },
      footer: { license: "MIT licensed", madeWith: "Built with iskill-promo-page" }
    }
  }
};
