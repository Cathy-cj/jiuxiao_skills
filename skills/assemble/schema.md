# Body 形状与字段规则

本分册只定义请求 Body 的允许形状。字段表是业务真源，`class示例.json` 只用于确认嵌套和键顺序。

## 权威顺序

发生冲突时，按此顺序决定：

1. `c:\math\class\README.md` 的 Body 字段表：键名、类型、必填和空值；
2. 同一 README 的请求 Body `//` 注释：不填、必须填和配星；
3. 本 Skills 的明确业务规则。它覆盖 README 的四处：费曼 `answer` 为课件讲法的因果复述加按星 `#` 挖空（覆盖“在题干中挖空”）、`homework_data.question_type` 恒为 `4`（覆盖按题型分流）、图片资源字段恒为 `""`（覆盖“把图 URL 填进 image_url / stem_pic”）、屏幕公式须改写成后台 Markdown 预览可渲染的写法（覆盖“解析照抄源 Markdown”）；
4. `c:\math\class\class示例.json`：键集合的嵌套形状及键顺序。它是按本 SOP 现行规则实产的 `W1-L5L6-1`（只有 B、A、AA 三个班型，每个班型都有 `learning_objective`，`question_type` 全为 `4`、`options_json` 全为空、图片资源字段全为空、费曼 `answer` 用 `#` 挖空、媒体 URL 为真实地址），形状和取值都可参照，但**内容不得照抄进任何课节产物**；
5. 禁止照抄 README“完整调用示例”：开场误用“同学们”，字段集合也可能过时。`learning_objective` 以本分册和 `class示例.json` 的 B 班句式为准，内容必须按 [courseware.md](courseware.md) 从该班 `courseware.json` 生成。

## 顶层与班型

顶层键依序为：

```json
{
  "key": "auth_****key",
  "data": [],
  "is_release": false
}
```

`data` 按 B、A、AA、AAA、S 的顺序排列，具体上传几个班由下面的「班型取舍」决定。每个对象的键顺序为：

```text
number_mark
learning_objective
core_method
begin_guide_data
lesson_data
week_question_data
feiman_data
feiman_guide_data
homework_data
homework_guide_data
```

每个上传的班型都必须有非空的 `learning_objective`，紧挨 `number_mark` 之后。句式参照 `class示例.json` 的 B 班，内容按 [courseware.md](courseware.md) 从该班两份 `courseware.json` 生成，不得留空、不得五班共用一句。不得写 `title`、`grade`、`level_code`、`exam_weight`、`main_title`、`sub_title` 或任何字段表未定义的键。

## 班型配星

| 班型 | `lesson_data` 配星 | 费曼练习星级 | 作业星级 |
| --- | --- | --- | --- |
| B | 2、3 | 3 | 3 |
| A | 3、4 | 4 | 4 |
| AA | 4、5 | 5 | 5 |
| AAA | 5、6 | 6 | 6 |
| S | 7、8 | 8 | 8 |

## 班型取舍

一个班型的两个配星课件**必须齐全**才上传：AAA 需要 `<课节编码>-5star` 和 `-6star` 同时存在，S 需要 `-7star` 和 `-8star` 同时存在，缺任意一个，该班型**整体不写进 `data`**——不是写成空 `lesson_data`，是连这个对象一起不出现。

- 常见情形：手上没有 6、7、8 星课件时，只上传 B、A、AA 三个班型，`data` 就是 3 项。
- `data` 里的班型必须是 `B → A → AA → AAA → S` 的**连续前缀**，合法组合只有 `[B]`、`[B,A]`、`[B,A,AA]`、`[B,A,AA,AAA]`、`[B,A,AA,AAA,S]`。中间挖空（例如上了 B、A、S 而没有 AA）一律不合法；出现这种星级缺失时，从缺口往后的班型全部丢弃。
- 写进 `data` 的班型，其 `lesson_data` 必须**恰好**是它的两个配星课件，不多不少，按星级升序。既不允许只放一个，也不允许放配星表以外的星级。
- 被丢弃的班型要在交付摘要里逐条点名：班型、缺哪个星级目录。不得为了凑满五班伪造 `lesson_data`、借用其他星级或其他课节的课件。

该规则由 `node tools/check-class-rules.mjs <课节编码>/class.json [--source <课件根>]` 硬性校验：不带 `--source` 校验 `data` 的前缀顺序与配星齐全；带 `--source` 时还会核对被丢弃的班型确实缺目录、且没有把配星齐全的班型漏掉。

## 子对象形状

