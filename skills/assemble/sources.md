# 源目录、课节切分与编码

## 可读根与课节范围

测试根是 `C:\math\测试用课件\`，采用扁平课节目录，不是 `dist/<年级>/`。一次只选一个 `<课节编码>`，只读取匹配其前缀的下列目录：

```text
<课节编码>-2star/ … <课节编码>-8star/     # 各自仅读取 courseware.json
<课节编码>-quiz/<任意名>-quiz.md
<课节编码>-homework/<任意名>-homework.md
```

例如 `W1-L6-1-quiz` 归属于 `W1-L6-1`，即使 Markdown 文件名或文内“课件 ID”采用另一套前缀。

## 编码规则

- 课节编码：从星级文件夹名移除末尾 `-<N>star`，例如 `W1-L6-1-2star` → `W1-L6-1`。
- 星级目录清点结果直接决定上传哪几个班型：配星齐全的班型才上传，且必须是 B→A→AA→AAA→S 的连续前缀，规则见 [schema.md](schema.md)「班型取舍」。
- `courseware_num`：始终等于星级文件夹名，例如 `W1-L6-1-2star`。
- 不使用 `courseware.json` 顶层 `id`；它可能是 `6-1-2star` 或 `2-1-4star`，与目录业务编码不一致。
- 上述目录名规则只适用于 `lesson_data`。`week_question_data.courseware_num` 必须逐字使用 quiz Markdown 的 `## 课件 ID`，不能根据目录名重建或纠正。

## 允许读取的内容

| 目标字段 | 唯一可读源 |
| --- | --- |
| 课件关联、学习目标、核心方法、开场引导、费曼 | 当前课节各星级目录的 `courseware.json` |
| `week_question_data` | 当前课节 `*-quiz/` 内的 `*-quiz.md` |
| `homework_data` | 当前课节 `*-homework/` 内的 `*-homework.md` |

在 `courseware.json` 内，读取顶层 `title`、`problem_source` 及其中 `flow_id`、`stem`、`answer_detail`、`images`；实际取数规则以对应分册为准。`images[].url` 若是本地文件名，媒体阶段可读取该文件本身（常见于 `<星级>/courseware/assets/`）以便 COS 上传。费曼话术需要年级时，只从 `title`、路径或用户指定推断，**不把 `grade` 写进产物**。

## 明确禁止读取

- `plan.json`；
- `nodes[]`，即使它位于可读的 `courseware.json`；
- `index.html`、`audio/` 目录、以及 `courseware/` 下的运行时脚本与样式；
- 任意其他课节、其他课节的 `class.json`，以及不属于当前前缀的文件。

源缺失只能导致对应班型整体不上传，或对应费曼、晋级赛、作业为空，不能从其他课节补齐，也不能虚构数据。
