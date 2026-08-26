# 从 quiz Markdown 生成晋级赛

## 读取和切块

只读取当前课节 `<课节编码>-quiz/` 下的 `*-quiz.md`。每道题按以下连续块解析：

```text
# 晋级题
## 星级
## 课件 ID
## 题目类型
## 题目
## 答案
## 解析
```

`## 课件 ID` 是晋级赛的 `courseware_num` 真源。不得以父目录编码和星级重新拼接，也不得改正或替换 Markdown 中的值。

## 映射

| Body 字段 | Markdown 来源或固定规则 |
| --- | --- |
| `courseware_num` | `## 课件 ID` 原文，去除首尾空白后保持一致 |
| `question_point` | `## 题目类型` |
| `stem` | `## 题目` |
| `standard_answer` | `## 答案` |
| `analysis` | `## 解析` |
| `stem_pic` | 恒为 `""`，任何情况下都不填图；图片按 [media.md](media.md)「图片写在题面原位置」写进 `stem` 正文 |

`standard_answer` 必须写入；即使 `class示例.json` 漏了这个键，字段表仍将其定义为必填。

`stem`、`analysis` 写入前按 [schema.md](schema.md)「屏幕公式」改写：字母前的 `<` 改成 `\lt`，区间写成 `\left[` / `\right]`，拆掉 `\begin{array}` / `\{` 联立。`## 课件 ID` 仍逐字照抄，不得改。

题目带图时，`stem_pic` 仍留空，只把裸 URL 写进 `stem` 正文中图片原本出现的位置，规则见 [media.md](media.md)。`stem_pic` 为空由 `node tools/check-class-rules.mjs` 硬性校验。

## 班型筛选与校验

- B 只收 2、3 星；A 只收 3、4 星；AA 只收 4、5 星；AAA 只收 5、6 星；S 只收 7、8 星。
- 按 [schema.md](schema.md)「班型取舍」被整体丢弃的班型不写晋级赛，它名下的晋级题一并丢弃并在交付摘要里点名。
- 先按星级筛选，再验证该题的 `courseware_num` 与 Markdown 的 `## 课件 ID` 原文一致，并能在同一班对象的 `lesson_data` 找到。
- 不在配星范围、缺少对应星级目录、或 `lesson_data` 无同名课件的题目都丢弃。
- 交付时逐条列明被丢弃的题目、星级和原因；不改写题目以凑齐晋级赛。

本分册只读取 quiz Markdown，绝不从 `courseware.json`、作业 Markdown 或课件运行时补充晋级题内容。
