function displayResults(sets, bs, s) {
  document.getElementById('final-date-display').innerText = s.dateStr;
  let findIntervals = s.timestamps.map(t => t.findTime);
  const maxFind = findIntervals.length ? Math.max(...findIntervals) : 0;
  const minFind = findIntervals.length ? Math.min(...findIntervals) : 0;
  const avgFind = findIntervals.length ? (findIntervals.reduce((a, b) => a + b, 0) / findIntervals.length) : 0;

  document.getElementById('final-time').innerText = formatTime(s.elapsedMs, true);
  document.getElementById('final-score').innerText = sets;
  document.getElementById('final-bad-shuffles').innerText = bs;
  document.getElementById('final-avg-find').innerText = avgFind ? formatTime(avgFind, true) : '--:--';
  document.getElementById('final-ext-find').innerHTML = `F: ${minFind ? formatTime(minFind, true) : '--'}<br>S: ${maxFind ? formatTime(maxFind, true) : '--'}`;

  buildModifiersUI(s.modifiers);
  renderSpeedChart(s.elapsedMs, s.timestamps);
}

function showSavedRecord(r) {
  if (!r.extra) { alert("Detailed info not available for old records"); return; }
  closeRecordsModal();
  resultOpenedFrom = 'local';
  currentExtraStats = r.extra;
  currentExtraStats.modifiers = r.modifiers;
  currentExtraStats.timestamps = r.timestamps;
  displayResults(r.sets, r.badShuffles, currentExtraStats);
  openModal('result-modal');
  if (typeof syncSubmitOnlineButtonState === 'function') syncSubmitOnlineButtonState();
}

function calculateSpeedData(totalTimeMs, timestampsInput) {
  const intervalMs = 10000;
  const points = Math.ceil(totalTimeMs / intervalMs);
  const labels = [];
  const data = [];
  const ts = timestampsInput || setTimestamps.map(t => t.time);

  let baseStartTime = startTime;
  if (timestampsInput && Array.isArray(ts) && ts.length) {
    const first = ts[0];
    if (typeof first === 'object' && first) {
      if (typeof first.time === 'number' && typeof first.findTime === 'number') {
        baseStartTime = first.time - first.findTime;
      } else if (typeof first.time === 'number') {
        baseStartTime = first.time;
      }
    } else if (typeof first === 'number') {
      baseStartTime = Math.min.apply(null, ts.filter(v => typeof v === 'number'));
    }
  }

  for (let i = 1; i <= points; i++) {
    const currentTime = i * intervalMs;
    labels.push(formatTime(currentTime));
    const setsInInterval = ts.filter(val => {
      const t = (typeof val === 'object' && val) ? val.time : val;
      if (typeof t !== 'number') return false;
      const relativeTs = t - baseStartTime;
      return relativeTs > (currentTime - intervalMs) && relativeTs <= currentTime;
    }).length;
    const spm = (setsInInterval / (intervalMs / 1000)) * 60;
    data.push(Number(spm.toFixed(1)));
  }
  return { labels, data };
}

function renderSpeedChart(totalTimeMs, timestampsInput) {
  const canvas = document.getElementById('speedChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { labels, data } = calculateSpeedData(totalTimeMs, timestampsInput);
  if (speedChartInstance) speedChartInstance.destroy();
  speedChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Sets/min',
        data: data,
        borderColor: '#ec4899',
        backgroundColor: 'rgba(236, 72, 153, 0.1)',
        borderWidth: 3,
        tension: 0.4,
        fill: true,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: true, grid: { display: false }, ticks: { color: '#888', font: { size: 9 }, maxRotation: 0 } },
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', font: { size: 9 } } }
      }
    }
  });
}

function buildModifiersUI(mods) {
  const container = document.getElementById('final-modifiers');
  if (!container) return;
  container.innerHTML = '';
  const target = mods || gameModifiers;
  const order = ['SP', 'AS', 'PBS', 'A3RD', 'SS', 'DM'];
  let count = 0;
  order.forEach(key => {
    if (key === 'DP') return;
    if (target[key]) {
      const chip = document.createElement('div');
      chip.className = 'mod-chip';
      chip.innerText = key;
      container.appendChild(chip);
      count++;
    }
  });
  if (count === 0) {
    const none = document.createElement('div');
    none.className = 'mod-none';
    none.innerText = 'No Modifiers';
    container.appendChild(none);
  }
}

