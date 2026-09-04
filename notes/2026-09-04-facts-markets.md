# 2026-09-04 事实核对：市场／宏观三页

范围：`drawdown/index.html`、`options/index.html`、`catchup/index.html`。

方法：页面上每一条带数字、口径或制度描述的陈述逐条抽出，一手源优先（World Bank
Indicators API、Cboe 官方页面、Direxion／ProShares 基金说明书与 fact sheet、
Nasdaq 指数方法论、ECB）。页面声称能自动更新的接口都实际 curl 过一次并记录 HTTP
码。二手来源只用来定位一手链接，不作为数字依据。

核对时仓库状态：本地检出 `main` **落后 origin 3 个提交**（`git status -sb` →
`[behind 3]`）。本地 `drawdown/data` 停在 2026-09-02、`options/data` 停在
2026-09-02。下面凡是拿"页面自带 JSON"做对照的地方都以本地这份为准，另外附了
2026-09-04 的实测复算值。**动手改页面前先 `git pull`。**

- 世行数据版本：所有指标 `lastupdated = 2026-07-13`（与仓库内 `catchup.json`
  的 `updated` 字段一致，说明世行自 8 月 31 日抓取以来没有再发布新版本）。
- 实测时间：2026-09-04 04:11–04:25 UTC。

---

## 一、`drawdown/index.html` 三大指数回撤

| 页面位置（原文片段） | 页面当前值 | 核对结果 | 正确值 | 一手来源 URL | 来源发布日期 |
|---|---|---|---|---|---|
| 正文：「标普和纳指的日线可回溯到 <b>1970 年</b>，道指到 1992 年」 | 纳指 1970 | **错误** | 纳指为 **1971-02-05**。纳斯达克综合指数 1971 年 2 月 5 日随 Nasdaq 市场创立、基点 100，1970 年该指数尚不存在。标普 1970-01-02 ✓、道指 1992-01-02 ✓ | <https://indexes.nasdaqomx.com/docs/FS_COMP.pdf>（"History: 02/01/1971"）；<https://www.nasdaq.com/articles/nasdaq-composite-indextm:-50th-anniversary-brings-new-records-and-further-optimism> | fact sheet 指数数据截至 2026-06-30；50 周年文 2021 |
| 图注：「标普与纳指可回溯到 <b>1970 年</b>，道指到 1992 年」 | 同上 | **错误** | 同上。这是同一处错误的第二个出现点，改一处会漏另一处 | 同上 | 同上 |
| lede：「标普 500 现在 −1.45%，道指 −2.14%，纳指 −2.67%」 | −1.45 / −2.14 / −2.67 | **已过时** | 2026-09-03 收盘：标普 **−0.66%**、道指 **−1.22%**、纳指 **−1.88%**。页面自带 `drawdown.json`（2026-09-02）是 −1.70 / −2.37 / −3.23。硬编码这三个数与两天中的任何一天都对不上 | Yahoo chart 接口实测 <https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?period1=0&period2=9999999999&interval=1d>（^DJI / ^IXIC 同）；`drawdown/data/drawdown.json` | 实测 2026-09-04 |
| 局限：「标普跌破 30% 在半个多世纪里只有 <b>5 次</b>，道指 <b>3 次</b>」 | 5 / 3 | **仍成立** | 标普 5 次（1974-07-05、1987-10-19、2001-09-17、2008-10-06、2020-03-20）；道指 3 次（2002-07-19、2008-10-07、2020-03-16） | 同上 Yahoo chart 接口，按页面自身口径（首次跌破日）复算 | 实测 2026-09-04 |
| 局限：「2008 年标普跌破 30% 之后又跌了将近 <b>27%</b>」 | 将近 27% | **仍成立** | 首次触线 2008-10-06，到本轮最低点额外再跌 **26.8%** | 同上 | 实测 2026-09-04 |
| 局限：「标普跌破 30% 之后 1 年中位…反而低于跌破 20% 的」 | 由 JSON 注入 | **仍成立** | −30% 后 1 年中位 **+11.81%**（5 次），−20% 后 **+23.19%**（8 次），方向确实反直觉。该句数字由 `#quirk` 从 JSON 动态注入，会自更新 | `drawdown/data/drawdown.json` → `indices.spx.after` | 快照 2026-09-02 |
| 口径：「日线收盘价来自 Yahoo Finance 的公开 chart 接口」 | 公开可用 | **仍成立（需加限定）** | 匿名可访问，无需 key／cookie／crumb：**HTTP 200**。但**必须带 User-Agent**——不带 UA 返回 **HTTP 429 `Edge: Too Many Requests`**。仓库脚本已带 UA，行为正确 | 实测 <https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=5d&interval=1d> | 实测 2026-09-04 |
| 口径：「回撤 = 收盘价距<b>历史最高收盘</b>」 | 历史最高收盘 | **口径需加限定** | 实为"接口可得区间内的最高收盘"。^GSPC 的 `firstTradeDate` 是 **1927-12-30**，但 `period1=0` 只返回到 1970-01-02，1929–32 年的 −86% 不在窗口内。页面的 `maxDD` 标普 −56.78% 即 2007–09 那轮 | 同上接口 `meta.firstTradeDate` 与实际首个 bar | 实测 2026-09-04 |
| 口径：回撤按收盘价／一轮从创新高起算／「此后 N 年」从首次触线算起／「触线后还跌了」= 首次触线到本轮最低点的额外跌幅 | 四条 | **仍成立** | 与 `scripts/fetch-drawdown.mjs` 实现逐条一致（`underwater()`、`episodes()`、`forward()`、`medExtra = trough + L`） | 仓库 `scripts/fetch-drawdown.mjs` | 文件 mtime 2026-08-31 |
| 正文：「每个交易日收盘后更新」 | 每交易日 | **仍成立（本地检出滞后）** | 工作流 cron `30 21 * * 1-5`（UTC）= EDT 17:30，收盘后一小时，口径正确。本地 `drawdown.json` `asOf=2026-09-02` 只是因为检出落后 origin 3 个提交，不是流水线坏了 | 仓库 `.github/workflows/drawdown.yml`；`git status -sb` | 核对于 2026-09-04 |

