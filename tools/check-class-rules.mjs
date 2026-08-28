// 硬性校验 class.json 的业务规则（schema.md / homework.md / media.md）：
//   1. homework_data[].question_type 仅能为 1（有选项的选择题）或 4（其余题）；
//      type=1 必须填写合法 options_json（type=1 文字 / type=2 图片 URL），type=4 的 options_json 必须是 ""
//   2. 班型取舍：两个配星的 courseware.json 都在才上传；data 按 B→A→AA→AAA→S 排序，允许缺口；
//      禁止漏传已配齐的班，禁止写入配不齐的班，禁止把「有文件夹但无 courseware.json」当成有课件
//   3. 图片资源字段留空：feiman_data[].image_url、homework_data[].image_url、week_question_data[].stem_pic 全为 ""
//      题面不得残留 ![说明](本地文件)；源 stem 有图时 question/stem 必须已有 http(s) 图 URL
//   4. 每个班型必须有非空 learning_objective
//   5. begin_guide_data 只允许 tts_text、audio，不得写 main_title、sub_title
//   6. 屏幕公式预览安全：不得出现 "<" 后接字母（空格也不行）、裸区间 "["、裸 "]$"、cases；
//      表格只能是 $$ \begin{array}{|c|...|} \hline ... \end{array} $$，禁止 Markdown/HTML/tabular 表
//   7. 带 --source 时：晋级赛源优先 <课节>-upgrade/*-upgrade.md，无该目录才读旧名 -quiz；
//      配星范围内的题不得漏写，courseware_num 必须与 ## 课件 ID 逐字一致
// 用法: node tools/check-class-rules.mjs <课节编码>/class.json [--source <课件根>]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import {
  leftoverLocalImages,
  httpUrlCount,
  stemImageKeys,
  hasChoiceOptions,
  isHttpUrl,
  isImageOptionContent,
} from './image-refs.mjs';

const ORDER = ['B', 'A', 'AA', 'AAA', 'S'];
const STARS = { B: [2, 3], A: [3, 4], AA: [4, 5], AAA: [5, 6], S: [7, 8] };
const ALLOWED_QUESTION_TYPES = new Set([1, 4]);
const HTML_LT = /<\s*[A-Za-z\\]/;
const CASES_ENV = /\\begin\{cases\}/;
const TABULAR_ENV = /\\begin\{tabular\}/;
const HTML_TABLE = /<table[\s>]/i;
const ARRAY_BEGIN = /\\begin\{array\}/;
const MD_TABLE_LINE = /^\s*\|.+\|.+\|\s*$/;

