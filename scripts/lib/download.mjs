// 取片层：阶段①
//
//   - URL 输入：yt-dlp 下载并 --remux-video mp4（带 cookies / --weixin 元宝配方 / 浏览器 cookie，
//     8 次指数退避重试 + 3s 错峰，扛住视频号元宝桥接的间歇 400）。
//   - 本地视频输入：ffmpeg 规整/重封装为 mp4（统一下游）。
//
// 设计要点（从 super-mark 抽离时保留）：
//   - 一律用 -o <id>.%(ext)s 短名，避免 yt-dlp 默认用长标题命名触发 macOS 255 字节文件名超限（Errno 63）。
//   - 产物只认最终 .mp4，不靠 startsWith(id) 误认残留。
//   - 进重试前清掉上次半成品，避免续传/误认损坏文件。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { findYtDlp, findFfmpeg } from './audio.mjs';

const run = (bin, argv, opts = {}) => new Promise((resolve) => {
  execFile(bin, argv, { maxBuffer: 256 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
    resolve({ ok: !err, code: err?.code ?? 0, stdout: stdout || '', stderr: stderr || '' });
  });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ensureDir = (d) => { fs.mkdirSync(d, { recursive: true }); return d; };

/* ---------------- URL → mp4 ---------------- */

/**
 * 解析视频 id（用于产出稳定文件名）。
 */
export async function resolveId(ytdlp, url, opts) {
  const r = await run(ytdlp, ['--no-warnings', '--get-id', ...cookieArgs(opts), url], {
    timeout: 120000,
    env: { ...process.env, PATH: ['/opt/homebrew/bin', process.env.PATH || ''].filter(Boolean).join(':') },
  });
  const id = (r.stdout || '').trim().split(/\r?\n/).pop() || null;
  return id;
}

function cookieArgs(opts) {
  if (opts.weixin) {
    // 解藕约定：cookie 存用户主目录（跨 agent 通用），env 覆盖 > 用户级 > 工作区
    const candidates = [
      process.env.WEIXIN_COOKIE_FILE,
      path.join(os.homedir(), '.iskill-weixin-cookies.txt'),
      path.join(process.cwd(), 'weixin_cookies.txt'),
    ].filter(Boolean);
    const f = candidates.find(p => fs.existsSync(p));
    if (!f) {
      throw new Error(`--weixin 需要元宝(tencent.com)会话 cookie 文件，以下位置均未找到：\n  ${candidates.join('\n  ')}\n` +
        `推荐导出到用户级（跨 agent 通用）：yt-dlp --cookies-from-browser chrome --cookies ~/.iskill-weixin-cookies.txt https://example.com\n` +
        `（先在 Chrome 登录 https://yuanbao.tencent.com 再用微信扫码）`);
    }
    return ['--cookies', f];
  }
  if (opts.cookiesFile) return ['--cookies', opts.cookiesFile];
  if (opts.cookiesFromBrowser) return ['--cookies-from-browser', opts.cookiesFromBrowser];
  return [];
}

/**
 * 下载 URL → 泛化为统一格式（视频→mp4，音频→mp3），**不**做转写。
 * 先探测是否有视频流，再决定泛化目标：有视频→ --remux-video mp4；纯音频→ --extract-audio --audio-format mp3。
 * @returns {{ok:boolean, file?:string, id?:string, ext?:string, kind?:'video'|'audio', reason?:string}}
 */
export async function downloadUrl(url, outDir, opts = {}) {
  const ytdlp = findYtDlp();
  if (!ytdlp) return { ok: false, reason: '未找到 yt-dlp（请在 managed Python venv 安装 yt-dlp）' };
  ensureDir(outDir);

  let cookies;
  try {
    cookies = cookieArgs(opts);
  } catch (e) {
    return { ok: false, reason: e.message };
  }

  let id;
  try {
    id = await resolveId(ytdlp, url, opts);
  } catch (e) {
    return { ok: false, reason: e.message };
  }
  if (!id) return { ok: false, reason: '无法解析视频 id（链接无效或登录态不足）' };

  // 探测是否有视频流 → 决定泛化目标（视频→mp4 / 音频→mp3）
  let isAudio = false;
  try {
    const probe = await run(ytdlp, ['--no-warnings', '--no-playlist', '--print', '%(vcodec)s', ...cookies, url], {
      timeout: 60000,
      env: { ...process.env, PATH: ['/opt/homebrew/bin', process.env.PATH || ''].filter(Boolean).join(':') },
    });
    const vc = (probe.stdout || '').trim().split(/\r?\n/).pop() || '';
    isAudio = vc === 'none' || vc === '';
  } catch { /* 探测失败则按视频处理（→ mp4 仍可用） */ }

  const ff = findFfmpeg();
  const ext = isAudio ? 'mp3' : 'mp4';
  const outTmpl = path.join(outDir, `${id}.%(ext)s`);
  const argv = ['--no-playlist', '--no-warnings', '--quiet', '--no-progress'];
  if (isAudio) {
    argv.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0');
  } else {
    argv.push('--remux-video', 'mp4');
  }
  if (ff) argv.push('--ffmpeg-location', path.dirname(ff));
  argv.push('-o', outTmpl, ...cookies, url);

  const attempts = opts.retries ?? 8;
  let lastLog = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    // 清掉上次留下的半成品
    for (const f of fs.readdirSync(outDir)) {
      if (f.startsWith(id) && /\.(part|mp4|webm|mkv|m4a|mp3|opus|tmp)$/i.test(f)) {
        try { fs.unlinkSync(path.join(outDir, f)); } catch { /* ignore */ }
      }
    }
    const r = await run(ytdlp, argv, {
      timeout: opts.timeoutMs || 600000,
      env: { ...process.env, PATH: [ff ? path.dirname(ff) : '', '/opt/homebrew/bin', process.env.PATH || ''].filter(Boolean).join(':') },
    });
    const produced = path.join(outDir, `${id}.${ext}`);
    if (r.ok && fs.existsSync(produced)) {
      return { ok: true, file: produced, id, ext, kind: isAudio ? 'audio' : 'video' };
    }
    lastLog = (r.stderr || r.stdout || '').slice(-600);
    if (attempt < attempts) await sleep(2000 * attempt); // 2s, 4s, 6s… 退避扛 CDN 抖动
  }
  return { ok: false, id, reason: lastLog || 'yt-dlp 解析/下载失败' };
}

/* ---------------- 本地视频 → 规整 mp4 ---------------- */

/**
 * 本地视频文件 → 规整 mp4（先尝试流拷贝，失败再重编码）。
 * @returns {{ok:boolean, file?:string, reason?:string}}
 */
export async function normalizeVideo(srcFile, outMp4, opts = {}) {
  if (!fs.existsSync(srcFile)) return { ok: false, reason: `找不到视频：${srcFile}` };
  const ff = findFfmpeg();
  if (!ff) return { ok: false, reason: '缺少 ffmpeg，无法规整视频' };
  ensureDir(path.dirname(outMp4));

  const env = { ...process.env, PATH: [path.dirname(ff), '/opt/homebrew/bin', process.env.PATH || ''].filter(Boolean).join(':') };
  // 1) 流拷贝（最快，不重编码）
  const copy = await run(ff, ['-y', '-loglevel', 'error', '-i', srcFile, '-c', 'copy', '-f', 'mp4', outMp4], { timeout: 600000, env });
  if (copy.ok && fs.existsSync(outMp4)) return { ok: true, file: outMp4 };
  // 2) 重编码兜底
  const enc = await run(ff, ['-y', '-loglevel', 'error', '-i', srcFile, '-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart', outMp4], { timeout: 600000, env });
  if (enc.ok && fs.existsSync(outMp4)) return { ok: true, file: outMp4 };
  return { ok: false, reason: (enc.stderr || 'ffmpeg 规整失败').slice(-200) };
}