### 建议改动（drawdown）

1. **把两处「1970」改对。** 正文第二段与图注都写着"标普和纳指的日线可回溯到 1970
   年"。纳指改成 1971。建议正文改为：
   > 标普的日线可回溯到 1970 年，纳指到 1971 年（纳斯达克综合指数 1971 年 2 月 5
   > 日才创立），道指到 1992 年。

   图注同步改为：「标普可回溯到 1970 年，纳指到 1971 年，道指到 1992 年。」

2. **lede 里那三个硬编码回撤数删掉，或改成从 JSON 注入。** 页面卡片本来就动态显示
   同样三个数（`#cards`），lede 再硬编码一份必然漂。最省事的改法是把整句改成不带
   数字的版本：
   > 离历史最高收盘还差多少，是判断「现在算不算跌了」最省事的一把尺子。**三大指数
   > 当前的回撤见下面的卡片。**但真正有用的不是当下这个数，是历史上跌破 −10% 之后
   > 还继续跌了多少。

   若要保留数字，就给三个 `<span id="lede-spx">` 之类的占位，在 `boot()` 里和卡片
   一起填。

3. **「历史最高收盘」补一句窗口限定。**「数据与口径」第一条建议改为：
   > 日线收盘价来自 Yahoo Finance 的公开 chart 接口，取全量日频；节假日与缺失价格
   > 跳过。**接口对标普只回溯到 1970 年、纳指 1971 年、道指 1992 年，所以本页的
   > 「历史最高收盘」指的是这个区间内的最高收盘 —— 1929–32 年那轮 −86% 不在窗口
   > 里。**

4. **可选：给 Yahoo 接口那条加一句 UA 说明**，省得以后有人拿浏览器直接开链接看到
   429 以为接口挂了：「该接口需带 User-Agent 请求，不带会返回 429。」

5. 不用改：−30%／−20% 的次数、2008 年额外跌 27%、"更深不等于更好"那段，以及全部
   四条统计口径，均与实测一致。

---

## 二、`options/index.html` 美股期权 Wheel 筛选器

