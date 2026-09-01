/* Three small behaviours the shared stylesheet cannot express on its own.
 * Loaded with defer on every page; nothing here is required for the page to
 * be readable, so failing to load degrades to plain-but-correct.
 */
(function () {
  'use strict';

  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 1. Slider fill.
     A native range gives you no way to color the track behind the thumb, so
     the filled portion is a gradient stop driven by this variable. Updated on
     `input`, which fires continuously while dragging - the fill has to track
     the finger, not appear when the drag ends. */
  function fill(el) {
    var min = +el.min || 0, max = +el.max, val = +el.value;
    if (!isFinite(max) || max === min) return;
    el.style.setProperty('--fill', ((val - min) / (max - min)) * 100 + '%');
  }

  var ranges = document.querySelectorAll('input[type="range"]');
  Array.prototype.forEach.call(ranges, function (el) {
    fill(el);
    el.addEventListener('input', function () { fill(el); });
  });

  /* Pages that swap slider values in code (presets, resets) dispatch `input`,
     but a bare `.value = x` does not. Catch those too. */
  window.addEventListener('zb:sliders', function () {
    Array.prototype.forEach.call(document.querySelectorAll('input[type="range"]'), fill);
  });

  /* 2. Scroll edge under the floating status bar.
     A 1px rule under sticky chrome is visible even when nothing is scrolled
     beneath it. The shadow should appear only once content actually slides
     under the bar. */
  var bar = null;
  function edge() {
    bar = bar || document.querySelector('.zb');
    if (bar) bar.classList.toggle('zb-lifted', window.scrollY > 2);
  }
  window.addEventListener('scroll', edge, { passive: true });
  window.addEventListener('load', edge);
  edge();

  /* 3. Entrance for blocks marked data-rise.
     The class is added here rather than in the markup so that with JS off the
     content is simply visible - it is never hidden by CSS alone. */
  if (still) return;

  var marked = document.querySelectorAll('[data-rise]');
  if (!marked.length) return;

  Array.prototype.forEach.call(marked, function (el) { el.classList.add('rise'); });

  function reveal(el, stagger) {
    // Stagger siblings by their order within the group, capped so a long list
    // never leaves the reader waiting on the last card.
    var i = stagger ? +(el.getAttribute('data-rise') || 0) : 0;
    el.style.transitionDelay = Math.min(i, 5) * 60 + 'ms';
    el.classList.add('in');
  }

  /* A plain rect check rather than IntersectionObserver, on purpose: an
     observer only reports threshold *crossings*, so an element the reader flew
     straight past - a jump to the bottom, an anchor, Cmd+Down - can go from
     below the viewport to above it without ever firing, and then stays
     invisible for good. Checking where things actually are cannot miss. */
  var pending = false;
  function sweep() {
    pending = false;
    var h = window.innerHeight, left = 0;
    Array.prototype.forEach.call(marked, function (el) {
      if (el.classList.contains('in')) return;
      var top = el.getBoundingClientRect().top;
      // Stagger only for something arriving from below; anything already
      // scrolled past just appears.
      if (top < h * 0.92) reveal(el, top > 0);
      else left++;
    });
    if (!left) window.removeEventListener('scroll', onScroll);
  }
  function onScroll() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(sweep);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  // One frame later, so the .rise class has painted and the first batch
  // actually transitions in rather than snapping.
  requestAnimationFrame(sweep);
}());
