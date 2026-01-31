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
    const shapes = [
      `<rect x="4" y="4" width="24" height="24" rx="1" stroke="${color}" stroke-width="1.8" fill="${fill}" />`,
      `<circle cx="16" cy="16" r="12" stroke="${color}" stroke-width="1.8" fill="${fill}" />`,
      `<polygon points="16,4 29,27 3,27" stroke="${color}" stroke-width="1.8" fill="${fill}" stroke-linejoin="round" />`
    ];
    return `<svg class="shape-svg-standard" viewBox="0 0 32 32">${shapes[card.s]}</svg>`;
  } else {
    const waveD = "M29.5,12 C30.8,14.5 30.8,17.2 30.2,19.9 C29.7,22.2 28,23 26,22 C25.4,21.7 24.8,21.4 24.3,21.1 C21.7,19.5 19,19.3 16.1,20.4 C13.4,21.5 10.6,21.6 7.8,20.8 C3.3,19.4 0.4,14.6 1.4,10.2 C2,7.7 3.7,7 5.9,8.2 C6.2,8.4 6.5,8.6 6.8,8.8 C9.7,10.6 12.7,11.2 16,9.9 C17.3,9.3 18.7,8.9 20,8.6 C24,7.6 27.5,8.9 29.5,12 Z";
    let inner = '';
    let extraClass = '';
    const rotateTransform = config.boardRotated ? 'rotate(90 16 16) ' : '';
    if (card.s === 0) {
      inner = `<polygon transform="${rotateTransform}translate(16,16) scale(1.08) translate(-16,-16)" points="1,16 16,8.5 31,16 16,23.5" stroke="${color}" stroke-width="${strokeW}" fill="${fill}" stroke-linejoin="round" />`;
      extraClass = 'diamond';
    } else if (card.s === 1) {
      inner = `<rect transform="${rotateTransform}translate(16,16) scale(1.08, 1.16) translate(-16,-16)" x="1" y="9.5" width="30" height="13" rx="6.5" stroke="${color}" stroke-width="${strokeW}" fill="${fill}" />`;
      extraClass = 'oval';
    } else {
      inner = `<path transform="${rotateTransform}translate(16,16) scale(1.08) translate(-16,-16)" d="${waveD}" stroke="${color}" stroke-width="${strokeW}" fill="${fill}" stroke-linejoin="round" />`;
      extraClass = 'wave';
    }
    return `<svg class="shape-svg-classic ${extraClass}" viewBox="0 0 32 32">${inner}</svg>`;
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
      if (config.boardRotated) {
        el.style.gap = isMobile ? ['0px', '3px', '1px'][card.n] : ['0px', '4px', '1px'][card.n];
      } else {
        el.style.gap = ['0px', '9px', '3px'][card.n];
      }
    } else {
      /* classic: same gap as horizontal for vertical (row gap = column gap of horizontal) */
      el.style.gap = config.boardRotated
        ? (isMobile ? ['0px', '2px', '0px'][card.n] : ['0px', '3px', '1px'][card.n])
        : (isMobile ? '0px 0px 2px 0px' : '0px 0px 3px 0px');
    }
    for (let n=0; n<=card.n; n++) el.innerHTML += getShapeSVG(card);
    el.onpointerdown = (e) => { e.preventDefault(); handleCardSelect(i, el); };
    slot.appendChild(el);
  }
}