| 页面位置（原文片段） | 页面当前值 | 核对结果 | 正确值 | 一手来源 URL | 来源发布日期 |
|---|---|---|---|---|---|
| 数据与口径：「Cboe 延迟行情 — 用的是<b>公开的</b> `delayed_quotes/options` 接口」 | 公开接口 | **需改措辞（接口本身仍成立）** | 接口可用：22/22 标的全部 **HTTP 200**。但 Cboe 官方延迟行情页面底部明文禁止自动抓取：<br>"IT IS STRICTLY PROHIBITED TO DOWNLOAD DELAYED QUOTE TABLE DATA FROM THIS WEB SITE BY USING AUTO-EXTRACTION PROGRAMS/QUERIES AND/OR SOFTWARE. CBOE WILL BLOCK IP ADDRESSES OF ALL PARTIES WHO ATTEMPT TO DO SO."<br>页面把它写成可以随便定时抓的"公开接口"，与 Cboe 自己的条款冲突 | <https://www.cboe.com/delayed_quotes/aapl/quote_table>（页面底部声明）；接口实测 <https://cdn.cboe.com/api/global/delayed_quotes/options/AAPL.json> | 实测 2026-09-04 |
| lede／正文：「从 <b>22 个</b>标的里筛出候选」 | 22 | **仍成立** | 名单确为 22 个（七姐妹 7 + 指数 ETF 4 + 行业 ETF 6 + 杠杆 ETF 5），22 个在 Cboe 全部返回活跃期权链，无退市、无改名 | 实测 Cboe 接口逐个 200；`scripts/fetch-options.mjs` 的 `SYMBOLS` | 实测 2026-09-04 |
| 风险标签：「<b>杠杆</b> = <b>三倍杠杆 ETF</b>」 | 三倍杠杆 | **错误／不完整** | 五只里 **SQQQ 是 −3 倍反向**（ProShares UltraPro Short QQQ，"three times the inverse (-3x) of the daily performance of the Nasdaq-100"），不是三倍做多。其余四只倍数未变：TQQQ 3x Nasdaq-100；SOXL Daily Target **300%**（NYSE Semiconductor Index）；TNA 300%（Russell 2000）；SPXL 300%（S&P 500） | <https://www.proshares.com/our-etfs/leveraged-and-inverse/sqqq>、<https://www.proshares.com/our-etfs/leveraged-and-inverse/tqqq>、<https://www.direxion.com/uploads/SOXL-SOXS-Fact-Sheet.pdf>、<https://www.direxion.com/uploads/TNA-TZA-Fact-Sheet.pdf>、<https://www.direxion.com/uploads/SPXL-SPXS-Fact-Sheet.pdf> | Direxion fact sheet 指数数据截至 2026-06-30；实测 2026-09-04 |
| 「年化 = <b>卖价</b> ÷ 行权价 × 365 ÷ 剩余天数…（按最保守的<b>买价</b>成交计算）」（正文 + 名词解释两处） | 卖价 | **错误（术语自相矛盾）** | 代码用的是 **bid（买价）**：`(r.bid / r.strike) * (365 / r.dte)`。同一页「价差」条目又把卖价定义成 ask：「价差 =（卖价−买价）÷中间价」。于是"卖价"在同一页里既是 ask 又是 bid。正确写法：**年化 = 买价(bid) ÷ 行权价 × 365 ÷ 剩余天数** | 仓库 `scripts/fetch-options.mjs` L115、L98 | 文件 mtime 2026-08-31 |
| 两张明细表表头「<b>卖价</b>」列 | 卖价 | **错误** | 该列渲染的是 `r.bid`，应为「买价」 | 同上（`options/index.html` L265、L275 渲染 `r.bid.toFixed(2)`） | — |
| 名词解释只定义了「年化（看跌）」 | 缺 CC 口径 | **缺口径** | 备兑看涨的年化分母**不是行权价而是现价**：`(r.bid / spot) * (365 / r.dte)`。两条腿分母不同，页面从未说明 | 仓库 `scripts/fetch-options.mjs` L127 | 文件 mtime 2026-08-31 |
| 排序：「年化 ÷ IV30（每单位波动率的收益）」 | 该口径 | **仍成立** | 量纲一致：Cboe 的 `iv30` 是百分数（实测 AAPL 24.077、SOXL 103.623），页面算 `y / (iv30/100)`，即"年化收益（小数）÷ 年化隐含波动率（小数）"。"每单位波动率的收益"这个说法准确 | 实测 Cboe 接口 `data.iv30`；`options/index.html` L414 | 实测 2026-09-04 |
| 收尾：「换成「年化 ÷ IV30」，排序立刻变成 <b>AAPL、QQQ 在前</b>」 | AAPL、QQQ | **已过时／错误** | 用页面同一套筛选条件对 2026-09-04 的 Cboe 数据复算，ratio 前八为：**TSLA 1.79、META 1.61、AAPL 1.58、MSFT 1.54、AMZN 1.51、NVDA 1.50、SOXL 1.46、GOOGL 1.46**。QQQ 不在前八，AAPL 是第三不是第一，SOXL 这只杠杆 ETF 仍留在第七。仓库快照（2026-09-02）也已是 TSLA 1.71、AAPL 1.66、TQQQ 1.52、SOXL 1.50 | 实测 Cboe 接口 22 标的复算；`options/data/options.json` | 实测 2026-09-04；快照 2026-09-02 |
| lede：「按年化排序，榜首<b>永远</b>是杠杆 ETF」 | 永远 | **仍成立但措辞过绝** | 当日榜首 SOXL 年化 151.10%，快照日 SOXL 158.10%，第一名确实是杠杆 ETF。但第二名当日已是 TSLA（77.30%）这只非杠杆标的。同页正文写的是"基本恒定"，两处措辞不一致 | 同上 | 实测 2026-09-04 |
| 筛选条件：「剩余 5–70 天，看跌 Δ −0.35–−0.10、看涨 Δ 0.10–0.35，买价 ≥ 0.05，未平仓或成交量 ≥ 25，价差 ≤ 0.10 或 ≤ 中间价的 30%」 | 六条 | **仍成立** | 与脚本逐条一致：`DTE=[5,70]`、`PUT_DELTA=[-0.35,-0.10]`、`CALL_DELTA=[0.10,0.35]`、`MIN_BID=0.05`、`MIN_OI=25`（OI **或** volume）、`MAX_SPREAD_ABS=0.1` / `MAX_SPREAD_PCT=0.3` | 仓库 `scripts/fetch-options.mjs` L26–L38、L104 | 文件 mtime 2026-08-31 |
| 口径：「曲面按 OTM 惯例取值…插值到 行权价／现价 0.8–1.2 的统一网格」 | 该口径 | **仍成立** | 与实现一致：`r.strike < spot ? 'P' : 'C'`，`MONEYNESS` 0.8→1.2 步长 0.025 | 仓库 `scripts/fetch-options.mjs` L47、L179 | 文件 mtime 2026-08-31 |
| 风险标签阈值：Δ高 ≥0.30、缓冲薄 <5%、价差宽 >15%、临期 ≤7、IV极高 >60 | 五条 | **仍成立（两处小瑕疵）** | 阈值与 `flags()` 完全一致。瑕疵一：「临期 DTE ≤ 7」与筛选下限 DTE ≥ 5 叠加，只能在 5–7 天这一窄带触发。瑕疵二：CC 那一侧标签仍叫「缓冲薄」，但判定用的是上涨空间（表头会切成"上涨空间"，标签文字不切） | `options/index.html` L430–L439 | — |
| 正文：「GitHub Actions 在美股交易时段定时抓」 | 交易时段 | **仍成立** | cron `0 14,17,19 * * 1-5` 与 `55 19 * * 1-5`（UTC）= EDT 10:00 / 13:00 / 15:00 / 15:55，均在交易时段内 | 仓库 `.github/workflows/options.yml` | 文件 mtime 2026-08-31 |
| 名词解释：「看跌的 Δ 绝对值<b>粗略</b>等于到期被指派的概率」 | 粗略等于 | **仍成立** | 业界通用近似，页面已用"粗略"限定。严格说 Δ 近似的是到期在价内的风险中性概率，略高于 N(d₂)，且不含提前指派 | — | — |

