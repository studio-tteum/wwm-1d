/* ── 날짜 ──
   기간은 이제 실제 달력(시작~종료)에서 나온다. "다음 주"는 화면에 박힌 문자열이 아니라
   오늘 날짜 기준으로 계산한 값이다 — 언제 열어도 진짜 다음 주 월~금이 기본값이 된다. */
const WD = ['일', '월', '화', '수', '목', '금', '토'];

function fmtMD(date) { return `${date.getMonth() + 1}/${date.getDate()}`; }
function fmtISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); // 그 주 월요일로
  return d;
}
function defaultRange() {
  const nextMon = addDays(startOfWeek(new Date()), 7);
  return [nextMon, addDays(nextMon, 4)];
}

const MAX_COLS = 10; // 격자에 동시에 띄울 영업일 상한(2주). 넘으면 자르고 화면에 알린다.

/* 시작~종료 사이에서 주말을 뺀 날짜만 돌려준다. 회의는 업무시간 전제라
   격자도 영업일만 동적으로 그린다(주말을 고르면 그 칸은 애초에 없다). */
function businessDays(start, end) {
  const out = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(d));
  }
  return out;
}

let DAYS = [];   // 요일 라벨 (동적)
let DATES = [];  // 'M/D' 라벨 (동적)

/* 기간 입력을 읽어 DAYS/DATES를 다시 계산한다. 잘못된 입력이면 기존 값을 그대로 두고
   에러만 띄운다 — 격자가 조용히 비거나 깨지는 것보다 낫다. */
function rebuildDays() {
  const err = document.getElementById('range-error');
  const note = document.getElementById('range-note');
  const startVal = document.getElementById('start-date').value;
  const endVal = document.getElementById('end-date').value;

  if (!startVal || !endVal) {
    err.textContent = '시작 날짜와 종료 날짜를 모두 선택해주세요.';
    note.hidden = true;
    return false;
  }

  const start = parseISO(startVal);
  const end = parseISO(endVal);

  if (end < start) {
    err.textContent = '종료 날짜는 시작 날짜보다 빠를 수 없습니다.';
    note.hidden = true;
    return false;
  }

  let biz = businessDays(start, end);
  if (biz.length === 0) {
    err.textContent = '선택한 기간에 평일이 없습니다. 주말이 아닌 날짜를 포함해주세요.';
    note.hidden = true;
    return false;
  }

  err.textContent = '';
  note.hidden = biz.length <= MAX_COLS;
  if (!note.hidden) note.textContent = `표시 범위가 길어 앞 ${MAX_COLS}영업일만 표시합니다.`;
  biz = biz.slice(0, MAX_COLS);

  DAYS = biz.map(d => WD[d.getDay()]);
  DATES = biz.map(fmtMD);
  return true;
}

/* ── 시간 격자: 30분 눈금 ──
   9:00~18:00, 30분 단위 18칸. 12~13시는 근무시간이 아니라 격자에서 빠진다. */
const SLOT_MIN = 30;
const DAY_START = 9 * 60;
const DAY_END = 18 * 60;
const LUNCH_START = 12 * 60;
const LUNCH_END = 13 * 60;

const SLOTS = [];
for (let t = DAY_START; t < DAY_END; t += SLOT_MIN) SLOTS.push(t);

const isLunch = t => t >= LUNCH_START && t < LUNCH_END;
const key = (d, t) => `${d}-${t}`;
const fmtTime = t => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;

/* 브리프: 같은 회사 동료 6명. 꼭 참석해야 하는 사람과 선택 참석자가 있다.
   기본값은 '선택'이다 — 필수로 지정하는 순간 그 사람에게 비용이 발생하므로,
   주최자가 의식적으로 올려야 한다. (지훈은 이미 지정된 상태로 시작한다)

   busy/picks는 여기선 시간 단위로 적는다('1-15' = 1번째 요일의 15시).
   격자가 30분 단위라 아래 normalizeFixtures()가 한 번 돌면서 각 시간을
   반시간 2칸으로 펼친다 — 시나리오 데이터를 사람이 시간 단위로 읽고 쓰기 위해서다. */
