const GAME_COLORS = ['#fd0000', '#01a43b', '#0000fe'];

const KEY_MAP = {
    'й':'q','ц':'w','у':'e','к':'r','е':'t','н':'y','г':'u','ш':'i','щ':'o','з':'p','х':'[','ъ':']',
    'ф':'a','ы':'s','в':'d','а':'f','п':'g','р':'h','о':'j','л':'k','д':'l','ж':';','э':'\'',
    'я':'z','ч':'x','с':'c','м':'v','и':'b','т':'n','ь':'m','б':',','ю':'.'
};

let config = {
    preset: localStorage.getItem('set_shape_preset') || 'standard',
    speedMod: localStorage.getItem('set_speed_mod') || '1.0',
    showPossible: localStorage.getItem('set_show_possible') !== 'false', 
    showDetailedPossible: localStorage.getItem('set_show_detailed_possible') === 'true',
    showSPM: localStorage.getItem('set_show_s_p_m') === 'true',
    autoShuffle: localStorage.getItem('set_auto_shuffle') === 'false',
    autoSelectThird: localStorage.getItem('set_auto_select_third') === 'true',
    preventBadShuffle: localStorage.getItem('set_prevent_bad_shuffle') === 'true',
    useFixedSeed: localStorage.getItem('set_use_fixed_seed') === 'true',
    minSetsToRecord: parseInt(localStorage.getItem('set_min_sets') || '23')
};

let gameModifiers = {
    SP: false, DP: false, AS: false, PBS: false, A3RD: false, SS: false
};

const DEFAULT_BINDS = {
    board: ['e', 'r', 'i', 'o', 'd', 'f', 'k', 'l', 'x', 'c', 'm', ','],
    shuffle: 'backspace',
    shuffleEx: ' ',
    finish: 'enter'
};
let binds = JSON.parse(localStorage.getItem('set_keybinds')) || JSON.parse(JSON.stringify(DEFAULT_BINDS));
let isCapturingKey = null;

let deck = [], board = [], selected = [], collectedSets = 0, badShuffles = 0;
let startTime = Date.now(), isAnimating = false, isGameOver = false, isBtnLocked = false;
let setTimestamps = [], possibleHistory = [], mistakes = 0, shuffleExCount = 0;
let speedChartInstance = null;
let lastSetFoundTime = Date.now();
let currentExtraStats = null;

const appContainer = document.getElementById('app-container');
const resizerL = document.getElementById('resizer-l');
const resizerR = document.getElementById('resizer-r');
let isResizing = false;

const savedWidth = localStorage.getItem('set_app_width');
if (savedWidth) appContainer.style.width = savedWidth + 'px';

function setSpeedMod(val) {
    config.speedMod = val;
    localStorage.setItem('set_speed_mod', val);
    document.documentElement.style.setProperty('--speed-mod', val);
    document.getElementById('speed-val').innerText = val + 'x';
}

function initResize(e) {
    isResizing = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
    document.body.style.cursor = 'ew-resize';
}

function handleMouseMove(e) {
    if (!isResizing) return;
    const centerX = window.innerWidth / 2;
    const offset = Math.abs(e.clientX - centerX);
    let newWidth = offset * 2;
    if (newWidth > window.innerWidth - 30) newWidth = window.innerWidth;
    appContainer.style.width = newWidth + 'px';
    localStorage.setItem('set_app_width', Math.floor(newWidth));
}

function stopResize() {
    isResizing = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResize);
    document.body.style.cursor = '';
}

resizerL?.addEventListener('mousedown', initResize);
resizerR?.addEventListener('mousedown', initResize);