### 建议改动（options）

1. **把「卖价」全部改成「买价」，并统一公式。** 三处：

   - 正文年化说明改为：
     > 年化 = **买价** ÷ 行权价 × 365 ÷ 剩余天数，即现金担保看跌的资金年化回报
     > （按最保守的买价成交计算）。

   - 名词解释「年化（看跌）」改为：
     > 年化 = **买价** ÷ 行权价 × 365 ÷ 剩余天数，就是这笔冻结资金的回报率。用买价
     > 而不是中间价，因为那是立刻能成交的一侧。

   - 两张明细表的 `<th>卖价</th>` 改成 `<th>买价</th>`（现金担保看跌表、备兑看涨表
     各一处）。

   「价差 =（卖价−买价）÷中间价」那条**不要动**，它那里的卖价确实是 ask。

2. **名词解释补一条「年化（看涨）」**，把两条腿分母不同这件事说出来：
   > **年化（看涨）** 备兑看涨的股票已经在手上，所以回报按**现价**算：年化 = 买价 ÷
   > **现价** × 365 ÷ 剩余天数。和看跌那条的分母（行权价）不同，两列数字不要直接相减。

3. **风险标签定义里点明 SQQQ 是反向基金。** 把
   > **杠杆** = 三倍杠杆 ETF

   改成
   > **杠杆** = 三倍杠杆 ETF（名单里的 SQQQ 是 **−3 倍反向**，方向与其余四只相反）

   并在 lede 或收尾段补一句风险提示，因为整页前提是"跌下来你愿意接"：
   > 名单里的 SQQQ 是 −3 倍反向基金：卖它的看跌等于做多"纳指下跌"，被指派后长期持有
   > 的衰减性质和 3 倍做多完全不是一回事。

