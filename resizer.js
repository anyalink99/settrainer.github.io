const appContainer = document.getElementById('app-container');
const resizerL = document.getElementById('resizer-l');
const resizerR = document.getElementById('resizer-r');
let isResizing = false;

const savedWidth = Storage.get(STORAGE_KEYS.APP_WIDTH);
if (savedWidth) appContainer.style.width = savedWidth + 'px';

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
  Storage.set(STORAGE_KEYS.APP_WIDTH, Math.floor(newWidth));
}

function stopResize() {
  isResizing = false;
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', stopResize);
  document.body.style.cursor = '';
}

resizerL?.addEventListener('mousedown', initResize);
resizerR?.addEventListener('mousedown', initResize);
