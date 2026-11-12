(() => {
  // Botones al pasar el ratón por una imagen de un post:
  //   HD  → visor con la versión más grande que ofrece Tumblr (la última del srcset)
  //   Pin → guarda en Pinterest la imagen en alta, enlazada al post original
  const MIN_SIZE = 120; // ignora avatares e iconos

  function largestSrc(img) {
    let best = img.currentSrc || img.src;
    let bestW = 0;
    for (const part of (img.srcset || '').split(',')) {
      const [url, desc] = part.trim().split(/\s+/);
      const w = parseInt(desc, 10) || 0;
      if (url && w > bestW) {
        best = url;
        bestW = w;
      }
    }
    return best;
  }

  function isPostImage(img) {
    if (!img.closest('article')) return false;
    if (!/media\.tumblr\.com/.test(img.currentSrc || img.src)) return false;
    if (/_c1\//.test(img.currentSrc || img.src)) return false; // avatares recortados
    const r = img.getBoundingClientRect();
    return r.width >= MIN_SIZE && r.height >= MIN_SIZE;
  }

  // Enlace permanente del post (tumblr.com/<blog>/<id>/...) y una descripción.
  function postInfo(img) {
    const article = img.closest('article');
    const links = article ? [...article.querySelectorAll('a[href]')].map((a) => a.href) : [];
    const permalink = links.find((h) => /tumblr\.com\/[^/?#]+\/\d+/.test(h)) || location.href;
    const blog = (permalink.match(/tumblr\.com\/([^/?#]+)\/\d+/) || [])[1];
    const tags = [...new Set(
      links
        .map((h) => (h.match(/\/tagged\/([^/?#]+)/) || [])[1])
        .filter(Boolean)
        .map((t) => '#' + decodeURIComponent(t).replace(/-/g, ' '))
    )].slice(0, 8);
    const description = [blog && `@${blog} on Tumblr`, tags.join(' ')].filter(Boolean).join(' — ');
    return { permalink, description };
  }

  // .pnj y .gifv a veces se sirven como página HTML; .png y .gif siempre son imagen.
  function pinnableMedia(url) {
    return url.replace(/\.pnj(\?|$)/, '.png$1').replace(/\.gifv(\?|$)/, '.gif$1');
  }

  function saveToPinterest(media, info) {
    const url = 'https://www.pinterest.com/pin/create/button/?' + new URLSearchParams({
      url: info.permalink,
      media: pinnableMedia(media),
      description: info.description,
    });
    window.open(url, 'tnw-pin', 'width=760,height=640');
  }

  // --- Botones flotantes (un solo grupo, se recoloca sobre la imagen activa) ---
  const hover = document.createElement('div');
  hover.className = 'tnw-hover';
  hover.innerHTML = `
    <button class="tnw-btn tnw-pin-btn" data-act="pin" title="Guardar en Pinterest">Pin</button>
    <button class="tnw-btn tnw-hd-btn" data-act="hd" title="Ver en resolución completa">HD</button>`;
  let current = null;

  function showHover(img) {
    current = img;
    const r = img.getBoundingClientRect();
    hover.style.top = `${Math.max(r.top, 0) + 8}px`;
    hover.style.left = `${r.right - 8 - 96}px`;
    hover.style.display = 'flex';
  }
  function hideHover() {
    hover.style.display = 'none';
    current = null;
  }

  document.addEventListener('mouseover', (e) => {
    if (hover.contains(e.target)) return;
    // Tumblr a veces pone capas encima de la imagen, así que buscamos bajo el cursor.
    const img = e.target.tagName === 'IMG'
      ? e.target
      : document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.tagName === 'IMG');
    if (img && isPostImage(img)) showHover(img);
    else if (current && !current.contains(e.target)) hideHover();
  }, true);
  window.addEventListener('scroll', hideHover, { passive: true });

  // Que Tumblr no reciba el clic (abriría su propio lightbox).
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
    hover.addEventListener(type, (e) => {
      e.preventDefault();
      e.stopPropagation();
      const act = e.target.dataset?.act;
      if (type !== 'click' || !current || !act) return;
      const img = current;
      if (act === 'hd') openViewer(largestSrc(img), postInfo(img));
      else saveToPinterest(largestSrc(img), postInfo(img));
    });
  }

  // --- Visor ---
  const viewer = document.createElement('div');
  viewer.className = 'tnw-viewer';
  viewer.innerHTML = `
    <div class="tnw-viewer-bar">
      <span class="tnw-viewer-info"></span>
      <button class="tnw-btn tnw-pin-btn tnw-viewer-pin">Guardar en Pinterest</button>
      <a class="tnw-viewer-post" target="_blank" rel="noopener">Ver post</a>
      <button class="tnw-viewer-close" title="Cerrar (Esc)">✕</button>
    </div>
    <div class="tnw-viewer-stage"><img class="tnw-viewer-img" alt=""></div>`;
  const vImg = viewer.querySelector('.tnw-viewer-img');
  const vInfo = viewer.querySelector('.tnw-viewer-info');
  const vPost = viewer.querySelector('.tnw-viewer-post');
  let viewerData = null;

  function openViewer(url, info) {
    hideHover();
    viewerData = { url, info };
    viewer.classList.remove('tnw-zoomed');
    vInfo.textContent = 'Cargando…';
    vImg.onload = () => {
      vInfo.textContent = `${vImg.naturalWidth} × ${vImg.naturalHeight} — clic para zoom`;
    };
    vImg.src = url;
    vPost.href = info.permalink;
    viewer.style.display = 'flex';
    document.documentElement.classList.add('tnw-viewer-open');
  }
  function closeViewer() {
    viewer.style.display = 'none';
    vImg.removeAttribute('src');
    viewerData = null;
    document.documentElement.classList.remove('tnw-viewer-open');
  }

  viewer.querySelector('.tnw-viewer-pin').addEventListener('click', () => {
    if (viewerData) saveToPinterest(viewerData.url, viewerData.info);
  });
  vImg.addEventListener('click', (e) => {
    e.stopPropagation();
    viewer.classList.toggle('tnw-zoomed');
  });
  viewer.querySelector('.tnw-viewer-stage').addEventListener('click', (e) => {
    if (e.target !== vImg) closeViewer();
  });
  viewer.querySelector('.tnw-viewer-close').addEventListener('click', closeViewer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && viewer.style.display === 'flex') {
      e.stopPropagation();
      closeViewer();
    }
  }, true);

  function mount() {
    document.body.append(hover, viewer);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
