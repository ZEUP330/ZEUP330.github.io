# 2026-09-17 事实核对：rates（美联储一动，谁跟着动）

范围：新页面 `rates/index.html`，以及首页新增的那张卡片。

方法：页面上每一条带数字、日期或制度描述的陈述都追到一手源。数据全部从官方接口直接拉取，
实测时间 2026-09-17 13:19–13:34（香港时间）：美联储 H.15 整包下载、美联储利率变动表原始 HTML、
香港金管局开放 API、欧洲央行数据门户 API、日本银行时间序列 API、Freddie Mac PMMS CSV、
美国财政部 TIC 表 5、TreasuryDirect 拍卖记录。FRED 在公司网络下连不上（超时），没有用。
新闻稿类事实（欧洲央行、日本银行、汇丰、富国）逐份读过官方页面原文；香港金管局 9 月 17 日新闻稿和
Bank of America 的 Prime 页面另用 curl 直接取原文复核过一次。二手报道没有作为任何数字的依据。

核对时的一个前提变化：用户问的是「降息」，但 2026-09-16 的 FOMC 是**加息** 25 个基点。页面按
「利率双向」写，标题、lede 与「现在」一节都据此改过。

---

## 数据处理口径（页面所有图表共用）

| 项 | 口径 |
|---|---|
| 月末值 | 每个月最后一个有值的观测日。H.15 节假日用 `OBS_STATUS="ND"`、`OBS_VALUE="-9999"` 占位，已剔除（第一版没剔，2010-05、2021-05 的 Prime 被读成 −9999） |
| 美联储序列 | 目标区间**上限**，按利率变动表的生效日做阶梯；2008-12-16 之前是单一目标值 |
| 日本序列 | 无担保隔夜拆借利率的**实际成交值**（FM01 / STRDCLUCON），不是政策目标；2013–2016 年日本央行没有利率目标，只有这条序列连续 |
| 9 月的点 | 政策利率取 9 月 17 日生效值；市场利率取各自最新一日（美债 9-15、HIBOR 9-16、日本拆借 9-15、房贷 9-10） |
| 手工覆盖的两个点 | 2026-09 的 Prime = 7.00、香港基本利率 = 4.25。H.15 只到 9-15、金管局 API 只到 9-16，都早于 9-17 的调整；不覆盖的话「进行中」那个周期会显示这两项没动，而美联储已经动了 |
| 推算的美债价格 | `p2` / `p10`：票息 4%、恒定 2 年 / 10 年期，按当月月末收益率定价（半年付息，付息日价格） |
| 912828ZQ6 价格 | 每月月末用 H.15 的 3M/6M/1Y/2Y/3Y/5Y/7Y/10Y 曲线按剩余期限线性插值出收益率，再按半年付息算净价。不是成交价 |
| 相关系数 | 两条序列各自的 12 个月变化（价格用百分比变化），按月重叠，取两者都有值的月份做 Pearson 相关 |
| 周期 | 按美联储目标上限自动切分：从第一次变动前一个月的月末，到同方向最后一次变动那个月的月末 |

---

## 一、「现在」一节

