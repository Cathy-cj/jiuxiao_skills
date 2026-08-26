// 硬性校验 class.json 的业务规则（schema.md / homework.md / media.md）：
//   1. 所有 homework_data[].question_type 必须是 4，options_json 必须是 ""
//   2. 班型取舍：配星齐全才上传，且 data 必须是 B→A→AA→AAA→S 的连续前缀
//   3. 图片资源字段留空：feiman_data[].image_url、homework_data[].image_url、week_question_data[].stem_pic 全为 ""
//   4. 每个班型必须有非空 learning_objective
//   5. begin_guide_data 只允许 tts_text、audio，不得写 main_title、sub_title
//   6. 屏幕公式预览安全：不得出现 "<" 后接字母（空格也不行）、裸区间 "["、裸 "]$"、array/cases
// 用法: node tools/check-class-rules.mjs <课节编码>/class.json [--source <课件根>]
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

const ORDER = ['B', 'A', 'AA', 'AAA', 'S'];
const STARS = { B: [2, 3], A: [3, 4], AA: [4, 5], AAA: [5, 6], S: [7, 8] };
const REQUIRED_QUESTION_TYPE = 4;
const HTML_LT = /<\s*[A-Za-z\\]/;
const ARRAY_ENV = /\\begin\{(array|cases)\}/;

