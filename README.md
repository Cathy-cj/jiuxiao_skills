# class v3.7

把一个课节目录组装成可提交的 `class.json`（课节批量新增请求 Body）。本仓库是组装流程的 SOP 与校验工具，不生成课件。

一次只处理一个课节。文本由 Agent 按 Skills 分册填写；媒体（TTS、图片上传）和硬性校验由 `tools/` 完成。提交到测试/生产环境须由用户明确发起。

## 目录

```text
skills/                 组装 SOP（真源）
  README.md             总览与入口表
  assemble/SKILL.md     课节组装入口
  assemble/*.md         字段、课件、费曼、晋级赛、作业、口播、媒体、提交
tools/                  TTS、图片上传、规则校验
class示例.json          键形状与键顺序范例（内容不得照抄）
```

开始组装时先读 [skills/README.md](skills/README.md)，再按 [skills/assemble/SKILL.md](skills/assemble/SKILL.md) 依序读分册。

## 产物

默认写出：

```text
c:\math\class\<课节编码>\class.json
```

顶层为 `key`、`data`、`is_release=false`。`data` 只放两个配星的 `courseware.json` 都在的班型，按 B → A → AA → AAA → S 排序，允许缺口；不得为缺失星级生成课件。

## 校验

三条检查全部通过才算组装完成：

```text
node tools/check-class-rules.mjs <课节编码>/class.json --source <课件根>
node tools/check-feiman-answer.mjs <课节编码>/class.json
node tools/check-tts-voice.mjs <课节编码>/class.json
```

文本写完后，用 `node tools/fill-media.mjs <课节编码>/class.json --source <课件根>` 合成引导音频、上传题图，并把裸 URL 写进题面。
