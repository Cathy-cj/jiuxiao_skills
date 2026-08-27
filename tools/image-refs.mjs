// 题面里的 Markdown 图与本地文件名，供 fill-media / check-class-rules 共用。

export const MD_IMAGE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const HTTP_URL = /^https?:\/\//i;
const OPTION_LINE = /^([A-Ha-hＡ-Ｈ])\s*[.．、]\s*(.*)$/;

export function isHttpUrl(src) {
  return HTTP_URL.test(String(src ?? '').trim()) && !String(src).includes('example.com');
}

export function fileKey(src) {
  return String(src ?? '')
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .pop();
}

export function extractMarkdownImages(text) {
  const out = [];
  if (typeof text !== 'string' || !text) return out;
  const re = new RegExp(MD_IMAGE.source, 'g');
  let match;
  while ((match = re.exec(text))) {
    out.push({ raw: match[0], alt: match[1], src: match[2].trim() });
  }
  return out;
}

export function leftoverLocalImages(text) {
  return extractMarkdownImages(text).filter((img) => !isHttpUrl(img.src));
}

export function httpUrlCount(text) {
  return [...String(text ?? '').matchAll(/https?:\/\/[^\s)]+/gi)].length;
}

export function stemImageKeys(flow3) {
  const stem = flow3?.stem ?? '';
  const keys = [];
  for (const img of extractMarkdownImages(stem)) {
    const key = fileKey(img.src);
    if (key && !keys.includes(key)) keys.push(key);
  }
  for (const img of flow3?.images ?? []) {
    const key = fileKey(img?.url ?? '');
    if (key && stem.includes(key) && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

export function collectImageKeys(...texts) {
  const keys = [];
  for (const text of texts) {
    for (const img of extractMarkdownImages(text)) {
      const key = fileKey(img.src);
      if (key && !keys.includes(key)) keys.push(key);
    }
    for (const match of String(text ?? '').matchAll(/\b([\w./-]+\.(?:png|jpe?g|gif|webp|svg))\b/gi)) {
      const key = fileKey(match[1]);
      if (key && !isHttpUrl(match[1]) && !keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

export function toNakedImageText(text, urlByFile) {
  let out = String(text ?? '');
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (raw, _alt, src) => {
    const srcTrim = String(src).trim();
    const key = fileKey(srcTrim);
    if (urlByFile.has(key)) return urlByFile.get(key);
    if (isHttpUrl(srcTrim)) return srcTrim;
    return raw;
  });
  for (const [key, url] of urlByFile) {
    if (!key || !url || !out.includes(key) || out.includes(url)) continue;
    out = out.split(key).join(url);
  }
  return out;
}

function optionLabel(letter) {
  return `${String(letter).replace(/[Ａ-Ｈ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff21 + 65),
  ).toUpperCase()}．`;
}

export function optionImagesFromStem(stem, urlByFile) {
  const result = [];
  let current = null;
  for (const line of String(stem ?? '').split(/\n/)) {
    const match = line.match(OPTION_LINE);
    if (match) {
      current = optionLabel(match[1]);
      const key = fileKey(extractMarkdownImages(line)[0]?.src ?? '');
      if (key && urlByFile.get(key)) {
        result.push({ label: current, url: urlByFile.get(key) });
        current = null;
      }
      continue;
    }
    if (!current) continue;
    const key = fileKey(extractMarkdownImages(line)[0]?.src ?? '');
    if (key && urlByFile.get(key)) {
      result.push({ label: current, url: urlByFile.get(key) });
      current = null;
    }
  }
  return result;
}

export function spliceOptionUrls(question, optionImages) {
  if (!optionImages.length) return String(question ?? '');
  const lines = String(question ?? '').split('\n');
  for (const { label, url } of optionImages) {
    if (!url || lines.join('\n').includes(url)) continue;
    const idx = lines.findIndex((line) => {
      const t = line.trim();
      return t === label || t === label.replace('．', '.') || (/^[A-H]\s*[.．、]\s*$/.test(t) && optionLabel(t[0]) === label);
    });
    if (idx < 0) continue;
    const next = lines[idx + 1]?.trim() ?? '';
    if (!next || leftoverLocalImages(next).length || /^[A-H]\s*[.．、]/.test(next)) {
      lines.splice(idx + 1, 0, url);
    } else {
      lines[idx] = `${label}${url}`;
    }
  }
  return lines.join('\n');
}
