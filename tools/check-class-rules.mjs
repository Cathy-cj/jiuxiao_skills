// 硬性校验 class.json 的业务规则（schema.md / homework.md / media.md）：
//   1. 所有 homework_data[].question_type 必须是 4，options_json 必须是 ""
//   2. 班型取舍：两个配星的 courseware.json 都在才上传；data 按 B→A→AA→AAA→S 排序，允许缺口；
//      禁止漏传已配齐的班，禁止写入配不齐的班，禁止把「有文件夹但无 courseware.json」当成有课件
//   3. 图片资源字段留空：feiman_data[].image_url、homework_data[].image_url、week_question_data[].stem_pic 全为 ""
//      题面不得残留 ![说明](本地文件)；源 stem 有图时 question/stem 必须已有 http(s) 图 URL
//   4. 每个班型必须有非空 learning_objective
//   5. begin_guide_data 只允许 tts_text、audio，不得写 main_title、sub_title
//   6. 屏幕公式预览安全：不得出现 "<" 后接字母（空格也不行）、裸区间 "["、裸 "]$"、array/cases
// 用法: node tools/check-class-rules.mjs <课节编码>/class.json [--source <课件根>]
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { leftoverLocalImages, httpUrlCount, stemImageKeys } from './image-refs.mjs';

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

function isFile(path) {
  try {
    return statSync(path).isFile();
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

let lastOrder = -1;
types.forEach((type, index) => {
  const orderIndex = ORDER.indexOf(type);
  if (orderIndex < 0) {
    errors.push(
      `data[${index}] (${marks[index] ?? '<缺少 number_mark>'}): 无法识别班型，只允许 B/A/AA/AAA/S。`,
    );
    return;
  }
  if (orderIndex <= lastOrder) {
    errors.push(
      `data[${index}] (${marks[index] ?? '<缺少 number_mark>'}): 班型必须按 B→A→AA→AAA→S 升序且不重复，` +
        `当前落到了已出现或更靠前的班。配不齐的班整段不写，配齐的班按该顺序排列，允许缺口。`,
    );
  }
  lastOrder = orderIndex;
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
      leftoverLocalImages(item?.question).forEach((img) => {
        errors.push(`${at}.question: 仍有本地图 ${JSON.stringify(img.src)}，须先上传并把裸 URL 写进题面。`);
      });
      leftoverLocalImages(item?.analysis).forEach((img) => {
        errors.push(`${at}.analysis: 仍有本地图 ${JSON.stringify(img.src)}，须先上传并把裸 URL 写进解析。`);
      });
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
      leftoverLocalImages(item?.question).forEach((img) => {
        errors.push(`${at}.question: 仍有本地图 ${JSON.stringify(img.src)}，须先上传并把裸 URL 写进题面。`);
      });
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
      leftoverLocalImages(item?.stem).forEach((img) => {
        errors.push(`${at}.stem: 仍有本地图 ${JSON.stringify(img.src)}，须先上传并把裸 URL 写进题面。`);
      });
      leftoverLocalImages(item?.analysis).forEach((img) => {
        errors.push(`${at}.analysis: 仍有本地图 ${JSON.stringify(img.src)}，须先上传并把裸 URL 写进解析。`);
      });
    });
  }
});

// ---- 附带：example.com ----
if (JSON.stringify(payload).includes('example.com')) {
  errors.push('全文出现 example.com，媒体 URL 必须是接口返回的真实地址。');
}

// ---- 规则 2 的目录侧校验（可选）----
if (sourceRoot) {
  const starReady = (star) =>
    isFile(join(sourceRoot, `${lessonCode}-${star}star`, 'courseware.json'));
  const missingFiles = (stars) =>
    stars.filter((star) => !starReady(star)).map((star) => `${lessonCode}-${star}star/courseware.json`);

  const readyTypes = ORDER.filter((type) => STARS[type].every((star) => starReady(star)));
  const gotTypes = types.filter(Boolean);
  if (JSON.stringify(gotTypes) !== JSON.stringify(readyTypes)) {
    errors.push(
      `${lessonCode}: 按磁盘 courseware.json 应上传 ${readyTypes.length ? readyTypes.join('→') : '（无配齐班型）'}，` +
        `实际为 ${gotTypes.length ? gotTypes.join('→') : '（空）'}。` +
        '配齐的班必须全部写入，配不齐的班不得出现，不得为缺失星级编造课件。',
    );
  }

  payload.data.forEach((lesson, index) => {
    const type = types[index];
    const stars = STARS[type];
    if (!stars) return;
    const missing = missingFiles(stars);
    if (missing.length) {
      errors.push(
        `${lesson?.number_mark}: 已上传该班型，但缺少 ${missing.join('、')}。不得编造缺失的 courseware.json。`,
      );
    }
    const feimanStar = { B: 3, A: 4, AA: 5, AAA: 6, S: 8 }[type];
    if (feimanStar) {
      const coursewarePath = join(sourceRoot, `${lessonCode}-${feimanStar}star`, 'courseware.json');
      try {
        const courseware = JSON.parse(readFileSync(coursewarePath, 'utf8'));
        const flow3 = (courseware.problem_source ?? []).find((item) => item.flow_id === 'flow_3');
        const keys = stemImageKeys(flow3);
        if (keys.length) {
          const questions = Array.isArray(lesson?.feiman_data) ? lesson.feiman_data : [];
          if (!questions.length) {
            errors.push(
              `${lesson?.number_mark}: 费曼源 ${lessonCode}-${feimanStar}star 的 flow_3 有 ${keys.length} 张题图，但 feiman_data 为空。`,
            );
          }
          questions.forEach((item, i) => {
            const have = httpUrlCount(item?.question);
            if (have < keys.length) {
              errors.push(
                `${lesson?.number_mark}.feiman_data[${i}].question: 源题有 ${keys.length} 张图（${keys.join('、')}），` +
                  `题面里只找到 ${have} 个 http(s) URL，本地有图必须写进 question。`,
              );
            }
          });
        }
      } catch {
        // 配星文件存在性已在上面检查；这里读不到 courseware.json 时不重复报。
      }
    }
  });

  for (const type of ORDER) {
    if (readyTypes.includes(type)) continue;
    const missing = missingFiles(STARS[type]);
    notes.push(`${type} 已丢弃：缺 ${missing.join('、')}。`);
  }
} else {
  notes.push('未传 --source，跳过星级 courseware.json 存在性核对（只校验了班型排序与每班 lesson_data 配星形状）。');
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
    'learning_objective 齐全、question_type 全为 4、options_json 全为空、图片资源字段全为空，源题有图则题面已带 URL。',
);
