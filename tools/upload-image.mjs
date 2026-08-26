import { readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  BUCKET_TYPE,
  IMAGE_KEY,
  IMAGE_PATH_PREFIX,
  SIGNATURE_PATHS,
  TEST_HOST,
  assertOk,
  postJson,
} from './api-config.mjs';

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

export async function getUploadSignature({ name, ext, path = IMAGE_PATH_PREFIX }) {
  let lastError;
  for (const pathname of SIGNATURE_PATHS) {
    try {
      const payload = await postJson(`${TEST_HOST}${pathname}`, {
        key: IMAGE_KEY,
        name,
        ext,
        path,
        bucket_type: BUCKET_TYPE,
      });
      return assertOk(payload, '获取上传签名');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('获取上传签名失败。');
}

export async function uploadImageFile(filePath) {
  const absolute = resolve(filePath);
  const ext = extname(absolute).slice(1).toLowerCase();
  if (!ext) {
    throw new Error(`无法识别后缀: ${filePath}`);
  }

  const name = basename(absolute, extname(absolute));
  const signature = await getUploadSignature({ name, ext });
  const fileBody = await readFile(absolute);
  const putUrl = `${signature.cos_host.replace(/\/$/, '')}/${signature.cos_key.replace(/^\//, '')}`;
  const putResponse = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      Authorization: signature.authorization,
      'x-cos-security-token': signature.security_token,
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
    },
    body: fileBody,
  });

  if (!putResponse.ok) {
    const detail = await putResponse.text();
    throw new Error(`COS 上传失败 HTTP ${putResponse.status}: ${detail.slice(0, 400)}`);
  }

  if (!signature.url) {
    throw new Error('签名接口未返回 url。');
  }
  return signature.url;
}

const asCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (asCli) {
  const fileIndex = process.argv.indexOf('--file');
  const filePath = fileIndex >= 0 ? process.argv[fileIndex + 1] : process.argv[2];
  if (!filePath) {
    console.error('用法: node tools/upload-image.mjs --file <本地图片>');
    process.exit(2);
  }
  try {
    const url = await uploadImageFile(filePath);
    console.log(url);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