4. **收尾那句点名 AAPL、QQQ 的断言改成不带代码的版本。** 把
   > 换成「年化 ÷ IV30」，排序立刻变成 AAPL、QQQ 在前

   改成
   > 换成「年化 ÷ IV30」，排在前面的通常变成七姐妹里的个股，杠杆 ETF 会掉下去几位
   > ——但掉不干净，波动最高的那只往往还留在前列。

   理由：这是随每次快照变化的实测排名，硬编码具体代码必然过时（当日实际前三是
   TSLA、META、AAPL，QQQ 完全不在前八，SOXL 仍在第七）。

5. **lede 的「永远」降级成「基本恒定」**，与正文措辞对齐：
   > 按年化排序，榜首**基本恒定**是杠杆 ETF —— 那是风险的标价，不是白捡的收益。

6. **数据与口径第一条加上 Cboe 的抓取限制**，这条最好别省：
   > Cboe 延迟行情 — 用的是 `delayed_quotes/options` 的公开 JSON 端点，IV 与希腊
   > 字母取交易所计算值，不是自己反解。**注意 Cboe 在延迟行情页面明文禁止用程序
   > 批量抓取该数据并声明会封 IP，本页的定时抓取属于自用演示，随时可能被断。**

7. 可选，不在页面上但顺手：`.github/workflows/options.yml` 里那个 step 名字还叫
   `Fetch Deribit option chain`，实际跑的是 Cboe 的 `fetch-options.mjs`，是遗留标签。

8. 不用改：22 标的名单、全部筛选条件、曲面口径、五个风险标签阈值、「年化 ÷ IV30」
   的口径表述、Δ≈指派概率的说法，均与实现和一手源一致。

---

## 三、`catchup/index.html` 被追赶的经济体

### 3.1 世界银行数据核对

所有值取自 World Bank Indicators API（`lastupdated = 2026-07-13`），实测于
2026-09-04。指标代码：储蓄 `NY.GNS.ICTR.ZS`、资本形成 `NE.GDI.TOTL.ZS`、私人信贷
`FS.AST.PRVT.GD.ZS`、人均 GDP PPP `NY.GDP.PCAP.PP.KD`、65 岁以上占比
`SP.POP.65UP.TO.ZS`、现价美元 GDP `NY.GDP.MKTP.CD`。