| 页面位置 | 页面当前值 | 核对结果 | 正确值 | 一手来源 | 来源日期 |
|---|---|---|---|---|---|
| 正文 + 关键数字：美联储 | 加息 0.25 至 3.75%–4.00%，9 月 17 日起 | 仍成立 | 声明原文 "raise the target range for the federal funds rate by 1/4 percentage point to 3-3/4 to 4 percent"，12 比 0；利率表生效日 September 17 | <https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm>；<https://www.federalreserve.gov/monetarypolicy/openmarket.htm> | 2026-09-16 |
| 正文：2025 年 9 到 12 月连降三次 | 三次 | 仍成立 | 2025-09-18、10-30、12-11 各降 25bp，至 3.50–3.75% | 同上利率表 | 2025-12-11 |
| 关键数字：香港基本利率 | 4.25%，9 月 17 日起 | 仍成立 | "the Base Rate has been set at 4.25% with immediate effect" | <https://www.hkma.gov.hk/eng/news-and-media/press-releases/2026/09/20260917-3/> | 2026-09-17 |
| 关键数字：美国 Prime | 7.00%，9 月 17 日起 | 仍成立 | Bank of America "7.00% (rate effective as of September 17, 2026)"；Wells Fargo "increasing its prime rate to 7.00 percent from 6.75 percent, effective tomorrow, Sept. 17, 2026"。摩根大通历史页尚无 2026 年记录（未能核到一手源，页面未引用摩根大通） | <https://newsroom.bankofamerica.com/content/newsroom/home/prime-rate-information.html>；<https://newsroom.wf.com/news-releases/news-details/2026/Wells-Fargo-Bank-Increases-Prime-Rate-to-7-00-Percent/default.aspx> | 2026-09-16 / 17 |
| 关键数字：欧洲央行存款利率 | 2.50%，9 月 16 日起 | 仍成立 | 2026-09-10 决定 "increased to 2.50%, 2.65% and 2.90% respectively, with effect from 16 September 2026"；数据门户 DFR 2026-09-16 起 2.5 | <https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.en.html> | 2026-09-10 |
| 关键数字：日本央行 | 约 1.0%，6 月 17 日起；9 月 18 日公布下一次 | 仍成立 | 2026-06-16 "remain at around 1.0 percent"，"effective from June 17, 2026"；9 月会议 "Sept. 17 (Thurs.), 18 (Fri.)"，9 月 17 日下午尚无声明 | <https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2026/k260616a.pdf>；<https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm> | 2026-06-16 |
| 关键数字：10 年期美债 | 5.00%（9-15），一年前 4.16% | 仍成立 | RIFLGFCY10_N.B：2026-09-15 = 5.00；2025-09-30 = 4.16 | 美联储 H.15 整包（`H15_data.xml` 文件时间 2026-09-16 11:49） | 2026-09-16 |
| FOMC 时间轴 | 8 次会，前 5 次不变，9 月加息，下次 10/27–28 | 仍成立 | 日历：1/27–28、3/17–18、4/28–29、6/16–17、7/28–29、9/15–16、10/27–28、12/8–9；利率表 2026 年只有 9-17 一条 | <https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm> | 2026-09-17 抓取 |
| 三家央行小图说明 | 2024–2025 美联储、欧洲央行在降，日本央行在加；今年美联储、欧洲央行又加 | 仍成立 | 欧洲央行 2024-06-06 起降，2026-06-11、09-10 两次加；日本央行 2024-07-31、2025-01-24、2025-12-19、2026-06-16 四次加 | 欧洲央行各期新闻稿；日本银行各期声明（见第二节） | — |

## 二、「七个东西」卡片

| 页面位置 | 页面当前值 | 核对结果 | 正确值 | 一手来源 | 来源日期 |
|---|---|---|---|---|---|
| 美国的银行：30 年房贷 | 6.76%（9 月 10 日） | 仍成立 | `9/10/2026,6.76` | <https://www.freddiemac.com/pmms/docs/PMMS_history.csv> | 2026-09-10 |
| 美国的银行：储蓄 / 12 个月定存 | 0.38% / 1.71%，8 月 17 日公布 | 仍成立 | "Monthly Rate Cap Information as of August 17, 2026"：Savings 0.38、12 month CD 1.71；页面说明这些是上月最后一个营业日的数据 | <https://www.fdic.gov/national-rates-and-rate-caps> | 2026-08-17 |
| 美国的银行：Prime = 上限 + 3 | 恒等 | 仍成立 | H.15 Prime 月末值与美联储上限之差：2009-01 至 2026-08 每个月都正好 3.00（9 月为时间差，见口径表） | H.15 + 利率表 | — |
| 香港：基本利率公式 | 下限 + 0.5，或 HIBOR 腿，取高 | 仍成立 | "50 basis points above the lower end of the prevailing target range for the US federal funds rate" … "or the average of the five-day moving averages of the overnight and one-month … HIBORs …, whichever is the higher" | 金管局 20260917-3 | 2026-09-17 |
| 香港：HIBOR 腿真的起过作用 | 2019-12、2020-03~05 | 仍成立 | 基本利率月末值 ≠ 美联储上限 + 0.25 的月份只有这四个（2009-04 之后，不含 9 月时间差） | 金管局 API `disc_win_base_rate` | — |
| 香港：1 个月 HIBOR | 2.95%（9 月 16 日） | 仍成立 | `end_of_date 2026-09-16, hibor_fixing_1m 2.95` | <https://api.hkma.gov.hk/public/market-data-and-statistics/daily-monetary-statistics/daily-figures-interbank-liquidity> | 2026-09-16 |
| 欧洲央行：2025 年降到 2%，今年 6、9 月各加 0.25 | — | 仍成立 | 2025-06-05 决定，6-11 起 2.00%；2026-06-11 决定，6-17 起 2.25%；2026-09-10 决定，9-16 起 2.50% | ECB mp250605 / mp260611 / mp260910 | — |
| 日本央行：2016–2024 负利率，2024-03 结束 | — | 仍成立 | 2016-01-29 宣布 −0.1%（2016-02-16 起）；2024-03-19 宣布约 0–0.1%（3-21 起）；期间利率未变 | <https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2016/k160129a.pdf>；<https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2024/k240319a.pdf> | — |
| 美债收益率曲线 | 9-15：4.11 / 4.67 / 5.00 / 5.36；一年前 4.02 / 3.60 / 4.16 / 4.73 | 仍成立 | H.15 RIFLGFCM03 / Y02 / Y10 / Y30 的 2026-09-15 与 2025-09-30 | H.15 | 2026-09-16 |
| US-T 跷跷板 | 5% → 6%，92.21 → 85.12，−7.7% | 计算 | 票息 4%、10 年、半年付息：P(5%) = 92.21，P(6%) = 85.12 | 债券定价公式 | — |

