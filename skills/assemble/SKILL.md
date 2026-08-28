---
name: assemble-class-json
description: Assembles one lesson folder into a five-level class.json Body when courseware, quiz, and homework source files are available.
---

# Assemble：课节 class.json 入口

## 职责

从一个扁平课节目录组装一份请求 Body：顶层 `key`、按 B→A→AA→AAA→S 排序的 `data` 项和 `is_release=false`。`data` 里放几个班型由 [schema.md](schema.md)「班型取舍」决定：两个配星的 `courseware.json` 都在的班才上传，彼此独立，允许缺口；**禁止**为缺失星级新建 `courseware.json` 或伪造课件内容。默认写出位置为 `c:\math\class\<课节编码>\class.json`。

## 输入

- 一个课节编码及 `C:\math\测试用课件\` 下与它同前缀的星级、quiz、homework 文件夹；
- `c:\math\class\README.md` 的字段表和 Body `//` 注释；
- `c:\math\class\class示例.json` 的键形状和键顺序；
- 本目录指定的分册。

## 输出

- 一份顶层 `key="auth_****key"`、`is_release=false` 的 `class.json`；
- `data` 只含配星齐全的班型，按 B→A→AA→AAA→S 排序（允许缺口），`number_mark` 为 `<课节编码>-B/-A/-AA/-AAA/-S`；
- 交付摘要，列明整体丢弃的班型及其缺失星级、丢弃的晋级题和原因。

## 禁止项

- 不处理多个课节，不把其他课节的 `class.json` 当范例；
- 文本组装阶段不调接口；媒体阶段只按 [media.md](media.md) 调用 TTS 与 COS 上传，禁止写 `example.com`；课节批量新增接口只在用户明确要求提交时按 [submit.md](submit.md) 调用，组装本身绝不触发；
- 不写字段表中没有的键，不写注释标为“不填”的 `title`、`grade`、`level_code`、`exam_weight`，也不写 `main_title`、`sub_title`；每个班型必须写 `learning_objective`；
- 不读取 `plan.json`、`nodes[]`、`index.html`、`audio/` 或 `courseware/` 运行时文件；
- 不创建、不改写、不补写任何 `courseware.json` 或星级课件目录；缺课不得编造课件内容，配齐的班不得因前面缺口而漏传；
- 不把本 SOP 复制到 `.cursor`。如需 `AGENTS.md`，它只能写“先读 skills/README.md”。

## 必读组合

所有课节依序读：

```text
../README.md → schema.md → sources.md → courseware.md
```

之后总是读 `feiman.md`；当前课节存在 `*-quiz/*.md` 时读 `quiz.md`，存在 `*-homework/*.md` 时读 `homework.md`。凡是要写 `tts_text` 的环节（开场、费曼引导、作业引导）都先读 `voice.md`。写出文本后读 `media.md`。用户明确要求提交时才读 `submit.md`。分册仅为本入口服务，不再向更深层规则跳转。

## 工作顺序

1. 从星级目录名确定课节编码，读取 `sources.md` 建立当前课节允许读取的文件清单。
2. 读取 `schema.md`，先按「班型取舍」定下这次上传哪几个班型（每个班只看自己的两份 `courseware.json` 是否都在），再建立这些班型的固定键、键顺序、空值和配星集合。没有任何班配齐则停止，不写产物。
3. 按 `courseware.md` 填每班的 `lesson_data`、`learning_objective`、`core_method` 和 `begin_guide_data`。
4. 按 `feiman.md` 为每班填 `feiman_data` 与 `feiman_guide_data`。
5. 当前课节有相应 Markdown 时，按 `quiz.md`、`homework.md` 填题目和引导；没有时填字段规定的空值。
6. 按 `schema.md` 组装顶层对象并写出目标 `class.json`。
7. 按 `voice.md` 逐条复核三类 `tts_text`，运行 `node tools/check-tts-voice.mjs <课节编码>/class.json`。
8. 按 `media.md` 运行 `node tools/fill-media.mjs <课节编码>/class.json --source <课件根>`：写回三类引导音频，清空三个图片资源字段，并把源题里的本地图全部上传，自动把裸 URL 写进 `question` / `stem` / `analysis` 原位置。
9. 运行 `node tools/check-class-rules.mjs <课节编码>/class.json --source <课件根>` 和 `node tools/check-feiman-answer.mjs <课节编码>/class.json`，两个硬性校验都通过后再做交付前自检。

## 与相邻阶段边界

