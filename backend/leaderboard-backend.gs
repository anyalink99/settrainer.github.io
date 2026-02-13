function doGet(e) {
  try {
    return doGetImpl(e);
  } catch (err) {
    var params = (e && e.parameter) || {};
    var callback = (params.callback || '').trim() || parseCallbackFromQuery((e && e.queryString) || '');
    return jsonpOrJson({ ok: false, error: String(err.message || err) }, callback, callback.length > 0);
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

function doGetImpl(e) {
  var params = (e && e.parameter) || {};
  var callback = (params.callback || '').trim() || parseCallbackFromQuery((e && e.queryString) || '');
  var isJsonp = callback.length > 0;

  if (params.action === 'submit') {
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
