export const TEST_HOST = 'https://test-jx-admin-api.zmexing.com';

export const TTS_PATH = '/v1/aimathclass/external/lesson/tts';

export const SIGNATURE_PATHS = [
  '/v1/aigc/tob/getUploadSignature',
  '/aigc/tob/getUploadSignature',
];

export const IMAGE_KEY =
  process.env.CLASS_IMAGE_KEY ??
  '71de69fc17eaaf8e6e686aba7dbf7058c9114388ec99a21ec50a29021562b8cb';

export const TTS_KEY = process.env.CLASS_TTS_KEY ?? IMAGE_KEY;

export const BUCKET_TYPE = 5;
export const IMAGE_PATH_PREFIX = 'aigc/tob/image/';

export async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`接口未返回 JSON（HTTP ${response.status}）: ${raw.slice(0, 300)}`);
  }
  return payload;
}

export function assertOk(payload, label) {
  if (!payload || payload.code !== 200) {
    const message = payload?.message ?? '未知错误';
    throw new Error(`${label} 失败: code=${payload?.code ?? '无'} ${message}`);
  }
  return payload.data;
}
