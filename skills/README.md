# class.json 组装 Skills

`skills/` 是本项目组装课节 `class.json` 的唯一 SOP 真源。它只说明如何从一个课节目录汇总可提交的 JSON；不生成课件。文本组装完成后，按 [assemble/media.md](assemble/media.md) 调用 TTS 与图片上传，把返回的 URL 写入对应字段。

## 当前工作 → 入口 → 产物

| 当前工作 | 入口 | 产物 |
| --- | --- | --- |
| 扫描一个课节并组装可上传的班型 | [assemble/SKILL.md](assemble/SKILL.md) | `c:\math\class\<课节编码>\class.json` |
| 核对 Body 字段、空值、键顺序、班型取舍 | [assemble/schema.md](assemble/schema.md) | 合法的请求 Body |
| 确认目录、编码和可读源 | [assemble/sources.md](assemble/sources.md) | 课节数据源清单 |
| 写学习目标、核心方法与开场引导 | [assemble/courseware.md](assemble/courseware.md) | `learning_objective`、`core_method`、`begin_guide_data`、`lesson_data` |
| 写费曼因果讲法稿与按星 `#` 挖空 | [assemble/feiman.md](assemble/feiman.md) | `feiman_data`、`feiman_guide_data` |
| 组装晋级赛 | [assemble/quiz.md](assemble/quiz.md) | `week_question_data` |
| 组装课后作业 | [assemble/homework.md](assemble/homework.md) | `homework_data`、`homework_guide_data` |
| 写任何 `tts_text` 的逐字稿 | [assemble/voice.md](assemble/voice.md) | 可直接合成的中文口播 |
| 填音频 URL、把图片写进题面 | [assemble/media.md](assemble/media.md) | `audio`、`question` / `stem` 里的裸图 URL |
| 提交到测试/生产环境 | [assemble/submit.md](assemble/submit.md) | `lesson_id_list` |

## 制作隔离

- 一次只处理一个课节；目标仅为该课节的 `class.json`。
- 不打开、引用或仿写其他课节的 `class.json`，包括本课节上次留下的产物。
- 唯一授权范例是 `c:\math\class\README.md` 的请求 Body 示例块与 `//` 注释、`c:\math\class\class示例.json` 的键形状，以及本目录分册明确写出的挖空示例。它们只用于规则核验，不得照抄为课节内容。
- `C:\math\测试用课件\` 仅用于识别目录和源文件结构，不能作为文风、题目或讲解措辞范本。

## 基本边界

组装只读取当前课节已有的 `courseware.json`、`*-quiz/*.md`、`*-homework/*.md`；不读取 `plan.json`、`nodes[]`、`index.html`、`audio/`、`courseware/` 运行时文件；**不得创建或补写缺失的 `courseware.json`**。两个配星的 `courseware.json` 都在的班都要写入 `data`，前面缺班不能把后面配齐的班一起丢掉。所有 `tts_text` 都要合成语音播给学生听，写法统一按 [assemble/voice.md](assemble/voice.md)：阿拉伯数字、LaTeX、数学符号、单位缩写和直角引号「」一律写成中文读法。文本完成后调用 TTS 与 COS 上传：音频 URL 写入 `audio`，图片 URL 只以裸 URL 写进 `question` / `stem` 正文中它原本出现的位置，`image_url` 与 `stem_pic` 一律留空；源题有 `![说明](本地文件)` 的不得删图，由 `fill-media.mjs` 上传替换。禁止写 `example.com`。课节批量新增接口不由组装触发，只在用户明确要求提交时按 [assemble/submit.md](assemble/submit.md) 调用。

三条硬性校验必须全部通过才算组装完成：

```text
node tools/check-class-rules.mjs <课节编码>/class.json --source <课件根>   # 班型取舍（配齐必传、配不齐禁传、禁止造课件）、每班非空 learning_objective、begin_guide_data 不含 main_title/sub_title、question_type=4、options_json=""、图片字段留空、源题有图则题面必须带 URL、屏幕公式预览安全（无「< 后接字母」、无裸 $[a,b]$ / 裸 ]$、无 array）
node tools/check-feiman-answer.mjs <课节编码>/class.json                  # 费曼 answer 的按星挖空、因果链与 LaTeX
node tools/check-tts-voice.mjs <课节编码>/class.json                      # 三类 tts_text 逐字稿
```

开始时先读 [assemble/SKILL.md](assemble/SKILL.md)。入口会按当前课节的实际数据源指出需读的分册。