| 页面位置（原文片段） | 页面当前值 | 核对结果 | 正确值 | 一手来源 URL | 来源发布日期 |
|---|---|---|---|---|---|
| 「美国…缺口一直是负的（2024 年 <b>−4.9%</b>）」（出现两次：逐项细节、反证一） | −4.9% | **仍成立** | 2024 年 = **−4.93%**。美国尚无 2025 年值 | <https://api.worldbank.org/v2/country/USA/indicator/NY.GNS.ICTR.ZS?format=json> 与 `NE.GDI.TOTL.ZS` | lastupdated 2026-07-13 |
| 「德国…缺口 2000 年还是 <b>−1.8%</b>，2015 年摆到 <b>+8.1%</b>」（出现两次） | −1.8 → +8.1 | **仍成立** | 2000 = **−1.82%**，2015 = **+8.13%** | 同上，`country/DEU` | lastupdated 2026-07-13 |
| 「日本…私人部门信贷占 GDP 从 2000 年的 <b>206%</b> 掉到 2010 年的 <b>158%</b>，十年去掉 <b>48</b> 个百分点」 | 206 → 158，−48pp | **仍成立** | 2000 = **205.75%**，2010 = **158.19%**，变化 **−47.6pp** | <https://api.worldbank.org/v2/country/JPN/indicator/FS.AST.PRVT.GD.ZS?format=json> | lastupdated 2026-07-13 |
| 「中国…从 2015 年的 <b>150%</b> 涨到 2024 年的 <b>194%</b>，创历史新高且还在升」 | 150 → 194 | **仍成立** | 2015 = **149.63%**，2024 = **194.31%**；2024 确为整条序列最大值；2023 = 189.6 → 2024 = 194.3 仍在升。世行暂无 2025 年值 | <https://api.worldbank.org/v2/country/CHN/indicator/FS.AST.PRVT.GD.ZS?format=json> | lastupdated 2026-07-13 |
| 「英国和韩国：相对收入几乎一样（<b>70.2%</b> 与 <b>72.4%</b>），缺口一个 <b>−2.5%</b>、一个 <b>+6.5%</b>」 | 四个数 | **仍成立** | 2025 年：英国 relUS **70.2%**、缺口 **−2.51%**；韩国 relUS **72.4%**、缺口 **+6.47%**。四个数逐位吻合 | `NY.GDP.PCAP.PP.KD` + 储蓄／资本形成，`country/GBR;KOR` | lastupdated 2026-07-13 |
| 「德国 <b>−0.84</b>、韩国 <b>+0.45</b>，方向相反」（规格表脚注 + 表下注） | −0.84 / +0.45 | **仍成立** | 独立复算 Pearson r：德国 **−0.838**（n=23）、韩国 **+0.451**（n=45） | 同上两组指标全序列，按 `fetch-catchup.mjs` 同一算法复算 | lastupdated 2026-07-13 |
| 「日本 1990 年被追上时，人均 GDP（购买力平价）已经是美国的 <b>81%</b>，德国是 <b>95%</b>」 | 81 / 95 | **仍成立** | 1990 年：日本 **81.4%**、德国 **95.4%**（`NY.GDP.PCAP.PP.KD` 该序列最早年份即 1990） | <https://api.worldbank.org/v2/country/JPN;DEU;USA/indicator/NY.GDP.PCAP.PP.KD?format=json> | lastupdated 2026-07-13 |
| 「中国现在是 <b>31%</b>」（正文 + 指标说明 `IND_NOTE.relUS` 两处） | 31% | **已过时** | 世行最新（**2025**）为 **32.6%**；同时有缺口数据的那年（2024）是 **31.5%**。页面自带 `catchup.json` 里 CHN relUS 最新值**已经是 32.6**，规格表第一行会显示 32.6，正文却仍写 31%，同页自相矛盾 | 同上，`country/CHN`；`catchup/data/catchup.json` | lastupdated 2026-07-13 |
| 「日本 65 岁以上占到 <b>12.2%</b> 那年（1990），人均 GDP（PPP）是 <b>36,138</b> 国际元。中国到 <b>12.6%</b> 那年（2020），人均只有 <b>19,215</b>…不到日本当年的 <b>54%</b>」 | 五个数 | **仍成立** | 日本 1990：old65 **12.16%**、pppcap **36,138**；中国 2020：old65 **12.65%**、pppcap **19,215**。比值 19,215 / 36,138 = **53.2%**，"不到 54%"成立。五个数逐位吻合 | `SP.POP.65UP.TO.ZS` 与 `NY.GDP.PCAP.PP.KD`，`country/JPN;CHN` | lastupdated 2026-07-13 |
| 老龄化图纵轴「人均 GDP（购买力平价，国际元）」 | 未标基年 | **口径不完整** | 该指标现为 **2021 年不变价国际元**（世行 2024 年随 2021 轮 ICP 从 2017 基年改过来）。不写基年读者无法复现，也无法和引用 2017 基年的旧文章对照 | 指标名实测返回 `GDP per capita, PPP (constant 2021 international $)` | lastupdated 2026-07-13 |
| 对照表：「储蓄减投资缺口仅 <b>+2.2%</b>，远低于德国 <b>+5.6%</b>、日本 <b>+4.4%</b>」 | +2.2 / +5.6 / +4.4 | **部分已过时** | 中国 2024 = **+2.23%** ✓、日本 2024 = **+4.38%** ✓；**德国 +5.6% 是 2024 年值，世行已有 2025 = +4.44%**。同页 `verdict-gap` 图用 `lastAt()` 动态取最新年，会画成德国 **+4.4**，与表里的 +5.6 直接打架 | 同上，`country/DEU` 2024 = 5.62、2025 = 4.44 | lastupdated 2026-07-13 |
| 「资本形成仍占 GDP <b>40% 以上</b>，全球最高之列」（出现两次） | 40% 以上 | **仍成立但逼近临界** | 中国 2024 = **40.48%**；2023 = 41.13%、2022 = 42.36%，三年连降。再降一年这句就不成立了 | <https://api.worldbank.org/v2/country/CHN/indicator/NE.GDI.TOTL.ZS?format=json> | lastupdated 2026-07-13 |
| 「中国占它 GDP 的比例从 40 年前的 <b>7.1%</b> 涨到现在的 <b>63.4%</b>」 | 7.1 → 63.4 | **仍成立** | 现价美元 GDP：2025 年 CHN/USA = **63.4%**；1985 年 = **7.1%**。"40 年前"对应 1985 ✓ | <https://api.worldbank.org/v2/country/CHN;USA/indicator/NY.GDP.MKTP.CD?format=json> | lastupdated 2026-07-13 |
| 「扩到 <b>235</b> 个国家—年度观测，相关系数同样接近零」 | 235 | **仍成立（会漂）** | 独立复算面板 n = **235**、r = **−0.075**；横截面 r = **−0.162**（n=7）。但正文里的"235"是硬编码，而散点注脚的 r 与 n 是从 JSON 注入的 —— 世行下次发布新年份，正文会和注脚对不上 | 按 `fetch-catchup.mjs` 同一算法复算；`catchup.json.stats` | lastupdated 2026-07-13 |
| 竖线注：「欧元启动（<b>1999</b>）与哈茨改革实施期（<b>2003–2005</b>）」 | 1999 / 2003–2005 | **仍成立** | 欧元 **1999-01-01** 以记账货币启动（现钞 2002-01-01）；哈茨 I 自 **2003-01-01** 起分阶段实施，哈茨 IV **2005-01-01** 生效 | <https://www.ecb.europa.eu/euro/intro/html/index.en.html>；<https://www.imf.org/external/pubs/ft/wp/2015/wp15162.pdf>（IMF WP/15/162） | ECB 页面现行版；IMF 2015 |
| 数据来源清单（GDP 现价美元、人均 GDP 2015 不变价、总储蓄、资本形成、对外直接投资净流出） | 五条 | **不完整** | 页面实际还用了三条没列出来的指标：私人部门信贷 `FS.AST.PRVT.GD.ZS`、65 岁以上人口占比 `SP.POP.65UP.TO.ZS`、人均 GDP PPP `NY.GDP.PCAP.PP.KD`（2021 年不变价国际元）。规格表、信贷对比图、老龄化图、相对收入图全靠这三条 | 仓库 `scripts/fetch-catchup.mjs` L19–L30 | 文件 mtime 2026-08-31 |
| 对照选择器「韩国追日本（人均）」显示"尚未"超过 | 尚未 | **仍成立但口径值得点破** | 在页面该处所用的"人均 GDP（2015 年不变价）"口径下，韩国从未超过日本（2025 = 97.0%），正确。但换成同页别处在用的 PPP 口径，韩国 **2014 年就已超过日本**，2025 年是日本的 **115.4%**。同一页两个口径给出相反结论 | `NY.GDP.PCAP.KD` 与 `NY.GDP.PCAP.PP.KD`，`country/KOR;JPN` | lastupdated 2026-07-13 |
| 规格表「私人信贷 / GDP」德国列 | 由 JSON 注入 | **数据年份不齐（非错误）** | 德国该指标最新只到 **2023（77.3%）**，其余国家是 2024／2025。德国的相关系数 n 只有 23，页面把 −0.84 与别国（n=43–46）并排比较，样本长度差一倍 | <https://api.worldbank.org/v2/country/DEU/indicator/FS.AST.PRVT.GD.ZS?format=json> | lastupdated 2026-07-13 |