function stripAllowedBrackets(math) {
  return math
    .replace(/\\left\[/g, '')
    .replace(/\\sqrt\[/g, '')
    .replace(/\\(?:big|Big|bigg|Bigg)l?\[/g, '');
}

function withoutDisplayMath(text) {
  return String(text ?? '').replace(/\$\$[\s\S]*?\$\$/g, '');
}

function tableArrayError(body) {
  const trimmed = String(body ?? '').trim();
  const wrapped = trimmed.match(/^\\begin\{array\}\{(\|c(?:\|c)*\|)\}([\s\S]*)\\end\{array\}$/);
  if (!wrapped) {
    return '表格必须写成 $$\\begin{array}{|c|c|...|c|}...\\end{array}$$：列格式只能是 |c|c|…|c|（两端都有 |，列对齐只用 c），且必须有成对 \\end{array}。';
  }
  const spec = wrapped[1];
  const colCount = spec.slice(1, -1).split('|').filter(Boolean).length;
  const inner = wrapped[2];
  const chunks = inner.split(/\\hline/);
  if (chunks.length < 3 || chunks[0].trim() !== '' || chunks[chunks.length - 1].trim() !== '') {
    return 'array 内必须从 \\hline 起、以 \\hline 收，每行数据后都要 \\\\ 再接 \\hline。';
  }
  const rows = chunks.slice(1, -1);
  if (!rows.length) {
    return 'array 表格至少要有一行数据。';
  }
  for (const [index, rawRow] of rows.entries()) {
    const row = rawRow.trim();
    if (!/\\\\\s*$/.test(row)) {
      return `第 ${index + 1} 行必须以 \\\\ 结尾，再写 \\hline。`;
    }
    const cells = row.replace(/\\\\\s*$/, '').split('&');
    if (cells.length !== colCount) {
      return `第 ${index + 1} 行列数是 ${cells.length}，与列格式 ${spec}（${colCount} 列）不一致。`;
    }
    const withoutText = cells.join('').replace(/\\text\{[^{}]*\}/g, '');
    if (/[\u4e00-\u9fff]/.test(withoutText)) {
      return `第 ${index + 1} 行的汉字必须写在 \\text{…} 里，例如 \\text{视力}、5.0\\text{及以上}。`;
    }
  }
  return null;
}

function scanScreenMath(text, at, errors) {
  if (typeof text !== 'string' || !text) return;
  if (HTML_LT.test(text)) {
    errors.push(
      `${at}: "$...$" 里 "<" 后即使有空格也不能接字母，后台会当成 HTML 标签并把后面的 \\leq / \\frac 剥掉；改成 "$0\\lt m$"、"$g(1)\\lt g(t)$"。`,
    );
  }
  if (CASES_ENV.test(text)) {
    errors.push(`${at}: 禁止 \\begin{cases}，联立拆成「同时满足 $A$ 且 $B$」。`);
  }
  if (TABULAR_ENV.test(text) || HTML_TABLE.test(text)) {
    errors.push(`${at}: 禁止 tabular / HTML table，表格只能写成 $$\\begin{array}{|c|…|}\\hline … \\end{array}$$。`);
  }

  const dollarDollar = [...text.matchAll(/\$\$/g)];
  if (dollarDollar.length % 2 !== 0) {
    errors.push(`${at}: $$ 必须成对，表格整块包在一对 $$…$$ 里。`);
  }

  const displays = [...text.matchAll(new RegExp('\\$\\$([\\s\\S]*?)\\$\\$', 'g'))];
  for (const block of displays) {
    if (ARRAY_BEGIN.test(block[1])) {
      const reason = tableArrayError(block[1]);
      if (reason) errors.push(`${at}: ${reason}`);
    }
  }

  const rest = withoutDisplayMath(text);
  if (ARRAY_BEGIN.test(rest)) {
    errors.push(`${at}: \\begin{array} 必须整块包在 $$…$$ 里，不能写进行内 $...$ 或裸放在正文。`);
  }
  if (rest.split(/\n/).some((line) => MD_TABLE_LINE.test(line))) {
    errors.push(`${at}: 禁止 Markdown 管道表（| a | b |），改写成 $$\\begin{array}{|c|…|}\\hline … \\end{array}$$。`);
  }

  const span = /\$([^$]*)\$/g;
  let match;
  let bareOpen = false;
  let bareClose = false;
  while ((match = span.exec(rest))) {
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

function checkHomeworkOptions(item, at, errors) {
  const type = item?.question_type;
  const raw = item?.options_json;
  const questionHasOptions = hasChoiceOptions(item?.question);

  if (!ALLOWED_QUESTION_TYPES.has(type)) {
    errors.push(
      `${at}: question_type 仅能为 1（单选）或 4（应用题），当前为 ${JSON.stringify(type)}。`,
    );
    return;
  }

  if (type === 4) {
    if (raw !== '') {
      errors.push(
        `${at}: question_type=4 时 options_json 必须是 ""，当前为 ${JSON.stringify(raw)}。`,
      );
    }
    if (questionHasOptions) {
      errors.push(`${at}: 题面有 A/B/C/D 选项，必须设 question_type=1 并填写 options_json。`);
    }
    return;
  }

  if (typeof raw !== 'string' || raw === '') {
    errors.push(`${at}: question_type=1 时 options_json 必须是非空 JSON 字符串。`);
    return;
  }

  let options;
  try {
    options = JSON.parse(raw);
  } catch (error) {
    errors.push(`${at}: options_json 不是合法 JSON：${error.message}。`);
    return;
  }

  if (!Array.isArray(options) || options.length < 2) {
    errors.push(`${at}: options_json 必须是至少 2 项的数组。`);
    return;
  }

  const keys = new Set();
  options.forEach((option, index) => {
    const optAt = `${at}.options_json[${index}]`;
    if (!option || typeof option !== 'object') {
      errors.push(`${optAt}: 必须是对象。`);
      return;
    }
    if (!/^[A-H]$/.test(option.key)) {
      errors.push(`${optAt}: key 必须是 A–H 的单个大写字母，当前为 ${JSON.stringify(option.key)}。`);
    } else if (keys.has(option.key)) {
      errors.push(`${optAt}: key ${option.key} 重复。`);
    } else {
      keys.add(option.key);
    }

    if (typeof option.content !== 'string' || !option.content.trim()) {
      errors.push(`${optAt}: content 必须是非空字符串。`);
      return;
    }

    leftoverLocalImages(option.content).forEach((img) => {
      errors.push(`${optAt}.content: 仍有本地图 ${JSON.stringify(img.src)}，须先上传并把链接写入 content。`);
    });

    if (option.type === 1) {
      if (isImageOptionContent(option.content)) {
        errors.push(`${optAt}: type=1 时 content 必须是文字；选项为图片时应 type=2 并把图片链接写入 content。`);
      }
      scanScreenMath(option.content, `${optAt}.content`, errors);
      return;
    }

    if (option.type === 2) {
      if (!isHttpUrl(option.content.trim())) {
        errors.push(`${optAt}: type=2 时 content 必须是图片 http(s) 链接，当前为 ${JSON.stringify(option.content)}。`);
      }
      return;
    }

    errors.push(`${optAt}: type 必须是 1（文字）或 2（图片链接），当前为 ${JSON.stringify(option.type)}。`);
  });
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

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function listMarkdown(dir, suffix) {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(suffix))
      .map((name) => join(dir, name));
  } catch {
    return [];
  }
}

function resolveUpgradeSources(sourceRoot, lessonCode) {
  const upgradeDir = join(sourceRoot, `${lessonCode}-upgrade`);
  if (isDir(upgradeDir)) {
    return { label: 'upgrade', files: listMarkdown(upgradeDir, '-upgrade.md') };
  }
  const quizDir = join(sourceRoot, `${lessonCode}-quiz`);
  if (isDir(quizDir)) {
    return { label: 'quiz', files: listMarkdown(quizDir, '-quiz.md') };
  }
  return { label: null, files: [] };
}

function parseUpgradeQuestions(files) {
  const questions = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const blocks = text.split(/^# 晋级题\s*$/m).slice(1);
    for (const block of blocks) {
      const starRaw = block.match(/## 星级\s*\r?\n+([^\r\n#]+)/)?.[1] ?? '';
      const star = Number(String(starRaw).match(/(\d+)/)?.[1]);
      const coursewareNum = (block.match(/## 课件 ID\s*\r?\n+([^\r\n#]+)/)?.[1] ?? '').trim();
      if (!star || !coursewareNum) continue;
      questions.push({ star, coursewareNum });
    }
  }
  return questions;
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
      checkHomeworkOptions(item, at, errors);
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

  const upgradeSource = resolveUpgradeSources(sourceRoot, lessonCode);
  const upgradeQuestions = parseUpgradeQuestions(upgradeSource.files);
  if (upgradeSource.label && upgradeSource.files.length === 0) {
    notes.push(
      `${lessonCode}: 找到 ${lessonCode}-${upgradeSource.label}/ 但没有 *-${upgradeSource.label}.md，跳过晋级赛源核对。`,
    );
  } else if (upgradeQuestions.length) {
    payload.data.forEach((lesson, index) => {
      const type = types[index];
      const stars = STARS[type];
      if (!stars) return;
      const lessonNums = new Set(
        (Array.isArray(lesson?.lesson_data) ? lesson.lesson_data : [])
          .map((item) => item?.courseware_num)
          .filter(Boolean),
      );
      const want = [
        ...new Set(
          upgradeQuestions
            .filter((question) => stars.includes(question.star) && lessonNums.has(question.coursewareNum))
            .map((question) => question.coursewareNum),
        ),
      ];
      const week = Array.isArray(lesson?.week_question_data) ? lesson.week_question_data : [];
      const got = week.map((item) => item?.courseware_num);
      const gotSet = new Set(got.filter(Boolean));
      const wantSet = new Set(want);
      if (want.length && gotSet.size === 0) {
        errors.push(
          `${lesson?.number_mark}: 源 ${lessonCode}-${upgradeSource.label} 有配星范围内的晋级题（${want.join('、')}），` +
            `但 week_question_data 为空。晋级赛目录名是 upgrade（旧名 quiz），不得漏写。`,
        );
        return;
      }
      for (const num of wantSet) {
        if (!gotSet.has(num)) {
          errors.push(
            `${lesson?.number_mark}: week_question_data 缺少源 ${upgradeSource.label} Markdown 的 ## 课件 ID ${num}。`,
          );
        }
      }
      got.forEach((num, i) => {
        const at = `${lesson?.number_mark}.week_question_data[${i}].courseware_num`;
        if (!upgradeQuestions.some((question) => question.coursewareNum === num)) {
          errors.push(
            `${at} 必须与 ${upgradeSource.label} Markdown 的 ## 课件 ID 逐字一致，当前为 ${JSON.stringify(num)}。`,
          );
          return;
        }
        if (!wantSet.has(num)) {
          errors.push(`${at} 不在本班配星范围或 lesson_data 中，当前为 ${JSON.stringify(num)}。`);
        }
      });
    });
  }

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
    'learning_objective 齐全、homework question_type 仅为 1/4、type=1 的 options_json 已校验、图片资源字段全为空，源题有图则题面已带 URL。',
);
