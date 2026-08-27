import { readdir, stat, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { synthesizeAudio } from './tts.mjs';
import { uploadImageFile } from './upload-image.mjs';
import {
  collectImageKeys,
  fileKey,
  httpUrlCount,
  leftoverLocalImages,
  optionImagesFromStem,
  spliceOptionUrls,
  stemImageKeys,
  toNakedImageText,
} from './image-refs.mjs';

const FEIMAN_STAR = { B: 3, A: 4, AA: 5, AAA: 6, S: 8 };
const DEFAULT_SOURCE = 'C:\\math\\测试用课件';
const SKIP_DIR = /^(runtime|vendor|node_modules|\.git)$/i;
const QUICK_SUBDIRS = ['', 'problem', 'assets', 'images', 'courseware/assets'];

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

async function walkFind(dir, fileName, depth = 0) {
  if (depth > 6) return null;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name === fileName) {
      return join(dir, entry.name);
    }
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP_DIR.test(entry.name)) continue;
    const found = await walkFind(join(dir, entry.name), fileName, depth + 1);
    if (found) return found;
  }
  return null;
}

function lessonSearchRoots(sourceRoot, lessonCode) {
  const roots = [];
  for (const star of [2, 3, 4, 5, 6, 7, 8]) {
    roots.push(join(sourceRoot, `${lessonCode}-${star}star`));
  }
  roots.push(
    join(sourceRoot, `${lessonCode}-homework`),
    join(sourceRoot, `${lessonCode}-quiz`),
    join(sourceRoot, `${lessonCode}-upgrade`),
  );
  return roots;
}

async function findLocalImage(sourceRoot, lessonCode, fileName) {
  const name = fileKey(fileName);
  if (!name) return null;
  if (/^https?:\/\//i.test(fileName)) {
    return fileName.includes('example.com') ? null : fileName;
  }
  const roots = lessonSearchRoots(sourceRoot, lessonCode);
  for (const root of roots) {
    for (const extra of QUICK_SUBDIRS) {
      const candidate = extra ? join(root, extra, name) : join(root, name);
      if (await pathExists(candidate)) return candidate;
    }
  }
  for (const root of roots) {
    const found = await walkFind(root, name);
    if (found) return found;
  }
  return null;
}

async function loadFlow3(sourceRoot, numberMark) {
  const classType = classTypeOf(numberMark);
  const star = FEIMAN_STAR[classType];
  const lessonCode = lessonCodeOf(numberMark);
  if (!star || !lessonCode) return null;
  const coursewarePath = join(sourceRoot, `${lessonCode}-${star}star`, 'courseware.json');
  if (!(await pathExists(coursewarePath))) return null;
  const courseware = JSON.parse(await readFile(coursewarePath, 'utf8'));
  return (courseware.problem_source ?? []).find((item) => item.flow_id === 'flow_3') ?? null;
}

async function uploadLocalImage(localPath, cache) {
  if (!localPath) return '';
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
  if (!key) return '';
  if (!cache.has(key)) {
    cache.set(key, synthesizeAudio(key));
  }
  return cache.get(key);
}

async function uploadKeys(keys, sourceRoot, lessonCode, imageCache, missing, at) {
  const urlByFile = new Map();
  for (const key of keys) {
    if (/^https?:\/\//i.test(key)) {
      if (!key.includes('example.com')) urlByFile.set(fileKey(key), key);
      continue;
    }
    const localPath = await findLocalImage(sourceRoot, lessonCode, key);
    if (!localPath) {
      missing.push(`${at}: 找不到本地题图 ${key}（应在 <星级>/problem/ 或同课节 homework/quiz 目录）`);
      continue;
    }
    const url = await uploadLocalImage(localPath, imageCache);
    if (!url) {
      missing.push(`${at}: 上传失败 ${key}`);
      continue;
    }
    urlByFile.set(key, url);
    urlByFile.set(fileKey(key), url);
  }
  return urlByFile;
}

function unplaced(urlByFile, text) {
  const seen = new Set();
  const missing = [];
  for (const [, url] of urlByFile) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (!String(text ?? '').includes(url)) missing.push(url);
  }
  return missing;
}

