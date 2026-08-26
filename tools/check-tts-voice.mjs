// 校验 class.json 里三类 tts_text 是否符合 skills/assemble/voice.md 的逐字稿规则。
// 用法: node tools/check-tts-voice.mjs <课节编码>/class.json
import fs from 'node:fs';
import process from 'node:process';

const FIELDS = ['begin_guide_data', 'feiman_guide_data', 'homework_guide_data'];

const RULES = [
  { name: '阿拉伯数字', re: /[0-9０-９]/g, hint: '写成中文读法，如 4.05 → 四点零五' },
  { name: '直角引号「」', re: /[「」『』]/g, hint: '改用弯引号“”或不加引号，单位「1」→ 单位一' },
  { name: '数学符号', re: /[×÷＝=＋－±≈≠<>％%]/g, hint: '写成 乘 / 除以 / 等于 / 加 / 减 / 百分之' },
  { name: 'LaTeX 残留', re: /\\|\$|frac|sqrt|\^|_\{/g, hint: 'tts_text 不能出现公式定界或命令' },
  { name: '单位缩写', re: /\b(cm|mm|dm|km|kg|ml|m²|cm²|km\/h|g)\b/gi, hint: '写成 厘米 / 千米 / 千克 / 毫升 / 平方厘米' },
  { name: '“同学们”', re: /同学们/g, hint: '只称呼“同学”' },
  { name: '换行或 Markdown', re: /[\n\r]|^[-*#]\s|\|/g, hint: '逐字稿是一段连续的话' },
  { name: '空括号或题号标记', re: /（\s*）|\(\s*\)|（　+）/g, hint: '（　　）不读' },
];

function check(file) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const problems = [];
  let checked = 0;
  for (const item of doc.data ?? []) {
    for (const field of FIELDS) {
      const text = item?.[field]?.tts_text;
      if (typeof text !== 'string' || !text) continue;
      checked += 1;
      for (const rule of RULES) {
        const hits = [...text.matchAll(rule.re)].map((m) => m[0]);
        if (hits.length) {
          problems.push({
            where: `${item.number_mark} · ${field}`,
            rule: rule.name,
            hits: [...new Set(hits)].join(' '),
            hint: rule.hint,
          });
        }
      }
    }
  }
  return { checked, problems };
}

const file = process.argv[2];
if (!file) {
  console.error('用法: node tools/check-tts-voice.mjs <课节编码>/class.json');
  process.exit(2);
}

const { checked, problems } = check(file);
if (!problems.length) {
  console.log(`✅ ${checked} 条 tts_text 全部通过逐字稿检查`);
  process.exit(0);
}
console.error(`❌ ${checked} 条 tts_text 中有 ${problems.length} 处不合规：\n`);
for (const p of problems) {
  console.error(`  ${p.where}\n    ${p.rule}: ${p.hits}\n    → ${p.hint}\n`);
}
process.exit(1);
