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

每个班只取其自身块中的 `## 题干`、`## 答案`、`## 解析`。块不存在时，该班 `homework_data=[]`，不得从其他班或其他课节借题。不上传的班型（见 [schema.md](schema.md)「班型取舍」）连同它的作业块一起跳过。

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

- `question_type` **恒为 `4`**，没有例外。不再按「单选 / 纯计算填空 / 无选项应用题」分流，也不因题目带选项改写成 `1`，不因题目是纯计算改写成 `3`。判断题型这一步整个取消。
- `options_json` **恒为 `""`**。所有作业题一律按无选项题提交，不再写选项 JSON 字符串。
- 题目带选项时，选项**只留在 `question` 正文里**：`question` 末尾空一行后逐字照抄源文件的 `A．`、`B．`…各行，源文件用全角空格把两个选项排在同一行时拆成一行一个。不得把选项从 `question` 里删掉，也不得因为 `options_json` 留空就丢掉这道题。
- `star` 固定为 B=3、A=4、AA=5、AAA=6、S=8。
- `question_source` 固定 `"AI数学课题库"`。
- `image_url` **恒为 `""`**，即使这道题有图也不填。题干或选项带图时，按 [media.md](media.md)「图片写在题面原位置」把 COS 返回的裸 URL 写进 `question` 的对应位置，资源字段仍留空。
- `question`、`answer`、`analysis` 写入前按 [schema.md](schema.md)「屏幕公式」改写：字母前的 `<` 改成 `\lt`，区间写成 `\left[` / `\right]`，拆掉 `\begin{array}` / `\{` 联立。不得为了保真而把 `$0<m$`、`$0 < m$`、`$[-2,3]$` 原样入库。
- 媒体阶段会为作业引导的 `tts_text` 合成音频。

以上三条（`question_type=4`、`options_json=""`、`image_url=""`）由 `node tools/check-class-rules.mjs <课节编码>/class.json` 硬性校验，不通过不得提交。

## 作业引导

有作业时写 `homework_guide_data`，它是做题前的开始引导，不是答案后的结束语。`tts_text` 用“同学”，不得用“同学们”，并提示先审题、选择方法或列式；它是逐字口播稿，写法按 [voice.md](voice.md)：不逐字读题干，需要提到题目里的量时用名字说，念数写中文读法，禁用阿拉伯数字、算式符号、单位缩写和直角引号「」；`audio` 在文本阶段先写 `""`，媒体阶段写入 TTS 返回的 URL。没有本班作业时写 `homework_guide_data=null`。

本分册只处理 homework Markdown，不从课件或 quiz 补题、补解析或生成选项。
