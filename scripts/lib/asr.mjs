// 转写层：本地 mp3 → 字幕/转写稿
//
// 引擎按「本机已有即用」顺序探测，全部离线、不外传音频：
//   1) VoiceBox 本地 MCP（http://127.0.0.1:17493，底层 Whisper，中文好）—— 主引擎
//   2) whisper CLI（openai-whisper / mlx-whisper / whisper.cpp）—— 兜底，且能产出带时间戳的 srt/json
//   3) VoiceStudio 本地 MCP（http://localhost:3900/mcp，默认 ASR 多为英文模型，中文不稳）—— 最后兜底
//
// 产出：text + segments（[{start,end,text}]）。segments 用于生成带时间戳的 srt/vtt；
// 若引擎只回纯文本，则退化为单块 srt（整段一个时间轴）。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, execFile } from 'node:child_process';

const run = (bin, argv, opts = {}) => new Promise((resolve) => {
  execFile(bin, argv, { maxBuffer: 256 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
    resolve({ ok: !err, stdout: stdout || '', stderr: stderr || '', code: err?.code ?? 0 });
  });
});

const which = (bin) => {
  try { return execFileSync('/usr/bin/which', [bin], { encoding: 'utf8' }).trim() || null; } catch { return null; }
};
const tryWhich = (bins) => bins.map(which).find(Boolean) || null;

/* ---------------- VoiceBox 本地 MCP ---------------- */

const VOICEBOX_URL = process.env.VOICEBOX_URL || 'http://127.0.0.1:17493';
const VOICEBOX_MCP = `${VOICEBOX_URL}/mcp`;
const VOICEBOX_CLIENT_ID = process.env.VOICEBOX_CLIENT_ID || 'media-transcribe';
let vbSession = null;

export async function voiceboxHealthy() {
  try {
    const r = await fetch(`${VOICEBOX_URL}/health`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return j || { status: 'ok' };
  } catch {
    return null;
  }
}

async function vbCall(method, params, { timeoutMs = 900000 } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'X-Voicebox-Client-Id': VOICEBOX_CLIENT_ID,
  };
  if (vbSession) headers['mcp-session-id'] = vbSession;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(VOICEBOX_MCP, {
      method: 'POST', headers, signal: ctrl.signal,
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now() % 100000, method, params }),
    });
    const sid = res.headers.get('mcp-session-id');
    if (sid) vbSession = sid;
    const text = await res.text();
    const line = text.split('\n').find((l) => l.startsWith('data:'));
    const body = line ? line.slice(5).trim() : text.trim();
    try { return JSON.parse(body); } catch { return null; }
  } finally {
    clearTimeout(timer);
  }
}

async function vbInit() {
  if (vbSession) return true;
  try {
    const r = await vbCall('initialize', {
      protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'media-transcribe', version: '1.0' },
    }, { timeoutMs: 10000 });
    if (!r?.result) return false;
    await vbCall('notifications/initialized', {}).catch(() => {});
    return true;
  } catch { return false; }
}

/** 把引擎返回的 segments/words 归一化为 [{start,end,text}] */
function normalizeSegments(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out = [];
  for (const s of raw) {
    const start = Number(s.start ?? s.start_time ?? s.begin ?? 0);
    const end = Number(s.end ?? s.end_time ?? s.stop ?? start);
    const text = String(s.text ?? s.word ?? s.segment ?? '').trim();
    if (!text) continue;
    out.push({ start, end, text });
  }
  return out.length ? out : null;
}

async function viaVoiceBox(file, language) {
  if (!(await voiceboxHealthy())) {
    return { ok: false, error: `连不上 ${VOICEBOX_URL}（VoiceBox 没在运行？）` };
  }
  if (!(await vbInit())) return { ok: false, error: 'VoiceBox MCP 握手失败' };
  const model = process.env.VOICEBOX_MODEL || 'turbo';
  const args = { audio_path: file, model };
  if (language) args.language = language;
  const r = await vbCall('tools/call', { name: 'voicebox.transcribe', arguments: args }, { timeoutMs: 900000 });
  const content = r?.result?.content;
  if (!content?.length) {
    return { ok: false, error: r?.error?.message || JSON.stringify(r).slice(0, 160) };
  }
  const raw = content.map((c) => c.text || '').join('\n').trim();
  const parsed = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  const j = parsed || {};
  if (j.detail?.message?.toLowerCase().includes('download')) {
    return { ok: false, error: `${j.detail.message}（首次使用会下载 Whisper 模型，稍等重试）` };
  }
  if (j.text == null) return { ok: false, error: raw.slice(0, 160) || '未返回文本' };
  return {
    ok: true,
    text: String(j.text).trim(),
    segments: normalizeSegments(j.segments || j.words || null),
    engine: `VoiceBox/${model}`, lang: j.language, duration: j.duration,
  };
}