- `begin_guide_data`：仅 `tts_text`、`audio`。不写 `main_title`、`sub_title`。
- `lesson_data[]`：`courseware_num`
- `week_question_data[]`：`courseware_num`、`question_point`、`stem`、`stem_pic`、`standard_answer`、`analysis`
- `feiman_data[]`：仅 `question`、`answer`、`image_url`。`image_desc` 虽在字段表出现，但本产物应与示例的费曼项键集合对齐，故不写。
- `feiman_guide_data`：`tts_text`、`audio`
- `homework_data[]`：`question`、`answer`、`analysis`、`image_url`、`question_type`、`star`、`question_source`、`options_json`
- `homework_guide_data`：`tts_text`、`audio`

## 固定值、空值与资源

- `number_mark`：写进 `data` 的班型各写 `<课节编码>-B`、`-A`、`-AA`、`-AAA`、`-S`；
- `is_release` 始终为 `false`；
- `homework_data[].question_type` **恒为 `4`**，不按题型分流；`options_json` **恒为 `""`**，带选项的题把选项留在 `question` 正文里，详见 [homework.md](homework.md)；
- **图片资源字段恒为 `""`**：`feiman_data[].image_url`、`homework_data[].image_url`、`week_question_data[].stem_pic` 一律留空，图片只以裸 URL 写在 `question` / `stem` 正文中它原本出现的位置，详见 [media.md](media.md)；
- 无数据数组写 `[]`；无数据对象写 `null`；无音频写 `""`；
- 有 `tts_text` 时，`audio` 必须写成 TTS 返回的 URL，禁止 `example.com`；
- 所有 `tts_text` 按 [voice.md](voice.md) 写成可直接朗读的中文逐字稿；题干、答案、解析、费曼 `answer` 是屏幕文本，不受口播限制，但必须按下节改写成预览安全公式；
- 费曼 `answer` 的挖空用成对 `#`，空缺数随费曼练习星级（2–3 星 1 处、4–5 星 2 处、6–8 星 3 处），并写成「因为…所以…；又因为…所以…」；`$` 在该字段专作 LaTeX 定界符，数学公式一律写成 `$5+10=15$`，公式挖空写成 `#$5+10=15$#`，详见 [feiman.md](feiman.md)。

## 屏幕公式（后台 Markdown 预览）

管理后台的题干/解析预览先走 Markdown 和 HTML，再渲染 `$...$`。源课件里的联立 `array`、`<` 后接字母、裸写 `$[-2,3]$` 会被当成标签或链接，预览里出现 `forall`、`frac12`、`leq`、红字 `\[-2,3\]`、整段解析被吃掉。入库前必须改写，**数学含义不变**。该规则覆盖“解析照抄源 Markdown”，由 `check-class-rules.mjs` 硬性校验。

适用字段：`week_question_data` 的 `stem` / `analysis` / `standard_answer`、`homework_data` 的 `question` / `answer` / `analysis`、`feiman_data` 的 `question` / `answer`。

- **比较符用 `\lt`，不要写 `<` 再接字母**：`$0<m$`、`$0 < m$`、`$g(1) < g(t)$` 一律改成 `$0\lt m$`、`$g(1)\lt g(t)$`。空格救不了：`<` 后即使隔开仍是字母时，后台会当成未闭合 HTML 标签，后面的 `\leq`、`\frac`、`\left` 会被剥掉。`<` 后是数字（`$m < 0$`）一般能过，但比较对象是字母时必须 `\lt`。
- **区间方括号必须 `\left[` / `\right]`**：禁止 `$[-2,3]$`、`$m\in [0,12]$`、`$[0,+\infty )$`。Markdown 会把 `[…]` 当成链接，变成 `\[-2,3\]`，KaTeX 再把 `\[` `\]` 当成行间公式，中间标红。写成 `$\left[-2,3\right]$`、`$m\in \left[0,12\right]$`。半开区间不要以裸 `]$` 收尾，写成 `$\left(-1,\frac{5}{4}\right]$` 或 `$\left(-1,\frac{5}{4}\right\rbrack$`。`$\sqrt[3]{8}$` 这类命令可选参数里的 `[` 可以保留。
- **禁止行内 `$...$` 包裹 `\begin{array}`、`\begin{cases}`、`\{` 联立**。拆成「同时满足 $m>0$ 且 $\Delta={m}^{2}-12m\leq 0$」。
- JSON 文件里反斜杠按标准转义（磁盘上看到 `\\geq` 是对的）；解析后的字符串只能有一个 `\`。不要再手写一层 `\\forall`。
- 改写只动公式标记和联立排版，不得改得数、选项或推理结论。
