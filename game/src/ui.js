// DOM screens: title, pause and the flight report. The HUD stays on canvas, but these larger
// typographic panels belong in HTML, where they scale cleanly and remain readable to screen readers.

function formatClock(seconds, tenths = false) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  if (tenths) {
    return `${String(minutes).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`;
  }
  const whole = Math.ceil(safe);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

export function createUi(handlers) {
  const title = document.getElementById('title');
  const pause = document.getElementById('pause');
  const end = document.getElementById('end');
  const titleBest = document.getElementById('title-best');
  const endKicker = document.getElementById('end-kicker');
  const endTitle = document.getElementById('end-title');
  const endDetail = document.getElementById('end-detail');
  const endGates = document.getElementById('end-gates');
  const endTime = document.getElementById('end-time');
  const endBest = document.getElementById('end-best');

  document.getElementById('start-button').addEventListener('click', () => handlers.start());
  document.getElementById('resume-button').addEventListener('click', () => handlers.resume());
  document.getElementById('restart-button').addEventListener('click', () => handlers.restart());

  function show(screen) {
    title.classList.toggle('active', screen === 'title');
    pause.classList.toggle('active', screen === 'pause');
    end.classList.toggle('active', screen === 'end');
    document.body.dataset.screen = screen;
  }

  function setBest(seconds) {
    titleBest.textContent = seconds === null ? '—' : formatClock(seconds, true);
    endBest.textContent = seconds === null ? '—' : formatClock(seconds, true);
  }

  function showTitle(best) {
    setBest(best);
    show('title');
  }

  function showPlay() {
    show('play');
  }

  function showPause() {
    show('pause');
  }

  function showEnd({ reason, gates, total, flightTime, best }) {
    endTitle.className = '';
    if (reason === 'win') {
      endKicker.textContent = 'Flight report · all gates';
      endTitle.textContent = 'Course complete';
      endTitle.classList.add('win');
      endDetail.textContent = 'All five gates cleared. The Kestrel is still flying, the reef is still there, and the clock has stopped.';
    } else if (reason === 'crash') {
      endKicker.textContent = 'Flight report · airframe lost';
      endTitle.textContent = 'The reef wins';
      endTitle.classList.add('crash');
      endDetail.textContent = 'The Kestrel met an island. Reset, climb a little earlier, and keep the next line higher.';
    } else {
      endKicker.textContent = 'Flight report · clock expired';
      endTitle.textContent = 'Out of time';
      endTitle.classList.add('timeout');
      endDetail.textContent = 'The course clock reached zero before the last gate. Fewer wide turns and a firmer throttle will buy the seconds back.';
    }
    endGates.textContent = `${gates} / ${total}`;
    endTime.textContent = formatClock(flightTime, true);
    setBest(best);
    show('end');
  }

  return {
    showTitle,
    showPlay,
    showPause,
    showEnd,
    setBest,
  };
}
