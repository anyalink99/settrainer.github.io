function openModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.remove('hide');
  modal.classList.add('show');
}

async function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.add('hide');
  await new Promise(r => setTimeout(r, GAME_CONFIG.MODAL_TRANSITION));
  modal.classList.remove('show', 'hide');
}

function toggleSettingsModal(show) {
  if (show) {
    syncSettingsUI();
    openModal('settings-modal');
  } else {
    closeModal('settings-modal');
  }
}

function openAdvancedModal() {
  syncSettingsUI();
  openModal('advanced-modal');
}

async function closeAdvancedModal() {
  await closeModal('advanced-modal');
}

function openBoardAppearanceModal() {
  syncSettingsUI();
  refreshBoardAppearancePreviews();
  if (typeof closeBoardColorPicker === 'function') closeBoardColorPicker();
  openModal('board-appearance-modal');
}

async function closeBoardAppearanceModal() {
  if (typeof closeBoardColorPicker === 'function') closeBoardColorPicker();
  await closeModal('board-appearance-modal');
}

function handleBoardAppearanceReset() {
  if (!confirm('Reset board appearance to default?')) return;
  config.preset = 'standard';
  config.boardRotated = false;
  config.gameColors = [...DEFAULT_GAME_COLORS];
  config.speedMod = '1.0';
  Storage.set(STORAGE_KEYS.PRESET, config.preset);
  Storage.set(STORAGE_KEYS.BOARD_ROTATED, String(config.boardRotated));
  Storage.setJSON(STORAGE_KEYS.GAME_COLORS, config.gameColors);
  Storage.set(STORAGE_KEYS.SPEED_MOD, config.speedMod);
  updateColors();
  syncSettingsUI();
  refreshBoardAppearancePreviews();
  const boardEl = document.getElementById('board');
  if (boardEl) {
    boardEl.classList.toggle('rotated', config.boardRotated);
  }
  transposeBoardLayout();
  for (let i = 0; i < 12; i++) updateSlot(i, false);
}

function refreshBoardAppearancePreviews() {
  const wrap = document.getElementById('board-preview-wrap');
  if (!wrap) return;
  wrap.classList.toggle('rotated', config.boardRotated);
  const colors = getGameColors();
  for (let i = 0; i < 3; i++) {
    const cardEl = document.getElementById(`board-preview-card-${i}`);
    const swatchEl = document.getElementById(`board-preview-swatch-${i}`);
    if (cardEl) {
      const card = { c: i, s: i, f: 1, n: 0 };
      cardEl.innerHTML = getShapeSVG(card);
    }
    if (swatchEl) swatchEl.style.backgroundColor = colors[i];
  }
}

function updateGameColor(index, hex) {
  if (index < 0 || index > 2) return;
  config.gameColors[index] = hex;
  Storage.setJSON(STORAGE_KEYS.GAME_COLORS, config.gameColors);
  updateColors();
  refreshBoardAppearancePreviews();
}

function openRecordsModal() {
  const records = Storage.getJSON(STORAGE_KEYS.RECORDS, []);

  const finishes = records.filter(r => r.extra?.isAutoFinish === true);
  const others = records.filter(r => r.extra?.isAutoFinish !== true);

  finishes.sort((a, b) => a.time - b.time);
  others.sort((a, b) => b.sets - a.sets || a.time - b.time);

  const container = document.getElementById('records-container');
  container.innerHTML = '';

  if (finishes.length === 0 && others.length === 0) {
    container.innerHTML = '<p class="text-center text-gray-500 mt-10">No records yet</p>';
    openModal('records-modal');
    return;
  }

  if (finishes.length > 0) {
    const finishHeader = document.createElement('div');
    finishHeader.className = 'text-pink-400 font-black uppercase text-sm mb-2 mt-4 first:mt-0 tracking-wider';
    finishHeader.innerText = 'Finishes';
    container.appendChild(finishHeader);

    finishes.forEach(r => {
      const item = document.createElement('div');
      item.className = 'record-item';
      item.innerHTML = `
        <div class="record-info">
          <div class="record-val">${r.sets} Sets ${r.isSeed ? '🧬' : ''}</div>
          <div class="text-[10px] uppercase opacity-70">${r.date}</div>
        </div>
        <div class="record-info text-right flex-grow flex justify-end items-center mr-2">
          <div class="text-white font-mono text-lg leading-none">${formatTime(r.time, true)}</div>
        </div>
        <div class="btn-del" onpointerdown="handleRecordDelete(event, ${r.id})">
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </div>
      `;
      bindRecordItemTap(item, r);
      container.appendChild(item);
    });
  }

  if (others.length > 0) {
    const othersHeader = document.createElement('div');
    othersHeader.className = 'text-gray-400 font-black uppercase text-sm mb-2 mt-6 tracking-wider';
    othersHeader.innerText = 'Other Records';
    container.appendChild(othersHeader);

    others.forEach(r => {
      const item = document.createElement('div');
      item.className = 'record-item';
      item.innerHTML = `
        <div class="record-info">
          <div class="record-val">${r.sets} Sets ${r.isSeed ? '🧬' : ''}</div>
          <div class="text-[10px] uppercase opacity-70">${r.date}</div>
        </div>
        <div class="record-info text-right flex-grow flex justify-end items-center mr-2">
          <div class="text-white font-mono text-lg leading-none">${formatTime(r.time, true)}</div>
        </div>
        <div class="btn-del" onpointerdown="handleRecordDelete(event, ${r.id})">
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </div>
      `;
      bindRecordItemTap(item, r);
      container.appendChild(item);
    });
  }

  openModal('records-modal');
}

