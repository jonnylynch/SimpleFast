const STORAGE_KEY = 'simplefast_state';

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
  if (m === 0)        label = '0 min ago';
  else if (h === 0)   label = `${mins} min ago`;
  else if (mins === 0) label = `${h} hr ago`;
  else                label = `${h} hr ${mins} min ago`;
  document.getElementById('offsetLabel').textContent = label;
}
const CIRCUMFERENCE = 603; // 2 * Math.PI * 96

let selectedGoal = null;
let tickInterval = null;

const STATUSES = [
  {
    minHours: 0,
    maxHours: 4,
    emoji: '🍽️',
    label: 'Anabolic State',
    desc: 'Blood sugar is rising as your body processes your last meal.',
    cls: 'status-anabolic',
    ringColor: '#3b82f6',
  },
  {
    minHours: 4,
    maxHours: 12,
    emoji: '🔋',
    label: 'Catabolic State',
    desc: 'Blood sugar is dropping; your body starts using stored glycogen.',
    cls: 'status-catabolic',
    ringColor: '#a855f7',
  },
  {
    minHours: 12,
    maxHours: 16,
    emoji: '🔥',
    label: 'Fat Burning & Trace Ketosis',
    desc: 'First trace ketones appear as liver glycogen depletes. Your body is entering the metabolic switch — burning fat for fuel.',
    cls: 'status-fat',
    ringColor: '#f59e0b',
  },
  {
    minHours: 16,
    maxHours: 24,
    emoji: '⚡',
    label: 'Ketosis & Repair',
    desc: 'High fat-burning mode. Autophagy (cellular cleanup) has begun.',
    cls: 'status-ketosis',
    ringColor: '#10b981',
  },
  {
    minHours: 24,
    maxHours: Infinity,
    emoji: '🧬',
    label: 'Deep Autophagy',
    desc: 'Peak cellular regeneration and growth hormone spike.',
    cls: 'status-deep',
    ringColor: '#06b6d4',
  },
];

function getStatus(elapsedHours) {
  return STATUSES.find(s => elapsedHours >= s.minHours && elapsedHours < s.maxHours) || STATUSES[STATUSES.length - 1];
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function updateUI(elapsedSeconds, targetHours, isActive) {
  const elapsedHours = elapsedSeconds / 3600;
  const progress = Math.min(elapsedHours / targetHours, 1);
  const status = getStatus(elapsedHours);

  // Timer
  document.getElementById('timerDisplay').textContent = formatTime(elapsedSeconds);
  document.getElementById('goalLabel').textContent = isActive ? `Goal: ${targetHours}h` : 'No active fast';

  // Progress ring
  const ring = document.getElementById('progressRing');
  ring.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  ring.style.stroke = status.ringColor;

  // Status card
  const card = document.getElementById('statusCard');
  card.className = `w-full max-w-sm bg-gray-900 border rounded-2xl p-5 text-center mt-6 transition-colors duration-500 ${status.cls}`;
  document.getElementById('statusEmoji').textContent = status.emoji;
  document.getElementById('statusLabel').textContent = status.label;
  document.getElementById('statusDesc').textContent = status.desc;

  // Action button
  const btn = document.getElementById('actionBtn');
  if (isActive) {
    btn.textContent = 'End Fast';
    btn.classList.add('ending');
  } else {
    btn.textContent = selectedGoal ? 'Start Fast' : 'Select a Goal';
    btn.classList.remove('ending');
    btn.disabled = !selectedGoal;
  }
}

function tick() {
  const state = loadState();
  if (!state || !state.isActive) return;

  const elapsed = Math.floor((Date.now() - new Date(state.startTime).getTime()) / 1000);
  updateUI(elapsed, state.targetHours, true);
}

function selectGoal(hours) {
  const state = loadState();
  if (state && state.isActive) return; // can't change goal mid-fast

  selectedGoal = hours;

  document.querySelectorAll('.goal-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.hours) === hours);
  });

  const btn = document.getElementById('actionBtn');
  btn.textContent = 'Start Fast';
  btn.disabled = false;

  updateUI(0, hours, false);
}

function toggleFast() {
  const state = loadState();

  if (state && state.isActive) {
    // End fast
    clearInterval(tickInterval);
    clearState();
    selectedGoal = null;

    document.querySelectorAll('.goal-btn').forEach(b => b.classList.remove('active'));

    document.getElementById('timerDisplay').textContent = '00:00:00';
    document.getElementById('goalLabel').textContent = 'No active fast';
    document.getElementById('progressRing').style.strokeDashoffset = CIRCUMFERENCE;
    document.getElementById('progressRing').style.stroke = '#f59e0b';

    const card = document.getElementById('statusCard');
    card.className = 'w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center mt-6';
    document.getElementById('statusEmoji').textContent = '✅';
    document.getElementById('statusLabel').textContent = 'Fast complete!';
    document.getElementById('statusDesc').textContent = 'Great work. Select a new goal whenever you\'re ready.';

    const btn = document.getElementById('actionBtn');
    btn.textContent = 'Select a Goal';
    btn.classList.remove('ending');
    btn.disabled = true;

    document.getElementById('offsetInput').value = 0;
    document.getElementById('offsetLabel').textContent = '0 min ago';
    document.getElementById('offsetPanel').classList.add('hidden');
    document.getElementById('offsetChevron').style.transform = '';
    document.getElementById('offsetRow').style.display = '';

  } else {
    // Start fast
    if (!selectedGoal) return;

    const offsetMins = parseFloat(document.getElementById('offsetInput').value) || 0;
    const offsetMs = Math.min(offsetMins, selectedGoal * 60) * 60 * 1000;
    const startTime = new Date(Date.now() - offsetMs).toISOString();

    const newState = {
      startTime,
      targetHours: selectedGoal,
      isActive: true,
    };
    saveState(newState);
    document.getElementById('offsetRow').style.display = 'none';

    clearInterval(tickInterval);
    tickInterval = setInterval(tick, 1000);
    tick();
  }
}

// Resume on page load
function init() {
  const state = loadState();
  if (state && state.isActive) {
    selectedGoal = state.targetHours;

    document.querySelectorAll('.goal-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.hours) === selectedGoal);
    });

    tickInterval = setInterval(tick, 1000);
    tick();
    document.getElementById('offsetRow').style.display = 'none';
    document.getElementById('offsetPanel').classList.add('hidden');
    document.getElementById('offsetChevron').style.transform = '';
  }
}

init();
