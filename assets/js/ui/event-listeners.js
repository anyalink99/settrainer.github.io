const swipeZone = document.getElementById('swipe-zone');
const cursorHideClass = 'cursor-hidden';
let touchStartY = 0;
let isCursorHidden = false;
let holdPossibleActive = false;
let holdDebugActive = false;
let holdPossiblePrev = null;
let holdDebugPrev = null;

const hideCursorOnKeyboard = () => {
  if (!document.body) return;
  if (!window.matchMedia || !window.matchMedia('(pointer: fine)').matches) return;
  if (isCursorHidden) return;
  document.body.classList.add(cursorHideClass);
  isCursorHidden = true;
};

const showCursorFromMouse = () => {
  if (!document.body || !isCursorHidden) return;
  document.body.classList.remove(cursorHideClass);
  isCursorHidden = false;
};

const enableShowPossibleHold = () => {
  if (holdPossibleActive) return;
  holdPossibleActive = true;
  holdPossiblePrev = config.showPossible;
  if (!config.showPossible) {
    config.showPossible = true;
    if (!isGameOver) markModUsed('SP');
  }
  syncSettingsUI();
  updateUI();
};

const disableShowPossibleHold = () => {
  if (!holdPossibleActive) return;
  holdPossibleActive = false;
  if (holdPossiblePrev !== null && config.showPossible !== holdPossiblePrev) {
    config.showPossible = holdPossiblePrev;
  }
  holdPossiblePrev = null;
  syncSettingsUI();
  updateUI();
};

const enableDebugHold = () => {
  if (holdDebugActive) return;
  holdDebugActive = true;
  holdDebugPrev = config.debugMode;
  if (!config.debugMode) {
    config.debugMode = true;
    if (!isGameOver) markModUsed('DM');
  }
  if (config.debugMode && isTrainingModeActive()) {
    trainingRefreshDebugInfo();
  } else if (config.debugMode) {
    restoreDebugTPSInfo();
  }
  syncSettingsUI();
  updateUI();
};

const disableDebugHold = () => {
  if (!holdDebugActive) return;
  holdDebugActive = false;
  if (holdDebugPrev !== null && config.debugMode !== holdDebugPrev) {
    config.debugMode = holdDebugPrev;
  }
  holdDebugPrev = null;
  if (!config.debugMode) {
    clearDebugTPSUI();
  } else if (isTrainingModeActive()) {
    trainingRefreshDebugInfo();
  } else {
    restoreDebugTPSInfo();
  }
  syncSettingsUI();
  updateUI();
};

window.addEventListener('mousemove', showCursorFromMouse, { passive: true });
window.addEventListener('mousedown', showCursorFromMouse, { passive: true });

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

  if (e.code === 'Backquote') {
    e.preventDefault();
    enableShowPossibleHold();
  } else if (e.code === 'ControlRight') {
    e.preventDefault();
    enableDebugHold();
  }

  if (isGameOver) {
    if (key === binds.finish && key !== '') {
      e.preventDefault();
      hideCursorOnKeyboard();
      handleGameReset();
    }
    return;
  }

  if (key !== '' && key === binds.shuffle) {
    e.preventDefault();
    hideCursorOnKeyboard();
    handleShuffleClick();
  } else if (key !== '' && key === binds.shuffleEx) {
    e.preventDefault();
    hideCursorOnKeyboard();
    shuffleExistingCards();
  } else if (key !== '' && key === binds.finish) {
    e.preventDefault();
    hideCursorOnKeyboard();
    handleGameFinish();
  } else if (key !== '') {
    const boardIdx = binds.board.indexOf(key);
    if (boardIdx !== -1) {
      hideCursorOnKeyboard();
      const slot = document.getElementById('board')?.children[boardIdx];
      const cardEl = slot?.querySelector('.card');
      if (cardEl) handleCardSelect(boardIdx, cardEl);
    }
  }
});

window.addEventListener('keyup', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Backquote') {
    disableShowPossibleHold();
  } else if (e.code === 'ControlRight') {
    disableDebugHold();
  }
});