async function closeRecordsModal() {
  await closeModal('records-modal');
}

function openKeybindsModal() {
  const grid = document.getElementById('kb-board-grid');
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = config.boardRotated ? 'repeat(3, 1fr)' : 'repeat(4, 1fr)';
  
  binds.board.forEach((key, i) => {
    const cell = document.createElement('div');
    cell.className = 'kb-cell';
    cell.id = `kb-slot-${i}`;
    cell.innerText = key === ' ' ? 'SPC' : key.toUpperCase();
    cell.onpointerdown = () => startKeyCapture('board', i);
    grid.appendChild(cell);
  });
  syncKeybindsUI();
  openModal('keybinds-modal');
}

async function closeKeybindsModal() {
  await closeModal('keybinds-modal');
  Storage.setJSON(STORAGE_KEYS.KEYBINDS, binds);
}

function openExtraStatsModal() {
  const s = currentExtraStats;
  const container = document.getElementById('extra-stats-content');

  openModal('extra-stats-modal');

  const avgPossible = (s.possibleHistory.reduce((a,b) => a+b, 0) / Math.max(1, s.possibleHistory.length)).toFixed(1);
  const diff1 = s.timestamps.filter(t => t.possibleAtStart === 1);
  const diff2 = s.timestamps.filter(t => t.possibleAtStart === 2);
  const diff3 = s.timestamps.filter(t => t.possibleAtStart >= 3);
  const getAvg = (arr) => arr.length ? formatTime(arr.reduce((a,b) => a+b.findTime, 0) / arr.length, true) : '--';

  container.innerHTML = `
    <div class="extra-stat-row"><span class="extra-stat-label">Avg sets on board</span><span class="extra-stat-value">${avgPossible}</span></div>
    <div class="extra-stat-row"><span class="extra-stat-label">Wrong selections</span><span class="extra-stat-value">${s.mistakes}</span></div>
    <div class="extra-stat-row"><span class="extra-stat-label">Avg find (1 set)</span><span class="extra-stat-value">${getAvg(diff1)}</span></div>
    <div class="extra-stat-row"><span class="extra-stat-label">Avg find (2 sets)</span><span class="extra-stat-value">${getAvg(diff2)}</span></div>
    <div class="extra-stat-row"><span class="extra-stat-label">Avg find (3+ sets)</span><span class="extra-stat-value">${getAvg(diff3)}</span></div>
    <div class="extra-stat-row"><span class="extra-stat-label">Shuffle Board uses</span><span class="extra-stat-value">${s.shuffleExCount}</span></div>
    <div class="extra-stat-row"><span class="extra-stat-label">Auto finish</span><span class="extra-stat-value">${s.isAutoFinish ? 'YES' : 'NO'}</span></div>
    <div class="extra-stat-row"><span class="extra-stat-label">Platform</span><span class="extra-stat-value">${s.platform}</span></div>
  `;
}

async function closeExtraStatsModal() {
  await closeModal('extra-stats-modal');
}