## 三、「推手排名」

| 页面位置 | 页面当前值 | 核对结果 | 正确值 | 一手来源 | 来源日期 |
|---|---|---|---|---|---|
| 得分 | 美联储 12.5、美债收益率 5、欧洲央行 2、日本央行 2 | 本页判断 | 由页面连线表的强弱（3/2/1）按「直接计分、隔一层计一半」算出，脚本里同一张表同时画首图。强弱是基于公开机制的判断，不是统计结果，页脚已写明 | — | — |
| 日本是美债最大海外持有者 | 2026 年 7 月末 1.10 万亿美元 | 仍成立 | Table 5：Japan 2026-07 = 1103.9（十亿美元），排第一；英国 998.3 第二 | <https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/slt_table5.txt> | 2026-09-17 抓取 |

## 四、「两两对比」里由数据得出的句子

以下数字都由页面内嵌数据算出（周期起止为月末值），页面脚本和本笔记的复算一致。

| 页面位置 | 页面当前值 | 核对结果 | 依据 |
|---|---|---|---|
| 美联储 → 美国的银行 | 2024-09 到 2025-12 房贷 6.35% → 6.15% | 仍成立 | PMMS 2024-08 最后一周 6.35、2025-12 最后一周 6.15 |
| 美联储 → 香港 | 2019-07 到 2020-03 基本利率 −1.10、HIBOR +0.12 | 仍成立 | 金管局 API 与月末 HIBOR 表 |
| 美联储 → 美债收益率 | 10 年期 3.91% → 4.18%；2 年期 3.47% → 4.67% | 仍成立 | H.15：2024-08-30、2025-12-31、2026-09-15 |
| 美联储 → US-T | 2 年期推算价格 +0.8%，10 年期 −2.2% | 仍成立 | 票息 4% 恒定期限推算：p10 100.74 → 98.54 |
| 美联储 → 欧洲央行 | 早 3 个月开始降息；2015–2018 欧洲央行降往负利率 | 仍成立 | ECB 2024-06-06 宣布（6-12 起）vs 美联储 2024-09-18 宣布（9-19 起）；DFR 2015-12-09 −0.30、2016-03-16 −0.40 |
| 美联储 → 日本央行 | 拆借 +0.50；相关系数 0.06 | 仍成立 | BoJ 拆借 2024-08 0.23 → 2025-12 0.73 |
| 美国的银行 ↔ 香港 | 汇丰 P 5.00% → 5.875%（加 0.875），后降回 5.00%（降 0.875） | 仍成立 | 汇丰新闻稿：2022-09-23 起 5.125%、2022-11-04 起 5.375%、2022-12-16 起 5.625%、2023-05-05 起 5.75%、2023-07-28 起 5.875%；2024-09-20 起 5.625%、2024-11-11 起 5.375%、2024-12-20 起 5.25%、2025-09-19 起 5.125%、2025-10-31 起 5.00%；2026-07-30 稿 "last changed on 31 October 2025"。9 月 17 日 13:41（香港时间）前汇丰、中银香港官网仍显示 5.00%，渣打这一轮未能核到一手源，页面没写「今天没跟」 |
| 美债收益率 ↔ 香港 | 2025-05 月末 HIBOR 0.59%，3 个月美债 4.36% | 仍成立 | 金管局月末 HIBOR 表；H.15 2025-05-30 |
| 欧洲央行 → 美国的银行 | 相关系数 0.66 | **错误，已改** | 初稿写 0.68，是用 9 月 Prime 覆盖之前的数据算的；覆盖后重算为 0.66 |
| 美国的银行 ↔ US-T | 储蓄 0.38%、定存 1.71%，同一天 3 个月美债 3.83% | 仍成立 | FDIC（7 月底数据）；H.15 2026-07-31 |
| 欧洲央行 ↔ 日本央行 | 欧洲央行一年多加 4.5 个百分点 | 仍成立 | DFR 2022-07-27 起 0.00（此前 −0.50）至 2023-09-20 起 4.00 |
| 其余相关系数 | 0.84 / 0.66 / 0.06 / 0.36 / 0.12 / −0.35 / 0.13 / −0.14 | 仍成立 | 按口径表复算，与页面实时计算一致 |
| 美债收益率 → US-T | 4% → 5%：2 年 −1.9%、10 年 −7.8%、30 年 −15.5% | 计算 | P = 98.12 / 92.21 / 84.55（票息 4%） |