/* ---------------- VoiceStudio MCP（兜底） ---------------- */

const VS_URL = process.env.VOICESTUDIO_MCP || 'http://localhost:3900/mcp';
let vsSession = null;

function parseSse(text) {
  const line = text.split('\n').find((l) => l.startsWith('data:'));
  if (!line) return null;
  try { return JSON.parse(line.slice(5).trim()); } catch { return null; }
}

async function vsCall(method, params, { timeoutMs = 900000 } = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (vsSession) headers['mcp-session-id'] = vsSession;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(VS_URL, {
      method: 'POST', headers, signal: ctrl.signal,
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now() % 100000, method, params }),
    });
    const sid = res.headers.get('mcp-session-id');
    if (sid) vsSession = sid;
    const text = await res.text();
    return parseSse(text) || (text.trim().startsWith('{') ? JSON.parse(text) : null);
  } finally {
    clearTimeout(timer);
  }
}

async function vsInit() {
  if (vsSession) return true;
  try {
    const r = await vsCall('initialize', {
      protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'media-transcribe', version: '1.0' },
    }, { timeoutMs: 10000 });
    if (!r?.result) return false;
    await vsCall('notifications/initialized', {}).catch(() => {});
    return true;
  } catch { return false; }
}

function parseLoose(txt) {
  const cleaned = String(txt).trim();
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  const asJson = cleaned
    .replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3')
    .replace(/:\s*'((?:[^'\\]|\\.)*)'/g, (_, v) => `:"${v.replace(/"/g, '\\"')}"`);
  try { return JSON.parse(asJson); } catch { /* continue */ }
  const err = /'error':\s*'([^']*)'/.exec(cleaned);
  if (err) return { error: err[1] };
  const text = /'text':\s*'([^']*)'/.exec(cleaned);
  if (text) return { text: text[1] };
  return null;
}

async function vsTranscribe(file, language) {
  if (!(await vsInit())) return { ok: false, error: `连不上 ${VS_URL}（VoiceStudio 没在运行？）` };
  const buf = fs.readFileSync(file);
  const args = { audio_base64: buf.toString('base64') };
  if (language) args.language = language;
  const r = await vsCall('tools/call', { name: 'transcribe', arguments: args });
  const raw = (r?.result?.content || []).map((c) => c.text || '').join('\n').trim();
  if (!raw) return { ok: false, error: '空响应' };
  const parsed = parseLoose(raw);
  if (parsed && typeof parsed === 'object') {
    if (parsed.error || parsed.detail) return { ok: false, error: String(parsed.error || parsed.detail).slice(0, 200) };
    const out = parsed.text || parsed.transcript || parsed.result;
    if (out) return { ok: true, text: String(out).trim(), segments: normalizeSegments(parsed.segments || null), lang: parsed.language, engine: 'VoiceStudio' };
    return { ok: false, error: '未返回文本' };
  }
  return { ok: true, text: raw, engine: 'VoiceStudio' };
}

/* ---------------- whisper CLI（兜底，且能产带时间戳 srt/json） ---------------- */

export function findWhisperCli() {
  const direct = process.env.WHISPER
    || tryWhich(['mlx_whisper', 'mlx-whisper', 'whisper-cli', 'whisper-cpp', 'whisper']);
  if (direct) return direct;
  // 非交互 shell 的 PATH 通常不含 venv/pipx 的 bin 目录，补查常见落点
  const dirs = [
    process.env.MLX_BIN_DIR,
    '/Users/lv/.workbuddy/binaries/python/envs/default/bin', // 本机 managed venv（依赖文档化）
    path.join(os.homedir(), '.local', 'bin'),                 // pipx / pip --user
    '/opt/homebrew/bin',
  ].filter(Boolean);
  for (const dir of dirs) {
    for (const name of ['mlx_whisper', 'mlx-whisper']) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

async function viaWhisperCli(bin, file, language, outDir) {
  const base = path.join(outDir, path.basename(file).replace(/\.[^.]+$/, ''));
  const name = path.basename(bin);
  // 三家 CLI 参数体系完全不同，按命令名分流
  const argv = /mlx/i.test(name)
    // mlx-whisper：模型用 HuggingFace 仓库名；output-format 部分版本只收单值，只出 json（json 里含 segments+text，足够）
    ? ['--model', process.env.WHISPER_MODEL || 'mlx-community/whisper-large-v3-turbo',
       '--language', language, '--output-dir', outDir, '--output-format', 'json', file]
    : /whisper-cli|whisper-cpp/i.test(name)
    // whisper.cpp：ggml 模型文件
    ? ['-m', process.env.WHISPER_MODEL || 'models/ggml-large-v3.bin',
       '-l', language, '-oj', '-of', base, file]
    // openai-whisper：模型名（tiny/base/small/medium/large-v3…），注意用下划线长选项
    : ['--model', process.env.WHISPER_MODEL || 'medium',
       '--language', language, '--output_format', 'json', '--output_dir', outDir, file];
  const r = await run(bin, argv, { timeout: 1800000 });
  const jsonPath = `${base}.json`;
  let segments = null; let text = null;
  if (fs.existsSync(jsonPath)) {
    try {
      const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      text = (j.text || (j.segments || []).map((s) => s.text).join(' ')).trim();
      segments = normalizeSegments(j.segments || null);
    } catch { /* ignore */ }
  }
  const txtPath = `${base}.txt`;
  if (!text && fs.existsSync(txtPath)) text = fs.readFileSync(txtPath, 'utf8').trim();
  if (!text && r.ok) text = (r.stdout || '').trim();
  if (text) return { ok: true, text, segments, engine: name };
  return { ok: false, error: 'whisper 未产出文本' };
}

/* ---------------- 能力探测 ---------------- */

export async function probeAsr() {
  const voicebox = await voiceboxHealthy();
  const cli = findWhisperCli();
  return {
    voicebox: voicebox ? { url: VOICEBOX_URL, status: String(voicebox.status || 'ok').slice(0, 40) } : null,
    whisperCli: cli,
    ready: !!(voicebox || cli),
  };
}

/* ---------------- 入口 ---------------- */

/**
 * 转写一个音频文件。
 * 默认(auto)：优先选「能产出分句时间戳」的引擎——若装有 whisper CLI 就用它（srt 带逐句时间）；
 * 否则退回 VoiceBox（中文质量最佳，但只回纯文本 → srt 退化为单块时间轴）。
 * 显式 --engine 可强制某一引擎。
 * @returns {{ok:boolean, text?:string, segments?:Array, engine?:string, reason?:string, duration?:number, noSegments?:boolean}}
 */
export async function transcribe(file, { language = 'zh', outDir, engine } = {}) {
  if (!fs.existsSync(file)) return { ok: false, reason: `找不到音频：${file}` };
  const dir = outDir || path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });

  const want = engine || 'auto';
  const reasons = [];

  if (want === 'voicebox') {
    const r = await viaVoiceBox(file, language).catch((e) => ({ ok: false, error: e.message }));
    if (r?.ok) return { ok: true, text: r.text, segments: r.segments, engine: r.engine, duration: r.duration, noSegments: !r.segments };
    return { ok: false, reason: `VoiceBox：${r?.error || '不可用'}` };
  }

  if (want === 'whisper') {
    const cli = findWhisperCli();
    if (!cli) return { ok: false, reason: '未找到 whisper CLI（装 mlx-whisper 中文效果最好）' };
    const t = await viaWhisperCli(cli, file, language, dir).catch((e) => ({ error: e.message }));
    if (t?.ok) return { ok: true, text: t.text, segments: t.segments, engine: t.engine };
    return { ok: false, reason: `whisper：${t?.error || '失败'}` };
  }

  if (want === 'voicestudio') {
    const r = await vsTranscribe(file, language).catch((e) => ({ error: e.message }));
    if (r?.ok) return { ok: true, text: r.text, segments: r.segments, engine: r.engine };
    return { ok: false, reason: `VoiceStudio：${r?.error || '不可用（默认 ASR 多为英文模型，中文不稳）'}` };
  }

  // auto：优先能产出时间戳的 whisper CLI；否则 VoiceBox（纯文本）；再兜底 VoiceStudio
  const cli = findWhisperCli();
  if (cli) {
    const t = await viaWhisperCli(cli, file, language, dir).catch((e) => ({ error: e.message }));
    if (t?.ok) return { ok: true, text: t.text, segments: t.segments, engine: t.engine };
    reasons.push(`${path.basename(cli)}：${t?.error || '失败'}`);
  }
  const r = await viaVoiceBox(file, language).catch((e) => ({ ok: false, error: e.message }));
  if (r?.ok) return { ok: true, text: r.text, segments: r.segments, engine: r.engine, duration: r.duration, noSegments: !r.segments };
  reasons.push(`VoiceBox：${r?.error || '不可用'}`);
  const vs = await vsTranscribe(file, language).catch((e) => ({ error: e.message }));
  if (vs?.ok) return { ok: true, text: vs.text, segments: vs.segments, engine: vs.engine };
  reasons.push(`VoiceStudio：${vs?.error || '不可用'}`);

  return { ok: false, reason: reasons.join('；') || '没有可用的转写引擎' };
}

/* ---------------- 字幕写出 ---------------- */

function fmtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mm = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(mm).padStart(3, '0')}`;
}

