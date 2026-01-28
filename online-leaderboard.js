function randomInt(maxExclusive) {
  maxExclusive = Math.max(1, maxExclusive | 0);
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      var a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] % maxExclusive;
    }
  } catch (_) {}
  return Math.floor(Math.random() * maxExclusive);
}

function generateDefaultOnlineNickname() {
  // One-time default nickname when user hasn't set one yet.
  var fixed = [
    'Huge Set fan',
    'Set enthusiast',
    'Set enjoyer',
    'Set aficionado',
    'Set connoisseur',
    'Set appreciator',
    'Set addict',
    'Set hunter',
    'Set seeker',
    'Set solver',
    'Set speedrunner',
    'Set grinder',
    'Set enjoyer supreme',
    'Set pattern lover',
    'Set vibes only',
    'Set wizard',
    'Set mage',
    'Set ninja',
    'Set detective',
    'Set tactician',
    'Set strategist',
    'Set machine',
    'Set enjoyer deluxe',
    'Card whisperer',
    'Pattern whisperer',
    'Triple threat',
    'Chaos tamer',
    'Board cleaner',
    'Fastest fingers',
    'Focus mode',
    'Zen solver',
    'Hyperfocus',
    'Shape scholar',
    'Pattern scholar',
    'Mind palace',
    'Clean combos',
    'Combo captain',
    'Logic sprinter',
    'Silky picks',
    'Sharp eyes'
  ];

  var adjectives = [
    'Huge', 'Dedicated', 'Casual', 'Legendary', 'Friendly', 'Curious', 'Swift', 'Calm', 'Focused', 'Brave',
    'Clever', 'Sneaky', 'Patient', 'Relentless', 'Chill', 'Cozy', 'Silly', 'Serious', 'Sharp', 'Tiny'
  ];
  var roles = [
    'set fan', 'set enthusiast', 'set enjoyer', 'set hunter', 'set solver', 'set wizard', 'set tactician',
    'pattern lover', 'card whisperer', 'shape scholar'
  ];

  if (randomInt(10) < 7) return fixed[randomInt(fixed.length)];
  return adjectives[randomInt(adjectives.length)] + ' ' + roles[randomInt(roles.length)];
}

function ensureOnlineNickname() {
  var nick = (Storage.get(STORAGE_KEYS.ONLINE_NICKNAME) || '').trim();
  // Also treat a stored placeholder as "not set" (in case it ever got persisted).
  if (!nick || nick.toLowerCase() === 'not set') {
    nick = generateDefaultOnlineNickname();
    Storage.set(STORAGE_KEYS.ONLINE_NICKNAME, nick);
  }
  return nick;
}

function getOnlineNickname() {
  return ensureOnlineNickname();
}

function getLeaderboardBaseUrl() {
  var url = typeof ONLINE_LEADERBOARD_URL === 'string' ? ONLINE_LEADERBOARD_URL.trim() : '';
  if (!url) return '';
  if (!/\/exec\/?$/i.test(url)) url = url.replace(/\/?$/, '') + '/exec';
  return url;
}

function setOnlineNickname(nick) {
  const value = (String(nick || '').trim()).slice(0, 32);
  Storage.set(STORAGE_KEYS.ONLINE_NICKNAME, value);
  return value;
}

function fetchViaIframe(url) {
  return new Promise(function (resolve, reject) {
    var timeoutMs = 15000;
    var done = false;
    var iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
    var urlWithFormat = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'format=postmessage';
    var onMessage = function (e) {
      if (done) return;
      var d = e.data;
      if (typeof d === 'string') try { d = JSON.parse(d); } catch (_) { return; }
      var fromGoogle = e.origin && (e.origin.indexOf('google') !== -1 || e.origin.indexOf('script.') !== -1);
      if (d && typeof d === 'object' && (fromGoogle || d.hasOwnProperty('ok') || Array.isArray(d))) {
        done = true;
        window.removeEventListener('message', onMessage);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        clearTimeout(t);
        resolve(d);
      }
    };
    var t = setTimeout(function () {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      reject(new Error('Timeout'));
    }, timeoutMs);
    window.addEventListener('message', onMessage);
    iframe.src = urlWithFormat;
    document.body.appendChild(iframe);
  });
}

function jsonpRequest(url) {
  return new Promise(function (resolve, reject) {
    var name = 'jsonp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    var finalUrl = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + encodeURIComponent(name);
    window[name] = function (data) {
      delete window[name];
      if (script.parentNode) script.parentNode.removeChild(script);
      resolve(data);
    };
    var script = document.createElement('script');
    script.src = finalUrl;
    script.onerror = function () {
      delete window[name];
      if (script.parentNode) script.parentNode.removeChild(script);
      reject(new Error('Failed to fetch'));
    };
    document.head.appendChild(script);
  });
}

