// ── Service worker ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── Constants ──
const STORAGE_KEY = 'simplefast_state';
const CIRCUMFERENCE = 603; // 2 * Math.PI * 96

const STATUSES = [
  {
    index: 0,
    minHours: 0,
    maxHours: 4,
    emoji: '🍽️',
    label: 'Anabolic State',
    desc: 'Blood sugar is rising as your body processes your last meal.',
    cls: 'stage-anabolic',
    ringColor: '#3b82f6',
    range: '0 – 4 hrs',
  },
  {
    index: 1,
    minHours: 4,
    maxHours: 12,
    emoji: '🔋',
    label: 'Catabolic State',
    desc: 'Blood sugar is dropping; your body starts using stored glycogen.',
    cls: 'stage-catabolic',
    ringColor: '#a855f7',
    range: '4 – 12 hrs',
  },
  {
    index: 2,
    minHours: 12,
    maxHours: 16,
    emoji: '🔥',
    label: 'Fat Burning & Trace Ketosis',
    desc: 'First trace ketones appear as liver glycogen depletes. Your body is entering the metabolic switch — burning fat for fuel.',
    cls: 'stage-fat',
    ringColor: '#f59e0b',
    range: '12 – 16 hrs',
  },
  {
    index: 3,
    minHours: 16,
    maxHours: 24,
    emoji: '⚡',
    label: 'Ketosis & Repair',
    desc: 'High fat-burning mode. Autophagy (cellular cleanup) has begun.',
    cls: 'stage-ketosis',
    ringColor: '#10b981',
    range: '16 – 24 hrs',
  },
  {
    index: 4,
    minHours: 24,
    maxHours: Infinity,
    emoji: '🧬',
    label: 'Deep Autophagy',
    desc: 'Peak cellular regeneration and growth hormone spike.',
    cls: 'stage-deep',
    ringColor: '#06b6d4',
    range: '24 hrs+',
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

  // Sync dots on manual scroll
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
    // Remove stage border class when current so green pulse is the only border
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

// ── Action button (start or open modal) ──
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

  document.getElementById('offsetRow').style.display = 'none';

  clearInterval(tickInterval);
  tickInterval = setInterval(tick, 1000);
  tick();
}

// ── Modal ──
function openModal() {
  document.getElementById('confirmModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('confirmModal').classList.add('hidden');
}

function confirmEndFast() {
  closeModal();
  clearInterval(tickInterval);
  clearState();
  selectedGoal = null;
  activeStatusIndex = -1;

  document.querySelectorAll('.goal-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.status-card').forEach(c => c.classList.remove('status-current'));

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
  document.getElementById('offsetRow').style.display = '';

  scrollToCard(0, false);
  updateDots(0);
}

// ── Offset panel ──
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
    document.getElementById('offsetRow').style.display = 'none';
    tickInterval = setInterval(tick, 1000);
    tick();
  } else {
    scrollToCard(0, false);
    updateDots(0);
  }
}

init();
