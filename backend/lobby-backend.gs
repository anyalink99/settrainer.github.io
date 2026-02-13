function doGet(e) {
  try {
    return doGetImpl(e);
  } catch (err) {
    var params = (e && e.parameter) || {};
    var callback = (params.callback || '').trim() || parseCallbackFromQuery((e && e.queryString) || '');
    var isJsonp = callback.length > 0;
    return out({ ok: false, error: String(err.message || err) }, params, callback, isJsonp);
  }
}

function parseCallbackFromQuery(qs) {
  if (!qs) return '';
  var match = qs.match(/[?&]callback=([^&]+)/);
  return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')).trim() : '';
}

function out(obj, params, callback, isJsonp) {
  var fmt = (params.format || '').trim();
  if (fmt === 'postmessage') {
    var html = '<script>parent.postMessage(' + JSON.stringify(obj) + ',"*");<\/script>';
    return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  if (fmt === 'display') {
    var msg = obj && obj.ok ? 'Record submitted! You can close this tab.' : (obj && obj.error) ? 'Error: ' + obj.error : 'Done.';
    return HtmlService.createHtmlOutput('<html><body style="font-family:sans-serif;text-align:center;padding:2em;"><p>' + msg + '</p></body></html>').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return jsonpOrJson(obj, callback, isJsonp);
}

function getActionFromQuery(queryString) {
  if (!queryString || typeof queryString !== 'string') return '';
  var q = queryString.trim();
  var pairs = q.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var eqIdx = pairs[i].indexOf('=');
    if (eqIdx < 0) continue;
    var key = decodeURIComponent((pairs[i].slice(0, eqIdx) || '').replace(/\+/g, ' ')).trim().toLowerCase();
    if (key === 'action') return decodeURIComponent((pairs[i].slice(eqIdx + 1) || '').replace(/\+/g, ' ')).trim();
  }
  return '';
}

function doGetImpl(e) {
  var params = (e && e.parameter) || {};
  var queryString = (e && e.queryString) || '';
  var callback = (params.callback || '').trim() || parseCallbackFromQuery(queryString);
  var isJsonp = callback.length > 0;

  var action = getActionFromQuery(queryString);
  if (!action && params.action !== undefined && params.action !== null) action = String(params.action).trim();
  if (!action && params.Action !== undefined && params.Action !== null) action = String(params.Action).trim();
  if (!action) {
    for (var k in params) {
      if (params.hasOwnProperty(k) && String(k).toLowerCase() === 'action') {
        action = String(params[k] || '').trim();
        break;
      }
    }
  }
  if (action.indexOf('lobby_') === 0) {
    var lobbyResult = handleLobbyAction(action, params);
    return out(lobbyResult, params, callback, isJsonp);
  }

  if (action === 'submit') {
    var sheet = getLeaderboardSheet();
    if (!sheet) return out({ ok: false, error: 'Sheet not found' }, params, callback, isJsonp);
    var nickname = (params.nickname || '').trim().slice(0, 32);
    var sets = parseInt(params.sets, 10) || 0;
    var time = parseInt(params.time, 10) || 0;
    var date = (params.date || '').trim();
    var isFinish = params.isFinish === '1' || params.isFinish === 'true';
    var badShuffles = parseInt(params.badShuffles, 10);
    if (isNaN(badShuffles)) badShuffles = 0;
    var modifiers = (params.modifiers || '').trim().slice(0, 64);
    var extraJson = (params.extraJson || params.extra || '').trim();
    if (extraJson.length > 40000) extraJson = extraJson.slice(0, 40000);
    if (!nickname) return out({ ok: false, error: 'Nickname required' }, params, callback, isJsonp);
    sheet.appendRow([new Date(), nickname, sets, time, date, isFinish ? 1 : 0, badShuffles, modifiers, extraJson]);
    return out({ ok: true }, params, callback, isJsonp);
  }

  if (queryString.indexOf('lobby_create') !== -1) {
    return out({ ok: false, error: 'Debug: URL had lobby_create but action=[' + action + '] len=' + (action ? action.length : 0) + ' qs_len=' + queryString.length + ' qs=' + JSON.stringify(queryString.slice(0, 220)) }, params, callback, isJsonp);
  }
  var sheet = getLeaderboardSheet();
  if (!sheet) return out({ error: 'Sheet not found' }, params, callback, isJsonp);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return out([], params, callback, isJsonp);
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var badShufflesVal = r[6];
    var modifiersVal = r[7];
    var extraJsonVal = r[8];
    rows.push({
      nickname: r[1],
      sets: r[2] !== '' ? Number(r[2]) : null,
      time: r[3] !== '' ? Number(r[3]) : null,
      time_ms: r[3] !== '' ? Number(r[3]) : null,
      date: r[4],
      isFinish: r[5] === 1 || r[5] === true || r[5] === '1',
      is_finish: r[5] === 1 || r[5] === true || r[5] === '1',
      badShuffles: badShufflesVal !== undefined && badShufflesVal !== '' ? Number(badShufflesVal) : null,
      bad_shuffles: badShufflesVal !== undefined && badShufflesVal !== '' ? Number(badShufflesVal) : null,
      modifiers: modifiersVal !== undefined && modifiersVal !== '' ? String(modifiersVal) : '',
      extraJson: extraJsonVal !== undefined && extraJsonVal !== '' ? String(extraJsonVal) : ''
    });
  }
  return out(rows, params, callback, isJsonp);
}