function parseJsonpOrJson(text) {
  var trimmed = (text || '').trim();
  if (/^[a-zA-Z0-9_]+\(/.test(trimmed)) {
    var start = trimmed.indexOf('(') + 1;
    var end = trimmed.lastIndexOf(')');
    if (end > start) trimmed = trimmed.slice(start, end);
  }
  return JSON.parse(trimmed);
}

function fetchViaCorsProxy(url) {
  var encoded = encodeURIComponent(url);
  var proxyUrl = 'https://api.allorigins.win/raw?url=' + encoded;
  return fetch(proxyUrl, { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (text) {
    var trimmed = (text || '').trim();
    if ((trimmed.toLowerCase().indexOf('<!doctype') === 0) || (trimmed.indexOf('<') === 0)) throw new Error('Proxy returned HTML');
    return parseJsonpOrJson(trimmed);
  });
}

async function fetchOnlineLeaderboard() {
  var url = getLeaderboardBaseUrl();
  if (!url) return [];
  try {
    var data = await jsonpRequest(url);
    return Array.isArray(data) ? data : [];
  } catch (_) {
    try {
      data = await fetchViaCorsProxy(url);
      return Array.isArray(data) ? data : [];
    } catch (__) {
      return [];
    }
  }
}

function modifiersToStr(mods) {
  if (!mods || typeof mods !== 'object') return '';
  var keys = ['SP', 'AS', 'PBS', 'A3RD', 'SS', 'DM'];
  return keys.filter(function (k) { return mods[k]; }).join(',');
}

/**
 * Submit a record to the online leaderboard (via JSONP GET — POST is blocked by CORS).
 * @param {{ sets: number, time: number, dateStr: string, isAutoFinish: boolean, badShuffles?: number, modifiers?: object, extra?: object }} record
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function submitRecordToOnline(record) {
  var url = getLeaderboardBaseUrl();
  if (!url) return { ok: false, error: 'URL not configured' };
  var nick = ensureOnlineNickname();
  if (!nick) return { ok: false, error: 'Set your nickname first' };
  try {
    var extraJson = '';
    try {
      if (record.extra) extraJson = JSON.stringify(record.extra);
    } catch (_) { extraJson = ''; }
    var params = {
      action: 'submit',
      nickname: nick,
      sets: String(record.sets),
      time: String(record.time),
      date: record.dateStr || '',
      isFinish: record.isAutoFinish ? '1' : '0',
      badShuffles: String(record.badShuffles != null ? record.badShuffles : 0),
      modifiers: modifiersToStr(record.modifiers || {}),
      extraJson: extraJson
    };
    var q = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    var fullUrl = url + (url.indexOf('?') >= 0 ? '&' : '?') + q;
    var data;
    try {
      data = await fetchViaIframe(fullUrl);
    } catch (_) {
      throw new Error('Failed to fetch');
    }
    var errVal = (data && data.error);
    var errStr = typeof errVal === 'object' && errVal !== null && errVal.message ? errVal.message : (errVal || 'Failed');
    return data && data.ok ? { ok: true } : { ok: false, error: errStr };
  } catch (e) {
    return { ok: false, error: e.message || 'Network error' };
  }
}

function submitLastResultToOnline() {
  if (!lastFinishResult) return Promise.resolve({ ok: false, error: 'No result to submit' });
  return submitRecordToOnline(Object.assign({}, lastFinishResult, { extra: typeof currentExtraStats === 'object' ? currentExtraStats : null }));
}

var lastSubmittedResultId = null;

async function handleSubmitToOnline() {
  if (!lastFinishResult) return;
  var resultId = lastFinishResult.sets + '-' + lastFinishResult.time + '-' + (lastFinishResult.dateStr || '');
  if (lastSubmittedResultId === resultId) return;
  var btn = document.getElementById('submit-online-btn');
  if (btn) btn.disabled = true;
  var result = await submitLastResultToOnline();
  if (btn) btn.disabled = false;
  if (result.ok) lastSubmittedResultId = resultId;
}

function getManualSubmitUrl() {
  if (!lastFinishResult) return '';
  var url = getLeaderboardBaseUrl();
  if (!url) return '';
  var nick = getOnlineNickname();
  if (!nick) return '';
  var params = {
    action: 'submit',
    nickname: nick,
    sets: String(lastFinishResult.sets),
    time: String(lastFinishResult.time),
    date: lastFinishResult.dateStr || '',
    isFinish: lastFinishResult.isAutoFinish ? '1' : '0',
    badShuffles: String(lastFinishResult.badShuffles != null ? lastFinishResult.badShuffles : 0),
    modifiers: modifiersToStr(lastFinishResult.modifiers || {}),
    extraJson: (function () {
      try {
        return typeof currentExtraStats === 'object' && currentExtraStats ? JSON.stringify(currentExtraStats) : '';
      } catch (_) {
        return '';
      }
    })(),
    format: 'display'
  };
  var q = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + q;
}

/**
 * Render online records into container. Shows loading, then list or error.
 * @param {HTMLElement} container
 */
async function renderOnlineRecords(container) {
  if (!container) return;
  container.innerHTML = '<p class="text-gray-500 text-sm">Loading…</p>';
  const url = getLeaderboardBaseUrl();
  if (!url) {
    container.innerHTML = '<p class="text-gray-500 text-sm">Online leaderboard is not configured.</p>';
    return;
  }
  const rows = await fetchOnlineLeaderboard();
  if (rows.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-sm">No online records yet.</p>';
    return;
  }
  const finishRows = rows.filter(r => r.isFinish || r.is_finish);
  const otherRows = rows.filter(r => !r.isFinish && !r.is_finish);
  finishRows.sort((a, b) => (a.time || a.time_ms || 0) - (b.time || b.time_ms || 0));
  otherRows.sort((a, b) => (b.sets || 0) - (a.sets || 0) || (a.time || a.time_ms || 0) - (b.time || b.time_ms || 0));
  const sorted = [...finishRows, ...otherRows];
  container.innerHTML = '';
  sorted.forEach((r) => {
    const nick = (r.nickname || r.nick || '').trim() || '—';
    const sets = r.sets != null ? r.sets : '—';
    const timeMs = r.time != null ? r.time : r.time_ms;
    const timeStr = timeMs != null ? formatTime(timeMs, true) : '—';
    const dateStr = (r.date || '').trim() || '';
    const isFin = r.isFinish || r.is_finish;
    const item = document.createElement('div');
    item.className = 'record-item online-record-item';
    item.innerHTML =
      '<div class="record-info">' +
        '<div class="record-val">' + escapeHtml(nick) + ' · ' + sets + ' Sets ' + (isFin ? '✓' : '') + '</div>' +
        (dateStr ? '<div class="text-[10px] uppercase opacity-70">' + escapeHtml(dateStr) + '</div>' : '') +
      '</div>' +
      '<div class="record-info text-right flex-grow flex justify-end items-center mr-2">' +
        '<div class="text-white font-mono text-lg leading-none">' + escapeHtml(timeStr) + '</div>' +
      '</div>';

    // Build a record-like object so we can show full stats on tap, similar to local records.
    var bsVal = r.badShuffles != null ? r.badShuffles : r.bad_shuffles;
    if (bsVal === undefined || bsVal === null || bsVal === '') bsVal = 0;
    var extraJson = r.extraJson || r.extra_json || r.extra || '';
    var extraStats = null;
    if (extraJson) {
      try { extraStats = JSON.parse(extraJson); } catch (_) { extraStats = null; }
    }
    if (!extraStats) {
      extraStats = {
        elapsedMs: timeMs || 0,
        dateStr: dateStr || '',
        platform: 'Online',
        isAutoFinish: !!isFin,
        mistakes: 0,
        shuffleExCount: 0,
        possibleHistory: [],
        timestamps: [],
        modifiers: {}
      };
    }
    var rec = {
      id: null,
      sets: sets === '—' ? 0 : Number(sets),
      time: timeMs != null ? timeMs : extraStats.elapsedMs || 0,
      badShuffles: Number(bsVal) || 0,
      date: dateStr,
      isSeed: false,
      timestamps: extraStats.timestamps || [],
      modifiers: extraStats.modifiers || {},
      extra: extraStats
    };
    bindOnlineRecordTap(item, rec);
    container.appendChild(item);
  });
}

function bindOnlineRecordTap(item, rec) {
  const onDown = (e) => {
    item._recordTap = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
  };
  const onUp = (e) => {
    const s = item._recordTap;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if ((Date.now() - s.t) < 400 && dx * dx + dy * dy < 225) showOnlineRecordDetails(rec);
    item._recordTap = null;
  };
  const onCancel = () => { item._recordTap = null; };
  item.addEventListener('pointerdown', onDown, { passive: true });
  item.addEventListener('pointerup', onUp, { passive: true });
  item.addEventListener('pointercancel', onCancel, { passive: true });
}

async function showOnlineRecordDetails(rec) {
  if (!rec.extra) { alert('Detailed info not available for this online record'); return; }
  if (typeof closeOnlineRecordsModal === 'function') await closeOnlineRecordsModal();
  if (typeof closeModal === 'function') await closeModal('records-modal');
  resultOpenedFrom = 'online';
  currentExtraStats = rec.extra;
  currentExtraStats.modifiers = rec.modifiers || currentExtraStats.modifiers || {};
  currentExtraStats.timestamps = rec.timestamps || currentExtraStats.timestamps || [];
  displayResults(rec.sets, rec.badShuffles || 0, currentExtraStats);
  openModal('result-modal');
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function openNicknamePrompt() {
  const current = ensureOnlineNickname();
  const raw = prompt('Your nickname for online leaderboard:', current || 'Player');
  if (raw === null) return;
  const nick = setOnlineNickname(raw);
  refreshOnlineNicknameDisplay();
}

function refreshOnlineNicknameDisplay() {
  const el = document.getElementById('online-nickname-display');
  if (!el) return;
  const nick = ensureOnlineNickname();
  el.textContent = nick || 'Not set';
  el.classList.toggle('text-gray-500', !nick);
  el.classList.toggle('font-bold', !!nick);
}
