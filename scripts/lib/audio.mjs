// 媒体层：抽音轨 / 规整音频 / 依赖探测
//
// 这是 iskill-media-transcribe 的「阶段②」：把视频（或裸音频）变成规整的 mp3。
// 同时集中导出 findYtDlp / findFfmpeg 两个依赖定位器，供 download.mjs / asr.mjs 复用。
//
// 设计要点（从 super-mark 抽离时保留的血泪经验）：
//   - 非交互 shell 里 PATH 常常没有 Homebrew，必须把 ffmpeg 位置显式告诉下游命令。
//   - 产物检查只认「最终扩展名」（.mp3），不要 startsWith(id)，否则会把转码残留误认成功。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execFile } from 'node:child_process';

const which = (bin) => {
  try {
    return execFileSync('/usr/bin/which', [bin], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
};

const tryWhich = (bins) => bins.map((b) => which(b)).find(Boolean) || null;

/* ---------------- 依赖定位 ---------------- */

export function findYtDlp() {
  const cands = [
    process.env.YTDLP,
    '/Users/lv/.workbuddy/binaries/python/envs/default/bin/yt-dlp',
    which('yt-dlp'),
  ].filter(Boolean);
  return cands.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}

// 探测链：PATH → Apple Silicon brew → Intel brew（Homebrew 默认路径随架构不同）
export function findFfmpeg() {
  const cands = [
    tryWhich(['ffmpeg']),
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
  ].filter(Boolean);
  return cands.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}

const run = (bin, argv, opts = {}) => new Promise((resolve) => {
  execFile(bin, argv, { maxBuffer: 256 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
    resolve({ ok: !err, code: err?.code ?? 0, stdout: stdout || '', stderr: stderr || '' });
  });
});

const ensureDir = (d) => { fs.mkdirSync(d, { recursive: true }); return d; };

/* ---------------- 阶段②：视频→mp3 ---------------- */

/**
 * 从视频文件抽取音轨 → 规整 mp3（libmp3lame, -q:a 4）。
 * @returns {{ok:boolean, file?:string, reason?:string}}
 */
export async function extractAudio(videoFile, outMp3, opts = {}) {
  if (!fs.existsSync(videoFile)) return { ok: false, reason: `找不到视频：${videoFile}` };
  const ff = findFfmpeg();
  if (!ff) return { ok: false, reason: '缺少 ffmpeg，无法抽取音轨' };
  ensureDir(path.dirname(outMp3));
  const r = await run(ff, ['-y', '-loglevel', 'error', '-i', videoFile, '-vn', '-acodec', 'libmp3lame', '-q:a', '4', outMp3], {
    timeout: opts.timeoutMs || 600000,
    env: { ...process.env, PATH: [path.dirname(ff), '/opt/homebrew/bin', process.env.PATH || ''].filter(Boolean).join(':') },
  });
  if (r.ok && fs.existsSync(outMp3)) return { ok: true, file: outMp3 };
  return { ok: false, reason: (r.stderr || 'ffmpeg 抽音轨失败').slice(-200) };
}

/* ---------------- 阶段②（裸音频输入）：规整为 mp3 ---------------- */

/**
 * 裸音频（mp3/m4a/wav/flac/...）→ 统一规整的 mp3。
 * 自带 mp3 也重新编码一次，保证下游 ASR 拿到的是一致、干净的容器。
 * @returns {{ok:boolean, file?:string, reason?:string}}
 */
export async function normalizeAudio(audioFile, outMp3, opts = {}) {
  if (!fs.existsSync(audioFile)) return { ok: false, reason: `找不到音频：${audioFile}` };
  const ff = findFfmpeg();
  if (!ff) return { ok: false, reason: '缺少 ffmpeg，无法规整音频' };
  ensureDir(path.dirname(outMp3));
  const r = await run(ff, ['-y', '-loglevel', 'error', '-i', audioFile, '-vn', '-acodec', 'libmp3lame', '-q:a', '4', outMp3], {
    timeout: opts.timeoutMs || 600000,
    env: { ...process.env, PATH: [path.dirname(ff), '/opt/homebrew/bin', process.env.PATH || ''].filter(Boolean).join(':') },
  });
  if (r.ok && fs.existsSync(outMp3)) return { ok: true, file: outMp3 };
  return { ok: false, reason: (r.stderr || 'ffmpeg 规整失败').slice(-200) };
}

/* ---------------- 工具 ---------------- */

/** 音频/视频时长（秒） */
export async function mediaDuration(file) {
  const ff = findFfmpeg();
  if (!ff) return 0;
  const r = await run(ff, ['-i', file, '-f', 'null', '-'], { timeout: 120000 });
  const m = /Duration: (\d+):(\d+):(\d+)(?:\.(\d+))?/.exec(r.stderr || '');
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + (Number(m[4] || 0) / 100);
}

/** 按扩展名判断输入类型 */
export function inputKind(p) {
  const ext = path.extname(p).toLowerCase();
  if (/^(https?:\/\/)/i.test(p)) return 'url';
  if (/\.(mp4|mov|mkv|webm|avi|m4v|flv|wmv|ts|mpg|mpeg)$/i.test(ext)) return 'video';
  if (/\.(mp3|m4a|aac|wav|flac|ogg|opus|wma|amr)$/i.test(ext)) return 'audio';
  return 'unknown';
}
