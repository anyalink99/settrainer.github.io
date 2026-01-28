/**
 * Minimal custom color picker for Edit Board appearance.
 * Plain script, no modules – works with file:// and no server.
 */
(function () {
  'use strict';

  var POPOVER_ID = 'board-color-picker-popover';
  var BACKDROP_ID = 'board-picker-backdrop';
  var MOUNT_ID = 'hex-picker-mount';
  var HEX_INPUT_ID = 'hex-input';
  var DONE_ID = 'board-picker-done';
  var HEX_REG = /^#([0-9A-Fa-f]{3}){1,2}$/;

  function $(id) { return document.getElementById(id); }

  function normalizeHex(v) {
    var s = String(v).trim();
    return s.indexOf('#') === 0 ? s : '#' + s;
  }

  function expandShortHex(hex) {
    if (hex.length !== 4) return hex;
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }

  function parseHex(s) {
    var h = normalizeHex(s);
    return HEX_REG.test(h) ? expandShortHex(h) : null;
  }

  function hexToRgb(hex) {
    var h = expandShortHex(hex);
    return {
      r: parseInt(h.slice(1, 3), 16) / 255,
      g: parseInt(h.slice(3, 5), 16) / 255,
      b: parseInt(h.slice(5, 7), 16) / 255
    };
  }

  function rgbToHsv(r, g, b) {
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var d = max - min, s = max === 0 ? 0 : d / max, v = max;
    var h = 0;
    if (d !== 0) {
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return { h: h * 360, s: s, v: v };
  }

  function hsvToRgb(h, s, v) {
    h = (h % 360) / 60;
    var c = v * s, x = c * (1 - Math.abs((h % 2) - 1)), m = v - c;
    var r = 0, g = 0, b = 0;
    if (h < 1) { r = c; g = x; } else if (h < 2) { r = x; g = c; } else if (h < 3) { g = c; b = x; } else if (h < 4) { g = x; b = c; } else if (h < 5) { r = x; b = c; } else { r = c; b = x; }
    return { r: r + m, g: g + m, b: b + m };
  }

  function rgbToHex(r, g, b) {
    var toByte = function (x) { return Math.max(0, Math.min(255, Math.round(x * 255))); };
    return '#' + [toByte(r), toByte(g), toByte(b)].map(function (n) { return ('0' + n.toString(16)).slice(-2); }).join('');
  }

  function createPicker(mount) {
    var wrap = document.createElement('div');
    wrap.className = 'custom-picker-wrap';
    var sv = document.createElement('div');
    sv.className = 'custom-picker-sv';
    var svHandle = document.createElement('div');
    svHandle.className = 'custom-picker-sv-handle';
    sv.appendChild(svHandle);
    var hue = document.createElement('div');
    hue.className = 'custom-picker-hue';
    var hueHandle = document.createElement('div');
    hueHandle.className = 'custom-picker-hue-handle';
    hue.appendChild(hueHandle);
    wrap.appendChild(sv);
    wrap.appendChild(hue);
    mount.appendChild(wrap);

    var state = { h: 0, s: 1, v: 1 };
    var dragging = null;

    function emit() {
      var rgb = hsvToRgb(state.h, state.s, state.v);
      var hex = rgbToHex(rgb.r, rgb.g, rgb.b);
      if (typeof updateGameColor === 'function' && typeof window._boardPickerEditingIndex === 'number' && window._boardPickerEditingIndex >= 0) {
        updateGameColor(window._boardPickerEditingIndex, hex);
      }
      if (typeof refreshBoardAppearancePreviews === 'function') refreshBoardAppearancePreviews();
      var input = $(HEX_INPUT_ID);
      if (input) input.value = hex;
      updateHandles();
    }

    function updateHandles() {
      var sw = sv.offsetWidth || 1, sh = sv.offsetHeight || 1;
      var hw = hue.offsetWidth || 1;
      var x = state.s * sw, y = (1 - state.v) * sh;
      svHandle.style.left = (x - 8) + 'px';
      svHandle.style.top = (y - 8) + 'px';
      hueHandle.style.left = ((state.h / 360) * Math.max(0, hw - 14)) + 'px';
      wrap.style.setProperty('--picker-hue', state.h);
    }

    function setHex(hex) {
      var rgb = hexToRgb(hex);
      var hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      state.h = hsv.h;
      state.s = hsv.s;
      state.v = hsv.v;
      updateHandles();
    }

    function onSv(px, py) {
      var rect = sv.getBoundingClientRect();
      var x = (px - rect.left) / rect.width;
      var y = (py - rect.top) / rect.height;
      state.s = Math.max(0, Math.min(1, x));
      state.v = Math.max(0, Math.min(1, 1 - y));
      emit();
    }

    function onHue(px) {
      var rect = hue.getBoundingClientRect();
      var x = (px - rect.left) / rect.width;
      state.h = Math.max(0, Math.min(360, x * 360));
      emit();
    }

    function pointerMove(e) {
      if (e.touches && e.preventDefault) e.preventDefault();
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;
      if (dragging === 'sv') onSv(clientX, clientY);
      else if (dragging === 'hue') onHue(clientX);
    }

    function pointerUp() {
      dragging = null;
      document.removeEventListener('pointermove', pointerMove);
      document.removeEventListener('pointerup', pointerUp);
      document.removeEventListener('touchmove', pointerMove, { passive: false });
      document.removeEventListener('touchend', pointerUp);
    }

    sv.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      dragging = 'sv';
      onSv(e.clientX, e.clientY);
      document.addEventListener('pointermove', pointerMove);
      document.addEventListener('pointerup', pointerUp);
    });
    hue.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      dragging = 'hue';
      onHue(e.clientX);
      document.addEventListener('pointermove', pointerMove);
      document.addEventListener('pointerup', pointerUp);
    });
    sv.addEventListener('touchstart', function (e) {
      e.preventDefault();
      dragging = 'sv';
      onSv(e.touches[0].clientX, e.touches[0].clientY);
      document.addEventListener('touchmove', pointerMove, { passive: false });
      document.addEventListener('touchend', pointerUp);
    }, { passive: false });
    hue.addEventListener('touchstart', function (e) {
      e.preventDefault();
      dragging = 'hue';
      onHue(e.touches[0].clientX);
      document.addEventListener('touchmove', pointerMove, { passive: false });
      document.addEventListener('touchend', pointerUp);
    }, { passive: false });

    return { setHex: setHex, updateHandles: updateHandles };
  }

  function init() {
    var mount = $(MOUNT_ID);
    var popover = $(POPOVER_ID);
    var backdrop = $(BACKDROP_ID);
    var hexInput = $(HEX_INPUT_ID);
    var doneBtn = $(DONE_ID);
    if (!mount || !popover || !backdrop || !hexInput || !doneBtn) return;

    var picker = createPicker(mount);

    function getColors() {
      return typeof getGameColors === 'function' ? getGameColors() : [];
    }

    function closePicker() {
      window._boardPickerEditingIndex = -1;
      popover.hidden = true;
      backdrop.hidden = true;
    }

    function openForIndex(idx) {
      var colors = getColors();
      if (idx < 0 || idx > 2 || !colors[idx]) return;
      window._boardPickerEditingIndex = idx;
      backdrop.hidden = false;
      popover.hidden = false;
      picker.setHex(colors[idx]);
      hexInput.value = colors[idx];
    }

    for (var i = 0; i < 3; i++) {
      var swatch = $('board-preview-swatch-' + i);
      if (swatch) {
        swatch.addEventListener('pointerdown', function (idx) {
          return function (e) {
            e.preventDefault();
            openForIndex(idx);
          };
        }(i));
      }
    }

    hexInput.addEventListener('input', function () {
      var hex = parseHex(hexInput.value);
      if (hex && window._boardPickerEditingIndex >= 0) {
        picker.setHex(hex);
        if (typeof updateGameColor === 'function') updateGameColor(window._boardPickerEditingIndex, hex);
        if (typeof refreshBoardAppearancePreviews === 'function') refreshBoardAppearancePreviews();
      }
    });

    hexInput.addEventListener('blur', function () {
      var hex = parseHex(hexInput.value);
      if (hex && window._boardPickerEditingIndex >= 0) {
        picker.setHex(hex);
        hexInput.value = hex;
      }
    });

    doneBtn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      closePicker();
    });
    backdrop.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      closePicker();
    });
    popover.addEventListener('pointerdown', function (e) { e.stopPropagation(); });

    window.closeBoardColorPicker = closePicker;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