function mulberry32(a) {
    return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

function formatTime(ms, showMs = false) {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    let res = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (showMs) {
        const remainder = Math.floor((ms % 1000) / 10);
        res += `.${String(remainder).padStart(2, '0')}`;
    }
    return res;
}

function getSPMColor(spm) {
    const min = 3;
    const max = 30;
    const clamped = Math.max(min, Math.min(max, spm));
    const hue = ((clamped - min) / (max - min)) * 330;
    return `hsl(${hue}, 80%, 65%)`;
}

function updateColors() {
    const defs = document.getElementById('svg-defs');
    if (!defs) return;
    const isStd = config.preset === 'standard';
    const step = isStd ? 3 : 1.5;
    const sWidth = isStd ? 1.2 : 0.6;
    const xOffset = isStd ? 1 : 0;
    defs.innerHTML = GAME_COLORS.map((c, i) => 
        `<pattern id="s-${i}" patternUnits="userSpaceOnUse" width="${step}" height="${step}">
            <line x1="${xOffset}" y1="0" x2="${xOffset}" y2="${step}" stroke="${c}" stroke-width="${sWidth}" />
        </pattern>`
    ).join('');
    for(let i=0; i<12; i++) updateSlot(i, false);
}

function getShapeSVG(card) {
    const color = GAME_COLORS[card.c];
    let fill = card.f === 0 ? 'none' : color;
    if (card.f === 1) fill = `url(#s-${card.c})`;
    let strokeW = config.preset === 'classic' ? (card.f === 1 ? 1 : 1.7) : 1.8;

    if (config.preset === 'standard') {
        const shapes = [
            `<rect x="4" y="4" width="24" height="24" rx="1" stroke="${color}" stroke-width="1.8" fill="${fill}" />`,
            `<circle cx="16" cy="16" r="12" stroke="${color}" stroke-width="1.8" fill="${fill}" />`,
            `<polygon points="16,4 29,27 3,27" stroke="${color}" stroke-width="1.8" fill="${fill}" stroke-linejoin="round" />`
        ];
        return `<svg style="width:36px; height:36px" viewBox="0 0 32 32">${shapes[card.s]}</svg>`;
    } else {
        const waveD = "M29.5,12 C30.8,14.5 30.8,17.2 30.2,19.9 C29.7,22.2 28,23 26,22 C25.4,21.7 24.8,21.4 24.3,21.1 C21.7,19.5 19,19.3 16.1,20.4 C13.4,21.5 10.6,21.6 7.8,20.8 C3.3,19.4 0.4,14.6 1.4,10.2 C2,7.7 3.7,7 5.9,8.2 C6.2,8.4 6.5,8.6 6.8,8.8 C9.7,10.6 12.7,11.2 16,9.9 C17.3,9.3 18.7,8.9 20,8.6 C24,7.6 27.5,8.9 29.5,12 Z";
        let inner = '';
        let extraClass = '';
        if (card.s === 0) {
            inner = `<polygon transform="translate(16,16) scale(1.08) translate(-16,-16)" points="1,16 16,8.5 31,16 16,23.5" stroke="${color}" stroke-width="${strokeW}" fill="${fill}" stroke-linejoin="round" />`;
            extraClass = 'diamond';
        } else if (card.s === 1) {
            inner = `<rect transform="translate(16,16) scale(1.08, 1.16) translate(-16,-16)" x="1" y="9.5" width="30" height="13" rx="6.5" stroke="${color}" stroke-width="${strokeW}" fill="${fill}" />`;
            extraClass = 'oval';
        } else {
            inner = `<path transform="translate(16,16) scale(1.08) translate(-16,-16)" d="${waveD}" stroke="${color}" stroke-width="${strokeW}" fill="${fill}" stroke-linejoin="round" />`;
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
        el.className = 'card' + (animateIn ? ' anim-in' : '');
        if (config.preset === 'standard') el.style.gap = ['0px', '9px', '3px'][card.n];
        for (let n=0; n<=card.n; n++) el.innerHTML += getShapeSVG(card);
        el.onpointerdown = (e) => { e.preventDefault(); toggleSelect(i, el); };
        slot.appendChild(el);
    }
}

async function toggleSettings(show) {
    const modal = document.getElementById('settings-modal');
    if (show) {
        syncSettingsUI();
        modal.classList.remove('hide');
        modal.classList.add('show');
    } else {
        modal.classList.add('hide');
        await new Promise(r => setTimeout(r, 200));
        modal.classList.remove('show', 'hide');
    }
}

function openAdvanced() {
    const advModal = document.getElementById('advanced-modal');
    syncSettingsUI();
    advModal.classList.remove('hide');
    advModal.classList.add('show');
}

async function closeAdvanced() {
    const advModal = document.getElementById('advanced-modal');
    advModal.classList.add('hide');
    await new Promise(r => setTimeout(r, 200));
    advModal.classList.remove('show', 'hide');
}

function syncSettingsUI() {
    document.getElementById('btn-std').className = `preset-chip ${config.preset === 'standard' ? 'active' : ''}`;
    document.getElementById('btn-cls').className = `preset-chip ${config.preset === 'classic' ? 'active' : ''}`;
    document.getElementById('toggle-possible').classList.toggle('active', config.showPossible);
    const rowDet = document.getElementById('row-detailed');
    rowDet.style.opacity = config.showPossible ? '1' : '0.3';
    rowDet.style.pointerEvents = config.showPossible ? 'auto' : 'none';
    document.getElementById('toggle-detailed').classList.toggle('active', config.showDetailedPossible);
    document.getElementById('toggle-spm').classList.toggle('active', config.showSPM);
    document.getElementById('live-spm').style.display = config.showSPM ? 'block' : 'none';
    if (config.showSPM) updateLiveSPM();

    document.getElementById('toggle-auto').classList.toggle('active', config.autoShuffle);
    document.getElementById('toggle-auto-select').classList.toggle('active', config.autoSelectThird);
    document.getElementById('toggle-prevent').classList.toggle('active', config.preventBadShuffle);
    document.getElementById('toggle-seed').classList.toggle('active', config.useFixedSeed);
    document.getElementById('min-sets-input').value = config.minSetsToRecord;
    document.getElementById('seed-label').style.display = config.useFixedSeed ? 'block' : 'none';
    
    const speedRange = document.getElementById('speed-range');
    if (speedRange) speedRange.value = config.speedMod;
    
    const speedVal = document.getElementById('speed-val');
    if (speedVal) speedVal.innerText = config.speedMod + 'x';
    
    document.documentElement.style.setProperty('--speed-mod', config.speedMod);
}

function setShape(p) {
    if (config.preset === p) return;
    config.preset = p;
    localStorage.setItem('set_shape_preset', p);
    const activeBtn = p === 'standard' ? document.getElementById('btn-std') : document.getElementById('btn-cls');
    activeBtn.classList.add('chip-animate');
    activeBtn.addEventListener('animationend', () => { activeBtn.classList.remove('chip-animate'); }, { once: true });
    updateColors();
    syncSettingsUI();
}

function toggleOption(key) {
    config[key] = !config[key];
    const storageKey = 'set_' + key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    localStorage.setItem(storageKey, config[key]);
    console.log('Saved:', storageKey, '=', config[key]);
    syncSettingsUI();

    
    if (key === 'useFixedSeed') {
        initNewDeckAndBoard();
        resetStats();
        updateUI();
    } else {
        updateUI();
    }
}

function setMinSets(val) {
    const num = parseInt(val) || 0;
    config.minSetsToRecord = num;
    localStorage.setItem('set_min_sets', num);
}

function createDeck() {
    const d = [];
    for (let c=0; c<3; c++) for (let s=0; s<3; s++) for (let f=0; f<3; f++) for (let n=0; n<3; n++) d.push({c,s,f,n});
    let randomFunc = Math.random;
    if (config.useFixedSeed) {
        const now = new Date();
        const seedStr = `${now.getFullYear()}${now.getMonth()}${now.getDate()}${now.getHours()}${now.getMinutes()}`;
        randomFunc = mulberry32(parseInt(seedStr));
    }
    for (let i = d.length - 1; i > 0; i--) {
        const j = Math.floor(randomFunc() * (i + 1));
        [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
}

function analyzePossibleSets() {
    let stats = { total: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    for(let i=0; i<board.length; i++) {
        for(let j=i+1; j<board.length; j++) {
            for(let k=j+1; k<board.length; k++) {
                if(board[i] && board[j] && board[k]) {
                    let diffCount = 0;
                    let isSet = true;
                    ['c','s','f','n'].forEach(p => {
                        if ((board[i][p]+board[j][p]+board[k][p])%3 !== 0) isSet = false;
                        if (board[i][p] !== board[j][p]) diffCount++;
                    });
                    if (isSet) { stats.total++; stats[diffCount]++; }
                }
            }
        }
    }
    return stats;
}

function updateLiveSPM() {
    if (isGameOver || !config.showSPM) return;

    const spmElement = document.getElementById('live-spm');
    const totalElapsedMs = Date.now() - startTime;

    if (totalElapsedMs > 500) {
        const spm = (collectedSets / (totalElapsedMs / 60000)).toFixed(1);
        spmElement.innerText = spm;
        spmElement.style.color = getSPMColor(parseFloat(spm));
    } else {
        spmElement.innerText = "0.0";
        spmElement.style.color = getSPMColor(0);
    }
}

function updateUI() {
    const stats = analyzePossibleSets();
    if (!isGameOver && !isAnimating) possibleHistory.push(stats.total);
    
    gameModifiers.SP = config.showPossible;
    gameModifiers.DP = config.showPossible && config.showDetailedPossible;
    gameModifiers.AS = config.autoShuffle;
    gameModifiers.PBS = config.preventBadShuffle;
    gameModifiers.A3RD = config.autoSelectThird;
    gameModifiers.SS = config.useFixedSeed;

    document.getElementById('deck-count').innerText = deck.length;
    document.getElementById('current-score').innerText = collectedSets;
    document.getElementById('possible-count').innerText = stats.total;
    document.getElementById('possible-label').style.opacity = config.showPossible ? '1' : '0';
    const detContainer = document.getElementById('detailed-possible');
    detContainer.style.opacity = (config.showPossible && config.showDetailedPossible) ? '1' : '0';
    document.getElementById('det-4').innerText = stats[4];
    document.getElementById('det-3').innerText = stats[3];
    document.getElementById('det-2').innerText = stats[2];
    document.getElementById('det-1').innerText = stats[1];
    
    if (stats.total === 0 && config.autoShuffle && deck.length > 0 && !isAnimating && !isGameOver) {
        setTimeout(() => shuffleBoard(true), 0);
    }
    
    updateLiveSPM();
}

function showToast(text) {
    const toast = document.createElement('div');
    toast.className = 'bad-shuffle-toast';
    toast.innerText = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 800);
}

async function toggleSelect(idx, el) {
    if (isAnimating || isGameOver) return;
    
    if (selected.includes(idx)) {
        selected = selected.filter(i => i !== idx);
        el.classList.remove('selected');
        return;
    }

    selected.push(idx); 
    el.classList.add('selected');

    const currentPossible = analyzePossibleSets().total;

    if (selected.length === 2 && config.autoSelectThird) {
        const c1 = board[selected[0]];
        const c2 = board[selected[1]];
        const target = {};
        ['c','s','f','n'].forEach(p => { target[p] = (3 - (c1[p] + c2[p]) % 3) % 3; });
        let thirdIdx = -1;
        for(let i=0; i<board.length; i++) {
            if (!board[i] || selected.includes(i)) continue;
            if (['c','s','f','n'].every(p => board[i][p] === target[p])) { thirdIdx = i; break; }
        }
        if (thirdIdx !== -1) {
            const thirdEl = document.getElementById('board').children[thirdIdx].querySelector('.card');
            selected.push(thirdIdx);
            thirdEl.classList.add('selected');
        } else {
            mistakes++;
            isAnimating = true;
            await new Promise(r => setTimeout(r, 150));
            selected.forEach(i => document.getElementById('board').children[i].querySelector('.card')?.classList.remove('selected'));
            selected = [];
            isAnimating = false;
            return;
        }
    }

    if (selected.length === 3) {
        isAnimating = true;
        const sIdx = [...selected];
        const cards = sIdx.map(i => board[i]);
        const isCorrect = ['c','s','f','n'].every(p => (cards[0][p] + cards[1][p] + cards[2][p]) % 3 === 0);
        if (isCorrect) {
            collectedSets++;
            const now = Date.now();
            const findTime = now - lastSetFoundTime;
            setTimestamps.push({ time: now, findTime: findTime, possibleAtStart: currentPossible });
            lastSetFoundTime = now;

            sIdx.forEach(i => document.getElementById('board').children[i].querySelector('.card')?.classList.add('anim-out'));
            await new Promise(r => setTimeout(r, 70));
            sIdx.forEach(i => { board[i] = deck.length > 0 ? deck.pop() : null; updateSlot(i, true); });
            selected = []; 
            isAnimating = false; 
            updateUI();
            if (collectedSets >= 23 && analyzePossibleSets().total === 0 && !isGameOver) {
                setTimeout(() => finishGame(true), 300);
            }
        } else {
            mistakes++;
            await new Promise(r => setTimeout(r, 150));
            sIdx.forEach(i => document.getElementById('board').children[i].querySelector('.card')?.classList.remove('selected'));
            selected = [];
            isAnimating = false;
        }
    }
}

function handleShuffleClick() {
    if (isAnimating || isGameOver || isBtnLocked) return;
    const possibleCount = analyzePossibleSets().total;
    if (possibleCount > 0) {
        badShuffles++;
        updateUI();
        if (!config.showPossible && !config.autoShuffle) showToast('bad shuffle!');
        if (config.preventBadShuffle) {
            const btn = document.getElementById('shuffle-btn');
            isBtnLocked = true;
            btn.classList.add('locked');
            btn.innerText = 'nuh-uh!';
            setTimeout(() => { btn.classList.remove('locked'); btn.innerText = 'Shuffle'; isBtnLocked = false; }, 1000);
            return;
        }
    }
    shuffleBoard(false);
}

function shuffleExistingCards() {
    if (isAnimating || isGameOver) return;
    isAnimating = true;
    shuffleExCount++;
    for (let i = board.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [board[i], board[j]] = [board[j], board[i]];
    }
    selected = [];
    const slots = document.getElementById('board').children;
    for (let i = 0; i < slots.length; i++) {
        updateSlot(i, false);
        const cardEl = slots[i].querySelector('.card');
        if (cardEl) {
            cardEl.classList.add('jumping');
            cardEl.addEventListener('animationend', () => { cardEl.classList.remove('jumping'); }, { once: true });
        }
    }
    setTimeout(() => { isAnimating = false; updateUI(); }, 200);
}

function shuffleBoard(isAuto = false) {
    if (isAnimating) return;
    isAnimating = true;
    document.querySelectorAll('.card').forEach(c => c.classList.add('anim-out'));
    setTimeout(() => {
        const currentCards = board.filter(c => c !== null);
        deck.push(...currentCards);
        deck.sort(() => Math.random() - 0.5);
        board = deck.splice(0, 12);
        selected = [];
        for (let i=0; i<12; i++) updateSlot(i, true);
        isAnimating = false;
        updateUI();
    }, 100);
}

function saveRecord(extra) {
    if (collectedSets < config.minSetsToRecord) return;
    const records = JSON.parse(localStorage.getItem('set_pro_records') || '[]');
    const rec = { 
        id: Date.now(), 
        sets: collectedSets, 
        time: extra.elapsedMs, 
        badShuffles: badShuffles, 
        date: extra.dateStr, 
        isSeed: config.useFixedSeed,
        timestamps: setTimestamps,
        modifiers: {...gameModifiers},
        extra: extra
    };
    records.push(rec);
    localStorage.setItem('set_pro_records', JSON.stringify(records));
}

function calculateSpeedData(totalTimeMs, timestampsInput) {
    const intervalMs = 10000; 
    const points = Math.ceil(totalTimeMs / intervalMs);
    const labels = [];
    const data = [];
    const ts = timestampsInput || setTimestamps.map(t => t.time);
    
    for (let i = 1; i <= points; i++) {
        const currentTime = i * intervalMs;
        labels.push(formatTime(currentTime));
        const setsInInterval = ts.filter(val => {
            const relativeTs = (typeof val === 'object' ? val.time : val) - startTime;
            return relativeTs > (currentTime - intervalMs) && relativeTs <= currentTime;
        }).length;
        const spm = (setsInInterval / (intervalMs / 1000)) * 60;
        data.push(spm.toFixed(1));
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
    let count = 0;
    const target = mods || gameModifiers;
    Object.entries(target).forEach(([key, active]) => {
        if (active) {
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

async function shareResult() {
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
    clone.style.backgroundColor = '#2d2631';
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
        await new Promise(r => setTimeout(r, 150));
        const canvas = await html2canvas(clone, { backgroundColor: '#2d2631', scale: 2, width: exportW, height: exportH, logging: false, useCORS: true });
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

async function closeExtraStats() {
    const modal = document.getElementById('extra-stats-modal');
    modal.classList.add('hide');
    await new Promise(r => setTimeout(r, 200));
    modal.classList.remove('show', 'hide');
}

function showExtraStats() {
    const s = currentExtraStats;
    const container = document.getElementById('extra-stats-content');

    const modal = document.getElementById('extra-stats-modal');
    modal.classList.remove('hide');
    modal.classList.add('show');

    const avgPossible = (s.possibleHistory.reduce((a,b) => a+b, 0) / Math.max(1, s.possibleHistory.length)).toFixed(1);
    const diff1 = s.timestamps.filter(t => t.possibleAtStart === 1);
    const diff2 = s.timestamps.filter(t => t.possibleAtStart === 2);
    const diff3 = s.timestamps.filter(t => t.possibleAtStart >= 3);
    const getAvg = (arr) => arr.length ? formatTime(arr.reduce((a,b) => a+b.findTime, 0) / arr.length, true) : '--';

    container.innerHTML = `
        <div class="extra-stat-row"><span class="extra-stat-label">Avg sets on board</span><span class="extra-stat-value">${avgPossible}</span></div>
        <div class="extra-stat-row"><span class="extra-stat-label">Wrong selections</span><span class="extra-stat-value">${s.mistakes}</span></div>
        <div class="extra-stat-row"><span class="extra-stat-label">Search (1 set)</span><span class="extra-stat-value">${getAvg(diff1)}</span></div>
        <div class="extra-stat-row"><span class="extra-stat-label">Search (2 sets)</span><span class="extra-stat-value">${getAvg(diff2)}</span></div>
        <div class="extra-stat-row"><span class="extra-stat-label">Search (3+ sets)</span><span class="extra-stat-value">${getAvg(diff3)}</span></div>
        <div class="extra-stat-row"><span class="extra-stat-label">Shuffle Board uses</span><span class="extra-stat-value">${s.shuffleExCount}</span></div>
        <div class="extra-stat-row"><span class="extra-stat-label">Auto finish</span><span class="extra-stat-value">${s.isAutoFinish ? 'YES' : 'NO'}</span></div>
        <div class="extra-stat-row"><span class="extra-stat-label">Platform</span><span class="extra-stat-value">${s.platform}</span></div>
    `;
}

function finishGame(isAuto = false) {
    if (isGameOver) return;
    isGameOver = true;
    const elapsedMs = (Date.now() - startTime);
    const now = new Date();
    const dateStr = now.toLocaleDateString('ru-RU') + ' ' + now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    
    const platform = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'Mobile' : 'PC';
    
    currentExtraStats = {
        elapsedMs, dateStr, platform, isAutoFinish: isAuto, 
        mistakes, shuffleExCount, 
        possibleHistory: [...possibleHistory],
        timestamps: [...setTimestamps],
        modifiers: {...gameModifiers}
    };

    saveRecord(currentExtraStats);
    displayResults(collectedSets, badShuffles, currentExtraStats);
    
    const modal = document.getElementById('result-modal');
    modal.classList.remove('hide');
    modal.classList.add('show');
    setTimeout(() => {
        document.querySelectorAll('.card').forEach(c => c.classList.add('anim-out'));
        setTimeout(() => { initNewDeckAndBoard(); }, 100);
    }, 150);
}

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

function initNewDeckAndBoard() {
    deck = createDeck();
    board = deck.splice(0, 12);
    selected = [];
    for (let i=0; i<12; i++) updateSlot(i, false);
}

function resetStats() {
    collectedSets = 0; badShuffles = 0; mistakes = 0; shuffleExCount = 0;
    startTime = Date.now();
    lastSetFoundTime = startTime;
    setTimestamps = [];
    possibleHistory = [];
    gameModifiers = { 
        SP: config.showPossible, 
        DP: config.showPossible && config.showDetailedPossible, 
        AS: config.autoShuffle, 
        PBS: config.preventBadShuffle, 
        A3RD: config.autoSelectThird, 
        SS: config.useFixedSeed 
    };
    document.getElementById('timer').innerText = "00:00";
    currentExtraStats = null;
}

async function resetGame() {
    const modal = document.getElementById('result-modal');
    if (modal.classList.contains('show')) {
        modal.classList.add('hide');
        await new Promise(r => setTimeout(r, 200));
        modal.classList.remove('show', 'hide');
    }
    isGameOver = false;
    resetStats();
    updateUI();
}

function openRecords() {
    const records = JSON.parse(localStorage.getItem('set_pro_records') || '[]');
    records.sort((a, b) => b.sets - a.sets || a.time - b.time);
    const container = document.getElementById('records-container');
    container.innerHTML = records.length ? '' : '<p class="text-center text-gray-500 mt-10">No records yet</p>';

    records.forEach(r => {
        const item = document.createElement('div');
        item.className = 'record-item';
        item.onclick = () => showSavedRecord(r);
        item.innerHTML = `
            <div class="record-info">
                <div class="record-val">${r.sets} Sets ${r.isSeed ? '🧬' : ''}</div>
                <div class="text-[10px] uppercase opacity-70">${r.date}</div>
            </div>
            <div class="record-info text-right flex-grow flex justify-end items-center mr-2">
                <div class="text-white font-mono text-lg leading-none">${formatTime(r.time, true)}</div>
            </div>
            <div class="btn-del" onclick="deleteRecord(event, ${r.id})">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
            </div>
        `;
        container.appendChild(item);
    });
    document.getElementById('records-modal').classList.remove('hide');
    document.getElementById('records-modal').classList.add('show');
}

function showSavedRecord(r) {
    if (!r.extra) { alert("Detailed info not available for old records"); return; }
    closeRecords();
    currentExtraStats = r.extra;
    currentExtraStats.modifiers = r.modifiers;
    currentExtraStats.timestamps = r.timestamps;
    displayResults(r.sets, r.badShuffles, currentExtraStats);
    document.getElementById('result-modal').classList.remove('hide');
    document.getElementById('result-modal').classList.add('show');
}

function deleteRecord(event, id) {
    event.stopPropagation();
    if (confirm('Delete this record?')) {
        let records = JSON.parse(localStorage.getItem('set_pro_records') || '[]');
        records = records.filter(r => r.id !== id);
        localStorage.setItem('set_pro_records', JSON.stringify(records));
        openRecords();
    }
}

async function closeRecords() {
    const modal = document.getElementById('records-modal');
    modal.classList.add('hide');
    await new Promise(r => setTimeout(r, 200));
    modal.classList.remove('show', 'hide');
}

function openKeybinds() {
    const grid = document.getElementById('kb-board-grid');
    grid.innerHTML = '';
    binds.board.forEach((key, i) => {
        const cell = document.createElement('div');
        cell.className = 'kb-cell';
        cell.id = `kb-slot-${i}`;
        cell.innerText = key === ' ' ? 'SPC' : key.toUpperCase();
        cell.onclick = () => startCapture('board', i);
        grid.appendChild(cell);
    });
    syncKeybindsUI();
    document.getElementById('keybinds-modal').classList.remove('hide');
    document.getElementById('keybinds-modal').classList.add('show');
}

function startCapture(type, index = null) {
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

async function closeKeybinds() {
    const modal = document.getElementById('keybinds-modal');
    modal.classList.add('hide');
    await new Promise(r => setTimeout(r, 200));
    modal.classList.remove('show', 'hide');
    localStorage.setItem('set_keybinds', JSON.stringify(binds));
}

function resetKeybinds() {
    if (confirm('Reset keys to default?')) {
        binds = JSON.parse(JSON.stringify(DEFAULT_BINDS));
        openKeybinds();
    }
}

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
    if (isGameOver) { if (key === binds.finish && key !== '') resetGame(); return; }
    if (key !== '' && key === binds.shuffle) { e.preventDefault(); handleShuffleClick(); } 
    else if (key !== '' && key === binds.shuffleEx) { e.preventDefault(); shuffleExistingCards(); } 
    else if (key !== '' && key === binds.finish) { e.preventDefault(); finishGame(); } 
    else if (key !== '') {
        const boardIdx = binds.board.indexOf(key);
        if (boardIdx !== -1) {
            const slot = document.getElementById('board')?.children[boardIdx];
            const cardEl = slot?.querySelector('.card');
            if (cardEl) toggleSelect(boardIdx, cardEl);
        }
    }
});

setInterval(() => {
    if (!isGameOver && !document.querySelector('.overlay.show')) {
        const elapsedMs = (Date.now() - startTime);
        document.getElementById('timer').innerText = formatTime(elapsedMs, false);
        updateLiveSPM();
    }
}, 1000);

initNewDeckAndBoard();
updateColors();
syncSettingsUI();
updateUI();
