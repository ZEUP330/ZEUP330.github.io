# 这个仓库的协作约定

zeup330.github.io，纯静态站，push `main` 即自动部署。

## 两个 agent 同时在这里干活

这个仓库被多个 agent 会话共用过，出现过连续三次「A 的提交裹走了 B 正在写的文件」——
`git add -A` 会把对方未提交的工作一起提交，commit 信息和内容就对不上了。

因此：

- **各自用独立 worktree**。主目录 `~/github/ZEUP330.github.io` 走 `main`；
  第二个 agent 用 `~/github/site-b`，分支 `agent-b`：

  ```bash
  git worktree list                 # 看现有的
  cd ~/github/site-b && git status  # 第二个 agent 在这里干活
  ```

  两边是同一个 `.git`，但工作树和分支互相独立，谁也 `add` 不到对方的文件。
  完成后从 `agent-b` 合回 `main`。

- **永远不要 `git add -A` / `git add .`**，只 `git add` 明确路径。即使有了 worktree，
  这条仍然要守：worktree 防的是跨会话，路径显式防的是自己手滑。

- 提交信息只描述这次实际改的东西。裹进无关文件时，宁可拆成两条提交。

## 结构

```
index.html          主页
mortgage/           房贷年限 × 月供
housing/            全国房价走势地图      housing/data/  ← housing.yml 写入
options/            美股期权 wheel 筛选器  options/data/  ← options.yml 写入
changsha/           长沙行程
assets/statusbar.*  全站共享状态栏（更新时间 + 抽签），每页两行 include
scripts/            两个采集脚本，在 Actions runner 里跑
```

## 几个踩过的坑

- **状态栏的 cron 表是硬编码的**。`assets/statusbar.js` 里的 `SETS[].cron` 必须和
  `.github/workflows/*.yml` 手工保持一致，页面读不到 workflow 文件，改了那边不改这边
  会静默偏差。
- **更新时间走 sidecar**。`*/data/status.json` 只有几十字节，专门给状态栏读；
  数据本体 158KB / 291KB，不要为了一个时间戳让每个页面都下载。
- **数据提交用 amend 压缩**。两个 workflow 都只在 HEAD 是自己的快照提交时才 amend，
  否则每次运行留一个 JSON blob，仓库很快就废了。手写的提交永远不会被改写。
- **图表用 CSS 变量上色时注意 canvas 读不到**。Chart.js / echarts-gl 里要写死 hex，
  inline SVG 才能用 `var(--ink)`。
- **本机连不上 Deribit**（公司网），但 Cboe 可以。采集脚本能不能本地跑要先测。

## 数据与口径

页面上的金融与政策数字都要能追到官方来源，并标注核对日期。所有涉及钱的页面写明
「不构成投资建议」，年化、IV 这类数字要同时给出风险侧（Delta、缓冲、价差、杠杆标记），
不要只展示收益。