### 3.2 辜朝明框架引用核对

待补：框架主张（三阶段两拐点的原始表述、各阶段货币／财政政策与借款人的九格断言、
《被追赶的经济体》与 *The Other Half of Macroeconomics* / *Pursued Economy* 的版本
关系、辜本人对中国所处阶段的表述、里根减税作为正面例子、可证伪性批评）的一手源
核对正在进行，结果补在本节。

### 建议改动（catchup）

1. **正文两处「中国现在 31%」改成带年份的写法。** 页面自己的 JSON 已经是 32.6 了。
   - 「二、被追赶的时候，收入水平差了一个量级」段改为：
     > 日本 1990 年被追上时，人均 GDP（购买力平价）已经是美国的 **81%**，德国是
     > **95%**。中国 2025 年是 **32.6%**。
   - 指标说明 `IND_NOTE.relUS` 改为：
     > …日本被追上时在 81%，中国 2025 年 32.6% —— 被追赶发生在完全不同的收入位置上。

   带上年份，下次世行更新时只需改一个数字，不会再出现正文与规格表打架。

2. **对照表「德国 +5.6%」改成 +4.4%，并标年份。** 那一行改为：
   > 储蓄减投资缺口仅 **+2.2%（2024）**，低于德国 **+4.4%（2025）**、日本
   > **+4.4%（2024）**

   注意：德国更新到 2025 之后，"远低于"已经不成立了 —— 中国 +2.2 对德国 +4.4、
   日本 +4.4，是"低于"不是"远低于"。措辞要一起改，否则同页的 `verdict-gap` 图会
   直接把这句话证伪。

