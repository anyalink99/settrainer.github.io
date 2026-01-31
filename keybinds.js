function startKeyCapture(type, index = null) {
  if (isCapturingKey) return;
  isCapturingKey = { type, index };
  const elId = index !== null ? `kb-slot-${index}` : `kb-${type.replace('Ex', '-ex')}`;
  document.querySelectorAll('.kb-cell').forEach(c => c.classList.remove('waiting'));
  document.getElementById(elId).classList.add('waiting');
}

function syncKeybindsUI() {
  document.getElementById('kb-shuffle').innerText = (binds.shuffle === ' ' ? 'SPC' : binds.shuffle.toUpperCase()) || '---';
  document.getElementById('kb-shuffle-ex').innerText = (binds.shuffleEx === ' ' ? 'SPC' : binds.shuffleEx.toUpperCase()) || '---';
  document.getElementById('kb-finish').innerText = (binds.finish === ' ' ? 'SPC' : binds.finish.toUpperCase()) || '---';
  binds.board.forEach((key, i) => {
    const cell = document.getElementById(`kb-slot-${i}`);
    if(cell) cell.innerText = (key === ' ' ? 'SPC' : key.toUpperCase()) || '---';
  });
}

function handleKeybindsReset() {
  if (confirm('Reset keys to default?')) {
    binds = JSON.parse(JSON.stringify(config.boardOrientation === 'horizontal' ? DEFAULT_BINDS_HORIZONTAL : DEFAULT_BINDS));
    openKeybindsModal();
  }
}
