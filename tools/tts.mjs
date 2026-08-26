import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { TEST_HOST, TTS_KEY, TTS_PATH, assertOk, postJson } from './api-config.mjs';

export async function synthesizeAudio(text, voiceId) {
  if (!text || !String(text).trim()) {
    throw new Error('TTS 文本不能为空。');
  }

  const body = { key: TTS_KEY, text: String(text) };
  if (voiceId) {
    body.voice_id = voiceId;
  }

  const payload = await postJson(`${TEST_HOST}${TTS_PATH}`, body);
  const data = assertOk(payload, 'TTS');
  const audioUrl = data?.audio_url;
  if (!audioUrl || typeof audioUrl !== 'string') {
    throw new Error('TTS 未返回 audio_url。');
  }
  return audioUrl;
}

const asCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (asCli) {
  const textIndex = process.argv.indexOf('--text');
  const voiceIndex = process.argv.indexOf('--voice');
  const text = textIndex >= 0 ? process.argv[textIndex + 1] : process.argv[2];
  const voiceId = voiceIndex >= 0 ? process.argv[voiceIndex + 1] : undefined;
  try {
    const audioUrl = await synthesizeAudio(text, voiceId);
    console.log(audioUrl);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
