function getGameColors() {
  return config.gameColors;
}

function updateColors() {
  const defs = document.getElementById('svg-defs');
  if (!defs) return;
  const colors = getGameColors();
  const isStd = config.preset === 'standard';
  const step = isStd ? 3 : 1.5;
  const sWidth = isStd ? 1.2 : 0.6;
  const xOffset = isStd ? 1 : 0;
  defs.innerHTML = colors.map((c, i) =>
    `<pattern id="s-${i}" patternUnits="userSpaceOnUse" width="${step}" height="${step}">
      <line x1="${xOffset}" y1="0" x2="${xOffset}" y2="${step}" stroke="${c}" stroke-width="${sWidth}" />
    </pattern>`
  ).join('');
  for(let i=0; i<12; i++) updateSlot(i, false);
}

function getShapeSVG(card) {
  const color = getGameColors()[card.c];
  let fill = card.f === 0 ? 'none' : color;
  if (card.f === 1) fill = `url(#s-${card.c})`;
  let strokeW = config.preset === 'classic' ? (card.f === 1 ? 1 : 1.7) : 1.8;

  if (config.preset === 'standard') {
    const shapes = STANDARD_SHAPE_TEMPLATES.map(t =>
      t.replace(/\$\{color\}/g, color).replace(/\$\{fill\}/g, fill)
    );
    return `<svg class="shape-svg-standard" viewBox="${SHAPE_VIEWBOX}">${shapes[card.s]}</svg>`;
  } else {
    const rotateTransform = config.boardOrientation === 'horizontal' ? 'rotate(90 16 16) ' : '';
    const vars = { color, strokeW, fill, rotateTransform, waveD: CLASSIC_WAVE_PATH };
    const keys = ['diamond', 'oval', 'wave'];
    const extraClass = keys[card.s];
    let inner = CLASSIC_SHAPE_TEMPLATES[extraClass];
    Object.keys(vars).forEach(k => { inner = inner.replace(new RegExp('\\$\\{' + k + '\\}', 'g'), vars[k]); });
    return `<svg class="shape-svg-classic ${extraClass}" viewBox="${SHAPE_VIEWBOX}">${inner}</svg>`;
  }
}

function updateSlot(i, animateIn = false) {
  const boardEl = document.getElementById('board');
  if (!boardEl) return;
  const slot = boardEl.children[i];
  const card = board[i];
  if (!slot) return;
  slot.innerHTML = '';
  if (card) {
    const el = document.createElement('div');
    el.className = 'card' + (config.preset === 'classic' ? ' classic' : '') + (animateIn ? ' anim-in' : '');
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (config.preset === 'standard') {
      if (config.boardOrientation === 'horizontal') {
        el.style.gap = isMobile ? ['0px', '3px', '1px'][card.n] : ['0px', '4px', '1px'][card.n];
      } else {
        el.style.gap = ['0px', '9px', '3px'][card.n];
      }
    } else {
      el.style.gap = config.boardOrientation === 'horizontal'
        ? (isMobile ? ['0px', '2px', '0px'][card.n] : ['0px', '3px', '1px'][card.n])
        : (isMobile ? '0px 0px 2px 0px' : '0px 0px 3px 0px');
    }
    for (let n=0; n<=card.n; n++) el.innerHTML += getShapeSVG(card);
    el.onpointerdown = (e) => { e.preventDefault(); handleCardSelect(i, el); };
    slot.appendChild(el);
  }
}
