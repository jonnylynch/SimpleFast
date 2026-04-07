// ── Service worker + update detection ──
let newWorker = null;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          document.getElementById('updateBanner').classList.remove('hidden');
        }
      });
    });
  }).catch(() => {});

  // When the new SW takes control, reload to apply update
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

function applyUpdate() {
  if (newWorker) newWorker.postMessage({ action: 'skipWaiting' });
}

// ── PWA install prompt ──
let installPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  document.getElementById('installBanner').classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
  document.getElementById('installBanner').classList.add('hidden');
  installPrompt = null;
});

function triggerInstall() {
  if (!installPrompt) return;
  installPrompt.prompt();
  installPrompt.userChoice.then(() => {
    installPrompt = null;
    document.getElementById('installBanner').classList.add('hidden');
  });
}

function dismissInstall() {
  document.getElementById('installBanner').classList.add('hidden');
}

// ── iOS install hint ──
(function () {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  const dismissed = sessionStorage.getItem('ios_hint_dismissed');
  if (isIos && !isStandalone && !dismissed) {
    document.getElementById('iosBanner').classList.remove('hidden');
  }
})();

function dismissIos() {
  document.getElementById('iosBanner').classList.add('hidden');
  sessionStorage.setItem('ios_hint_dismissed', '1');
}

// ── Constants ──
const STORAGE_KEY = 'simplefast_state';
const CIRCUMFERENCE = 603;

const STATUSES = [
  {
    index: 0, minHours: 0, maxHours: 4,
    emoji: '🍽️', label: 'Anabolic State',
    desc: 'Blood sugar is rising as your body processes your last meal.',
    cls: 'stage-anabolic', ringColor: '#3b82f6', range: '0 – 4 hrs',
  },
  {
    index: 1, minHours: 4, maxHours: 12,
    emoji: '🔋', label: 'Catabolic State',
    desc: 'Blood sugar is dropping; your body starts using stored glycogen.',
    cls: 'stage-catabolic', ringColor: '#a855f7', range: '4 – 12 hrs',
  },
  {
    index: 2, minHours: 12, maxHours: 16,
    emoji: '🔥', label: 'Fat Burning & Trace Ketosis',
    desc: 'First trace ketones appear as liver glycogen depletes. Your body is entering the metabolic switch — burning fat for fuel.',
    cls: 'stage-fat', ringColor: '#f59e0b', range: '12 – 16 hrs',
  },
  {
    index: 3, minHours: 16, maxHours: 24,
    emoji: '⚡', label: 'Ketosis & Repair',
    desc: 'High fat-burning mode. Autophagy (cellular cleanup) has begun.',
    cls: 'stage-ketosis', ringColor: '#10b981', range: '16 – 24 hrs',
  },
  {
    index: 4, minHours: 24, maxHours: Infinity,
    emoji: '🧬', label: 'Deep Autophagy',
    desc: 'Peak cellular regeneration and growth hormone spike.',
    cls: 'stage-deep', ringColor: '#06b6d4', range: '24 hrs+',
  },
];

// ── State ──
let selectedGoal = null;
let tickInterval = null;
let activeStatusIndex = -1;

// ── Helpers ──
function getStatusIndex(elapsedHours) {
  const idx = STATUSES.findIndex(s => elapsedHours >= s.minHours && elapsedHours < s.maxHours);
  return idx === -1 ? STATUSES.length - 1 : idx;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}
