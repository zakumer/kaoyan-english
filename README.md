# 研英 · 考研英语一

一个完全离线的考研英语一学习工具。把 29 套真题、1,240 道客观题、1,148 个高频词和逐题解析装进一个本地网页。

## 快速开始

1. 双击 **`启动.bat`**，或在浏览器里直接打开 **`index.html`**。
2. 推荐 Chrome / Edge 最新版。首次打开不需要联网。
3. 点“背单词”开始今天的 SRS 队列；点“真题”选一套卷模考或练习。
4. 阅读精读里点任意英文单词，可查释义、听发音、加入生词本。

> 如果双击 `.bat` 没有反应，直接右键 `index.html` → 打开方式 → Chrome / Edge。
> 不建议用 IE 或非常旧的浏览器。

## 功能

- **背单词**：SM-2 简化间隔重复；每日新词/复习上限；考纲 931 + 超纲 217 筛选；CEFR、真题句频；词条含音标、义项、最多 20 条英语一真题例句与解析；浏览器朗读。
- **真题模考**：1998–2026 共 29 套英语一；180 分钟倒计时；答题卡、标记、自动保存、断点续做；交卷自动判分。
- **练习模式**：选完立即看解析，适合第一次精做。
- **逐题解析**：阅读定位句、题型、选项归因；完形理由；排序衔接；翻译参考译文与意群；写作范文、中译、结构拆解。
- **阅读精读**：按 Text 阅读；点词查询；生词高亮；题目解析侧栏；段落朗读。
- **错题本**：自动收集错题，按套卷分组；标记“已掌握”；回看题干与解析。
- **统计**：词汇状态、正确率、26 周热力图、最近模考、错题分布。
- **写作/翻译**：草稿自动保存；对照参考范文/译文自评。
- **备份**：设置页导出/导入 JSON；所有数据只在本机 localStorage。

## 数据

| 内容 | 数量 |
| --- | --- |
| 英语一真题 | 29 套（1998–2026） |
| 客观题 | 1,240 道 |
| 考纲高频词 | 931 |
| 超纲高频词 | 217 |
| 合并词库 | 1,148 |
| 有英语一例句的词 | 1,140 |
| 真题例句 | 每词最多 20 条 |

词库数据约 16MB；词条例句按需加载（首次打开词条时需要读一次约 11MB 的本地数据），不影响首页和套卷加载。

数据来自 [懒笔记 · 考研英语真题](https://english-exam.lazynote.cn/)，仅用于个人学习。真题版权归考试委员会所有；本工具不包含、不再分发站点上的 PDF/Word 文件。

## 目录

```text
kaoyan-english/
  index.html          应用入口
  启动.bat            双击打开
  css/app.css         设计系统与响应式样式
  js/
    app.js            hash 路由、全局搜索
    data.js           试卷/词条懒加载
    store.js          localStorage 状态
    srs.js            间隔重复算法（可 Node 测试）
    util.js / ui.js   工具函数与通用 UI
    views/            今日、单词、真题、考试、解析、精读、错题、统计、设置
  data/
    meta.js           29 套试卷索引
    papers/*.js       每套试卷（懒加载）
    words-index.js    词库索引（构建后生成）
    word-details.js   例句/义项（懒加载，构建后生成）
    word-order.js     学习顺序
    word-meta.js      词库统计
  tools/              抓取、解析、构建脚本（仅开发时需要）
  tests/              Node 单元测试与数据校验
```

## 重新构建数据（可选）

只有想更新站点内容时才需要。应用本身不需要 Node/Python。

```bash
cd kaoyan-english
python tools/parse_papers.py --all
python tools/parse_sections.py --all
python tools/parse_words.py
python tools/build_data.py --download-images
python tools/validate.py
```

抓取会缓存到 `tools/.cache/`，并限速；请遵守站点 robots，不要抓取 `/downloads/`，不要高频重复请求。

## 测试

```bash
# Node 18+；Windows 下如遇 test runner 的 spawn EPERM，加 --test-isolation=none
node --test --test-isolation=none tests/
python tools/validate.py
```

## 浏览器与数据说明

- 应用是纯静态、经典 `<script>`，因此 `file://` 直接打开也能用。
- 学习记录保存在 `localStorage` 的 `kaoyan-english:v1`。清浏览器数据会丢失，请定期在设置页导出 JSON。
- 如果浏览器禁用 `localStorage`，应用会退回内存模式，并在设置页提示。
- 朗读使用系统 `speechSynthesis`，音色取决于操作系统；没有声音时检查系统英语语音包。
- 2010/2011/2014/2017/2018/2019/2023/2025/2026 的排序题没有逐题解析（站点本身未提供），但答案、正确顺序和衔接说明可用；其余题目解析覆盖 100%。
- 旧卷（1998–2009）按原始客观题正确数展示，不套用 2010 年后的官方分值。

## 版本管理

项目已使用 Git 管理，默认分支为 `main`。`data/` 与 `assets/` 属于应用运行所需内容，会纳入版本库；`tools/build/`、`tools/.cache/`、`.tmp/` 等生成物已忽略。

```bash
git status
git log --oneline
git diff
```

修改后提交：

```bash
git add -A
git commit -m "说明这次改动"
```

## 许可与致谢

仅用于个人备考学习。题目、文章、解析、词表版权归原权利人；如权利人要求，请删除本地数据。向 [懒笔记](https://english-exam.lazynote.cn/) 的数据整理工作致谢。