function getLeaderboardSheet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return null;
    var sheet = ss.getSheetByName('Leaderboard');
    if (sheet) return sheet;
    var sheets = ss.getSheets();
    return sheets.length > 0 ? sheets[0] : null;
  } catch (err) {
    return null;
  }
}

function jsonpOrJson(obj, callback, isJsonp) {
  var body = JSON.stringify(obj);
  if (isJsonp && callback) {
    body = callback + '(' + body + ')';
    return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

var LOBBY_HEADERS = ['lobbyId', 'hostNick', 'status', 'configJson', 'playersJson', 'createdAt', 'signalsJson'];

function getLobbiesSheet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return null;
    var sheet = ss.getSheetByName('Lobbies');
    if (sheet) return sheet;
    sheet = ss.insertSheet('Lobbies');
    sheet.appendRow(LOBBY_HEADERS);
    sheet.getRange(1, 1, 1, LOBBY_HEADERS.length).setFontWeight('bold');
    return sheet;
  } catch (err) {
    return null;
  }
}

function ensureLobbyHeaders(sheet) {
  var data = sheet.getRange(1, 1, 1, LOBBY_HEADERS.length).getValues()[0];
  var empty = data.every(function (c) { return c === '' || c === null; });
  if (empty) {
    sheet.getRange(1, 1, 1, LOBBY_HEADERS.length).setValues([LOBBY_HEADERS]).setFontWeight('bold');
  }
}