function saveState(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
function clearState() { localStorage.removeItem(STORAGE_KEY); }

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ── Build carousel ──
function buildCarousel() {
  const carousel = document.getElementById('statusCarousel');
  const dots = document.getElementById('carouselDots');
  carousel.innerHTML = '';
  dots.innerHTML = '';

  STATUSES.forEach((s, i) => {
    const card = document.createElement('div');
    card.className = `status-card ${s.cls}`;
    card.id = `status-card-${i}`;
    const emojiClass = `emoji-${s.cls.replace('stage-', '')}`;
    card.innerHTML = `
      <div class="text-3xl mb-1"><span class="${emojiClass}">${s.emoji}</span></div>
      <div class="text-xs text-gray-500 mb-1">${s.range}</div>
      <div class="text-base font-semibold text-white">${s.label}</div>
      <div class="text-xs text-gray-400 mt-1 leading-relaxed">${s.desc}</div>
    `;
    carousel.appendChild(card);

    const dot = document.createElement('button');
    dot.className = 'carousel-dot';
    dot.setAttribute('aria-label', s.label);
    dot.onclick = () => scrollToCard(i);
    dots.appendChild(dot);
  });

  document.getElementById('statusCarousel').addEventListener('scroll', onCarouselScroll, { passive: true });
}

function scrollToCard(index, smooth = true) {
  const card = document.getElementById(`status-card-${index}`);
  if (card) card.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant', block: 'nearest', inline: 'center' });
}

function onCarouselScroll() {
  const carousel = document.getElementById('statusCarousel');
  const cardWidth = carousel.scrollWidth / STATUSES.length;
  const visibleIndex = Math.round(carousel.scrollLeft / cardWidth);
  updateDots(visibleIndex);
}

function updateDots(index) {
  document.querySelectorAll('.carousel-dot').forEach((d, i) => {
    d.classList.toggle('active', i === index);
  });
}

function updateCarouselCurrent(statusIndex) {
  document.querySelectorAll('.status-card').forEach((card, i) => {
    const isActive = i === statusIndex;
    card.classList.toggle('status-current', isActive);
    card.classList.toggle(STATUSES[i].cls, !isActive);
  });

  if (statusIndex !== activeStatusIndex) {
    activeStatusIndex = statusIndex;
    scrollToCard(statusIndex);
    updateDots(statusIndex);
  }
}

// ── UI update ──
function updateUI(elapsedSeconds, targetHours, isActive) {
  const elapsedHours = elapsedSeconds / 3600;
  const progress = Math.min(elapsedHours / targetHours, 1);
  const statusIndex = getStatusIndex(elapsedHours);
  const status = STATUSES[statusIndex];

  document.getElementById('timerDisplay').textContent = formatTime(elapsedSeconds);
  document.getElementById('goalLabel').textContent = isActive ? `Goal: ${targetHours}h` : 'No active fast';

  const ring = document.getElementById('progressRing');
  ring.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  ring.style.stroke = status.ringColor;

  if (isActive) updateCarouselCurrent(statusIndex);

  const btn = document.getElementById('actionBtn');
  if (isActive) {
    btn.textContent = 'End Fast';
    btn.classList.add('ending');
    btn.disabled = false;
  } else {
    btn.textContent = selectedGoal ? 'Start Fast' : 'Select a Goal';
    btn.classList.remove('ending');
    btn.disabled = !selectedGoal;
  }
}

// ── Tick ──
function tick() {
  const state = loadState();
  if (!state || !state.isActive) return;
  const elapsed = Math.floor((Date.now() - new Date(state.startTime).getTime()) / 1000);
  updateUI(elapsed, state.targetHours, true);
}

// ── Goal selection ──
function selectGoal(hours) {
  const state = loadState();
  if (state && state.isActive) return;

  selectedGoal = hours;
  document.querySelectorAll('.goal-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.hours) === hours);
  });

  const btn = document.getElementById('actionBtn');
  btn.textContent = 'Start Fast';
  btn.disabled = false;

  updateUI(0, hours, false);
}

// ── Start ──
function handleActionBtn() {
  const state = loadState();
  if (state && state.isActive) {
    openModal();
  } else {
    startFast();
  }
}

function startFast() {
  if (!selectedGoal) return;

  const offsetMins = parseFloat(document.getElementById('offsetInput').value) || 0;
  const offsetMs = Math.min(offsetMins, selectedGoal * 60) * 60 * 1000;
  const startTime = new Date(Date.now() - offsetMs).toISOString();

  saveState({ startTime, targetHours: selectedGoal, isActive: true });
  document.getElementById('offsetRow').style.visibility = 'hidden';

  clearInterval(tickInterval);
  tickInterval = setInterval(tick, 1000);
  tick();
}

