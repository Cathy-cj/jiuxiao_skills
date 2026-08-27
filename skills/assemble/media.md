# 音频 TTS 与图片 COS 上传

文本组装完成后，用本分册把接口返回的 URL 写入对应位置。禁止写 `example.com`。

## 音频

接口见 `c:\math\class\README.md`「课节 TTS‑文本生成音频」：

```text
POST https://test-jx-admin-api.zmexing.com/v1/aimathclass/external/lesson/tts
{ "key": "<鉴权 key>", "text": "<tts_text>" }
返回 data.audio_url
```

写入位置：

| 字段 | 文本来源 |
| --- | --- |
| `begin_guide_data.audio` | 同对象 `tts_text` |
| `feiman_guide_data.audio` | 同对象 `tts_text` |
| `homework_guide_data.audio` | 同对象 `tts_text` |

送去合成前，`tts_text` 必须先通过 [voice.md](voice.md) 的逐字稿规则和 `node tools/check-tts-voice.mjs`：阿拉伯数字、LaTeX 与数学符号会被读错或跳读，合成后再改就要重新合成一遍。相同 `tts_text` 只合成一次，所有上传的班型共用同一条开场音频。没有引导对象时保持 `null`，不要为了音频去造引导。

## 图片

接口见 `c:\math\class\图片接口.md`：先取 COS 签名，再直传文件，最后把返回的 `url` 写进题面正文。

```text
POST https://test-jx-admin-api.zmexing.com/v1/aigc/tob/getUploadSignature
{ "key": "<图片 key>", "name": "<无后缀文件名>", "ext": "png", "path": "aigc/tob/image/", "bucket_type": 5 }
PUT {cos_host}/{cos_key}  （Authorization + x-cos-security-token）
把返回的 url 写进题面正文
```

### 资源字段一律留空

`homework_data[].image_url`、`feiman_data[].image_url`、`week_question_data[].stem_pic` **恒为 `""`**，任何情况下都不填 URL：

| 字段 | 值 |
| --- | --- |
| `feiman_data[].image_url` | `""` |
| `week_question_data[].stem_pic` | `""` |
| `homework_data[].image_url` | `""` |

这三个资源字段不决定图片显示在题目的哪一处，填了反而会让同一张图重复出现。图片的位置信息只由题面正文承载。该规则由 `node tools/check-class-rules.mjs <课节编码>/class.json` 硬性校验。

### 图片写在题面原位置

图片一律写进题目正文里它**原本出现的地方**：`feiman_data[].question`、`homework_data[].question`、`week_question_data[].stem`。

- **选项带图**：URL 直接跟在选项标号后面，一行一个。

  ```text
  A．https://…/opt-a.png
  B．https://…/opt-b.png
  ```

- **题干带图**：URL 单独成行，插在原题里“如图”“竖式如下”“下图”这类指代之后；源 Markdown 里图片本来就排在题干和选项之间的，就仍排在中间。
- 文本阶段先**原样保留**源里的 `![说明](本地文件名)`，不要删图，也不要提前改成裸 URL。媒体阶段由 `fill-media.mjs` 上传后改成裸 URL。
- 最终产物一律写**裸 URL**，不要残留 `![说明](URL)` 或本地文件名。
- 本地图片必须上传：源题里出现的**每一张**图都要传，不是只传 `images[0]`。费曼以该班费曼星级 `courseware.json` 的 `flow_3.stem` 为准：stem 里的 `![说明](文件名)` 以及 `images[]` 中文件名也出现在 stem 里的项，全部进 `question`。只出现在 `answer_detail` 的解析图不要写进 `question`。
- 本地文件优先从 `<星级>/problem/<文件名>` 取，其次 `<星级>/`、`<星级>/assets/`、`<星级>/courseware/assets/`、`<星级>/images/`，以及同课节 `*-homework/`、`*-quiz/`、`*-upgrade/`。不要用课件运行时装饰图（星星图标等），不要伪造 URL。
- 源里已经是真实 HTTP 图（非 `example.com`）的，直接把那个 URL 写进正文。
- 源题有图却找不到文件、或上传后没写进正文，视为组装失败，不得静默丢图。

## 命令

在 `c:\math\class v3.7\` 运行（`--source` 必须是含有 `<课节编码>-3star` 等目录的课件根，例如桌面上的课节文件夹）：

```text
node tools/tts.mjs --text "同学，今天我们一起学习……"
node tools/upload-image.mjs --file <本地图片>
node tools/fill-media.mjs <课节编码>/class.json --source <课件根>
```

`fill-media.mjs` 会遍历当前课节 JSON：合成并写回三类引导音频；把三个图片资源字段强制清空为 `""`；把题面里的 `![说明](本地文件)` 全部上传到 COS，并**自动**把返回的裸 URL 写回 `question` / `stem` / `analysis` 原位置。选项只有标号、图被删掉时，会按源 stem 的 A/B/C/D 顺序把 URL 补回去。找不到本地文件或补不进正文时直接失败。
