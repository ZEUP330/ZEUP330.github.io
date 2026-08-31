// Shared status bar for every page: when each dataset last refreshed, how long
// until the next scheduled run, and the omikuji draw. Injects its own markup so
// a page only needs the two include lines, and reads tiny status.json files
// rather than the multi-hundred-KB datasets they describe.
(function () {
  'use strict';

  // Mirrors .github/workflows/*.yml. The page cannot read the workflow files, so
  // a cron change there has to be repeated here or the countdown drifts silently.
  var SETS = [
    {
      id: 'options', name: '美股期权快照', url: '/options/data/status.json', page: '/options/',
      // options.yml: '0 14,17,19 * * 1-5' and '55 19 * * 1-5'
      cron: { weekdaysOnly: true, times: [[14, 0], [17, 0], [19, 0], [19, 55]] },
      note: '美股交易时段每天 4 次'
    },
    {
      id: 'housing', name: '全国房价指数', url: '/housing/data/status.json', page: '/housing/',
      // housing.yml: '20 3 18,20,24 * *'
      cron: { monthDays: [18, 20, 24], times: [[3, 20]] },
      note: '统计局月度发布后取，每月 3 次'
    }
  ];

  var pad = function (n) { return String(n).padStart(2, '0'); };

  function nextRun(cron, from) {
    for (var d = 0; d < 40; d++) {
      var day = new Date(from.getTime() + d * 86400000);
      if (cron.weekdaysOnly) {
        var dow = day.getUTCDay();
        if (dow === 0 || dow === 6) continue;
      }
      if (cron.monthDays && cron.monthDays.indexOf(day.getUTCDate()) < 0) continue;
      for (var i = 0; i < cron.times.length; i++) {
        var t = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(),
                         cron.times[i][0], cron.times[i][1]);
        if (t > from.getTime()) return new Date(t);
      }
    }
    return null;
  }

  function ago(ms) {
    var h = Math.floor(ms / 3600000);
    if (h < 1) return '不到 1 小时前';
    if (h < 48) return h + ' 小时前';
    return Math.floor(h / 24) + ' 天前';
  }

  function left(ms) {
    if (ms <= 0) return '随时';
    var d = Math.floor(ms / 86400000), h = Math.floor(ms % 86400000 / 3600000);
    var m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000);
    return d ? d + ' 天 ' + h + ' 小时' : h + ':' + pad(m) + ':' + pad(s);
  }

  // ---- omikuji --------------------------------------------------------------
  // Weights lean the way a shrine box does: 吉 common, 大吉 and 大凶 both rare.
  var LEVELS = [
    { n: '大吉', w: 9,  c: 'great', tone: 'great', poem: '风顺水顺，但顺风时最容易忘记看路。' },
    { n: '中吉', w: 17, c: 'good',  tone: 'good',  poem: '云开一线，够看清脚下三步。' },
    { n: '小吉', w: 18, c: 'good',  tone: 'good',  poem: '小小的好，攒起来也是好。' },
    { n: '吉',   w: 22, c: 'mid',   tone: 'mid',   poem: '不惊不险，日子照常。' },
    { n: '末吉', w: 16, c: 'mid',   tone: 'mid',   poem: '好在后头，先把眼下的事做完。' },
    { n: '凶',   w: 15, c: 'bad',   tone: 'bad',   poem: '逆风。收帆比换船便宜。' },
    { n: '大凶', w: 3,  c: 'bad',   tone: 'bad',   poem: '今日诸事从简，明日再议。' }
  ];

  var ITEMS = [
    { k: '願い事', label: '愿望', good: ['开口去问，对方比你以为的更愿意点头。', '差的那一步是行动，不是运气。'],
      mid: ['能成，但要比预想的多花一个月。', '先把它写下来，模糊的愿望没法实现。'],
      bad: ['这次先放着。放着不等于放弃。', '换个更小的版本，先拿到它。'] },
    { k: '仕事', label: '工作', good: ['把手上那件拖了很久的事收尾，会连带解决另外两件。', '适合谈条件，你手里的筹码比你估的多。'],
      mid: ['稳住节奏，别接第五件并行的事。', '今天适合整理，不适合开新坑。'],
      bad: ['别在情绪上头时回那封邮件。', '重要的决定往后放一天，你会写出不一样的版本。'] },
    { k: '金運', label: '财运', good: ['意外的进项，先存一半再说。', '适合把钱挪到该在的地方，比如提前还一点本金。'],
      mid: ['不赔不赚。把自动扣款清单翻一遍会有惊喜。', '大额支出前先睡一觉。'],
      bad: ['今天不适合下单，尤其是分期的那种。', '看到「限时」两个字就先关掉页面。'] },
    { k: '恋愛', label: '恋爱', good: ['主动联系那个人，时机比你想的好。', '把想说的说完整，别只说一半。'],
      mid: ['照常相处就好，不用刻意制造进展。', '听比说管用。'],
      bad: ['不要在深夜发长消息。', '这几天少解释，多做事。'] },
    { k: '健康', label: '健康', good: ['状态不错，适合开始一件需要坚持的事。', '早睡一晚，收益超过任何补品。'],
      mid: ['老毛病照旧，喝水和走路仍然有用。', '久坐是真正的问题，起来动十分钟。'],
      bad: ['小病别拖，今天就去看。', '别熬夜，这一签就是提醒。'] },
    { k: '旅行', label: '出行', good: ['宜远行，路上会遇到值得的事。', '临时起意的那趟车可以坐。'],
      mid: ['能去，但留出比计划多一小时的余量。', '出门前确认末班车时间。'],
      bad: ['行程从简，别赶最后一班。', '带伞。带充电宝。'] },
    { k: '学問', label: '学业', good: ['卡住的地方今天能通，去啃它。', '教会别人一遍，你自己就真的懂了。'],
      mid: ['进度平平，按计划走就行。', '与其看新教程，不如把旧的做完。'],
      bad: ['今天记不住东西，改成整理和复盘。', '基础没打牢，回头补比硬撑快。'] },
    { k: '住まい', label: '安居', good: ['看房的好日子，你能看出别人看不出的问题。', '适合谈价，多问一句就是钱。'],
      mid: ['不急。多看几套，别被第一套锚住。', '把通勤时间乘以两倍再做决定。'],
      bad: ['今天别签任何三十年的字。', '算清楚月供再谈喜欢，顺序别反。'] }
  ];

  var TIE_NOTE = '按参拜的习惯，凶签系在神社的绳架上，把坏运留在那儿再走；吉签则带回家。这里也给你一根绳。';
  var KEEP_NOTE = '按参拜的习惯，吉签带回家，不必系在绳上。签是提醒，不是安排。';
  var KEY = 'omikuji-day';
  var TOTAL = LEVELS.reduce(function (t, l) { return t + l.w; }, 0);
  var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  var today = function () { return new Date().toISOString().slice(0, 10); };

  // ---- markup ---------------------------------------------------------------
  var bar = document.createElement('div');
  bar.className = 'zb';
  bar.innerHTML =
    '<div class="zb-row">'
    + '<button class="zb-toggle" type="button" aria-expanded="false" aria-controls="zb-panel">'
    + '<span class="zb-dot" id="zb-dot"></span>'
    + '<span class="zb-line" id="zb-line">读取更新状态…</span>'
    + '<span class="zb-caret" aria-hidden="true">▾</span></button>'
    + '<button class="zb-draw" id="zb-draw" type="button">🎋 抽一签</button>'
    + '</div>'
    + '<div class="zb-panel" id="zb-panel" hidden><div class="zb-inner">'
    + '<p class="zb-h">数据更新</p><div class="zb-sets" id="zb-sets"></div>'
    + '<p class="zb-note">时间来自各自的 GitHub Actions 工作流。cron 会排队，实际可能晚 10–30 分钟，'
    + '高负载时整次跳过 —— 倒计时是计划时间，不是保证。</p>'
    + '<div class="zb-slip" id="zb-slip" hidden>'
    + '<p class="zb-h">🎋 おみくじ · 今日一签</p>'
    + '<div class="zb-head"><span class="zb-lot" id="zb-lot">—</span><span class="zb-poem" id="zb-poem"></span></div>'
    + '<dl class="zb-items" id="zb-items"></dl>'
    + '<div class="zb-foot"><p class="zb-note" id="zb-slipnote" style="flex:1 1 12rem"></p>'
    + '<button class="zb-small" id="zb-tie" type="button" hidden>結ぶ · 系在这里</button>'
    + '<button class="zb-small" id="zb-again" type="button">再抽</button></div>'
    + '</div></div></div>';

  function mount() {
    document.body.insertBefore(bar, document.body.firstChild);
    wire();
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  function wire() {
    var toggle = bar.querySelector('.zb-toggle');
    var panel = document.getElementById('zb-panel');
    var slip = document.getElementById('zb-slip');
    var drawBtn = document.getElementById('zb-draw');
    var lotEl = document.getElementById('zb-lot');

    var open = function (yes) {
      panel.hidden = !yes;
      toggle.setAttribute('aria-expanded', String(yes));
    };
    toggle.addEventListener('click', function () { open(panel.hidden); });

    function render(lot, isRedraw) {
      lotEl.textContent = lot.n;
      lotEl.className = 'zb-lot ' + lot.c;
      document.getElementById('zb-poem').textContent = lot.poem;
      document.getElementById('zb-items').innerHTML = ITEMS.map(function (it) {
        return '<dt>' + it.k + '</dt><dd>' + pick(it[lot.tone])
             + '<span class="zb-tag"> · ' + it.label + '</span></dd>';
      }).join('');
      var tie = document.getElementById('zb-tie');
      document.getElementById('zb-slipnote').textContent =
        (lot.tone === 'bad' ? TIE_NOTE : KEEP_NOTE) + (isRedraw ? ' 传统上以第一次抽到的为准。' : '');
      tie.hidden = lot.tone !== 'bad';
      tie.textContent = '結ぶ · 系在这里';
      tie.disabled = false;
      slip.hidden = false;
      open(true);
      drawBtn.textContent = '🎋 ' + lot.n + ' · 重抽';
    }

    function draw(isRedraw) {
      var r = Math.random() * TOTAL, acc = 0, lot = LEVELS[LEVELS.length - 1];
      for (var i = 0; i < LEVELS.length; i++) {
        acc += LEVELS[i].w;
        if (r < acc) { lot = LEVELS[i]; break; }
      }
      render(lot, isRedraw);
      try { localStorage.setItem(KEY, JSON.stringify({ d: today(), n: lot.n })); } catch (e) { /* private mode */ }
    }

    drawBtn.addEventListener('click', function () { draw(!slip.hidden); });
    document.getElementById('zb-again').addEventListener('click', function () { draw(true); });
    document.getElementById('zb-tie').addEventListener('click', function () {
      this.textContent = '已系上 · 坏运留在这儿了';
      this.disabled = true;
      document.getElementById('zb-slipnote').textContent =
        '结绳的动作本身没有魔力，作用是让你把这件事放下、然后去做别的。';
    });

    // A slip belongs to the day it was drawn; the shrine does not remember, so
    // this only reminds you that you already drew today.
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && saved.d === today()) drawBtn.textContent = '🎋 今天抽过 ' + saved.n;
    } catch (e) { /* ignore */ }

    loadStatus();
  }

  function loadStatus() {
    var here = location.pathname;
    Promise.all(SETS.map(function (s) {
      return fetch(s.url, { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (j) { return Object.assign({}, s, { t: j && j.t, extra: j }); });
    })).then(function (sets) {
      var box = document.getElementById('zb-sets');
      var tick = function () {
        var now = new Date();
        box.innerHTML = sets.map(function (s) {
          var nx = nextRun(s.cron, now);
          return '<div class="zb-set"><span class="zb-name">' + s.name + '</span>'
            + '<span class="zb-when">' + (s.t ? ago(now - s.t) : '未获取到') + '</span>'
            + '<span class="zb-sub">'
            + (s.t ? new Date(s.t).toLocaleString('zh-CN', { hour12: false }) + ' · ' : '')
            + s.note + ' · 下次 ' + (nx ? left(nx - now) : '—') + '</span></div>';
        }).join('');

        var line = document.getElementById('zb-line');
        var dot = document.getElementById('zb-dot');
        var live = sets.filter(function (s) { return s.t; });
        if (!live.length) {
          line.textContent = '数据状态读取失败 · 点开看详情';
          dot.className = 'zb-dot warn';
          return;
        }
        var staleAfter = function (s) { return s.id === 'housing' ? 40 * 86400000 : 26 * 3600000; };
        // On a page that owns a dataset the headline is about that dataset; on
        // the rest, picking one arbitrarily would be noise, so summarise instead.
        var mine = live.filter(function (s) { return here.indexOf(s.page) === 0; })[0];
        if (mine) {
          var age = now - mine.t;
          var nx2 = nextRun(mine.cron, now);
          line.textContent = '本页数据更新于 ' + ago(age) + (nx2 ? ' · 下次 ' + left(nx2 - now) : '');
          dot.className = 'zb-dot' + (age > staleAfter(mine) * 2 ? ' old' : age > staleAfter(mine) ? ' warn' : '');
        } else {
          var newest = live.reduce(function (a, b) { return b.t > a.t ? b : a; });
          var soonest = live.map(function (s) { return nextRun(s.cron, now); })
            .filter(Boolean).sort(function (a, b) { return a - b; })[0];
          // Keep this short: the draw button shares the row, and on a phone a
          // longer line just gets ellipsed mid-phrase. Detail is in the panel.
          line.textContent = live.length + ' 个数据集 · 最近 ' + ago(now - newest.t)
            + (soonest ? ' · 下次 ' + left(soonest - now) : '');
          var worst = live.some(function (s) { return now - s.t > staleAfter(s); });
          dot.className = 'zb-dot' + (worst ? ' warn' : '');
        }
      };
      tick();
      setInterval(tick, 1000);
    });
  }
})();