const PEOPLE = [
  { name: '서연', role: 'required', host: true, busy: ['1-15', '1-16'], picks: ['0-9', '4-17'] },
  { name: '지훈', role: 'required', busyDays: [2, 3], picks: [] }, // 수·목 외근
  { name: '민수', role: 'optional', busy: ['0-9', '0-10'], picks: ['0-13', '1-13', '4-13', '0-9'] },
  { name: '하늘', role: 'optional', busy: ['4-16', '4-17'], picks: ['1-13', '4-13', '1-9'] },
  { name: '예은', role: 'optional', busy: ['0-14'], picks: [] },
  { name: '태윤', role: 'optional', busy: [], picks: [] }
];

const ROSTER = ['준호', '다은', '시우', '예린']; // 추가할 수 있는 동료

/* '나'(지훈)는 화면 2에서 실제로 칠하는 사람이다. 지훈을 삭제하면 다음 남은
   필수 참여자에게 이 역할을 넘긴다 — 서연은 항상 필수라 받는 사람이 없어 끊기는 일은 없다. */
let me = PEOPLE.find(p => p.name === '지훈');
function ensureMe() {
  if (PEOPLE.includes(me) && me.role === 'required') return;
  me = required()[0];
}

/* 시간 단위 fixture 항목 하나('1-15')를 반시간 두 칸으로 펼친다. */
function expandHour(entry) {
  const [d, h] = entry.split('-').map(Number);
  return [key(d, h * 60), key(d, h * 60 + 30)];
}
function normalizeFixtures() {
  PEOPLE.forEach(p => {
    if (p.busy) p.busy = p.busy.flatMap(expandHour);
    if (p.picks) p.picks = p.picks.flatMap(expandHour);
  });
}

const required = () => PEOPLE.filter(p => p.role === 'required');
const optional = () => PEOPLE.filter(p => p.role === 'optional');

/* 캘린더가 아는 '불가능'. 사람이 입력하지 않는다. */
function busySlots(p) {
  const s = new Set(p.busy || []);
  (p.busyDays || []).forEach(d => SLOTS.forEach(t => s.add(key(d, t))));
  return s;
}

/* 필수 참여자 중 한 명이라도 안 되면 그 시간은 죽는다 */
function blockedSlots() {
  const s = new Set();
  required().forEach(p => busySlots(p).forEach(k => s.add(k)));
  return s;
}

/* ── 회피 예산 ─────────────────────────────────────────
   총량은 항상 1. 많이 칠할수록 각 칸이 묽어진다.
   그래서 한 사람의 총 영향력은 다른 사람과 같다. 1인 1표.  */
