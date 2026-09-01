/* Builds the frozen section rail from whatever h2[id] a page already has, so a
   page gets a table of contents by adding two tags rather than by carrying its
   own copy of this logic. Changsha keeps its own rail: it groups sections
   rather than listing them, which this does not model. */
(function () {
  'use strict';

  // Section titles are written to read in place ("三、击鼓传花：10 个人各赚
  // 100 万，这些钱从哪来"), which is far too long for a pill. Cut at the first
  // structural punctuation and drop any leading enumerator. A page can always
  // override with data-rail.
  function label(h) {
    var explicit = h.getAttribute('data-rail');
    if (explicit) return explicit;
    var t = (h.textContent || '').trim();
    t = t.replace(/^[一二三四五六七八九十０-９0-9]+[、.．]\s*/, '');
    t = t.split(/[：:（(—·，,、]/)[0].trim();
    // Never cut mid-phrase: if it is still long there is no good break
    // point, so mark the truncation rather than pretending it is a title.
    return t.length > 9 ? t.slice(0, 8) + '…' : t;
  }

  function build() {
    var main = document.querySelector('main');
    if (!main || document.querySelector('.rail')) return;
    var heads = Array.prototype.slice.call(main.querySelectorAll('h2[id]'))
      // A heading whose text is filled in by script is empty at build time and
      // would render as a blank pill.
      .filter(function (h) { return label(h).length > 0; });
    // One or two sections is not a table of contents, it is noise.
    if (heads.length < 3) return;

    var rail = document.createElement('nav');
    rail.className = 'rail';
    rail.setAttribute('aria-label', '章节导航');
    var inner = document.createElement('div');
    inner.className = 'rail-in';

    var items = heads.map(function (h) {
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = label(h);
      inner.appendChild(a);
      return { el: h, link: a };
    });
    rail.appendChild(inner);
    main.parentNode.insertBefore(rail, main);

    // The status bar above is injected by a deferred script of its own, so its
    // height is not knowable at parse time. Measure it, and re-measure on
    // resize, rather than hard-coding an offset the two bars would fight over.
    var railTop = 0, railH = 44;
    function setTop() {
      var bar = document.querySelector('.zb') || document.querySelector('.statusbar');
      railTop = bar ? Math.round(bar.getBoundingClientRect().height) : 0;
      railH = Math.round(rail.getBoundingClientRect().height) || 44;
      document.documentElement.style.setProperty('--rail-top', railTop + 'px');
      document.documentElement.style.setProperty('--rail-h', railH + 'px');
    }

    function setCurrent(cur) {
      items.forEach(function (x) {
        x.link.setAttribute('aria-current', x === cur ? 'true' : 'false');
      });
      var a = inner.querySelector('[aria-current="true"]');
      if (!a) return;
      var l = a.offsetLeft, w = a.offsetWidth, sw = inner.clientWidth;
      if (l < inner.scrollLeft || l + w > inner.scrollLeft + sw) {
        inner.scrollTo({ left: Math.max(0, l - sw / 2 + w / 2), behavior: 'smooth' });
      }
    }

    // Geometry rather than IntersectionObserver: these pages are read inside
    // embedded panes and background tabs where observers and rAF are suspended,
    // and sections expand and collapse under any cached offsets.
    function pick() {
      // Re-measure whenever the bar above has changed height. The status bar has
      // an expandable panel and is itself sticky, so when it opens the rail must
      // move down with it - otherwise every anchor lands underneath. A
      // ResizeObserver on it did not fire reliably here, and this check is two
      // getBoundingClientRect calls on a tick that already runs.
      var bar = document.querySelector('.zb') || document.querySelector('.statusbar');
      var h = bar ? Math.round(bar.getBoundingClientRect().height) : 0;
      if (h !== railTop) setTop();

      var edge = railTop + railH + 12;
      var cur = items[0];
      items.forEach(function (x) {
        if (x.el.getBoundingClientRect().top <= edge) cur = x;
      });
      // At the foot of the page the last sections never cross the edge line, so
      // they could never be marked current. Once scrolled to the bottom, take
      // the last one that is visible at all.
      var se = document.scrollingElement || document.documentElement;
      if (se.scrollTop + window.innerHeight >= se.scrollHeight - 4) {
        items.forEach(function (x) {
          if (x.el.getBoundingClientRect().top < window.innerHeight) cur = x;
        });
      }
      setCurrent(cur);
    }

    setTop();
    pick();
    window.addEventListener('scroll', pick, { passive: true });
    window.addEventListener('resize', function () { setTop(); pick(); });

    // Try an observer as well; pick() covers the case where it does not fire.
    var watched = null;
    function watch() {
      var bar = document.querySelector('.zb') || document.querySelector('.statusbar');
      if (!bar || bar === watched) return;
      watched = bar;
      setTop();
      if (typeof ResizeObserver === 'function') {
        new ResizeObserver(function () { setTop(); pick(); }).observe(bar);
      }
    }
    watch();
    // The bar may not exist yet; keep looking briefly, then stop.
    var tries = 0;
    var hunt = setInterval(function () {
      watch();
      if (watched || ++tries > 20) clearInterval(hunt);
    }, 150);

    setInterval(pick, 700);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
