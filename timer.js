setInterval(() => {
  if (!isGameOver && !document.querySelector('.overlay.show')) {
    const elapsedMs = (Date.now() - startTime);
    document.getElementById('timer').innerText = formatTime(elapsedMs, false);
    updateLiveSPM();
  }
}, 1000);