## 五、「US-T 为什么会涨会跌」

| 页面位置 | 页面当前值 | 核对结果 | 正确值 | 一手来源 | 来源日期 |
|---|---|---|---|---|---|
| 912828ZQ6 | 10 年期、票息 0.625%，2020-05-15 发行，2030-05-15 到期 | 仍成立 | securityTerm "10-Year"，interestRate 0.625000，issueDate 2020-05-15，maturityDate 2030-05-15，首次拍卖 highYield 0.700、价格 99.276869 | <https://www.treasurydirect.gov/TA_WS/securities/search?cusip=912828ZQ6&format=json> | 2020-05-12 拍卖 |
| 912828ZQ6 推算价格 | 2023-10 最低约 76，现在约 86 | 计算 | 2023-10 月末 76.45；2026-09-15 为 86.17；反推收益率 4.78% | 口径表「912828ZQ6 价格」 | — |
| 港元汇率区间 | 7.75–7.85，最多差 1.3% | 仍成立 | 金管局 API `cu_strongside 7.75`、`cu_weakside 7.85`；7.85 / 7.75 − 1 = 1.29% | 金管局 API | 2026-09-16 |

IBKR 相关的几条（US-T 的标注方式、按面值百分比报价、应计利息、持仓估值）见文末补记。

## 补记：IBKR 与 TreasuryDirect

IBKR 主站（interactivebrokers.com / .com.hk）在核对时的网络下打不开（curl HTTP 000、连接被拒），
IBKR Campus 会跳回主站，同样打不开；能打开的是 ibkrguides.com。以下只写 ibkrguides 与 TreasuryDirect
原文里有的东西。