3. **老龄化图与相对收入口径补基年。** 图注或纵轴标签加上「2021 年不变价」：
   > 横轴是 65 岁以上人口占比，纵轴是人均 GDP（购买力平价，**2021 年不变价国际
   > 元**）。

4. **数据来源清单补三条指标。** 在现有那条后面加：
   > 另用私人部门信贷占 GDP（`FS.AST.PRVT.GD.ZS`）、65 岁以上人口占比
   > （`SP.POP.65UP.TO.ZS`）、人均 GDP 购买力平价（`NY.GDP.PCAP.PP.KD`，2021 年
   > 不变价国际元）——规格表、信贷对比、老龄化轨迹与相对收入图用的是这三条。

5. **「资本形成 40% 以上」加一句趋势**，免得下次更新突然失效：
   > 资本形成仍占 GDP **40% 以上（2024 年 40.5%，但已连续三年下滑）**，全球最高之列

6. **正文硬编码的「235 个国家—年度观测」改成从 JSON 注入**，和同段的 r／n 一起来自
   `data.stats.panel`，否则世行加一年就对不上。若不想改代码，至少加上"截至
   2026-07-13 的世行数据"。

7. **可选：韩国追日本那一对补一句口径提示。** 在 `ratio-note` 或对照表下加：
   > 这里用的是人均 GDP（2015 年不变价）；换成本页别处使用的购买力平价口径，韩国
   > 2014 年就已超过日本。口径不同，结论相反。

8. 不用改：美国 −4.9%、德国 2000 → 2015 的 −1.8 → +8.1、日本 206 → 158、中国
   150 → 194、英韩 70.2/72.4 与 −2.5/+6.5、德韩相关系数 −0.84/+0.45、日本 1990 年
   81% 与德国 95%、老龄化那组五个数（12.2%/36,138 与 12.6%/19,215）、中美 GDP
   7.1% → 63.4%、面板 n=235、欧元 1999 与哈茨 2003–2005 —— 全部与世行现值和一手源
   逐位吻合。

---

## 附：接口实测记录（2026-09-04 04:11–04:25 UTC）

| 接口 | 请求 | HTTP | 返回样例 |
|---|---|---|---|
| Yahoo Finance chart（带 UA） | `GET query1.finance.yahoo.com/v8/finance/chart/^GSPC?range=5d&interval=1d` | **200** | `{"chart":{"result":[{"meta":{"currency":"USD","symbol":"^GSPC",…,"firstTradeDate":-1325583000,"regularMarketPrice":7747.71,…` |
| Yahoo Finance chart（**不带 UA**） | 同上，无 `User-Agent` 头 | **429** | `Edge: Too Many Requests` |
| Yahoo Finance chart 全历史 | `?period1=0&period2=9999999999&interval=1d` | **200** | ^GSPC n=14290，1970-01-02 → 2026-09-03；^DJI n=8730，1992-01-02 →；^IXIC n=14012，**1971-02-05** → |
| Cboe 延迟行情 JSON | `GET cdn.cboe.com/api/global/delayed_quotes/options/AAPL.json` | **200** | `{"timestamp": "2026-09-04 03:44:43", "data": {"options": [{"option": "AAPL260904C00110000", "bid": 216.7, …, "iv": 0.0, "delta": 0.9999, …}], "current_price": 327.7, "iv30": 24.077, …}` |
| Cboe 延迟行情 JSON（全部 22 标的） | 同上，逐个 | **22/22 全 200** | 最小 TNA 535 KB，最大 SPY 5.59 MB |
| Cboe 延迟行情页面 | `GET www.cboe.com/delayed_quotes/aapl/quote_table` | **200** | 页脚含 "IT IS STRICTLY PROHIBITED TO DOWNLOAD DELAYED QUOTE TABLE DATA FROM THIS WEB SITE BY USING AUTO-EXTRACTION PROGRAMS/QUERIES AND/OR SOFTWARE…" |
| World Bank Indicators API | `GET api.worldbank.org/v2/country/JPN;DEU;USA;KOR;CHN;GBR;IND/indicator/{code}?format=json&per_page=20000&date=1980:2026` | **200**（8 个指标全部） | 每个指标 `lastupdated = 2026-07-13`；`NY.GDP.PCAP.PP.KD` 返回名 `GDP per capita, PPP (constant 2021 international $)` |
| Direxion 产品页 | `GET www.direxion.com/product/daily-semiconductor-bull-bear-3x-etfs` | **403** | 被 WAF 拦截；改用 `/uploads/*-Fact-Sheet.pdf`（**200**）作为一手源 |
