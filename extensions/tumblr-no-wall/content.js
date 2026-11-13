(() => {
  // Tumblr obfuscates its CSS classes, so the wall is detected by its text.
  const PHRASES = [
    'sign up or log in',
    'continue with google',
    'continue with apple',
    'continue with email',
    'join over 100 million',
    'coming from twitter/x',
    'regístrate o inicia sesión',
    'continuar con google',
    'únete a más de 100 millones',
  ];
  // Short fragments to quickly filter the candidate text nodes.
  const FRAGMENTS = ['sign up', 'continue with', 'join over', '100 million', 'twitter/x', 'regístrate', 'continuar con', 'únete'];

  const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

  // The text often comes split across several nodes ("Join over " + "100 million"),
  // so we look at the full text of the nearby ancestors.
  function matchesPhrase(el) {
    for (let i = 0; el && i < 4; i++, el = el.parentElement) {
      const t = el.textContent;
      if (t.length > 400) break;
      const n = norm(t);
      if (PHRASES.some((p) => n.includes(p))) return true;
    }
    return false;
  }

  // First fixed container going up that does NOT contain posts.
  // That hides the popup and the bottom bar, but not an open blog panel.
  function findWall(el) {
    for (; el && el !== document.body; el = el.parentElement) {
      if (getComputedStyle(el).position !== 'fixed') continue;
      if (el.querySelector('article')) return null;
      return el;
    }
    return null;
  }

  function hideWalls() {
    if (!document.body) return;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const targets = new Set();
    let n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue.toLowerCase();
      if (!FRAGMENTS.some((f) => t.includes(f))) continue;
      const parent = n.parentElement;
      if (!parent || parent.closest('.tnw-hidden') || !matchesPhrase(parent)) continue;
      const wall = findWall(parent);
      if (wall) targets.add(wall);
    }
    targets.forEach((el) => el.classList.add('tnw-hidden'));

    // The popup brings its own <style>body{overflow:hidden}</style>, which keeps
    // applying even while the popup is hidden. We disable it.
    document.querySelectorAll('.tnw-hidden style').forEach((s) => {
      s.media = 'not all';
    });

    // Undo the scroll / interaction lock that modals add,
    // but only when no legitimate panel (e.g. a blog) is open.
    const legitDialog = [...document.querySelectorAll('[role="dialog"]')].some(
      (d) => !d.closest('.tnw-hidden') && d.offsetParent !== null
    );
    if (!legitDialog) {
      for (const el of [document.documentElement, document.body]) {
        el.style.removeProperty('overflow');
        if (el.style.position === 'fixed') {
          const top = parseInt(el.style.top || '0', 10);
          el.style.removeProperty('position');
          el.style.removeProperty('top');
          if (top) window.scrollTo(0, -top);
        }
      }
      document.querySelectorAll('[inert]').forEach((el) => el.removeAttribute('inert'));
    }
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      hideWalls();
    });
  }

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'inert'],
  });

  document.addEventListener('DOMContentLoaded', schedule);
  schedule();
})();