上游只有课节源文件；本阶段不制作、不修订、不补写课件、quiz、homework，也不得为缺失星级生成 `courseware.json`。媒体阶段只调用 TTS 与 COS 上传。提交课节批量新增是本阶段之后的独立动作，须由用户明确发起，规则见 [submit.md](submit.md)。

## 当前实现边界

文本组装仍由 Agent 按分册完成。TTS、COS 签名与直传已落在 `tools/tts.mjs`、`tools/upload-image.mjs`、`tools/fill-media.mjs`；硬性校验落在 `tools/check-class-rules.mjs`（班型取舍、每班非空 `learning_objective`、`begin_guide_data` 不含 `main_title`/`sub_title`、`question_type` 仅为 `1`/`4`、`question_type=1` 时 `options_json` 合法且 `type=2` 的 `content` 为图片 URL、图片字段留空、源题有图则题面必须带 http(s) URL、屏幕公式无「`<` 后接字母」、无裸 `$[a,b]$`、无 `cases`、表格仅为规定的 `$$ array $$`）、`tools/check-feiman-answer.mjs`（按星挖空、因果链与 LaTeX）、`tools/check-tts-voice.mjs`（逐字稿）。文本阶段保留源题的 `![说明](本地文件)`；`fill-media.mjs` 负责上传并写回裸 URL（作业选择题的选项图写进 `options_json` 的 `content`）。课节批量新增接口地址与 key 见 [submit.md](submit.md)，尚无封装工具，需手工 POST；未真正收到 `lesson_id_list` 前，不能声称已入库。

## 交付前自检

```text
□ 仅扫描了一个课节编码，且没读取任何其他课节的 class.json
□ 顶层 key、data、is_release 三键齐全，is_release 为 false
□ data 只含配星齐全的班型，按 B→A→AA→AAA→S 排序（允许缺口），没有为缺失星级造课件
□ 每个写进 data 的班型两个配星的 courseware.json 都在，lesson_data 恰好是这两条
□ 配齐却未写入的班型为零；被整体丢弃的班型已在交付摘要点名，并写明缺哪份 courseware.json
□ 每项 number_mark 与课节编码和班型一致
□ 每个写进 data 的班型都有非空 learning_objective，紧挨 number_mark 之后，句式为「理解…，学会…。」，内容只来自该班两份 courseware.json
□ 每个写进 data 的 begin_guide_data 仅含 tts_text 与 audio，无 main_title、sub_title；tts_text 完全相同，均为 2–3 句、100–150 字，且只称呼“同学”
□ 三类 tts_text 均通过 check-tts-voice.mjs：无阿拉伯数字、LaTeX、数学符号、单位缩写、直角引号「」
□ 每条 week_question_data.courseware_num 与对应 quiz Markdown 的 ## 课件 ID 逐字一致
□ 每条 feiman_data.answer 是课件讲法的因果复述，按费曼星级挖空（2–3星1处、4–5星2处、6–8星3处），含「因为…所以…；又因为…所以…」，去标记后不超过 500 字且与 question 不同
□ feiman_data.answer 的数学公式都写成 $…$ 的 LaTeX，公式挖空写成 #$…$#，无裸运算符、无旧式 ##、无人称称呼与套话
□ 题干、解析、费曼稿：字母前的 "<" 已改成 \lt，区间已写成 \left[ / \right]，无裸 "$[a,b]$" / 裸 "]$"，无 \begin{cases} / \{ 联立；表格仅为 $$\begin{array}{|c|…|}\hline … \end{array}$$
□ 作业题 question_type 仅为 1 或 4：有选项则为 1 且 options_json 已填；无选项则为 4 且 options_json 为 ""
□ options_json 仅在 question_type=1 时有值：type=1 的 content 为文字，type=2 的 content 为图片 URL
□ 带选项的费曼题，选项留在 question 正文里；作业选择题的选项写入 options_json，不抄进 question
□ feiman_data.image_url、homework_data.image_url、week_question_data.stem_pic 全部为 ""
□ 题干或选项带图的：源里的 `![说明](本地文件)` 已保留到文本稿，fill-media 已换成裸 URL 写进 question / stem 原位置
□ 所有“不填”字段均未写入，数组为空时为 []，对象为空时为 null；无音频时 audio 为 ""
□ 有 tts_text 的引导对象，audio 已是 TTS 返回的 http(s) URL，且不含 example.com
□ check-class-rules.mjs 与 check-feiman-answer.mjs 均已通过（含每班非空 learning_objective、begin_guide_data 无 main_title/sub_title、屏幕公式预览安全、费曼按星挖空与因果链）
□ 未出现 example.com 或未经字段表授权的键
```