function handleLobbyAction(action, params) {
  var sheet = getLobbiesSheet();
  if (!sheet) return { ok: false, error: 'Lobbies sheet not found' };
  ensureLobbyHeaders(sheet);

  if (action === 'lobby_create') {
    var nick = (params.nickname || '').trim().slice(0, 32);
    if (!nick) return { ok: false, error: 'Nickname required' };
    var lobbyId = Utilities.getUuid().slice(0, 8);
    var playersJson = JSON.stringify([{ nick: nick, role: 'host' }]);
    sheet.appendRow([lobbyId, nick, 'waiting', '', playersJson, new Date().toISOString(), '[]']);
    return { ok: true, lobbyId: lobbyId };
  }

  if (action === 'lobby_list') {
    var data = sheet.getDataRange().getValues();
    var lobbies = [];
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      if ((r[2] || '').toString().trim() !== 'waiting') continue;
      var players = [];
      try { players = JSON.parse(r[4] || '[]'); } catch (_) {}
      lobbies.push({
        lobbyId: r[0],
        hostNick: r[1],
        hostNickname: r[1],
        playerCount: players.length,
        players: players
      });
    }
    lobbies.reverse();
    return { ok: true, lobbies: lobbies };
  }

  var lobbyId = (params.lobbyId || '').trim();
  if (!lobbyId) return { ok: false, error: 'lobbyId required' };

  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim() === lobbyId) { rowIndex = i + 1; break; }
  }
  if (rowIndex < 0) return { ok: false, error: 'Lobby not found' };

  var row = sheet.getRange(rowIndex, 1, 1, 7).getValues()[0];
  var hostNick = (row[1] || '').toString().trim();
  var status = (row[2] || '').toString().trim();
  var configJson = (row[3] || '').toString();
  var players = [];
  try { players = JSON.parse(row[4] || '[]'); } catch (_) {}
  var signals = [];
  try { signals = JSON.parse(row[6] || '[]'); } catch (_) {}
  var nickname = (params.nickname || '').trim().slice(0, 32);

  if (action === 'lobby_signal') {
    var sigType = (params.signalType || params.type || '').trim().slice(0, 20);
    var payload = (params.payload || params.data || '').toString();
    if (payload.length > 10000) payload = payload.slice(0, 10000);
    signals.push({ from: nickname, type: sigType, payload: payload, at: new Date().toISOString() });
    sheet.getRange(rowIndex, 7).setValue(JSON.stringify(signals));
    return { ok: true };
  }

  if (action === 'lobby_get') {
    return {
      ok: true,
      lobby: {
        lobbyId: lobbyId,
        hostNick: hostNick,
        hostNickname: hostNick,
        status: status,
        configJson: configJson,
        players: players,
        signals: signals,
        createdAt: (row[5] || '').toString()
      }
    };
  }

  if (action === 'lobby_join') {
    if (status !== 'waiting') return { ok: false, error: 'Lobby not waiting' };
    var exists = players.some(function (p) { return (p.nick || p.nickname || '').toString().trim().toLowerCase() === nickname.toLowerCase(); });
    if (!exists) {
      players.push({ nick: nickname });
      sheet.getRange(rowIndex, 5).setValue(JSON.stringify(players));
    }
    return { ok: true };
  }

  if (action === 'lobby_start') {
    if (nickname !== hostNick) return { ok: false, error: 'Only host can start' };
    if (status !== 'waiting') return { ok: false, error: 'Invalid state' };
    var cfg = (params.configJson || '').trim().slice(0, 2000);
    sheet.getRange(rowIndex, 4).setValue(cfg);
    sheet.getRange(rowIndex, 3).setValue('playing');
    return { ok: true };
  }

  if (action === 'lobby_submit_result') {
    var sets = parseInt(params.sets, 10);
    var time = parseInt(params.time, 10);
    var badShuffles = parseInt(params.badShuffles, 10);
    if (isNaN(sets)) sets = 0;
    if (isNaN(time)) time = 0;
    if (isNaN(badShuffles)) badShuffles = 0;
    var found = false;
    for (var j = 0; j < players.length; j++) {
      if ((players[j].nick || players[j].nickname || '').toString().trim().toLowerCase() === nickname.toLowerCase()) {
        players[j].sets = sets;
        players[j].time = time;
        players[j].badShuffles = badShuffles;
        found = true;
        break;
      }
    }
    if (!found) players.push({ nick: nickname, sets: sets, time: time, badShuffles: badShuffles });
    sheet.getRange(rowIndex, 5).setValue(JSON.stringify(players));
    return { ok: true };
  }

  if (action === 'lobby_finish') {
    if (nickname !== hostNick) return { ok: false, error: 'Only host can finish' };
    sheet.getRange(rowIndex, 2).setValue('finished');
    return { ok: true };
  }

  return { ok: false, error: 'Unknown lobby action' };
}
