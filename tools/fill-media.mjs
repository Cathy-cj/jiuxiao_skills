import { stat, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { synthesizeAudio } from './tts.mjs';
import { uploadImageFile } from './upload-image.mjs';

const FEIMAN_STAR = { B: 3, A: 4, AA: 5, AAA: 6, S: 8 };
const DEFAULT_SOURCE = 'C:\\math\\测试用课件';

function parseArgs(argv) {
  const sourceIndex = argv.indexOf('--source');
  const classJsonPath = argv.find((item, index) => index >= 2 && !item.startsWith('--') && argv[index - 1] !== '--source');
  return {
    classJsonPath,
    sourceRoot: sourceIndex >= 0 ? argv[sourceIndex + 1] : DEFAULT_SOURCE,
  };
}

function classTypeOf(numberMark) {
  const match = String(numberMark ?? '').match(/-(B|A|AA|AAA|S)$/);
  return match?.[1] ?? null;
}

function lessonCodeOf(numberMark) {
  return String(numberMark ?? '').replace(/-(B|A|AA|AAA|S)$/, '');
}

async function pathExists(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

async function findLocalImage(sourceRoot, lessonCode, star, fileName) {
  if (!fileName || /^https?:\/\//i.test(fileName)) {
    return /^https?:\/\//i.test(fileName) ? fileName : null;
  }
  const starDir = join(sourceRoot, `${lessonCode}-${star}star`);
  const candidates = [
    join(starDir, fileName),
    join(starDir, 'assets', fileName),
    join(starDir, 'courseware', 'assets', fileName),
    join(starDir, 'images', fileName),
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function feimanSourceImage(sourceRoot, numberMark) {
  const classType = classTypeOf(numberMark);
  const star = FEIMAN_STAR[classType];
  const lessonCode = lessonCodeOf(numberMark);
  if (!star || !lessonCode) {
    return null;
  }
  const coursewarePath = join(sourceRoot, `${lessonCode}-${star}star`, 'courseware.json');
  if (!(await pathExists(coursewarePath))) {
    return null;
  }
  const courseware = JSON.parse(await readFile(coursewarePath, 'utf8'));
  const flow3 = (courseware.problem_source ?? []).find((item) => item.flow_id === 'flow_3');
  const fileName = flow3?.images?.[0]?.url;
  return findLocalImage(sourceRoot, lessonCode, star, fileName);
}

// media.md：图片资源字段一律留空，返回的 URL 只由人工写进题面正文原位置。
// 这里只负责把本地题图传上 COS，并把 URL 交回调用方去打印。
async function uploadLocalImage(localPath, cache) {
  if (!localPath) {
    return '';
  }
  if (/^https?:\/\//i.test(localPath)) {
    return localPath.includes('example.com') ? '' : localPath;
  }
  if (!cache.has(localPath)) {
    cache.set(localPath, uploadImageFile(localPath));
  }
  return cache.get(localPath);
}

async function resolveAudioUrl(text, cache) {
  const key = String(text ?? '').trim();
  if (!key) {
    return '';
  }
  if (!cache.has(key)) {
    cache.set(key, synthesizeAudio(key));
  }
  return cache.get(key);
}

async function fillMedia(classJsonPath, sourceRoot) {
  const absolute = resolve(classJsonPath);
  const payload = JSON.parse(await readFile(absolute, 'utf8'));
  if (!Array.isArray(payload.data)) {
    throw new Error('class.json 的 data 必须是数组。');
  }

  const audioCache = new Map();
  const imageCache = new Map();
  const report = [];
  const pending = [];

  for (const lesson of payload.data) {
    const mark = lesson.number_mark ?? '<缺少 number_mark>';

    if (lesson.begin_guide_data?.tts_text) {
      lesson.begin_guide_data.audio = await resolveAudioUrl(lesson.begin_guide_data.tts_text, audioCache);
      report.push(`${mark}.begin_guide_data.audio`);
    }
    if (lesson.feiman_guide_data?.tts_text) {
      lesson.feiman_guide_data.audio = await resolveAudioUrl(lesson.feiman_guide_data.tts_text, audioCache);
      report.push(`${mark}.feiman_guide_data.audio`);
    }
    if (lesson.homework_guide_data?.tts_text) {
      lesson.homework_guide_data.audio = await resolveAudioUrl(lesson.homework_guide_data.tts_text, audioCache);
      report.push(`${mark}.homework_guide_data.audio`);
    }

    for (const [index, item] of (lesson.feiman_data ?? []).entries()) {
      const at = `${mark}.feiman_data[${index}]`;
      const carried = typeof item.image_url === 'string' ? item.image_url : '';
      item.image_url = '';
      const localPath = await feimanSourceImage(sourceRoot, mark);
      const uploaded = await uploadLocalImage(localPath, imageCache);
      const url =
        uploaded || (/^https?:\/\//i.test(carried) && !carried.includes('example.com') ? carried : '');
      if (!url) {
        report.push(`${at}.image_url=""（无可上传题图）`);
      } else if (String(item.question ?? '').includes(url)) {
        report.push(`${at}.image_url=""，题图 URL 已在 question 正文中：${url}`);
      } else {
        pending.push(`${at}: 需写入正文 → ${url}`);
        report.push(`${at}.image_url=""，题图 URL 待写入 question 正文：${url}`);
      }
    }
    for (const [index, item] of (lesson.week_question_data ?? []).entries()) {
      const at = `${mark}.week_question_data[${index}]`;
      const carried = typeof item.stem_pic === 'string' ? item.stem_pic : '';
      item.stem_pic = '';
      if (/^https?:\/\//i.test(carried) && !carried.includes('example.com') && !String(item.stem ?? '').includes(carried)) {
        pending.push(`${at}: 需写入正文 → ${carried}`);
      }
      report.push(`${at}.stem_pic=""`);
    }
    for (const [index, item] of (lesson.homework_data ?? []).entries()) {
      const at = `${mark}.homework_data[${index}]`;
      const carried = typeof item.image_url === 'string' ? item.image_url : '';
      item.image_url = '';
      if (/^https?:\/\//i.test(carried) && !carried.includes('example.com') && !String(item.question ?? '').includes(carried)) {
        pending.push(`${at}: 需写入正文 → ${carried}`);
      }
      report.push(`${at}.image_url=""`);
    }
  }

  await writeFile(absolute, `${JSON.stringify(payload, null, 4)}\n`, 'utf8');
  return { report, pending };
}

const { classJsonPath, sourceRoot } = parseArgs(process.argv);
if (!classJsonPath) {
  console.error('用法: node tools/fill-media.mjs <课节编码>/class.json [--source <课件根>]');
  process.exit(2);
}

try {
  const { report, pending } = await fillMedia(classJsonPath, sourceRoot);
  console.log(`已写入媒体 URL: ${resolve(classJsonPath)}`);
  for (const line of report) {
    console.log(`- ${line}`);
  }
  if (pending.length) {
    console.log('\n以下图片 URL 需按 media.md「图片写在题面原位置」手工写进 question / stem 正文：');
    for (const line of pending) {
      console.log(`- ${line}`);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
