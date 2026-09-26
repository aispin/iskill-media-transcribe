#!/usr/bin/env node
// iskill-media-transcribe CLI
//
// 把「一个视频/音频」变成三件套（视输入而定）：
//   - 视频 URL / 本地视频 → mp4（规整） + mp3（音轨） + srt（字幕） + json（结构化转写）
//   - 本地音频           →        mp3（规整） + srt（字幕） + json（结构化转写）
//
// 命令：
//   one <url|本地路径>          端到端：取片→抽音→转写
//   batch --list urls.txt       批量（每行一个 url 或本地路径）
//   batch --dir ./videos        批量处理目录下所有音视频文件
//   download <url>              仅取片（视频 URL → mp4）
//   audio <mp4|路径>            仅抽音轨/规整（→ mp3）
//   transcribe <mp3>            仅转写（→ srt + json）
//   caps                        引擎体检
//
// 选项：
//   --out <dir>                 输出目录（默认 ./out）
//   --cookies <file>            netscape cookie 文件（需登录的站点，如视频号）
//   --cookies-from-browser <b>  chrome|firefox|... 临时取 cookie
//   --weixin                    视频号专用：用元宝(tencent.com)会话 cookie（一等公民）
//   --lang <code>               转写语言（默认 zh）
//   --formats <csv>             字幕格式（默认 srt,json；可 srt,vtt,json,txt）
//   --engine <name>             auto|voicebox|whisper|voicestudio
//   --retries <n>               下载重试（默认 8）
//   --spacing <ms>              批量条目间错峰（默认 3000）
//   --force                     重处理已有产物
import fs from 'node:fs';
import path from 'node:path';
import { downloadUrl, normalizeVideo } from './lib/download.mjs';
import { extractAudio, normalizeAudio, inputKind } from './lib/audio.mjs';
import { transcribe, writeSubtitles } from './lib/asr.mjs';
import { capsReport } from './lib/caps.mjs';

function parseArgs(argv) {
  const opts = { out: './out', lang: 'zh', formats: 'srt,json', retries: 8, spacing: 3000, force: false };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--cookies') opts.cookiesFile = argv[++i];
    else if (a === '--cookies-from-browser') opts.cookiesFromBrowser = argv[++i];
    else if (a === '--weixin') opts.weixin = true;
    else if (a === '--lang') opts.lang = argv[++i];
    else if (a === '--formats') opts.formats = argv[++i];
    else if (a === '--engine') opts.engine = argv[++i];
    else if (a === '--retries') opts.retries = Number(argv[++i]) || 8;
    else if (a === '--spacing') opts.spacing = Number(argv[++i]) || 3000;
    else if (a === '--force') opts.force = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else pos.push(a);
  }
  return { opts, pos };
}

const exists = (f) => fs.existsSync(f);
const need = (f, force) => force || !exists(f);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 端到端处理一个输入（url / 本地视频 / 本地音频） */
async function processOne(input, opts) {
  const kind = inputKind(input);
  const outDir = path.resolve(opts.out);
  fs.mkdirSync(outDir, { recursive: true });

  let base;
  let mp4 = null;

  if (kind === 'url') {
    const dl = await downloadUrl(input, outDir, opts);
    if (!dl.ok) return { ok: false, reason: dl.reason };
    base = dl.id;
    mp4 = dl.file;
  } else if (kind === 'video') {
    if (!exists(input)) return { ok: false, reason: `找不到本地视频：${input}` };
    base = path.basename(input).replace(/\.[^.]+$/, '');
    const target = path.join(outDir, `${base}.mp4`);
    if (need(target, opts.force)) {
      const r = await normalizeVideo(input, target, opts);
      if (!r.ok) return { ok: false, reason: r.reason };
    }
    mp4 = target;
  } else if (kind === 'audio') {
    if (!exists(input)) return { ok: false, reason: `找不到本地音频：${input}` };
    base = path.basename(input).replace(/\.[^.]+$/, '');
  } else {
    return { ok: false, reason: `无法识别输入类型（需 http(s) 链接、或本地音视频文件）：${input}` };
  }

  // 阶段②：→ mp3
  const mp3 = path.join(outDir, `${base}.mp3`);
  if (need(mp3, opts.force)) {
    const r = mp4
      ? await extractAudio(mp4, mp3, opts)
      : await normalizeAudio(input, mp3, opts);
    if (!r.ok) return { ok: false, reason: `抽音轨失败：${r.reason}` };
  }

  // 阶段③：→ srt + json
  const srt = path.join(outDir, `${base}.srt`);
  const json = path.join(outDir, `${base}.json`);
  const wantTranscribe = opts.formats.split(',').some((f) => ['srt', 'json', 'vtt', 'txt'].includes(f.trim()))
    && (need(srt, opts.force) || need(json, opts.force));
  const files = [mp4, mp3].filter(Boolean);
  if (wantTranscribe) {
    const t = await transcribe(mp3, { language: opts.lang, outDir, engine: opts.engine });
    if (!t.ok) return { ok: false, reason: `转写失败：${t.reason}`, files };
    const written = await writeSubtitles(t.text, t.segments, { engine: t.engine, language: opts.lang, duration: t.duration }, path.join(outDir, base), opts.formats);
    files.push(...written);
    if (t.noSegments && opts.formats.split(',').some((f) => ['srt', 'vtt'].includes(f.trim()))) {
      files.note = '⚠️ 当前引擎只回纯文本，srt 为单块时间轴（无逐句时间戳）。装 whisper CLI(mlx-whisper) 可获精确逐句时间戳。';
    }
  }

  return { ok: true, base, files: files.filter(Boolean) };
}