| 页面位置 | 页面当前值 | 核对结果 | 正确值 | 一手来源 | 来源日期 |
|---|---|---|---|---|---|
| 七个东西 · US-T 卡 | TWS 里输入 US-T 能查到美国国债 | 仍成立 | 观察列表可输入 US-T，同页还列了 Treasuries、US Treasuries、US Treasury、United States Treasuries。它是否作为持仓或结单里的标签：未能核到一手源，页面没这么写 | <https://www.ibkrguides.com/traderworkstation/trade-treasuries.htm> | 页面日期未取到 |
| 七个东西 · US-T 卡 | T-bill 不付息，低于或等于面值买、到期拿回面值；note 2–10 年、bond 20/30 年每半年付息 | 仍成立 | "Bills are sold at a discount or at par (face value). When the bill matures, you are paid its face value."；期限 4–52 周。Notes "for a term of 2, 3, 5, 7, or 10 years"，Bonds "either 20 or 30 years"，均 "pay a fixed rate of interest every six months" | <https://www.treasurydirect.gov/marketable-securities/treasury-bills/>；<https://www.treasurydirect.gov/marketable-securities/treasury-notes/>；<https://www.treasurydirect.gov/marketable-securities/treasury-bonds/> | 页面无更新日期 |
| US-T 涨跌 · 应计利息 | 中途买入先付前手攒的利息；结单 Bond Interest Paid、持仓 Accrued Int. 列 | 仍成立 | 结单 Bond Interest Paid 一节记付息周期中途买入时付给前手的利息；Open Positions 债券部分有 Accrued Int. 列（2014-10-29 起替换原 Mult 列）。TWS / Client Portal 的持仓列：未能核到一手源，页面没写 | <https://www.ibkrguides.com/reportingreference/reportguide/bondinterestpaid_default.htm>；<https://www.ibkrguides.com/reportingreference/reportguide/openpositions_default.htm> | 页面日期未取到 |
| US-T 涨跌 · 价格口径 | 价格按每 100 美元面值算 | 仍成立 | TreasuryDirect 拍卖记录字段 `pricePer100`（912828ZQ6 首拍 99.276869）。「IBKR 按面值百分比报价」：未能核到一手源，页面没有归到 IBKR 名下 | TreasuryDirect 拍卖记录（见第五节） | 2020-05-12 |
| US-T 涨跌 · 买卖价差 | 买入付卖价、马上卖掉拿买价，先亏一个价差 | 算术说明 | 例子数字是假设的。IBKR 债券持仓按买价、中间价还是评估价估值：未能核到一手源，页面删掉了初稿里「刚买进按买价估」的说法 | — | — |
| 美国的银行 ↔ US-T | 美债不是存款，没有存款保险 | 仍成立 | FDIC 不受保产品列有 "U.S. Treasury Bills, Bonds or Notes"，并注明由美国政府完全信用担保 | <https://www.fdic.gov/resources/deposit-insurance/financial-products-not-insured> | 2026-09-17 抓取 |

## 补记：改为每月自动更新（2026-09-17）

- 页面数据从内联改为读取 `rates/data/rates.json`：由 `scripts/fetch-rates.mjs` 从上文同一批一手源抓取，
  `.github/workflows/rates.yml` 每月 26 日 03:30 UTC 运行，状态栏读 `rates/data/status.json`。
- **对账**：新脚本重抓后，2007-01 到 2026-08 的 12 条月度序列（美联储上限、Prime、3 个月 / 2 年 / 10 年 /
  30 年期收益率、30 年房贷、香港基本利率、1 个月 HIBOR、欧央行存款利率、日本拆借利率、912828ZQ6 推算价格）
  与上文人工核对时的数据逐月完全一致。HIBOR 改为取每日定盘的月末值，与金管局月末表逐月相同。
- **取消了手工覆盖**：9 月的 Prime（7.00）和香港基本利率（4.25）不再手填。未完结月份的最后一个点统一截到各日频源
  共同的最新日期（这次是 9 月 15 日），所以图表里 9 月的点是加息之前的值；「现在」一节的数字卡各自显示本源最新一日，
  美联储已调整而 Prime、香港基本利率的数据还没更新到那天时，页面会注明。
- 改为运行时由数据生成的：「现在」一节的正文与数字卡、FOMC 时间轴、美国的银行与香港两张卡片图、各卡片与图注里的
  日期、两两对比里引用的相关系数与 HIBOR / FDIC 数字、房贷利差区间。写死在页面里的只剩带明确年份的历史陈述。
- 日本的数字卡由「政策利率约 1.0%」（人工读自日本银行声明）改为「无担保隔夜拆借利率」（API 实际成交值），
  因为政策目标没有可以直接抓取的接口；两者目前差 0.02 个百分点。
- 抓取失败的源沿用上一次的数据并写进 `failures`；月份数或任一序列的有值月份数比上次少时，整次不写。
  金管局 API 在 2026-09-17 下午有一段时间对所有请求返回 502，所以请求对 5xx 和超时各重试两次。
- 选 26 日的依据：FDIC 每月第三个周一（15–21 日）公布；2018 年以来美联储 27 次利率变动没有一次在 25、26 日生效，
  这一天抓取时 Prime 与香港基本利率通常已经跟上美联储。