async function handleShareResult() {
  const source = document.getElementById('share-content');
  const clone = source.cloneNode(true);
  const exportHeader = clone.querySelector('#export-header');
  const resultTitle = clone.querySelector('#result-title');
  const finalDate = clone.querySelector('#final-date-display');
  const statCards = clone.querySelectorAll('.stat-card');
  const statLabels = clone.querySelectorAll('.stat-label');
  const statValues = clone.querySelectorAll('.stat-value');
  const modContainer = clone.querySelector('#final-modifiers');
  const modChips = clone.querySelectorAll('.mod-chip');

  clone.querySelectorAll('.no-export').forEach(n => n.remove());

  const exportW = 430, exportH = 480;
  clone.style.width = `${exportW}px`;
  clone.style.height = `${exportH}px`;
  clone.style.padding = '15px';
  clone.style.display = 'flex';
  clone.style.flexDirection = 'column';
  clone.style.alignItems = 'center';
  clone.style.justifyContent = 'flex-start';
  clone.style.backgroundColor = UI_COLORS.BACKGROUND;
  clone.style.position = 'fixed';
  clone.style.left = '-9999px';
  clone.style.top = '0';
  clone.style.zIndex = '9999';

  exportHeader.style.display = 'block';
  exportHeader.style.marginBottom = '5px';
  resultTitle.style.margin = '0';
  resultTitle.style.padding = '0';
  resultTitle.style.lineHeight = '0.8';
  resultTitle.style.marginBottom = '20px';

  modContainer.style.display = 'flex';
  modContainer.style.flexWrap = 'wrap';
  modContainer.style.justifyContent = 'center';
  modChips.forEach(c => {
    c.style.display = 'inline-block';
    c.style.margin = '2px';
  });

  statCards.forEach(card => {
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.padding = '10px 14px';
    card.style.height = '64px';
    card.style.justifyContent = 'flex-start';
    card.style.position = 'relative';
  });
  statLabels.forEach(label => { label.style.display = 'block'; label.style.marginBottom = '5px'; label.style.lineHeight = '1'; });
  statValues.forEach(val => {
    val.style.position = 'relative';
    let topOffset = -12;
    if (val.id === 'final-ext-find') topOffset = -3;
    val.style.top = `${topOffset}px`;
    val.style.display = 'block';
    val.style.lineHeight = '1.1';
  });

  modChips.forEach(c => {
    c.style.display = 'inline-block';
    c.style.margin = '2px';
    c.style.lineHeight = '0.7';
    c.style.paddingTop = '0px';
    c.style.paddingBottom = '4px';
  });

  finalDate.style.display = 'block';
  finalDate.style.marginTop = '12px';

  const originalCanvas = source.querySelector('canvas');
  const clonedCanvas = clone.querySelector('canvas');
  const ctx = clonedCanvas.getContext('2d');
  clonedCanvas.width = originalCanvas.width;
  clonedCanvas.height = originalCanvas.height;
  ctx.drawImage(originalCanvas, 0, 0);

  document.body.appendChild(clone);
  try {
    await new Promise(r => setTimeout(r, GAME_CONFIG.EXPORT_DELAY));
    const canvas = await html2canvas(clone, { backgroundColor: UI_COLORS.BACKGROUND, scale: 2, width: exportW, height: exportH, logging: false, useCORS: true });
    canvas.toBlob(async (blob) => {
      const file = new File([blob], 'set_pro_result.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Set Pro Result', text: `Sets: ${collectedSets} | Time: ${document.getElementById('final-time').innerText}` });
      } else {
        const link = document.createElement('a');
        link.download = `set_result_${Date.now()}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
      }
    }, 'image/png');
  } catch (err) { console.error("Error sharing:", err); } finally { document.body.removeChild(clone); }
}

function bindRecordItemTap(item, r) {
  const onDown = (e) => {
    if (e.target.closest('.btn-del')) return;
    item._recordTap = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
  };
  const onUp = (e) => {
    if (e.target.closest('.btn-del')) return;
    const s = item._recordTap;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if ((Date.now() - s.t) < 400 && dx * dx + dy * dy < 225) showSavedRecord(r);
    item._recordTap = null;
  };
  const onCancel = () => { item._recordTap = null; };
  item.addEventListener('pointerdown', onDown, { passive: true });
  item.addEventListener('pointerup', onUp, { passive: true });
  item.addEventListener('pointercancel', onCancel, { passive: true });
}

function handleRecordDelete(event, id) {
  event.stopPropagation();
  if (confirm('Delete this record?')) {
    let records = Storage.getJSON(STORAGE_KEYS.RECORDS, []);
    records = records.filter(r => r.id !== id);
    Storage.setJSON(STORAGE_KEYS.RECORDS, records);
    openRecordsModal();
  }
}
