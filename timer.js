setInterval(() => {
  if (!isGameOver && !document.querySelector('.overlay.show')) {
    const elapsedMs = (Date.now() - startTime);
    document.getElementById('timer').innerText = config.showTimerMs ? formatTimeTenths(elapsedMs) : formatTime(elapsedMs);
    updateLiveSPM();
  }
}, 100);
