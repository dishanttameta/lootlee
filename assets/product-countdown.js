(function() {
  function initCountdown(id, type) {
    const element = document.getElementById(id);
    if (!element) return;
    
    // Check if we have the new block elements
    const hoursEl = element.querySelector('[data-hours]');
    const minutesEl = element.querySelector('[data-minutes]');
    const secondsEl = element.querySelector('[data-seconds]');
    
    // Fallback to old display span if not found
    const display = element.querySelector('[data-time-remaining]');

    function update() {
      const now = new Date();
      let target;
      if (type === 'daily') {
        // Countdown to the end of today (midnight local time)
        target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
      } else {
        // Fallback: 2 hours from current time
        target = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      }

      let diff = target - now;
      if (diff < 0) {
        if (type === 'daily') {
          // If we somehow passed it, target next day
          target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 0, 0, 0);
          diff = target - now;
        } else {
          diff = 0;
        }
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const hStr = String(hours).padStart(2, '0');
      const mStr = String(minutes).padStart(2, '0');
      const sStr = String(seconds).padStart(2, '0');

      if (hoursEl && minutesEl && secondsEl) {
        hoursEl.textContent = hStr;
        minutesEl.textContent = mStr;
        secondsEl.textContent = sStr;
      } else if (display) {
        display.textContent = hStr + 'h : ' + mStr + 'm : ' + sStr + 's';
      }
    }

    update();
    setInterval(update, 1000);
  }

  window.initCountdown = initCountdown;
})();