async function fillFieldImages({ text, extraKeys = [], extraStem = '', sourceRoot, lessonCode, imageCache, missing, at }) {
  const keys = collectImageKeys(text, extraStem, extraKeys.join('\n'));
  for (const key of extraKeys) {
    if (key && !keys.includes(key)) keys.push(key);
  }
  if (!keys.length) {
    return { text: String(text ?? ''), uploaded: 0 };
  }
  const localKeys = keys.filter((key) => !/^https?:\/\//i.test(key));
  if (localKeys.length && !leftoverLocalImages(text).length && httpUrlCount(text) >= localKeys.length) {
    return { text: String(text ?? ''), uploaded: 0 };
  }
  const urlByFile = await uploadKeys(keys, sourceRoot, lessonCode, imageCache, missing, at);
  const optionImages = optionImagesFromStem(extraStem || text, urlByFile);
  let next = spliceOptionUrls(toNakedImageText(text, urlByFile), optionImages);
  for (const { label, url } of optionImages) {
    if (!url || next.includes(url)) continue;
    next = `${String(next).trimEnd()}\n${label}\n${url}`;
  }
  for (const url of unplaced(urlByFile, next)) {
    missing.push(`${at}: 已上传但未能写入正文 → ${url}`);
  }
  return { text: next, uploaded: urlByFile.size };
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
  const missing = [];

  for (const lesson of payload.data) {
    const mark = lesson.number_mark ?? '<缺少 number_mark>';
    const lessonCode = lessonCodeOf(mark);

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
      item.image_url = '';
      const flow3 = await loadFlow3(sourceRoot, mark);
      const extraKeys = stemImageKeys(flow3);
      const filled = await fillFieldImages({
        text: item.question,
        extraKeys,
        extraStem: flow3?.stem ?? '',
        sourceRoot,
        lessonCode,
        imageCache,
        missing,
        at,
      });
      item.question = filled.text;
      const left = leftoverLocalImages(item.question);
      if (left.length) {
        missing.push(`${at}.question 仍有未替换的本地图：${left.map((img) => img.src).join('、')}`);
      }
      report.push(
        extraKeys.length || filled.uploaded
          ? `${at}.image_url=""，已把 ${extraKeys.length || filled.uploaded} 张题图 URL 写入 question`
          : `${at}.image_url=""（源题无图）`,
      );
    }

    for (const [index, item] of (lesson.week_question_data ?? []).entries()) {
      const at = `${mark}.week_question_data[${index}]`;
      item.stem_pic = '';
      const stemFilled = await fillFieldImages({
        text: item.stem,
        sourceRoot,
        lessonCode,
        imageCache,
        missing,
        at: `${at}.stem`,
      });
      item.stem = stemFilled.text;
      const analysisFilled = await fillFieldImages({
        text: item.analysis,
        sourceRoot,
        lessonCode,
        imageCache,
        missing,
        at: `${at}.analysis`,
      });
      item.analysis = analysisFilled.text;
      report.push(`${at}.stem_pic=""`);
    }

    for (const [index, item] of (lesson.homework_data ?? []).entries()) {
      const at = `${mark}.homework_data[${index}]`;
      item.image_url = '';
      const questionFilled = await fillFieldImages({
        text: item.question,
        sourceRoot,
        lessonCode,
        imageCache,
        missing,
        at: `${at}.question`,
      });
      item.question = questionFilled.text;
      const analysisFilled = await fillFieldImages({
        text: item.analysis,
        sourceRoot,
        lessonCode,
        imageCache,
        missing,
        at: `${at}.analysis`,
      });
      item.analysis = analysisFilled.text;
      report.push(`${at}.image_url=""`);
    }
  }

  if (missing.length) {
    throw new Error(`本地有图但未能写入题面（${missing.length} 项）：\n- ${missing.join('\n- ')}`);
  }

  await writeFile(absolute, `${JSON.stringify(payload, null, 4)}\n`, 'utf8');
  return { report };
}

const { classJsonPath, sourceRoot } = parseArgs(process.argv);
if (!classJsonPath) {
  console.error('用法: node tools/fill-media.mjs <课节编码>/class.json [--source <课件根>]');
  process.exit(2);
}

try {
  const { report } = await fillMedia(classJsonPath, sourceRoot);
  console.log(`已写入媒体 URL: ${resolve(classJsonPath)}`);
  for (const line of report) {
    console.log(`- ${line}`);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
