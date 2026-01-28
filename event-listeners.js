let touchStartY = 0;
const swipeZone = document.getElementById('swipe-zone');

window.addEventListener('touchstart', (e) => {
  if (!swipeZone) return;
  const touch = e.touches[0];
  const rect = swipeZone.getBoundingClientRect();
  if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
      touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
    touchStartY = touch.clientY;
  } else {
    touchStartY = null;
  }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
  if (touchStartY !== null && Math.abs(e.touches[0].clientY - touchStartY) > 10) {
    e.preventDefault();
  }
}, { passive: false });

window.addEventListener('touchend', (e) => {
  if (touchStartY === null) return;
  const touchEndY = e.changedTouches[0].clientY;
  const diff = touchStartY - touchEndY;
  if (diff > 50) {
    shuffleExistingCards();
  }
  touchStartY = null;
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  let key = e.key.toLowerCase();
  if (KEY_MAP[key]) key = KEY_MAP[key];

  if (isCapturingKey) {
    e.preventDefault();
    const { type, index } = isCapturingKey;
    if (binds.shuffle === key) binds.shuffle = '';
    if (binds.shuffleEx === key) binds.shuffleEx = '';
    if (binds.finish === key) binds.finish = '';
    binds.board = binds.board.map(b => b === key ? '' : b);
    if (type === 'board') binds.board[index] = key;
    else binds[type] = key;
    isCapturingKey = null;
    syncKeybindsUI();
    document.querySelectorAll('.kb-cell').forEach(c => c.classList.remove('waiting'));
    return;
  }

  if (isGameOver) {
    if (key === binds.finish && key !== '') {
      e.preventDefault();
      handleGameReset();
    }
    return;
  }

  if (key !== '' && key === binds.shuffle) {
    e.preventDefault();
    handleShuffleClick();
  } else if (key !== '' && key === binds.shuffleEx) {
    e.preventDefault();
    shuffleExistingCards();
  } else if (key !== '' && key === binds.finish) {
    e.preventDefault();
    handleGameFinish();
  } else if (key !== '') {
    const boardIdx = binds.board.indexOf(key);
    if (boardIdx !== -1) {
      const slot = document.getElementById('board')?.children[boardIdx];
      const cardEl = slot?.querySelector('.card');
      if (cardEl) handleCardSelect(boardIdx, cardEl);
    }
  }
});