// ── End fast modal ──
function openModal() {
  // Reset ate panel
  document.getElementById('ateInput').value = 0;
  document.getElementById('ateLabel').textContent = '0 min ago';
  document.getElementById('atePanel').classList.add('hidden');
  document.getElementById('ateChevron').style.transform = '';
  document.getElementById('confirmModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('confirmModal').classList.add('hidden');
}

function toggleAtePanel() {
  const panel = document.getElementById('atePanel');
  const chevron = document.getElementById('ateChevron');
  const open = panel.classList.toggle('hidden');
  chevron.style.transform = open ? '' : 'rotate(180deg)';
}

function updateAteLabel(minutes) {
  const m = parseInt(minutes);
  const h = Math.floor(m / 60);
  const mins = m % 60;
  let label;
  if (m === 0)         label = '0 min ago';
  else if (h === 0)    label = `${mins} min ago`;
  else if (mins === 0) label = `${h} hr ago`;
  else                 label = `${h} hr ${mins} min ago`;
  document.getElementById('ateLabel').textContent = label;
}

function confirmEndFast() {
  const state = loadState();
  closeModal();

  // Calculate actual end time (backdated if "I already ate" was used)
  const ateMins = parseFloat(document.getElementById('ateInput').value) || 0;
  const ateOffsetMs = ateMins * 60 * 1000;
  const effectiveEndTime = Date.now() - ateOffsetMs;
  const startTime = new Date(state.startTime).getTime();
  const actualSeconds = Math.max(0, Math.floor((effectiveEndTime - startTime) / 1000));
  const targetSeconds = state.targetHours * 3600;

  // Stop timer and clear state
  clearInterval(tickInterval);
  clearState();
  selectedGoal = null;
  activeStatusIndex = -1;

  // Reset main UI
  document.querySelectorAll('.goal-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.status-card').forEach((c, i) => {
    c.classList.remove('status-current');
    c.classList.add(STATUSES[i].cls);
  });
  document.getElementById('timerDisplay').textContent = '00:00:00';
  document.getElementById('goalLabel').textContent = 'No active fast';
  document.getElementById('progressRing').style.strokeDashoffset = CIRCUMFERENCE;
  document.getElementById('progressRing').style.stroke = '#f59e0b';

  const btn = document.getElementById('actionBtn');
  btn.textContent = 'Select a Goal';
  btn.classList.remove('ending');
  btn.disabled = true;

  document.getElementById('offsetInput').value = 0;
  document.getElementById('offsetLabel').textContent = '0 min ago';
  document.getElementById('offsetPanel').classList.add('hidden');
  document.getElementById('offsetChevron').style.transform = '';
  document.getElementById('offsetRow').style.visibility = '';

  scrollToCard(0, false);
  updateDots(0);

  // Show result
  showResult(actualSeconds, targetSeconds, state.targetHours);
}

// ── Result modal ──
function showResult(actualSeconds, targetSeconds, targetHours) {
  const ratio = actualSeconds / targetSeconds;
  const stageIndex = getStatusIndex(actualSeconds / 3600);
  const stage = STATUSES[stageIndex];
  const durationStr = formatDuration(actualSeconds);

  let emoji, heading, message;

  if (ratio >= 1) {
    emoji = '🏆';
    heading = 'Goal crushed!';
    message = `You hit your ${targetHours}h target and reached ${stage.label}. Your body was working hard — great discipline.`;
  } else if (ratio >= 0.75) {
    emoji = '💪';
    heading = 'So close!';
    message = `You made it to ${stage.label}. Just a bit more next time and you'll hit that ${targetHours}h goal.`;
  } else if (ratio >= 0.5) {
    emoji = '👊';
    heading = 'Good effort!';
    message = `You reached ${stage.label}. Every fast builds the habit — you'll go further next time.`;
  } else {
    emoji = '🌱';
    heading = 'Every fast counts.';
    message = `You reached ${stage.label}. Short fasts still benefit your body. Keep showing up.`;
  }

  document.getElementById('resultEmoji').textContent = emoji;
  document.getElementById('resultHeading').textContent = heading;
  document.getElementById('resultDuration').textContent = durationStr;
  document.getElementById('resultStage').textContent = stage.label;
  document.getElementById('resultMessage').textContent = message;
  document.getElementById('resultModal').classList.remove('hidden');
}

function closeResultModal() {
  document.getElementById('resultModal').classList.add('hidden');
}

// ── Offset panel (start) ──
function toggleOffsetPanel() {
  const panel = document.getElementById('offsetPanel');
  const chevron = document.getElementById('offsetChevron');
  const open = panel.classList.toggle('hidden');
  chevron.style.transform = open ? '' : 'rotate(180deg)';
}

function updateOffsetLabel(minutes) {
  const m = parseInt(minutes);
  const h = Math.floor(m / 60);
  const mins = m % 60;
  let label;
  if (m === 0)         label = '0 min ago';
  else if (h === 0)    label = `${mins} min ago`;
  else if (mins === 0) label = `${h} hr ago`;
  else                 label = `${h} hr ${mins} min ago`;
  document.getElementById('offsetLabel').textContent = label;
}

// ── Init ──
function init() {
  buildCarousel();

  const state = loadState();
  if (state && state.isActive) {
    selectedGoal = state.targetHours;
    document.querySelectorAll('.goal-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.hours) === selectedGoal);
    });
    document.getElementById('offsetRow').style.visibility = 'hidden';
    tickInterval = setInterval(tick, 1000);
    tick();
  } else {
    scrollToCard(0, false);
    updateDots(0);
  }
}

init();
