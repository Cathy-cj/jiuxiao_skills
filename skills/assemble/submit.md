# 提交：课节批量新增接口

## 基础信息

| 项目 | 内容 |
| --- | --- |
| 接口名称 | 批量新增课节接口 |
| 请求路径 | `/v1/aimathclass/external/lesson/batch/create` |
| 请求方式 | POST |
| Content-Type | `application/json` |
| 测试环境地址 | `https://test-jx-admin-api.zmexing.com` |
| 生产环境地址 | `https://jx-admin-api.zmexing.com` |
| 功能描述 | 批量新增数学课节；key 做身份权限校验；`is_release` 控制是否直接发布；校验通过后落库 `math_lesson` / `math_lesson_draft` |

拼好的完整测试地址：

```text
POST https://test-jx-admin-api.zmexing.com/v1/aimathclass/external/lesson/batch/create
```

路径是 `batch/create` **两段**，不是 `batchCreate`。`课件生成本周题库对外接口.md` 导出后基础信息表塌成了「表格」两个字，「完整调用示例」里只写着"待确定测试地址"，不要再去那份文档里找地址。

## 鉴权 key

```text
71de69fc17eaaf8e6e686aba7dbf7058c9114388ec99a21ec50a29021562b8cb
```

与 `tools/api-config.mjs` 的 `IMAGE_KEY` / `TTS_KEY` 是同一个，可用环境变量 `CLASS_IMAGE_KEY`、`CLASS_TTS_KEY` 覆盖。该 key 出自接口文档的「最小测试数据」，**只在测试环境验证过**；打生产地址前必须先向服务端确认 key 是否通用，不要拿它直接试生产。

## 调用时机

组装阶段**不调用**本接口。只有用户明确要求"提交/上传/入库"时才发，且默认 `is_release=false`。

`class.json` 落盘时顶层 `key` 保持 `"auth_****key"` 占位。提交时另存一份副本，把 `key` 换成上面的真值再发；不要把真 key 写回课节产物。

## 请求体

请求体就是本课节的 `class.json`，只替换顶层 `key`：

```json
{
  "key": "<上面的真 key>",
  "data": [ /* 按 B→A→AA→AAA→S 排列的班型对象，个数由班型取舍决定 */ ],
  "is_release": false
}
```

`data` 里放几个班型由 [schema.md](schema.md)「班型取舍」决定：两个配星的 `courseware.json` 都在的班才上传，按 B→S 排序，允许缺口。**不要**为缺失星级补空对象或补造 `courseware.json` 来凑前缀。提交前先跑 `node tools/check-class-rules.mjs <课节编码>/class.json --source <课件根>`，它不通过就不发。

`is_release=false` 只写草稿表 `math_lesson_draft`，不进正式表，也不触发下游 MQ 推送。`is_release=true` 才写 `math_lesson` 并推送下游——没有用户明确指令不得置 true。

## 服务端已验证的字段边界

以下字段按 [schema.md](schema.md) 的"不填"规则**不写**，服务端接受，不会报参数错误：

`title`、`grade`、`level_code`、`exam_weight`、`feiman_data[].image_desc`、`homework_data[].image_desc`

`lesson_data` 为空数组的课节服务端也能通过校验，但本 SOP 不再产出这种对象：配星不齐的班型整体不提交，见 [schema.md](schema.md)「班型取舍」。

## 业务约束

- 数组无数据传 `[]`，禁止传 `null`；对象无数据传 `null`；资源为空传 `""`。
- 批量整体事务，任意一条校验或存储失败，全部回滚。

### 实测与文档不符的三点（2026-08-22 在测试环境验证）

1. **`number_mark` 不是"重复即报错"，而是按编号 upsert。** 文档写"全局唯一性校验，重复返回业务错误"，
   实际重复提交同一个 `number_mark` 返回 `code:200`，且 `lesson_id_list` 回的是**原来那条的 id**，
   内容被整条覆盖。好处是改错可以直接重推同一份修正稿；风险是拿真实 `number_mark` 做试验会把已入库的数据冲掉。
2. **`number_mark` 必须事先登记。** 凭空造一个编号提交会返回 `课节编号「xxx」不存在`，
   不能用临时编号做探针。
3. **`lesson_data[].courseware_num` 必须在服务端课件表里已登记**，本地有 `<课节编码>-<N>star/` 目录不等于服务端有。
   缺失时返回 `课件编号「xxx」不存在`，整批回滚。

校验顺序为：key 鉴权 → 逐条查 `number_mark` 是否登记 → 逐条查 `courseware_num` 是否登记 → 落库。
要在不写库的前提下试探某个课件是否登记，可以发两条：第一条放待测课件，第二条放一个**已确认不存在**的课件，
后者必然触发整批回滚；看报错点名的是哪一个即可判断。
- `week_question_data` 是完整快照，服务端直接存储，不查外部题库。
- 题干、解析、费曼 `answer` 中的 `$...$` LaTeX 原样存储，服务端不解析。费曼 `answer` 的挖空因此改用成对 `#`，把 `$` 让给 LaTeX。
- `level_code` 若要写，枚举只允许 `c`/`b`/`a`/`aa`/`aaa`/`s`。

## 返回

```json
{
  "code": 200,
  "message": "success",
  "data": { "lesson_id_list": [11003, 11004, 11005, 11006, 11007] },
  "traceId": "01d54ecd7207ca7d6acbb69e9748d8ad"
}
```

`lesson_id_list` 与提交的 `data` 顺序一一对应。交付时记录 `traceId` 和 `number_mark` → `lesson_id` 对照表。

## 路由自检

活路由用空 body POST 会返回 `{"code":1001,"message":"参数异常"}`；不存在的路由返回纯文本 `404 page not found`。用这个判据确认地址，再发真实 payload。

## 交付前自检

```text
□ 用户明确要求提交，且已确认目标环境是测试还是生产
□ 提交副本的 key 已替换为真值，课节产物里的 key 仍是 auth_****key
□ is_release 为 false；置 true 有用户明确指令
□ data 只含配星齐全的班型，按 B→A→AA→AAA→S 排序（允许缺口），number_mark 本批无重复
□ check-class-rules.mjs 已通过（班型取舍、question_type 仅为 1/4、type=1 时 options_json 合法、图片字段留空）
□ 已记录返回的 traceId 与 number_mark → lesson_id 对照
```
