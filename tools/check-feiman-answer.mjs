import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const [classJsonPath] = process.argv.slice(2);

if (!classJsonPath) {
  console.error('用法: node tools/check-feiman-answer.mjs <课节编码>/class.json');
  process.exit(2);
}

let payload;
try {
  payload = JSON.parse(await readFile(resolve(classJsonPath), 'utf8'));
} catch (error) {
  console.error(`无法读取或解析 ${classJsonPath}: ${error.message}`);
  process.exit(2);
}

if (!Array.isArray(payload.data)) {
  console.error('class.json 的 data 必须是数组。');
  process.exit(2);
}

// feiman.md：answer 是课件讲法的因果复述稿。
// 挖空标记是成对的单个 #；数学公式一律写成 LaTeX $...$，公式挖空写成 #$...$#。
// 空缺数随费曼练习星级：2–3 星 1 处，4–5 星 2 处，6–8 星 3 处。
const BLANK_MARK = '#';
const MAX_CHARS = 500;
const FEIMAN_STAR = { B: 3, A: 4, AA: 5, AAA: 6, S: 8 };
const FORBIDDEN_TEMPLATES = ['上述条件和推理都成立', '由此可以确定本题的结果是'];
const FORBIDDEN_PRONOUNS = /我|你|我们|你们|他们|同学|请你/;
const BARE_OPERATOR = /[×÷＝＋－±≈≠≤≥]|(?<![a-zA-Z])=(?!=)/;

function classTypeOf(numberMark) {
  return String(numberMark ?? '').match(/-(AAA|AA|A|B|S)$/)?.[1] ?? null;
}

function expectedBlankCount(star) {
  return star <= 3 ? 1 : star <= 5 ? 2 : 3;
}

function countableLength(text) {
  const withoutMath = text.replace(/\$([^$]*)\$/g, (_, body) =>
    body.replace(/\\[a-zA-Z]+\s?/g, '').replace(/[{}]/g, ''),
  );
  return [...withoutMath].length;
}

function proseOnly(text) {
  return text.replace(/\$[^$]*\$/g, '');
}

const errors = [];
let checked = 0;

for (const lesson of payload.data) {
  const numberMark = lesson?.number_mark ?? '<缺少 number_mark>';
  const feimanData = lesson?.feiman_data;
  const classType = classTypeOf(numberMark);
  const star = FEIMAN_STAR[classType];
  const wantBlanks = star ? expectedBlankCount(star) : null;

  if (!Array.isArray(feimanData)) {
    errors.push(`${numberMark}: feiman_data 必须是数组。`);
    continue;
  }

  for (const [index, item] of feimanData.entries()) {
    checked += 1;
    const location = `${numberMark}.feiman_data[${index}]`;
    const { question, answer } = item ?? {};

    if (typeof question !== 'string' || typeof answer !== 'string' || !question.trim() || !answer.trim()) {
      errors.push(`${location}: question 和 answer 都必须是非空字符串。`);
      continue;
    }

    if (answer.includes('##')) {
      errors.push(`${location}: 检测到 ##。挖空标记是成对的单个 #，公式挖空写成 #$5+10=15$#。`);
      continue;
    }

    const dollarCount = [...answer].filter((char) => char === '$').length;
    if (dollarCount % 2 !== 0) {
      errors.push(`${location}: LaTeX 定界符 $ 必须成对，当前共 ${dollarCount} 个。`);
      continue;
    }

    let inMath = false;
    let straddles = false;
    for (const char of answer) {
      if (char === '$') inMath = !inMath;
      else if (char === '#' && inMath) straddles = true;
    }
    if (straddles) {
      errors.push(`${location}: 挖空标记 # 落在 $...$ 内部，公式被切断；公式挖空要整条包住，写成 #$5+10=15$#。`);
      continue;
    }

    const segments = answer.split(BLANK_MARK);
    const markCount = segments.length - 1;

    if (markCount % 2 !== 0) {
      errors.push(`${location}: 挖空标记 # 必须成对，当前共 ${markCount} 个。`);
      continue;
    }

    const blanks = segments.filter((_, i) => i % 2 === 1);
    if (wantBlanks != null && blanks.length !== wantBlanks) {
      errors.push(
        `${location}: ${classType} 班费曼为 ${star} 星，挖空应为 ${wantBlanks} 处，当前 ${blanks.length} 处。`,
      );
    }
    if (blanks.some((blank) => blank.trim() === '')) {
      errors.push(`${location}: 每对 # 之间必须有内容，存在空挖空。`);
    }
    if (!/(因为[^；。]*#[\s\S]*?#|所以[^；。]*#[\s\S]*?#)/.test(answer)) {
      errors.push(`${location}: 挖空必须落在「因为」或「所以」所在的分句里。`);
    }
    if (!answer.includes('又因为')) {
      errors.push(`${location}: 必须保留「又因为…所以…」的连续因果链。`);
    }

    const stripped = segments.join('');
    const charCount = countableLength(stripped);
    const prose = proseOnly(stripped);

    if (stripped === question) {
      errors.push(`${location}: answer 去掉 # 后与 question 相同；answer 必须是课件讲法的缩略复述，不是题干挖空版。`);
    }
    if (charCount > MAX_CHARS) {
      errors.push(`${location}: 去掉 # 与 LaTeX 定界后不得超过 ${MAX_CHARS} 字，当前 ${charCount} 字。`);
    }
    if (stripped.includes('____')) {
      errors.push(`${location}: 不得使用 ____ 作为挖空，只能用成对 #。`);
    }
    if (prose.includes('\\')) {
      errors.push(`${location}: 公式外出现反斜杠；LaTeX 命令必须写在 $...$ 里。`);
    }
    if (BARE_OPERATOR.test(prose)) {
      const hit = prose.match(BARE_OPERATOR)?.[0];
      errors.push(`${location}: 运算符「${hit}」出现在 $...$ 之外；数学公式一律写成 LaTeX，如 $5+10=15$。`);
    }
    if (/[∵∴]/.test(answer)) {
      errors.push(`${location}: 禁止使用 ∵、∴，因果关系写成「因为……所以……」。`);
    }
    if (FORBIDDEN_PRONOUNS.test(stripped)) {
      const hit = stripped.match(FORBIDDEN_PRONOUNS)?.[0];
      errors.push(`${location}: answer 是客观步骤句，不应含「${hit}」等人称或直接称呼。`);
    }
    for (const template of FORBIDDEN_TEMPLATES) {
      if (stripped.includes(template)) {
        errors.push(`${location}: 不得使用套话「${template}」。`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`费曼 answer 检查失败（${errors.length} 项）：`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`费曼 answer 检查通过：${checked} 条。`);
