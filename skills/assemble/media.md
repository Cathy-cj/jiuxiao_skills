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
- 一律写**裸 URL**，不要写 `![说明](URL)` 这类 Markdown 图片语法。
- 本地图片仍要上传：费曼题图取该班费曼星级 `courseware.json` 的 `flow_3.images[0].url`（本地文件常见于 `<星级>/courseware/assets/`），上传后把返回的 URL 写进 `question`。源里已经是真实 HTTP 图（非 `example.com`）的，直接把那个 URL 写进正文。
- 找不到可上传的文件、或 `images` 为空时，正文里就不写 URL。不要用课件运行时图、不要伪造 URL。

## 命令

在 `c:\math\class\` 运行：

```text
node tools/tts.mjs --text "同学，今天我们一起学习……"
node tools/upload-image.mjs --file <本地图片>
node tools/fill-media.mjs <课节编码>/class.json
```

`fill-media.mjs` 会遍历当前课节 JSON：合成并写回三类引导音频；把三个图片资源字段强制清空为 `""`；上传找得到的费曼本地题图并**打印**返回的 URL。正文里的图片位置由人工按上一节写入，工具不会替你插进 `question` / `stem`——凡是打印出 `需写入正文` 的 URL，都要手工放到题面对应位置后再提交。