function stripAllowedBrackets(math) {
  return math
    .replace(/\\left\[/g, '')
    .replace(/\\sqrt\[/g, '')
    .replace(/\\(?:big|Big|bigg|Bigg)l?\[/g, '');
}

function scanScreenMath(text, at, errors) {
  if (typeof text !== 'string' || !text) return;
  if (HTML_LT.test(text)) {
    errors.push(
      `${at}: "$...$" 里 "<" 后即使有空格也不能接字母，后台会当成 HTML 标签并把后面的 \\leq / \\frac 剥掉；改成 "$0\\lt m$"、"$g(1)\\lt g(t)$"。`,
    );
  }
  if (ARRAY_ENV.test(text)) {
    errors.push(`${at}: 禁止 \\begin{array} / \\begin{cases}，拆成「同时满足 $A$ 且 $B$」。`);
  }
  const span = /\$([^$]*)\$/g;
  let match;
  let bareOpen = false;
  let bareClose = false;
  while ((match = span.exec(text))) {
    const math = match[1];
    if (stripAllowedBrackets(math).includes('[')) bareOpen = true;
    if (/\]$/.test(math) && !/\\right\]$/.test(math) && !/\\rbrack$/.test(math)) {
      bareClose = true;
    }
  }
  if (bareOpen) {
    errors.push(
      `${at}: 区间 "[" 必须写成 \\left[...\\right]，禁止 "$[-2,3]$"、"$m\\in [0,12]$"（Markdown 会变成红字 \\[...\\]）。`,
    );
  }
  if (bareClose) {
    errors.push(
      `${at}: 半开区间不要以裸 "]$" 收尾，写成 $\\left(-1,\\frac{5}{4}\\right]$ 或 $\\left(-1,\\frac{5}{4}\\right\\rbrack$。`,
    );
  }
}

function parseArgs(argv) {
  const rest = argv.slice(2);
  const sourceIndex = rest.indexOf('--source');
  const sourceRoot = sourceIndex >= 0 ? rest[sourceIndex + 1] : null;
  const file = rest.find((item, index) => !item.startsWith('--') && rest[index - 1] !== '--source');
  return { file, sourceRoot };
}

function classTypeOf(numberMark) {
  return String(numberMark ?? '').match(/-(AAA|AA|A|B|S)$/)?.[1] ?? null;
}

function lessonCodeOf(numberMark) {
  return String(numberMark ?? '').replace(/-(AAA|AA|A|B|S)$/, '');
}

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

const { file, sourceRoot } = parseArgs(process.argv);
if (!file) {
  console.error('用法: node tools/check-class-rules.mjs <课节编码>/class.json [--source <课件根>]');
  process.exit(2);
}

let payload;
try {
  payload = JSON.parse(readFileSync(resolve(file), 'utf8'));
} catch (error) {
  console.error(`无法读取或解析 ${file}: ${error.message}`);
  process.exit(2);
}

const errors = [];
const notes = [];

// ---- 顶层 ----
if (!Array.isArray(payload.data) || payload.data.length === 0) {
  console.error('class.json 的 data 必须是非空数组。');
  process.exit(2);
}
if (payload.is_release !== false) {
  errors.push(`顶层: is_release 必须是 false，当前为 ${JSON.stringify(payload.is_release)}。`);
}
if (typeof payload.key !== 'string' || !payload.key) {
  errors.push('顶层: key 必须是非空字符串。');
}

// ---- 规则 2：班型取舍 ----
const marks = payload.data.map((item) => item?.number_mark);
const types = marks.map(classTypeOf);
const expected = ORDER.slice(0, payload.data.length);

types.forEach((type, index) => {
  if (type !== expected[index]) {
    errors.push(
      `data[${index}] (${marks[index] ?? '<缺少 number_mark>'}): 班型应为 ${expected[index]}，` +
        `实为 ${type ?? '<无法识别>'}。data 必须是 B→A→AA→AAA→S 的连续前缀，不得中间挖空。`,
    );
  }
});

const codes = new Set(marks.map(lessonCodeOf).filter(Boolean));
if (codes.size > 1) {
  errors.push(`课节编码不一致：${[...codes].join('、')}。一份 class.json 只能是一个课节。`);
}
const lessonCode = [...codes][0] ?? '';

payload.data.forEach((lesson, index) => {
  const mark = lesson?.number_mark ?? `<data[${index}] 缺少 number_mark>`;
  const type = types[index];
  const wantStars = STARS[type];
  if (typeof lesson?.learning_objective !== 'string' || !lesson.learning_objective.trim()) {
    errors.push(`${mark}: learning_objective 必须是非空字符串，每个班型都要写。`);
  }
  const beginGuide = lesson?.begin_guide_data;
  if (beginGuide && typeof beginGuide === 'object') {
    for (const forbidden of ['main_title', 'sub_title']) {
      if (Object.hasOwn(beginGuide, forbidden)) {
        errors.push(`${mark}: begin_guide_data 不得写 ${forbidden}，只保留 tts_text 与 audio。`);
      }
    }
  }
  if (!wantStars) return;

  const lessonData = lesson?.lesson_data;
  if (!Array.isArray(lessonData)) {
    errors.push(`${mark}: lesson_data 必须是数组。`);
    return;
  }
  const want = wantStars.map((star) => `${lessonCodeOf(mark)}-${star}star`);
  const got = lessonData.map((item) => item?.courseware_num);
  if (got.length !== want.length || got.some((value, i) => value !== want[i])) {
    errors.push(
      `${mark}: lesson_data 必须恰好是配星齐全的两条 ${want.join('、')}（按星级升序），` +
        `当前为 ${got.length ? got.join('、') : '空'}。配星不齐的班型整体不上传。`,
    );
  }
});

// ---- 规则 1 与 3：逐题字段 ----
payload.data.forEach((lesson, index) => {
  const mark = lesson?.number_mark ?? `<data[${index}]>`;

  const homework = lesson?.homework_data;
  if (!Array.isArray(homework)) {
    errors.push(`${mark}: homework_data 必须是数组，无数据写 []。`);
  } else {
    homework.forEach((item, i) => {
      const at = `${mark}.homework_data[${i}]`;
      if (item?.question_type !== REQUIRED_QUESTION_TYPE) {
        errors.push(`${at}: question_type 必须是 ${REQUIRED_QUESTION_TYPE}，当前为 ${JSON.stringify(item?.question_type)}。`);
      }
      if (item?.options_json !== '') {
        errors.push(`${at}: options_json 必须是 ""，选项只留在 question 正文里，当前为 ${JSON.stringify(item?.options_json)}。`);
      }
      if (item?.image_url !== '') {
        errors.push(`${at}: image_url 必须是 ""，图片只以裸 URL 写进 question 正文原位置，当前为 ${JSON.stringify(item?.image_url)}。`);
      }
      scanScreenMath(item?.question, `${at}.question`, errors);
      scanScreenMath(item?.answer, `${at}.answer`, errors);
      scanScreenMath(item?.analysis, `${at}.analysis`, errors);
    });
  }

  const feiman = lesson?.feiman_data;
  if (!Array.isArray(feiman)) {
    errors.push(`${mark}: feiman_data 必须是数组，无数据写 []。`);
  } else {
    feiman.forEach((item, i) => {
      const at = `${mark}.feiman_data[${i}]`;
      if (item?.image_url !== '') {
        errors.push(
          `${at}: image_url 必须是 ""，图片只以裸 URL 写进 question 正文原位置，` +
            `当前为 ${JSON.stringify(item?.image_url)}。`,
        );
      }
      scanScreenMath(item?.question, `${at}.question`, errors);
      scanScreenMath(item?.answer, `${at}.answer`, errors);
    });
  }

  const week = lesson?.week_question_data;
  if (!Array.isArray(week)) {
    errors.push(`${mark}: week_question_data 必须是数组，无数据写 []。`);
  } else {
    week.forEach((item, i) => {
      const at = `${mark}.week_question_data[${i}]`;
      if (item?.stem_pic !== '') {
        errors.push(
          `${at}: stem_pic 必须是 ""，图片只以裸 URL 写进 stem 正文原位置，` +
            `当前为 ${JSON.stringify(item?.stem_pic)}。`,
        );
      }
      scanScreenMath(item?.stem, `${at}.stem`, errors);
      scanScreenMath(item?.analysis, `${at}.analysis`, errors);
      scanScreenMath(item?.standard_answer, `${at}.standard_answer`, errors);
    });
  }
});

// ---- 附带：example.com ----
if (JSON.stringify(payload).includes('example.com')) {
  errors.push('全文出现 example.com，媒体 URL 必须是接口返回的真实地址。');
}

// ---- 规则 2 的目录侧校验（可选）----
if (sourceRoot) {
  const starExists = (star) => isDir(join(sourceRoot, `${lessonCode}-${star}star`));

  payload.data.forEach((lesson, index) => {
    const type = types[index];
    const stars = STARS[type];
    if (!stars) return;
    const missing = stars.filter((star) => !starExists(star));
    if (missing.length) {
      errors.push(
        `${lesson?.number_mark}: 已上传该班型，但配星目录缺失 ${missing.map((s) => `${lessonCode}-${s}star`).join('、')}。`,
      );
    }
  });

  const nextType = ORDER[payload.data.length];
  if (nextType) {
    const stars = STARS[nextType];
    const missing = stars.filter((star) => !starExists(star));
    if (missing.length === 0) {
      errors.push(
        `${lessonCode}-${nextType}: 配星目录 ${stars.map((s) => `${lessonCode}-${s}star`).join('、')} 都存在，` +
          '配星齐全的班型不得漏传。',
      );
    } else {
      notes.push(
        `${nextType} 及其后的班型已丢弃：缺 ${missing.map((s) => `${lessonCode}-${s}star`).join('、')}。`,
      );
    }
  }
  for (const type of ORDER.slice(payload.data.length + 1)) {
    const stars = STARS[type];
    const missing = stars.filter((star) => !starExists(star));
    notes.push(
      missing.length
        ? `${type} 已丢弃：缺 ${missing.map((s) => `${lessonCode}-${s}star`).join('、')}。`
        : `${type} 已丢弃：配星齐全，但按连续前缀规则随前一个缺口一并丢弃。`,
    );
  }
} else {
  notes.push('未传 --source，跳过星级目录存在性核对（只校验了 data 内部的前缀顺序与配星齐全）。');
}

for (const note of notes) {
  console.log(`· ${note}`);
}

if (errors.length > 0) {
  console.error(`\n❌ class.json 硬性规则检查失败（${errors.length} 项）：`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `\n✅ 硬性规则检查通过：${payload.data.length} 个班型（${types.join('→')}），` +
    'learning_objective 齐全、question_type 全为 4、options_json 全为空、图片资源字段全为空。',
);
