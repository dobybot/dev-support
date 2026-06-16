// better-review guide — self-contained, inline this whole file into a <script> tag.
// Toggles the diff under a changed flow-step. The "open in VS Code" link (.open)
// must not toggle, so it stops propagation.
(function () {
  function toggle(step) {
    var diff = step.querySelector('.diff');
    if (!diff) return;
    var open = diff.hasAttribute('hidden');
    if (open) diff.removeAttribute('hidden'); else diff.setAttribute('hidden', '');
    step.classList.toggle('open-diff', open);
    var head = step.querySelector('.step-head');
    if (head) head.setAttribute('aria-expanded', String(open));
  }
  document.querySelectorAll('.step.changed .step-head').forEach(function (head) {
    var step = head.closest('.step');
    head.addEventListener('click', function (e) {
      if (e.target.closest('.open')) return; // let the VS Code link through
      toggle(step);
    });
    head.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(step); }
    });
  });
  // Expand-all / collapse-all if a control with [data-toggle-all] exists.
  document.querySelectorAll('[data-toggle-all]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var anyClosed = !!document.querySelector('.step.changed .diff[hidden]');
      document.querySelectorAll('.step.changed').forEach(function (step) {
        var diff = step.querySelector('.diff'); if (!diff) return;
        if (anyClosed) { diff.removeAttribute('hidden'); step.classList.add('open-diff'); }
        else { diff.setAttribute('hidden', ''); step.classList.remove('open-diff'); }
      });
    });
  });
  // Scrollspy: mark the sidebar .toc link whose target section/flow is currently
  // in view. Picks the last anchor whose top is above the reading line (~90px).
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc a[href^="#"]'));
  var targets = tocLinks.map(function (a) {
    return { a: a, el: document.getElementById(a.getAttribute('href').slice(1)) };
  }).filter(function (t) { return t.el; });
  function spy() {
    var line = window.scrollY + 90, best = null;
    targets.forEach(function (t) {
      var top = t.el.getBoundingClientRect().top + window.scrollY;
      if (top <= line && (!best || top >= best.top)) best = { a: t.a, top: top };
    });
    tocLinks.forEach(function (a) { a.classList.remove('active'); });
    if (best) best.a.classList.add('active');
  }
  if (targets.length) {
    document.addEventListener('scroll', spy, { passive: true });
    spy();
  }
})();