function budget(picks) {
  const weights = picks.map((_, i) => 1 / (i + 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const out = {};
  picks.forEach((k, i) => (out[k] = weights[i] / total));
  return out;
}

/* 칠한 칸의 색. 색상(연두)은 '기피'라는 범주를, 명도는 강도를 말한다.
   안 칠한 칸은 CSS의 --ok(하늘색) = '가능'.
   t = 0(약하게) → 1(정말 피하고 싶음) */
const ramp = t => `hsl(${88 - 10 * t} ${55 + 15 * t}% ${93 - 35 * t}%)`;

/* ── 아바타: 이름에서 결정되는 도형. 무채색이라 격자의 색을 방해하지 않는다 ──
   플러스(+)는 '추가' 버튼으로 읽혀서 도형 목록에 두지 않는다. */
const SHAPES = [
  c => `<circle cx="16" cy="16" r="6" fill="${c}"/>`,
  c => `<rect x="10" y="10" width="12" height="12" rx="2.5" fill="${c}"/>`,
  c => `<path d="M16 9l7 13H9z" fill="${c}"/>`,
  c => `<rect x="9" y="11.8" width="14" height="3.2" rx="1.6" fill="${c}"/>
        <rect x="9" y="17.4" width="14" height="3.2" rx="1.6" fill="${c}"/>`,
  c => `<circle cx="16" cy="16" r="6.4" fill="none" stroke="${c}" stroke-width="3.2"/>`,
  c => `<path d="M9 19.5a7 7 0 0114 0z" fill="${c}"/>`,
  c => `<rect x="9" y="14.4" width="14" height="3.2" rx="1.6" fill="${c}" transform="rotate(-35 16 16)"/>`
];
const TONES = ['#8b95a1', '#6b7684', '#a4acb6'];

/* 한글 음절은 U+AC00(44032, 8의 배수)에서 시작한다. 받침 없는 글자는 코드포인트가
   28의 배수만큼 떨어져 있어서, 코드포인트를 그냥 더하면 %8의 결과가 0 또는 4로 굳는다.
   도형 8종을 두고도 원과 링만 나왔던 이유다. 비트를 섞어야 골고루 퍼진다. */
function hash(str) {
  let h = 2166136261;
  for (const ch of str) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* 도형 7종 × 톤 3종. 이름 해시에서 출발하되, 목록에 이미 쓰인 조합이면 다음 칸으로 옮긴다.
   6명 중 둘이 같은 도형이면 아바타가 사람을 구별하지 못한다.
   PEOPLE 순서가 고정이고 추가된 동료는 뒤에 붙으므로 배정은 결정적이다. */
function assignAvatars() {
  const taken = new Set();
  const combos = SHAPES.length * TONES.length;

  PEOPLE.forEach(p => {
    const h = hash(p.name);
    const start = (h >>> 3) % SHAPES.length;
    let tone = (h >>> 13) % TONES.length;
    let shape = start;

    for (let n = 0; n < combos && taken.has(`${shape}-${tone}`); n++) {
      shape = (shape + 1) % SHAPES.length;
      if (shape === start) tone = (tone + 1) % TONES.length;
    }
    taken.add(`${shape}-${tone}`);
    p.face = { shape, tone };
  });
}

/* 바탕은 원이 아니라 둥근 사각형이다. 이름 옆의 원은 라디오 버튼으로 읽힌다. */
function avatar(p) {
  return `<svg class="av" viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="10" fill="#eef0f2"/>
    ${SHAPES[p.face.shape](TONES[p.face.tone])}
  </svg>`;
}

/* ── 격자 ──
   컬럼 수(=영업일 수)가 기간에 따라 달라지므로 매번 grid-template-columns를 다시 정한다.
   행은 30분 눈금 18개. 정시(:00) 행만 라벨을 보여주고 반시(:30) 행은 비워
   18칸이 붐비지 않게 한다. */
function buildGrid(el, prefix) {
  el.innerHTML = '';
  el.style.gridTemplateColumns = `56px repeat(${DAYS.length}, 1fr)`;
  el.append(div('corner'));
  DAYS.forEach((d, i) => {
    const head = div('day');
    head.innerHTML = `<b>${d}</b><i>${DATES[i]}</i>`;
    el.append(head);
  });

  const myBusy = prefix === 'in' ? busySlots(me) : null;
  SLOTS.forEach(t => {
    const onHour = t % 60 === 0;
    const timeCell = div('time', onHour ? fmtTime(t) : '');
    timeCell.classList.toggle('on-hour', onHour);
    el.append(timeCell);

    DAYS.forEach((_, d) => {
      const cell = div('cell');
      cell.dataset.slot = key(d, t);
      cell.classList.toggle('on-hour', onHour);
      if (isLunch(t)) cell.classList.add('lunch');
      else if (prefix === 'in' && myBusy.has(key(d, t))) cell.classList.add('busy');
      el.append(cell);
    });
  });
}

/* 화면 1: 한 사람의 캘린더.
   ⚠️ 여기에는 '불가능'만 나온다. 기피(연두)는 절대 보이지 않는다.
   불가능은 사실이라 이름을 달아도 비용이 없고, 기피는 선호라 이름을 달면 안 된다. */
function buildMini(el, p) {
  const busy = busySlots(p);
  el.innerHTML = '';
  el.style.gridTemplateColumns = `26px repeat(${DAYS.length}, 1fr)`;
  el.append(div('m-corner'));
  DAYS.forEach(d => el.append(div('m-day', d)));

  SLOTS.forEach(t => {
    const onHour = t % 60 === 0;
    el.append(div('m-time', onHour ? fmtTime(t) : ''));
    DAYS.forEach((_, d) => {
      const cell = div('m-cell');
      cell.classList.toggle('on-hour', onHour);
      if (isLunch(t)) cell.classList.add('lunch');
      else if (busy.has(key(d, t))) cell.classList.add('busy');
      el.append(cell);
    });
  });
}

function div(cls, text = '') {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  return el;
}

const paintable = el =>
  el.classList.contains('cell') &&
  !el.classList.contains('lunch') &&
  !el.classList.contains('busy');

/* ── 화면 1: 참여자 ── */

/* 주최자의 '필수'는 토글이 아니라 사실이다. 버튼이 아닌 라벨로 렌더한다.
   주최자는 필수를 겸하므로 칩 하나에 '주최자'로 합치고, 한 단계 더 진하게 칠한다. */
const roleControl = p => p.host
  ? `<span class="role required fixed host" title="주최자는 항상 필수 참여자입니다">주최자</span>`
  : `<button type="button" class="role ${p.role}" aria-pressed="${p.role === 'required'}"
       aria-label="${p.name} 필수 참여자">${p.role === 'required' ? '필수참석' : '선택참석'}</button>`;

function renderPeople() {
  assignAvatars();
  document.getElementById('people').innerHTML = PEOPLE.map((p, i) => `
    <li class="person${p.host ? ' host' : ''}${p.role === 'required' ? ' required' : ''}" data-i="${i}">
      <div class="prow">
        ${avatar(p)}
        <span class="pname">${p.name}</span>
        <button type="button" class="peek sched" aria-expanded="false">일정 보기</button>
        ${roleControl(p)}
        ${!p.host ? `<button type="button" class="rm" aria-label="${p.name} 제외">×</button>` : `<span class="rm-spacer" aria-hidden="true"></span>`}
      </div>
      <div class="mini" hidden></div>
    </li>`).join('');
}

document.getElementById('people').addEventListener('click', e => {
  const li = e.target.closest('.person');
  if (!li || e.target.closest('.mini')) return;   // 캘린더 안을 눌러도 역할은 안 바뀐다
  const p = PEOPLE[li.dataset.i];

  if (e.target.classList.contains('rm')) {
    PEOPLE.splice(li.dataset.i, 1);
    ensureMe();
    renderPeople();
    return document.getElementById('add-btn').focus();
  }
  if (e.target.classList.contains('sched')) {
    const mini = li.querySelector('.mini');
    if (mini.hidden) buildMini(mini, p);
    mini.hidden = !mini.hidden;
    e.target.textContent = mini.hidden ? '일정 보기' : '접기';
    e.target.setAttribute('aria-expanded', String(!mini.hidden));
    return;
  }
  if (p.host) return; // 주최자는 항상 필수
  p.role = p.role === 'required' ? 'optional' : 'required';
  renderPeople();

  /* renderPeople()이 목록을 통째로 다시 그려서 포커스가 사라진다.
     키보드로 토글한 사람은 원래 있던 자리로 돌려보낸다. */
  document.querySelector(`.person[data-i="${li.dataset.i}"] button.role`)?.focus();

  /* 주최자를 뺀 모두가 선택이 되는 순간에만 알린다 — 평소엔 조용히 두고
     실제로 회의가 위태로워질 때만 말한다. */
  if (required().every(r => r.host)) {
    alert('필수 참여자가 오지 못하면 회의가 성립하지 않습니다. 최소 한 명은 필수로 지정해주세요.');
  }
});

/* ── 회의 설정: 동료 추가 (모달) ──
   자유 입력 대신 목록에서 고른다 — 오타·중복 이름 자체가 나올 수 없다.
   아직 참여자가 아니라 face가 없으므로, 정식 배정(assignAvatars)과 같은 해시로
   미리보기 아바타만 가볍게 만든다 — 충돌 회피는 실제로 추가될 때 다시 계산된다. */
function previewAvatar(name) {
  const h = hash(name);
  const shape = (h >>> 3) % SHAPES.length;
  const tone = (h >>> 13) % TONES.length;
  return `<svg class="av" viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="10" fill="#eef0f2"/>
    ${SHAPES[shape](TONES[tone])}
  </svg>`;
}

function renderRosterList() {
  const rest = ROSTER.filter(n => !PEOPLE.some(p => p.name === n));
  document.getElementById('roster-list').innerHTML = rest.length
    ? rest.map(n => `
      <li class="roster-row">
        ${previewAvatar(n)}
        <span class="roster-name">${n}</span>
        <button type="button" class="roster-add" data-name="${n}" aria-label="${n} 추가">+</button>
      </li>`).join('')
    : `<li class="roster-empty">추가할 수 있는 동료가 없습니다.</li>`;
}

function openRosterModal() {
  renderRosterList();
  document.getElementById('roster-modal').hidden = false;
}
function closeRosterModal() {
  document.getElementById('roster-modal').hidden = true;
  document.getElementById('add-btn').focus();
}

document.getElementById('add-btn').addEventListener('click', openRosterModal);
document.getElementById('roster-modal-close').addEventListener('click', closeRosterModal);
document.getElementById('roster-modal').addEventListener('click', e => {
  if (e.target.id === 'roster-modal') closeRosterModal(); // 바깥(오버레이) 클릭 시 닫기
});
document.getElementById('roster-list').addEventListener('click', e => {
  const btn = e.target.closest('.roster-add');
  if (!btn) return;
  PEOPLE.push({ name: btn.dataset.name, role: 'optional', picks: [], added: true });
  renderPeople();
  closeRosterModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('roster-modal').hidden) closeRosterModal();
});

/* ── 회의 설정: 회의명 ──
   프리셋 + 직접입력. select에서 '직접 입력…'을 고르면 옆에 텍스트 칸이 열린다. */
const TITLE_PRESETS = ['팀 회의', '주간 회의', '1:1', '스프린트 리뷰'];

function renderTitleOptions() {
  document.getElementById('title-select').innerHTML =
    TITLE_PRESETS.map(t => `<option value="${t}">${t}</option>`).join('') +
    `<option value="custom">직접 입력…</option>`;
}

function currentTitle() {
  const sel = document.getElementById('title-select');
  if (sel.value === 'custom') {
    return document.getElementById('title-custom').value.trim() || '회의';
  }
  return sel.value;
}

document.getElementById('title-select').addEventListener('change', () => {
  const custom = document.getElementById('title-select').value === 'custom';
  const input = document.getElementById('title-custom');
  input.hidden = !custom;
  if (custom) input.focus();
  syncMeta();
});
document.getElementById('title-custom').addEventListener('input', syncMeta);

/* ── 회의 설정: 회의 시간 ──
   30분 단위로 6시간까지 + 직접입력(분). 격자가 30분 눈금이라 분 단위 그대로 반영된다. */
const DUR_STEP = 30;
const DUR_MAX = 360;
let DURATION = 60; // 분 단위. 기본 1시간

function fmtDuration(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

function renderDurationOptions() {
  const opts = [];
  for (let m = DUR_STEP; m <= DUR_MAX; m += DUR_STEP) opts.push(m);
  const sel = document.getElementById('dur-select');
  sel.innerHTML = opts.map(m => `<option value="${m}">${fmtDuration(m)}</option>`).join('') +
    `<option value="custom">직접 입력…</option>`;
  sel.value = String(DURATION);
}

function readDuration() {
  const sel = document.getElementById('dur-select');
  if (sel.value === 'custom') {
    const custom = document.getElementById('dur-custom');
    let m = Math.round((Number(custom.value) || DUR_STEP) / DUR_STEP) * DUR_STEP;
    m = Math.min(DUR_MAX, Math.max(DUR_STEP, m));
    custom.value = m; // 30분 배수로 스냅한 값을 그대로 보여준다 — 보이는 값과 실제 계산을 일치시킨다
    DURATION = m;
  } else {
    DURATION = Number(sel.value);
  }
}

document.getElementById('dur-select').addEventListener('change', () => {
  const custom = document.getElementById('dur-select').value === 'custom';
  const input = document.getElementById('dur-custom');
  input.hidden = !custom;
  if (custom) input.focus();
  readDuration();
  syncMeta();
});
document.getElementById('dur-custom').addEventListener('change', () => {
  readDuration();
  syncMeta();
});

/* ── 회의 설정: 기간 · 의견 마감 ──
   마감일은 회의 날짜의 전날을 기본값으로 따라간다 — 날짜를 바꿀 때마다 다시 맞춘다. */
function syncDueDate() {
  const anchor = document.getElementById('mode-fixed').checked
    ? document.getElementById('fixed-date').value
    : document.getElementById('start-date').value;
  if (!anchor) return;
  document.getElementById('due-date').value = fmtISO(addDays(parseISO(anchor), -1));
}

function setDefaultDates() {
  const [start, end] = defaultRange();
  document.getElementById('start-date').value = fmtISO(start);
  document.getElementById('end-date').value = fmtISO(end);
  document.getElementById('fixed-date').value = fmtISO(start);
  document.getElementById('due-time').value = '18:00';
  syncDueDate();
}

function onRangeChange() {
  rebuildDays();
  syncMeta();
  syncDueDate();
}
document.getElementById('start-date').addEventListener('change', onRangeChange);
document.getElementById('end-date').addEventListener('change', onRangeChange);

/* '원하는 날짜가 있어요'는 하루짜리 기간이다 — 고른 날짜를 시작=종료에 그대로 넣어
   기존 격자·후보 계산(rebuildDays 이하)을 손대지 않고 그대로 태운다. */
function applyDateMode() {
  const fixed = document.getElementById('mode-fixed').checked;
  document.getElementById('body-fixed').hidden = !fixed;
  document.getElementById('body-range').hidden = fixed;

  if (fixed) {
    const v = document.getElementById('fixed-date').value;
    document.getElementById('start-date').value = v;
    document.getElementById('end-date').value = v;
  }
  rebuildDays();
  syncMeta();
  syncDueDate();
}
document.getElementById('mode-fixed').addEventListener('change', applyDateMode);
document.getElementById('mode-range').addEventListener('change', applyDateMode);
document.getElementById('fixed-date').addEventListener('change', applyDateMode);

function syncMeta() {
  const label = DATES.length ? `${DATES[0]}–${DATES[DATES.length - 1]}` : '';
  document.getElementById('meet-sub').textContent = `${currentTitle()} · ${fmtDuration(DURATION)} · ${label}`;
}

/* ── 화면 2: 지훈이 칠한다 ── */
function renderInput() {
  const b = budget(me.picks);
  document.querySelectorAll('#grid-input .cell').forEach(c => {
    c.style.backgroundColor = b[c.dataset.slot] ? ramp(b[c.dataset.slot]) : '';
  });
}

function toggle(el, mode) {
  const i = me.picks.indexOf(el.dataset.slot);
  if (mode === 'remove') { if (i !== -1) me.picks.splice(i, 1); }
  else if (i === -1) me.picks.push(el.dataset.slot);
  renderInput();
}

let dragMode = null;
const gridInput = document.getElementById('grid-input');

gridInput.addEventListener('pointerdown', e => {
  if (!paintable(e.target)) return;
  dragMode = me.picks.includes(e.target.dataset.slot) ? 'remove' : 'add';
  toggle(e.target, dragMode);
});
gridInput.addEventListener('pointerover', e => {
  if (dragMode && paintable(e.target)) toggle(e.target, dragMode);
});
document.addEventListener('pointerup', () => (dragMode = null));

/* ── 화면 3: 합산 ── */
function totals() {
  const sum = {};
  required().forEach(p => {
    const b = budget(p.picks || []);
    for (const k in b) sum[k] = (sum[k] || 0) + b[k];
  });
  return sum;
}

const whoAvoided = slots =>
  [...new Set(required()
    .filter(p => slots.some(s => (p.picks || []).includes(s)))
    .map(p => p.name))];

let chosen = null;

function renderAggregate() {
  const sum = totals();
  const blocked = blockedSlots();
  const max = Math.max(...Object.values(sum), 0.001);

  document.querySelectorAll('#grid-agg .cell').forEach(c => {
    const busy = blocked.has(c.dataset.slot) && !c.classList.contains('lunch');
    c.classList.toggle('busy', busy);
    const v = sum[c.dataset.slot];
    c.style.backgroundColor = !busy && v ? ramp(v / max) : '';
  });

  /* 후보: 회의 길이(30분 단위)만큼 연속으로 비어 있어야 한다. 점심을 가로지르면 제외한다. */
  const need = Math.ceil(DURATION / SLOT_MIN);
  const cands = [];
  DAYS.forEach((_, d) => {
    SLOTS.forEach((t, i) => {
      const span = SLOTS.slice(i, i + need);
      if (span.length < need) return;
      if (span.some(isLunch)) return;
      const slots = span.map(x => key(d, x));
      if (slots.some(s => blocked.has(s))) return;
      cands.push({ d, t, slots, total: slots.reduce((a, s) => a + (sum[s] || 0), 0) });
    });
  });
  cands.sort((a, b) => a.total - b.total || a.d - b.d || a.t - b.t);

  const list = document.getElementById('cands');
  const empty = document.getElementById('cands-empty');
  const opt = optional().length;
  list.innerHTML = '';
  chosen = cands[0] || null;
  empty.hidden = cands.length > 0;

  cands.slice(0, 3).forEach((c, i) => {
    const names = whoAvoided(c.slots);
    const li = document.createElement('li');
    li.className = 'cand' + (i === 0 ? ' on' : '');
    li.innerHTML = `
      <div class="cand-main">
        <strong>${DAYS[c.d]}요일 ${DATES[c.d]} · ${fmtTime(c.t)}–${fmtTime(c.t + DURATION)}</strong>
        <span class="cand-meta">
          기피 ${c.total === 0 ? '없음' : c.total.toFixed(2)}
          · 선택 참여자 참석 가능 ${opt}/${opt}
        </span>
      </div>
      <button class="peek">이름 보기</button>
      <p class="names" hidden>${names.length ? names.join(', ') + ' 님이 기피' : '기피한 참여자 없음'}</p>`;

    li.addEventListener('click', e => {
      if (e.target.classList.contains('peek')) {
        const p = li.querySelector('.names');
        p.hidden = !p.hidden;
        e.target.textContent = p.hidden ? '이름 보기' : '접기';
        return;
      }
      list.querySelectorAll('.cand').forEach(x => x.classList.remove('on'));
      li.classList.add('on');
      chosen = c;
    });
    list.append(li);
  });
}

/* ── 단계 전환 ──
   화면 2·3의 격자는 매번 다시 짓는다 — 기간(컬럼 수)이나 '나'(지훈 삭제 시)가
   화면 1에서 바뀌었을 수 있어서, 들어갈 때마다 최신 상태로 새로 그린다. */
function goto(n) {
  document.querySelectorAll('.step').forEach(s =>
    s.classList.toggle('on', s.dataset.step === String(n)));
  document.querySelectorAll('.steps button').forEach(b => {
    const on = b.dataset.goto === String(n);
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'step');
    else b.removeAttribute('aria-current');
  });

  if (n === 2) {
    ensureMe();
    buildGrid(gridInput, 'in');
    renderInput();
  }
  if (n === 3) {
    buildGrid(document.getElementById('grid-agg'), 'ag');
    renderAggregate();
  }
  if (n === 4 && chosen) {
    document.getElementById('confirmed').textContent =
      `${DAYS[chosen.d]}요일 ${DATES[chosen.d]} ${fmtTime(chosen.t)}로 확정되었습니다`;
  }
  window.scrollTo(0, 0);
}

document.addEventListener('click', e => {
  const n = e.target.dataset.goto;
  if (n) goto(Number(n));
  if (e.target.classList.contains('rsvp-btn')) {
    document.querySelectorAll('.rsvp-btn').forEach(b => b.classList.remove('on'));
    e.target.classList.add('on');
  }
});

normalizeFixtures();
setDefaultDates();
rebuildDays();
renderTitleOptions();
renderDurationOptions();
syncMeta();
renderPeople();
buildGrid(gridInput, 'in');
buildGrid(document.getElementById('grid-agg'), 'ag');
renderInput();