function buildSrt(segments, text, duration) {
  if (segments?.length) {
    return segments.map((s, i) => `${i + 1}\n${fmtTime(s.start)} --> ${fmtTime(s.end || s.start + 1)}\n${s.text.trim()}\n`).join('\n') + '\n';
  }
  return `1\n00:00:00,000 --> ${fmtTime(duration || 0)}\n${(text || '').trim()}\n`;
}

function buildVtt(segments, text, duration) {
  const toVtt = (t) => t.replace(',', '.');
  let body;
  if (segments?.length) {
    body = segments.map((s) => `${toVtt(fmtTime(s.start))} --> ${toVtt(fmtTime(s.end || s.start + 1))}\n${s.text.trim()}`).join('\n\n');
  } else {
    body = `00:00:00.000 --> ${toVtt(fmtTime(duration || 0))}\n${(text || '').trim()}`;
  }
  return `WEBVTT\n\n${body}\n`;
}

/**
 * 把转写结果写出为字幕文件。
 * @param {string} text 全文
 * @param {Array} segments [{start,end,text}]
 * @param {object} meta {engine, language, duration}
 * @param {string} outBase 不含扩展名的输出路径
 * @param {string} formats 逗号分隔：srt,vtt,json,txt（默认 srt,json）
 * @returns {string[]} 已写出文件列表
 */
export async function writeSubtitles(text, segments, meta, outBase, formats) {
  const fmts = (formats || 'srt,json').split(',').map((s) => s.trim()).filter(Boolean);
  const written = [];
  const json = { text, segments: segments || [], engine: meta.engine, language: meta.language, duration: meta.duration, subtitleTimed: !!(segments && segments.length) };

  if (fmts.includes('json')) {
    fs.writeFileSync(`${outBase}.json`, JSON.stringify(json, null, 2), 'utf8');
    written.push(`${outBase}.json`);
  }
  if (fmts.includes('txt')) {
    fs.writeFileSync(`${outBase}.txt`, text || '', 'utf8');
    written.push(`${outBase}.txt`);
  }
  if (fmts.includes('srt')) {
    fs.writeFileSync(`${outBase}.srt`, buildSrt(segments, text, meta.duration), 'utf8');
    written.push(`${outBase}.srt`);
  }
  if (fmts.includes('vtt')) {
    fs.writeFileSync(`${outBase}.vtt`, buildVtt(segments, text, meta.duration), 'utf8');
    written.push(`${outBase}.vtt`);
  }
  return written;
}
