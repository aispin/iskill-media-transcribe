// 能力体检：把「这台机器现在能做到哪一步」讲清楚
import { findYtDlp, findFfmpeg } from './audio.mjs';
import { probeAsr, findWhisperCli } from './asr.mjs';

export function probeCapabilities() {
  const ytdlp = findYtDlp();
  let ytdlpVersion = null;
  if (ytdlp) {
    try { ytdlpVersion = require('node:child_process').execFileSync(ytdlp, ['--version'], { encoding: 'utf8' }).trim(); } catch { /* ignore */ }
  }
  return {
    ytdlp,
    ytdlpVersion,
    ffmpeg: findFfmpeg(),
    whisperCli: findWhisperCli(),
  };
}

/** 打印友好体检报告，返回是否全部就绪 */
export async function capsReport() {
  const cap = probeCapabilities();
  const asr = await probeAsr();
  const lines = [];
  lines.push('=== iskill-media-transcribe 能力体检 ===');
  lines.push(`yt-dlp      : ${cap.ytdlp ? '✓ ' + (cap.ytdlpVersion || cap.ytdlp) : '✗ 未安装（URL 下载需要）'}`);
  lines.push(`ffmpeg      : ${cap.ffmpeg ? '✓ ' + cap.ffmpeg : '✗ 未安装（抽音轨/规整需要）'}`);
  lines.push(`VoiceBox    : ${asr.voicebox ? '✓ ' + asr.voicebox.url + ' (' + asr.voicebox.status + ')' : '✗ 未运行（主转写引擎，中文最佳）'}`);
  lines.push(`whisper CLI : ${cap.whisperCli ? '✓ ' + cap.whisperCli + '（auto 默认：产出带逐句时间戳 srt）' : '· 未安装（装 mlx-whisper 可获精确逐句时间戳 srt）'}`);
  const ready = !!(cap.ytdlp && cap.ffmpeg && asr.ready);
  lines.push('');
  lines.push(ready ? '结论：核心链路可用（下载+抽音轨+转写齐备）。' : '结论：缺依赖，见上方 ✗ 项，按 README 安装后再用。');
  return lines.join('\n');
}