async function runBatch(opts) {
  let inputs = [];
  if (opts.list) {
    if (!exists(opts.list)) return console.error(`找不到列表文件：${opts.list}`);
    inputs = fs.readFileSync(opts.list, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } else if (opts.dir) {
    if (!exists(opts.dir)) return console.error(`找不到目录：${opts.dir}`);
    inputs = fs.readdirSync(opts.dir)
      .map((f) => path.join(opts.dir, f))
      .filter((p) => { const k = inputKind(p); return k === 'video' || k === 'audio'; });
  } else {
    return console.error('batch 需要 --list <file> 或 --dir <dir>');
  }
  console.log(`批量处理 ${inputs.length} 个输入 → ${path.resolve(opts.out)}`);
  let ok = 0;
  for (let i = 0; i < inputs.length; i++) {
    if (i > 0) await sleep(opts.spacing);
    const r = await processOne(inputs[i], opts);
    if (r.ok) { ok++; console.log(`  [${i + 1}/${inputs.length}] ok ${r.base} -> ${r.files.join(', ')}`); }
    else console.log(`  [${i + 1}/${inputs.length}] FAIL ${inputs[i]} -> ${r.reason}`);
  }
  console.log(`完成：${ok}/${inputs.length} 成功`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { opts, pos } = parseArgs(rest);

  if (!cmd || opts.help) {
    console.log(`Usage: node ${path.basename(process.argv[1])} <command> [args] [options]\n`);
    console.log('Commands: one <url|path> | batch --list <file> | batch --dir <dir> | download <url> | audio <file> | transcribe <mp3> | caps');
    console.log('Options: --out ./out  --cookies <file>  --cookies-from-browser <b>  --weixin  --lang zh  --formats srt,json  --engine auto  --retries 8  --spacing 3000  --force');
    return;
  }

  if (cmd === 'caps') {
    console.log(await capsReport());
    return;
  }

  if (cmd === 'one') {
    if (!pos[0]) return console.error('one requires an input (url or local path)');
    const r = await processOne(pos[0], opts);
    if (r.ok) { console.log(`ok ${r.base}\n  ${r.files.join('\n  ')}`); if (r.files.note) console.log('  ' + r.files.note); }
    else { console.error(`FAIL ${r.reason}`); if (r.files?.length) console.error('  partial: ' + r.files.join(', ')); process.exitCode = 1; }
    return;
  }

  if (cmd === 'batch') {
    await runBatch(opts);
    return;
  }

  if (cmd === 'download') {
    if (!pos[0]) return console.error('download requires url');
    const r = await downloadUrl(pos[0], path.resolve(opts.out), opts);
    if (r.ok) console.log(`ok ${r.file}`);
    else { console.error(`FAIL ${r.reason}`); process.exitCode = 1; }
    return;
  }

  if (cmd === 'audio') {
    if (!pos[0]) return console.error('audio requires input file');
    const kind = inputKind(pos[0]);
    const outDir = path.resolve(opts.out);
    fs.mkdirSync(outDir, { recursive: true });
    const base = path.basename(pos[0]).replace(/\.[^.]+$/, '');
    const mp3 = path.join(outDir, `${base}.mp3`);
    const r = (kind === 'audio')
      ? await normalizeAudio(pos[0], mp3, opts)
      : await extractAudio(pos[0], mp3, opts);
    if (r.ok) console.log(`ok ${r.file}`);
    else { console.error(`FAIL ${r.reason}`); process.exitCode = 1; }
    return;
  }

  if (cmd === 'transcribe') {
    if (!pos[0]) return console.error('transcribe requires mp3 file');
    const outDir = path.dirname(path.resolve(pos[0]));
    const base = path.join(outDir, path.basename(pos[0]).replace(/\.[^.]+$/, ''));
    const t = await transcribe(pos[0], { language: opts.lang, outDir, engine: opts.engine });
    if (!t.ok) { console.error(`FAIL ${t.reason}`); process.exitCode = 1; return; }
    const written = await writeSubtitles(t.text, t.segments, { engine: t.engine, language: opts.lang, duration: t.duration }, base, opts.formats);
    console.log(`ok engine=${t.engine}\n  ${written.join('\n  ')}`);
    if (t.noSegments && opts.formats.split(',').some((f) => ['srt', 'vtt'].includes(f.trim()))) {
      console.log('  ⚠️ 当前引擎只回纯文本，srt 为单块时间轴（无逐句时间戳）。装 whisper CLI(mlx-whisper) 可获精确逐句时间戳。');
    }
    return;
  }

  console.error(`unknown command: ${cmd}`);
  process.exitCode = 1;
}

main().catch((e) => { console.error('FATAL:', e); process.exitCode = 1; });
