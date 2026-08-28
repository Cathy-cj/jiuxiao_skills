# 从 homework Markdown 生成课后作业

## 读取和切块

只读取当前课节 `<课节编码>-homework/` 下的 `*-homework.md`。按一级标题切为：

```text
# B-作业题
# A-作业题
# AA-作业题
# AAA-作业题
# S-作业题
```

每个班只取其自身块中的 `## 题干`、`## 答案`、`## 解析`。块不存在时，该班 `homework_data=[]`，不得从其他班或其他课节借题。不上传的班型（见 [schema.md](schema.md)「班型取舍」）连同它的作业块一起跳过。已经配齐并写进 `data` 的班，即使前面有缺口，也仍写它自己的作业块。

## 作业项

```json
{
  "question": "<题干>",
  "answer": "<答案>",
  "analysis": "<解析>",
  "image_url": "",
  "question_type": 4,
  "star": 3,
  "question_source": "AI数学课题库",
  "options_json": ""
}
```

- `question_type` **仅能为 `1` 或 `4`**：`1` 单选，`4` 应用题。禁止写 `2`、`3`、`5` 或其他值。
- **有选项就是选择题，`question_type` 必须为 `1`。** 源文件出现 `A．` / `B．` / `C．` / `D．`（或 `A.`、`A、`）选项行，包括多选、判断、计算选结果，一律按单选提交。源文件用全角空格把两个选项排在同一行时，拆成一行一个再写入 `options_json`。
- **除选择题外所有题 `question_type` 都为 `4`**：填空、解答、应用、纯计算、无选项的证明或作图，一律 `4`。
- `options_json` **仅在 `question_type=1` 时填值**，必须是选项数组的 JSON 字符串。`question_type=4` 时必须是 `""`，不得写 `[]` 或 `"null"`。
- `options_json` 每一项为 `{"key":"A","content":"…","type":1}`：
  - `key` 为 `A`、`B`、`C`、`D`…，与源选项标号一致，至少两项且不重复。
  - `type` 为 `1` 时，`content` 必须是文字（可含 `$...$`），不得放图片链接或 `![说明](文件)`。
  - `type` 为 `2` 时，`content` 必须是图片 http(s) 链接。选择题的选项是图时，把图片链接放到 `content`，不要只把图留在 `question` 里。
  - 文本阶段选项图仍写 `![说明](本地文件)`，媒体阶段由 `fill-media.mjs` 上传后把该项改成 `type=2` 且 `content` 为裸 URL。
- 选择题的选项写入 `options_json`，`question` 只保留题干（可保留「（ ）」），不要再把 `A．`、`B．`…选项行抄进 `question`。
- `star` 固定为 B=3、A=4、AA=5、AAA=6、S=8。
- `question_source` 固定 `"AI数学课题库"`。
- `image_url` **恒为 `""`**，即使这道题有图也不填。源 Markdown 题干或解析里的 `![说明](本地文件)` 必须原样保留进 `question` / `analysis`，媒体阶段再按 [media.md](media.md) 上传并换成裸 URL。不得因为还不是 http URL 就删图。
- `question`、`answer`、`analysis` 写入前按 [schema.md](schema.md)「屏幕公式」改写：字母前的 `<` 改成 `\lt`，区间写成 `\left[` / `\right]`，联立拆掉 `\begin{cases}` / `\{`，表格改写成规定的 `$$\begin{array}{|c|…|}\hline … \end{array}$$`。不得为了保真而把 `$0<m$`、`$0 < m$`、`$[-2,3]$` 或 Markdown 管道表原样入库。
- 媒体阶段会为作业引导的 `tts_text` 合成音频。

`question_type`（仅 `1`/`4`）、`question_type=1` 时的 `options_json`（合法 JSON、每项 `key`/`content`/`type`，`type=1` 为文字、`type=2` 为图片链接）以及 `image_url=""` 由 `node tools/check-class-rules.mjs <课节编码>/class.json` 硬性校验，不通过不得提交。

## 作业引导

有作业时写 `homework_guide_data`，它是做题前的开始引导，不是答案后的结束语。`tts_text` 用“同学”，不得用“同学们”，并提示先审题、选择方法或列式；它是逐字口播稿，写法按 [voice.md](voice.md)：不逐字读题干，需要提到题目里的量时用名字说，念数写中文读法，禁用阿拉伯数字、算式符号、单位缩写和直角引号「」；`audio` 在文本阶段先写 `""`，媒体阶段写入 TTS 返回的 URL。没有本班作业时写 `homework_guide_data=null`。

本分册只处理 homework Markdown，不从课件或 quiz 补题、补解析或生成选项。
