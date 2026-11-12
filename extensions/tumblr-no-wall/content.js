(() => {
  // Tumblr ofusca sus clases CSS, así que detectamos el muro por su texto.
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
  // Fragmentos cortos para filtrar rápido los nodos de texto candidatos.
  const FRAGMENTS = ['sign up', 'continue with', 'join over', '100 million', 'twitter/x', 'regístrate', 'continuar con', 'únete'];

  const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

  // El texto suele venir partido en varios nodos ("Join over " + "100 million"),
  // así que miramos el texto completo de los ancestros cercanos.
  function matchesPhrase(el) {
    for (let i = 0; el && i < 4; i++, el = el.parentElement) {
      const t = el.textContent;
      if (t.length > 400) break;
      const n = norm(t);
      if (PHRASES.some((p) => n.includes(p))) return true;
    }
    return false;
  }

  // Primer contenedor fijo hacia arriba que NO contenga posts.
  // Así ocultamos el popup y la barra inferior, pero no el panel de un blog.
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

    // El popup trae su propio <style>body{overflow:hidden}</style>, que sigue
    // aplicando aunque el popup esté oculto. Lo desactivamos.
    document.querySelectorAll('.tnw-hidden style').forEach((s) => {
      s.media = 'not all';
    });

    // Deshacer el bloqueo de scroll / interacción que ponen los modales,
    // pero solo si no hay un panel legítimo (p. ej. un blog) abierto.
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
