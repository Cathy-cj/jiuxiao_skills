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
- 星级是否存在只看该目录里有没有可读的 `courseware.json`：有文件才算这一星，有文件夹但没有该文件仍算缺失。清点结果直接决定上传哪几个班型：两个配星的 `courseware.json` 都在的班才上传，彼此独立，规则见 [schema.md](schema.md)「班型取舍」。
- `courseware_num`：始终等于星级文件夹名，例如 `W1-L6-1-2star`。
- 不使用 `courseware.json` 顶层 `id`；它可能是 `6-1-2star` 或 `2-1-4star`，与目录业务编码不一致。
- 上述目录名规则只适用于 `lesson_data`。`week_question_data.courseware_num` 必须逐字使用 quiz Markdown 的 `## 课件 ID`，不能根据目录名重建或纠正。

## 允许读取的内容

| 目标字段 | 唯一可读源 |
| --- | --- |
| 课件关联、学习目标、核心方法、开场引导、费曼 | 当前课节各星级目录的 `courseware.json` |
| `week_question_data` | 当前课节 `*-quiz/` 内的 `*-quiz.md` |
| `homework_data` | 当前课节 `*-homework/` 内的 `*-homework.md` |

在 `courseware.json` 内，读取顶层 `title`、`problem_source` 及其中 `flow_id`、`stem`、`answer_detail`、`images`；实际取数规则以对应分册为准。`images[].url` 或 stem 里的 `![说明](文件名)` 若是本地文件，媒体阶段必须读取该文件并上传：优先 `<星级>/problem/<文件名>`，其次该星级目录根、`assets/`、`courseware/assets/`、`images/`。同课节作业/晋级 Markdown 旁的同名图也可。费曼话术需要年级时，只从 `title`、路径或用户指定推断，**不把 `grade` 写进产物**。

## 明确禁止读取

- `plan.json`；
- `nodes[]`，即使它位于可读的 `courseware.json`；
- `index.html`、`audio/` 目录、以及 `courseware/` 下的运行时脚本与样式；
- 任意其他课节、其他课节的 `class.json`，以及不属于当前前缀的文件。

## 禁止生成课件

本阶段只组装 `class.json`，**不得创建、改写、补写**任何 `courseware.json` 或星级课件目录。缺哪一星就让依赖它的班型整体缺席，把已经配齐的班照常写入 `data`。不得用题干 Markdown、运行时图或邻星内容填出一份假课件。

源缺失只能导致对应班型整体不上传，或对应费曼、晋级赛、作业为空，不能从其他课节补齐，也不能虚构数据。若没有一个班配星齐全，停止并报告，不要写残缺或伪造的 `class.json`。
