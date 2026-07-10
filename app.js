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

let DAYS = [];    // 요일 라벨 (동적)
let DATES = [];   // 'M/D' 라벨 (동적)
let WEEKEND = []; // 컬럼별 주말 여부 — 주말은 자르지 않고 통으로 흰색(선택 불가)으로 보여준다

/* 기간 입력을 읽어 DAYS/DATES를 다시 계산한다. 잘못된 입력이면 기존 값을 그대로 두고
   에러만 띄운다 — 격자가 조용히 비거나 깨지는 것보다 낫다.
   주말 포함 모든 날짜를 담는다 — 7일이 넘으면 buildGrid가 주 단위로 줄을 바꾼다. */
/* 오류의 원인 칸에만 빨간 테두리 — 어느 칸을 고치면 되는지 가리킨다.
   '원하는 날짜가 있어요' 모드에선 보이는 칸이 fixed-date 하나뿐이라 거기에 표시한다. */
function markInvalidDates(ids) {
  const fixed = document.getElementById('mode-fixed').checked;
  const show = ids.length && fixed ? ['fixed-date'] : ids;
  ['start-date', 'end-date', 'fixed-date'].forEach(id =>
    document.getElementById(id).classList.toggle('invalid', show.includes(id)));
}

function rebuildDays() {
  const err = document.getElementById('range-error');
  const startVal = document.getElementById('start-date').value;
  const endVal = document.getElementById('end-date').value;

  if (!startVal || !endVal) {
    err.textContent = '시작 날짜와 종료 날짜를 모두 선택해주세요.';
    markInvalidDates([!startVal && 'start-date', !endVal && 'end-date'].filter(Boolean));
    return false;
  }

  const start = parseISO(startVal);
  const end = parseISO(endVal);

  if (end < start) {
    err.textContent = '종료 날짜는 시작 날짜보다 빠를 수 없습니다.';
    markInvalidDates(['end-date']);
    return false;
  }

  const days = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) days.push(new Date(d));

  if (!days.some(d => d.getDay() !== 0 && d.getDay() !== 6)) {
    err.textContent = '선택한 기간에 평일이 없습니다. 주말이 아닌 날짜를 포함해주세요.';
    markInvalidDates(['start-date', 'end-date']);
    return false;
  }

  err.textContent = '';
  markInvalidDates([]);
  DAYS = days.map(d => WD[d.getDay()]);
  DATES = days.map(fmtMD);
  WEEKEND = days.map(d => d.getDay() === 0 || d.getDay() === 6);
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

/* 브리프: 같은 회사 동료 6명. 꼭 참여해야 하는 사람과 선택 참여자가 있다.
   기본값은 '선택'이다 — 필수로 지정하는 순간 그 사람에게 비용이 발생하므로,
   주최자가 의식적으로 올려야 한다. (지훈은 이미 지정된 상태로 시작한다)

   busy는 시간 단위로 적는다('1-15' = 1번째 요일의 15시) + 무슨 일정인지 제목을 함께 단다.
   picks도 같은 표기지만 제목이 없는 순수 문자열이다 — 기피는 이유를 안 남긴다.
   격자가 30분 단위라 아래 normalizeFixtures()가 한 번 돌면서 각 시간을
   반시간 2칸으로 펼친다 — 시나리오 데이터를 사람이 시간 단위로 읽고 쓰기 위해서다. */
const PEOPLE = [
  { name: '서연', role: 'required', host: true, team: '기획팀',
    busy: [{ h: '1-15', title: '외부 미팅' }, { h: '1-16', title: '외부 미팅' }],
    picks: ['0-9', '4-17'] },
  { name: '지훈', role: 'required', team: '개발팀', busyDays: [2, 3], busyDayTitle: '외근',
    busy: [{ h: '1-16', title: '팀장 면담' }], // 서연의 외부 미팅(화 15~17시)과 겹치는 16시
    picks: [] },
  { name: '민수', role: 'required', team: '디자인팀',
    busy: [{ h: '0-9', title: '주간 보고' }, { h: '0-10', title: '주간 보고' }, { h: '2-14', title: '디자인 리뷰' }],
    picks: ['0-13', '1-13', '4-13', '0-9'] },
  { name: '하늘', role: 'required', team: '마케팅팀',
    busy: [{ h: '4-16', title: '거래처 미팅' }, { h: '4-17', title: '거래처 미팅' }],
    picks: ['1-13', '4-13', '1-9'] },
  { name: '예은', role: 'optional', team: '개발팀', busy: [{ h: '0-14', title: '면접' }], picks: [] },
  { name: '태윤', role: 'optional', team: '디자인팀', busy: [], picks: [] }
];

/* 추가할 수 있는 인원 — 카테고리(팀)로 분류해 모달에서 필터링한다. */
const ROSTER = [
  { name: '준호', team: '개발팀' },
  { name: '다은', team: '디자인팀' },
  { name: '시우', team: '마케팅팀' },
  { name: '예린', team: '기획팀' }
];
const TEAMS = ['전체', '기획팀', '디자인팀', '개발팀', '마케팅팀'];
let rosterTeam = '전체';
let REMOVED = []; // ×로 뺀 사람 — 원래 데이터(불가능 시간·역할·팀)를 그대로 들고 있다가 다시 추가하면 복원한다

/* '나'(지훈)는 화면 2에서 실제로 칠하는 사람이다. 지훈을 삭제하면 다음 남은
   필수 참여자에게 이 역할을 넘긴다 — 서연은 항상 필수라 받는 사람이 없어 끊기는 일은 없다. */
let me = PEOPLE.find(p => p.name === '지훈');
function ensureMe() {
  if (PEOPLE.includes(me) && me.role === 'required') return;
  me = required()[0];
}

/* 시간 단위 fixture 항목 하나('1-15')를 반시간 두 칸으로 펼친다. picks는 제목이 없는 문자열. */
function expandHour(entry) {
  const [d, h] = entry.split('-').map(Number);
  return [key(d, h * 60), key(d, h * 60 + 30)];
}
/* busy는 { h, title } 객체라 제목을 같이 들고 반시간 두 칸으로 펼친다. */
function expandBusyHour(entry) {
  const [d, h] = entry.h.split('-').map(Number);
  return [
    { key: key(d, h * 60), title: entry.title },
    { key: key(d, h * 60 + 30), title: entry.title }
  ];
}
function normalizeFixtures() {
  PEOPLE.forEach(p => {
    if (p.busy) p.busy = p.busy.flatMap(expandBusyHour);
    if (p.picks) p.picks = p.picks.flatMap(expandHour);
  });
}

const required = () => PEOPLE.filter(p => p.role === 'required');
const optional = () => PEOPLE.filter(p => p.role === 'optional');

/* 캘린더가 아는 '불가능'. 사람이 입력하지 않는다. */
function busySlots(p) {
  const s = new Set((p.busy || []).map(b => b.key));
  (p.busyDays || []).forEach(d => SLOTS.forEach(t => s.add(key(d, t))));
  return s;
}

/* 그 칸이 무슨 일정인지. 격자에 라벨을 달 때만 쓴다. */
function busyTitle(p, slotKey) {
  const found = (p.busy || []).find(b => b.key === slotKey);
  let title;
  if (found) {
    title = found.title;
  } else {
    const day = Number(slotKey.split('-')[0]);
    title = (p.busyDays || []).includes(day) ? (p.busyDayTitle || '다른 일정') : '다른 일정';
  }
  // 전체/필수 참여자 보기(합산 대상)는 이미 "이름 · 제목" 형태라 p.name이 없다 — 그때만 건너뛴다.
  return p.name ? `${p.name} · ${title}` : title;
}

/* 칸 안에 보이는 짧은 표기. groupBusyEntries가 만든 summary(축약형)가 있으면 그걸 쓰고,
   없으면(개인 보기·busyDays) busyTitle과 같다 — 겹칠 일이 없어서 축약이 필요 없다. */
function busyCellText(p, slotKey) {
  const found = (p.busy || []).find(b => b.key === slotKey);
  return found && found.summary ? found.summary : busyTitle(p, slotKey);
}

/* 클릭 팝업에 사람별로 한 줄씩 그리기 위한 구조화된 목록.
   합산 보기는 groupBusyEntries가 만든 entries를 그대로 쓰고, 개인 보기·busyDays는 그 사람 한 명짜리로 만든다. */
function busyEntries(p, slotKey) {
  const found = (p.busy || []).find(b => b.key === slotKey);
  if (found && found.entries) return found.entries;
  if (found) return [{ person: p, title: found.title }];
  const day = Number(slotKey.split('-')[0]);
  const title = (p.busyDays || []).includes(day) ? (p.busyDayTitle || '다른 일정') : '다른 일정';
  return [{ person: p, title }];
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

/* 칠한 칸의 색. 파란(가능과 같은 색조)에서 빨강(정말 피하고 싶음)으로 이어지는 그라데이션.
   안 칠한 칸은 CSS의 --ok(하늘색) = '가능'.
   t = 0(약하게) → 1(정말 피하고 싶음) */
/* 연파랑(--avoid-min)→빨강(--avoid-max)을 RGB로 직선 보간한다.
   HSL 색상각 보간(210°→0°)은 중간 강도가 초록·노랑을 지나가 '옅어짐'이 '변색'으로 읽힌다.
   끝색은 CSS 변수가 단일 출처 — 범례 그라데이션과 격자 색이 어긋날 수 없다. */
function cssRgb(varName) {
  const el = document.body.appendChild(document.createElement('i'));
  el.style.color = `var(${varName})`;
  const rgb = getComputedStyle(el).color.match(/\d+/g).slice(0, 3).map(Number);
  el.remove();
  return rgb;
}
const RAMP_FROM = cssRgb('--avoid-min');
const RAMP_TO = cssRgb('--avoid-max');
const ramp = t => `rgb(${RAMP_FROM.map((f, i) => Math.round(f + (RAMP_TO[i] - f) * t)).join(' ')})`;

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
   한 번 배정한 얼굴은 유지한다 — 사람이 추가·정렬돼도 기존 아바타는 바뀌지 않는다. */
function assignAvatars() {
  const taken = new Set();
  const combos = SHAPES.length * TONES.length;

  /* 기존 얼굴 선점. 뺐다 다시 넣은 사람의 얼굴이 그 사이 다른 사람에게
     넘어간 경우에만 얼굴을 비워 아래에서 새로 배정받는다. */
  PEOPLE.forEach(p => {
    if (!p.face) return;
    const key = `${p.face.shape}-${p.face.tone}`;
    if (taken.has(key)) { delete p.face; return; }
    taken.add(key);
  });

  PEOPLE.filter(p => !p.face).forEach(p => {
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
   컬럼은 최대 7일(한 주). 기간이 그보다 길면 자르지 않고 주 단위 블록으로 줄을 바꾼다.
   주말 컬럼은 통으로 흰색(선택 불가) — 근무시간 아님(점심)과 같은 시각 언어.
   행은 30분 눈금 18개. 정시(:00) 행만 라벨을 보여주고 반시(:30) 행은 비워
   18칸이 붐비지 않게 한다. */
function buildGrid(el, prefix, person) {
  el.innerHTML = '';
  const cols = Math.min(7, DAYS.length);
  el.style.gridTemplateColumns = `56px repeat(${cols}, 1fr)`;

  const shownBusy = prefix === 'in' ? busySlots(person || me) : null;

  for (let w = 0; w < DAYS.length; w += cols) {
    const week = []; // 이 줄에 들어갈 날짜 인덱스들 — 마지막 줄은 7개보다 적을 수 있다
    for (let d = w; d < Math.min(w + cols, DAYS.length); d++) week.push(d);

    if (w > 0) el.append(div('week-gap')); // 주 블록 사이 숨 — 컬럼 전체를 가로지른다

    el.append(div('corner'));
    for (let i = 0; i < cols; i++) {
      if (i >= week.length) { el.append(div('out')); continue; } // 기간 밖 — 빈 자리
      const d = week[i];
      const head = div(WEEKEND[d] ? 'day we' : 'day');
      head.innerHTML = `<b>${DAYS[d]}</b><i>${DATES[d]}</i>`;
      el.append(head);
    }

    const lastTitle = {}; // 요일별 직전 busy 칸의 title — 내용이 바뀌면(사람이 중간에 끼어들면) 라벨을 다시 단다
    SLOTS.forEach(t => {
      const onHour = t % 60 === 0;
      const timeCell = div('time', onHour ? fmtTime(t) : '');
      timeCell.classList.toggle('on-hour', onHour);
      el.append(timeCell);

      for (let i = 0; i < cols; i++) {
        if (i >= week.length) { el.append(div('out')); continue; }
        const d = week[i];
        const cell = div('cell');
        cell.dataset.slot = key(d, t);
        cell.classList.toggle('on-hour', onHour);
        if (WEEKEND[d]) {
          cell.classList.add('we');
        } else if (isLunch(t)) {
          cell.classList.add('lunch');
          lastTitle[d] = undefined;
        } else if (prefix === 'in' && shownBusy.has(key(d, t))) {
          cell.classList.add('busy');
          const title = busyTitle(person || me, key(d, t));
          cell.dataset.title = title; // 클릭 시 전체 목록을 보여주기 위해 매 칸에 저장
          // 연속된 칸마다 반복하지 않고, 내용이 바뀌는 칸에만 축약 라벨을 단다
          if (lastTitle[d] !== title) cell.textContent = busyCellText(person || me, key(d, t));
          lastTitle[d] = title;
        } else {
          lastTitle[d] = undefined;
        }
        el.append(cell);
      }
    });
  }
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
  !el.classList.contains('busy') &&
  !el.classList.contains('we');

/* ── 화면 1: 참여자 ── */

/* 주최자의 '필수참여'는 토글이 아니라 사실이다. 버튼이 아닌 라벨로 렌더해 클릭을 막는다.
   '주최자'라는 사실 자체는 이름 옆 별도 배지로 뗀다. */
const roleControl = p => p.host
  ? `<span class="role required fixed" title="주최자는 항상 필수 참여자입니다">필수참여</span>`
  : `<button type="button" class="role ${p.role}" aria-pressed="${p.role === 'required'}"
       aria-label="${p.name} 필수 참여자">${p.role === 'required' ? '필수참여' : '선택참여'}</button>`;

/* 목록 순서는 '주최자 맨 위, 나머지 ㄱㄴㄷ'. 정렬이 역할(필수/선택)을 안 보므로
   역할을 토글해도 줄이 튀지 않고, 뺐다 다시 넣은 사람도 항상 같은 자리로 돌아온다. */
function sortPeople() {
  PEOPLE.sort((a, b) =>
    (b.host ? 1 : 0) - (a.host ? 1 : 0) || a.name.localeCompare(b.name, 'ko'));
}

function renderPeople() {
  sortPeople();
  assignAvatars();
  document.getElementById('people').innerHTML = PEOPLE.map((p, i) => `
    <li class="person${p.host ? ' host' : ''}${p.role === 'required' ? ' required' : ''}" data-i="${i}">
      <div class="prow">
        ${avatar(p)}
        <span class="pname-group">
          <span class="pname">${p.name}</span>
          ${p.team ? `<span class="team-tag">${p.team}</span>` : ''}
          ${p.host ? `<span class="name-sep" aria-hidden="true">|</span><span class="host-tag">주최자</span>` : ''}
        </span>
        ${roleControl(p)}
        ${!p.host ? `<button type="button" class="rm" aria-label="${p.name} 제외">×</button>` : `<span class="rm-spacer" aria-hidden="true"></span>`}
      </div>
    </li>`).join('');
  syncPeopleSummary();
  renderCombinedSchedule();
}

/* 하단 최종 확인 표의 참여자 행 — 알림 발송에서 가장 무거운 결정(누구를 필수로 지정했나)을
   보내기 직전에 다시 보여준다. 인원 구성이 바뀔 때마다(renderPeople) 같이 갱신된다. */
function syncPeopleSummary() {
  const names = list => list.length
    ? `${list.map(p => p.name).join(', ')} (${list.length}명)`
    : '없음';
  document.getElementById('sum-required').textContent = names(required());
  document.getElementById('sum-optional').textContent = names(optional());
  document.getElementById('who-count').textContent =
    `총 ${PEOPLE.length}명 · 필수 ${required().length} · 선택 ${optional().length}`;
}

/* 개별로 펼쳐보지 않아도 되도록, '인원 추가하기' 아래 프로필을 한 줄로 두고
   고른 사람의 일정을 화면 2와 같은 격자(buildGrid)로 그대로 보여준다.
   ⚠️ 여기도 '불가능'만 나온다 — 화면 2 격자와 같은 원칙. */
let csSelected = 'ALL';

/* 개개인이 아니라 여럿을 합쳐 보고 싶을 때 쓴다. 같은 칸에 여러 명이 겹치면
   "이름 · 제목"을 나열해 누구 일정인지 알 수 있게 한다.
   entries는 사람 객체 자체를 들고 있어 팝업에서 아바타·필수 여부를 그릴 수 있게 한다. */
function groupBusyEntries(people) {
  const map = new Map();
  const add = (k, entry) => map.set(k, [...(map.get(k) || []), entry]);
  people.forEach(p => {
    (p.busy || []).forEach(b => add(b.key, { person: p, title: b.title }));
    (p.busyDays || []).forEach(d => SLOTS.forEach(t =>
      add(key(d, t), { person: p, title: p.busyDayTitle || '다른 일정' })));
  });
  // title은 전체 목록(클릭 상세용), summary는 칸 안에 넣을 축약형 — 겹치는 사람이 늘어도 칸 폭을 안 넘기려고 첫 명만 보여주고 나머지는 수로 뭉갠다.
  return [...map.entries()].map(([k, entries]) => ({
    key: k,
    entries,
    title: entries.map(e => `${e.person.name} · ${e.title}`).join(', '),
    summary: entries.length > 1
      ? `${entries[0].person.name} · ${entries[0].title} 외 ${entries.length - 1}명`
      : `${entries[0].person.name} · ${entries[0].title}`
  }));
}

/* 아바타 피커 — 화면 1(전체 일정 미리보기)과 화면 2(현황)가 같은 마크업을 쓴다.
   markMe면 '나'는 기호 대신 문자로 표시한다 — 이름을 '지훈(나)'로(화면 2). */
function renderAvatarPicker(containerId, selected, markMe = false) {
  const groupBtn = (mode, label, icon, boundary) => `
    <button type="button" class="cs-avatar-btn cs-group${boundary ? ' cs-group-end' : ''}${selected === mode ? ' on' : ''}"
            data-mode="${mode}" aria-pressed="${selected === mode}">
      <svg class="av" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="10" fill="#eef0f2"/>
        ${icon}
      </svg>
      <span>${label}</span>
    </button>`;
  const reqBtn = groupBtn('REQUIRED', '필수 참여자',
    `<circle cx="16" cy="12" r="5" fill="#6b7684"/><rect x="7" y="20" width="18" height="5" rx="2.5" fill="#6b7684"/>`,
    true);
  const allBtn = groupBtn('ALL', '전체 참여자',
    `<circle cx="12" cy="13" r="4" fill="#6b7684"/><circle cx="20" cy="13" r="4" fill="#a4acb6"/>
     <rect x="8" y="20" width="16" height="4" rx="2" fill="#8b95a1"/>`);
  const peopleBtns = PEOPLE.map((p, i) => `
    <button type="button" class="cs-avatar-btn${p === selected ? ' on' : ''}"
            data-i="${i}" aria-pressed="${p === selected}">
      <span class="cs-av-wrap">
        ${avatar(p)}
        ${p.role === 'required' ? '<span class="cs-req-dot" title="필수 참여자" aria-hidden="true"></span>' : ''}
      </span>
      ${markMe && p === me ? `<span class="me-name">${p.name}(나)</span>` : `<span>${p.name}</span>`}
    </button>`).join('');
  document.getElementById(containerId).innerHTML = allBtn + reqBtn + peopleBtns;
}

/* 지금 그리드가 누구 기준인지 — 그룹 선택은 병합 일정을 가진 가짜 인물로 푼다.
   클릭 핸들러도 buildGrid와 같은 기준을 써야 칸과 일치한다 */
function resolveViewPerson(selected) {
  return selected === 'ALL' ? { busy: groupBusyEntries(PEOPLE) } :
    selected === 'REQUIRED' ? { busy: groupBusyEntries(required()) } :
    selected;
}

function renderCombinedSchedule() {
  if (csSelected !== 'ALL' && csSelected !== 'REQUIRED' && !PEOPLE.includes(csSelected)) csSelected = 'ALL';
  renderAvatarPicker('cs-avatars', csSelected);
  buildGrid(document.getElementById('grid-combined'), 'in', resolveViewPerson(csSelected));
  closeCsPopover();
}

document.getElementById('cs-avatars').addEventListener('click', e => {
  const btn = e.target.closest('.cs-avatar-btn');
  if (!btn) return;
  csSelected = btn.dataset.mode || PEOPLE[btn.dataset.i];
  renderCombinedSchedule();
});

/* ── 칸 클릭 → 옆에 뜨는 팝업 ──
   파란(가능) 칸은 애초에 클릭 대상이 아니라 여기 안 걸린다 — 빨간(일정) 칸만 반응한다.
   위로 띄울 자리가 없으면 아래로 뒤집고, 좌우로는 stage 밖을 안 벗어나게 당긴다. */
let csPopCell = null;

function closeCsPopover() {
  document.getElementById('cs-popover').classList.remove('on');
  if (csPopCell) csPopCell.classList.remove('picked');
  csPopCell = null;
}

function openCsPopover(cell, entries, when) {
  const pop = document.getElementById('cs-popover');
  const stage = document.getElementById('cs-stage');
  if (csPopCell) csPopCell.classList.remove('picked');
  csPopCell = cell;
  cell.classList.add('picked');

  pop.innerHTML = `<div class="cs-pop-when">${when}</div>` + entries.map(e => `
    <div class="cs-pop-row">
      <span class="cs-av-wrap">
        ${avatar(e.person)}
        ${e.person.role === 'required' ? '<span class="cs-req-dot" title="필수 참여자" aria-hidden="true"></span>' : ''}
      </span>
      <span class="cs-pop-name">${e.person.name}</span><span class="cs-pop-sep">·</span><span class="cs-pop-title">${e.title}</span>
    </div>`).join('');
  pop.classList.add('on');

  const stageRect = stage.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  const popRect = pop.getBoundingClientRect();

  let left = (cellRect.left - stageRect.left) + cellRect.width / 2 - popRect.width / 2;
  left = Math.max(8, Math.min(left, stageRect.width - popRect.width - 8));

  let top = (cellRect.top - stageRect.top) - popRect.height - 10;
  let above = true;
  if (top < 8) {
    top = (cellRect.bottom - stageRect.top) + 10;
    above = false;
  }

  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.classList.toggle('arrow-bottom', above);
  pop.classList.toggle('arrow-top', !above);
  pop.style.setProperty('--arrow-left', `${(cellRect.left - stageRect.left) + cellRect.width / 2 - left}px`);
}

document.getElementById('grid-combined').addEventListener('click', e => {
  const cell = e.target.closest('.cell.busy');
  if (!cell) return;
  if (csPopCell === cell) { closeCsPopover(); return; }
  const [d, t] = cell.dataset.slot.split('-').map(Number);
  const entries = busyEntries(resolveViewPerson(csSelected), key(d, t));
  openCsPopover(cell, entries, `${DATES[d]}(${DAYS[d]}) ${fmtTime(t)}`);
});

document.addEventListener('click', e => {
  const stage = document.getElementById('cs-stage');
  if (csPopCell && !stage.contains(e.target)) closeCsPopover();
});

document.getElementById('people').addEventListener('click', e => {
  const li = e.target.closest('.person');
  if (!li) return;
  const p = PEOPLE[li.dataset.i];

  if (e.target.classList.contains('rm')) {
    REMOVED.push(...PEOPLE.splice(li.dataset.i, 1));
    ensureMe();
    renderPeople();
    return document.getElementById('add-btn').focus();
  }
  if (p.host) return; // 주최자는 항상 필수
  p.role = p.role === 'required' ? 'optional' : 'required';
  renderPeople();

  /* renderPeople()이 목록을 통째로 다시 그려서 포커스가 사라진다.
     키보드로 토글한 사람은 원래 있던 자리로 돌려보낸다. */
  document.querySelector(`.person[data-i="${li.dataset.i}"] button.role`)?.focus();
});

/* ── 회의 설정: 인원 추가 (모달) ──
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

function renderRosterTabs() {
  document.getElementById('roster-tabs').innerHTML = TEAMS.map(t => `
    <button type="button" class="roster-tab${t === rosterTeam ? ' on' : ''}" data-team="${t}">${t}</button>
  `).join('');
}

function renderRosterList() {
  renderRosterTabs();
  const candidates = [
    ...ROSTER.filter(r => !PEOPLE.some(p => p.name === r.name)),
    ...REMOVED.map(p => ({ name: p.name, team: p.team }))
  ];
  const rest = rosterTeam === '전체' ? candidates : candidates.filter(c => c.team === rosterTeam);
  document.getElementById('roster-list').innerHTML = rest.length
    ? rest.map(c => `
      <li class="roster-row">
        ${previewAvatar(c.name)}
        <span class="roster-name-group">
          <span class="roster-name">${c.name}</span>
          <span class="team-tag">${c.team}</span>
        </span>
        <button type="button" class="roster-add" data-name="${c.name}" aria-label="${c.name} 추가">+</button>
      </li>`).join('')
    : `<li class="roster-empty">추가할 수 있는 인원이 없습니다.</li>`;
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
document.getElementById('roster-tabs').addEventListener('click', e => {
  const btn = e.target.closest('.roster-tab');
  if (!btn) return;
  rosterTeam = btn.dataset.team;
  renderRosterList();
});
document.getElementById('roster-modal').addEventListener('click', e => {
  if (e.target.id === 'roster-modal') closeRosterModal(); // 바깥(오버레이) 클릭 시 닫기
});
document.getElementById('roster-list').addEventListener('click', e => {
  const btn = e.target.closest('.roster-add');
  if (!btn) return;
  const name = btn.dataset.name;
  const removedIdx = REMOVED.findIndex(p => p.name === name);
  if (removedIdx !== -1) {
    PEOPLE.push(REMOVED.splice(removedIdx, 1)[0]); // 원래 불가능 시간·역할·팀 그대로 복원
  } else {
    const team = ROSTER.find(r => r.name === name)?.team;
    PEOPLE.push({ name, role: 'optional', team, picks: [], added: true });
  }
  renderPeople();
  renderRosterList(); // 닫지 않고 남은 후보만 다시 그려 연달아 추가할 수 있게 한다
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
  document.getElementById('title-select').value = 'custom';
  document.getElementById('title-custom').hidden = false;
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
  document.getElementById('dur-unit').hidden = !custom;
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
  if (anchor) document.getElementById('due-date').value = fmtISO(addDays(parseISO(anchor), -1));
  checkDueDate();
}

/* 마감일이 후보 기간의 마지막 날보다 뒤면 경고 — 회의 후보일이 다 지난 뒤에 의견을 받는 셈이다.
   기본값을 자동으로 따라가는 동안에는 나올 수 없고, 손으로 바꿨을 때만 걸린다.
   지정일 모드도 applyDateMode가 지정일을 start=end로 복사하므로 end-date 하나로 판정된다. */
function checkDueDate() {
  const dueVal = document.getElementById('due-date').value;
  const endVal = document.getElementById('end-date').value;
  const bad = !!(dueVal && endVal && parseISO(dueVal) > parseISO(endVal));
  document.getElementById('due-error').textContent =
    bad ? '의견접수 마감일은 날짜 후보의 마지막 날보다 늦을 수 없습니다.' : '';
  document.getElementById('due-date').classList.toggle('invalid', bad);
}
document.getElementById('due-date').addEventListener('change', () => {
  checkDueDate();
  syncMeta(); // 하단 요약·화면 2 표의 마감일 표기도 같이 맞춘다
});
document.getElementById('due-time').addEventListener('change', syncMeta);

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
  syncDueDate(); // 마감일 리셋이 먼저 — syncMeta가 리셋된 값으로 요약을 만든다
  syncMeta();
  renderCombinedSchedule();
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
  syncDueDate(); // 마감일 리셋이 먼저 — syncMeta가 리셋된 값으로 요약을 만든다
  syncMeta();
  renderCombinedSchedule();
}
document.getElementById('mode-fixed').addEventListener('change', applyDateMode);
document.getElementById('mode-range').addEventListener('change', applyDateMode);
document.getElementById('fixed-date').addEventListener('change', applyDateMode);

/* Safari의 날짜 팝업은 값을 골라도 열린 채 남는다 — 고르는 즉시 접는다. */
document.querySelectorAll('input[type="date"]').forEach(el =>
  el.addEventListener('change', () => el.blur()));

/* 화면 2의 '회의 일정' 표 — 화면 1에서 정한 값을 참여자 눈으로 다시 보여준다 */
function dueLabel() {
  const d = document.getElementById('due-date').value;
  if (!d) return '—';
  const t = document.getElementById('due-time').value;
  const date = parseISO(d);
  return `${fmtMD(date)}(${WD[date.getDay()]})${t ? ' ' + t : ''}까지`;
}

/* 같은 값이 두 군데 나간다 — 화면 1 하단 요약(sum-*)과 화면 2 회의 일정 표(info-*) */
function syncMeta() {
  /* 입력 폼의 문구("…부터 … 중 1일")와 같은 말로 쓴다 — 요약에서 표기가 달라지면 다른 값처럼 읽힌다 */
  const dates = !DATES.length ? '—'
    : DATES.length === 1 ? `${DATES[0]}(${DAYS[0]})`
    : `${DATES[0]}(${DAYS[0]})~${DATES[DATES.length - 1]}(${DAYS[DAYS.length - 1]}) 중 1일`;
  const put = (name, v) => ['info-', 'sum-'].forEach(pre =>
    document.getElementById(pre + name).textContent = v);
  put('title', currentTitle());
  put('duration', fmtDuration(DURATION));
  put('dates', dates);
  put('due', dueLabel());
}

/* ── 화면 2: 지훈이 칠한다 ──
   그룹 뷰에서도 이 함수로 내 기피만 그린다. 남의 일정(busy) 칸 위에는 얹지 않는다 — 사실이 우선. */
function renderInput() {
  const b = budget(me.picks);
  document.querySelectorAll('#grid-input .cell').forEach(c => {
    c.style.backgroundColor = paintable(c) && b[c.dataset.slot] ? ramp(b[c.dataset.slot]) : '';
  });
}

function toggle(el, mode) {
  const i = me.picks.indexOf(el.dataset.slot);
  if (mode === 'remove') { if (i !== -1) me.picks.splice(i, 1); }
  else if (i === -1) me.picks.push(el.dataset.slot);
  repaintInput(); // 그룹 뷰에서 칠해도 내 기피 색이 그 자리에서 다시 그려진다
}

let dragMode = null;
const gridInput = document.getElementById('grid-input');

gridInput.addEventListener('pointerdown', e => {
  if (gridInput.classList.contains('readonly') || !paintable(e.target)) return;
  dragMode = me.picks.includes(e.target.dataset.slot) ? 'remove' : 'add';
  toggle(e.target, dragMode);
});
gridInput.addEventListener('pointerover', e => {
  if (dragMode && paintable(e.target)) toggle(e.target, dragMode);
});
document.addEventListener('pointerup', () => (dragMode = null));

/* ── 화면 2: 현황 피커 · 기본값 · 초기화 ──
   격자는 하나다. 피커로 보는 대상을 바꾸고, '나'와 그룹 뷰(전체·필수)에서 칠할 수 있다.
   남의 기피는 어느 뷰에서도 안 보인다(비밀투표) — 서로의 의견이 보이면 눈치·동조가 생기고,
   독립적으로 표명된 의견이어야 같은 무게 합산이 성립한다. 남의 개인 뷰는 읽기 전용 + 일정만.
   합산과 개인별 기피는 주최자의 화면 3에서만 보인다. */
let p2Selected = 'ALL';

/* 타인·그룹 뷰 색: 개인은 자기 예산 그대로, 그룹은 상대 지형 (화면 2 현황 · 화면 3 인원별 현황 공용) */
function paintStatusGrid(gridId, selected) {
  const group = typeof selected === 'string'; // 개인 선택은 항상 인물 객체
  const sum = sumBudgets(selected === 'ALL' ? PEOPLE :
    selected === 'REQUIRED' ? required() : [selected]);
  const max = group ? Math.max(...Object.values(sum), 0.001) : 1;
  document.querySelectorAll(`#${gridId} .cell`).forEach(c => {
    const v = paintable(c) && sum[c.dataset.slot];
    c.style.backgroundColor = v ? ramp(v / max) : '';
  });
}

function renderInputView() {
  renderAvatarPicker('in-avatars', p2Selected, true);
  buildGrid(gridInput, 'in', resolveViewPerson(p2Selected));
  const otherPerson = typeof p2Selected !== 'string' && p2Selected !== me;
  gridInput.classList.toggle('readonly', otherPerson);
  document.getElementById('in-note').hidden = p2Selected === me; // 남의 기피를 기대할 수 있는 뷰에서만 안내
  repaintInput();
}

/* 지금 보고 있는 뷰에 맞는 색으로 다시 칠한다 — 화면 2는 어느 뷰에서든 내 기피만 그린다.
   남의 기피는 개인 뷰든 그룹 뷰든 안 보인다(비밀투표) — 합산은 주최자의 화면 3에서만. */
function repaintInput() {
  if (typeof p2Selected === 'string' || p2Selected === me) renderInput();
}

document.getElementById('in-avatars').addEventListener('click', e => {
  const btn = e.target.closest('.cs-avatar-btn');
  if (!btn) return;
  p2Selected = btn.dataset.mode || PEOPLE[Number(btn.dataset.i)];
  renderInputView();
});

/* 기본값: 매번 같은 기피를 다시 칠하지 않도록 저장한다. 새로고침에도 유지(localStorage). */
const AVOID_DEFAULT_KEY = 'avoid-default';

function flashBtn(btn, msg) {
  const orig = btn.textContent;
  btn.textContent = msg;
  btn.disabled = true;
  setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1200);
}

document.getElementById('load-default').addEventListener('click', e => {
  const saved = JSON.parse(localStorage.getItem(AVOID_DEFAULT_KEY) || 'null');
  if (!saved || !saved.length) { flashBtn(e.target, '저장된 값 없음'); return; }
  const busy = busySlots(me);
  me.picks = saved.filter(s => {
    const [d, t] = s.split('-').map(Number);
    return d < DAYS.length && !isLunch(t) && !busy.has(s); // 지금 격자에서 칠할 수 있는 칸만
  });
  p2Selected = me;
  renderInputView();
  flashBtn(e.target, '불러옴');
});

document.getElementById('save-default').addEventListener('click', e => {
  localStorage.setItem(AVOID_DEFAULT_KEY, JSON.stringify(me.picks));
  flashBtn(e.target, '저장됨');
});

document.getElementById('clear-picks').addEventListener('click', () => {
  me.picks = [];
  p2Selected = me;
  renderInputView();
});

/* ── 합산: 여러 사람의 회피 예산을 슬롯별로 더한다 (화면 2 현황 뷰 · 화면 3 공용) ── */
function sumBudgets(people) {
  const sum = {};
  people.forEach(p => {
    const b = budget(p.picks || []);
    for (const k in b) sum[k] = (sum[k] || 0) + b[k];
  });
  return sum;
}

/* ── 화면 3: 합산 · 격자에서 직접 선택 · 인원별 현황 ── */
function totals() {
  return sumBudgets(required());
}

let chosen = null;                 // 선택된 시간 { d, t, slots }
let sent = false;                  // 알림을 보냈는가 — 선택이 바뀌어야 풀린다 (뷰 전환으로는 안 풀림)
let p3Selected = 'ALL';            // 기본은 전체 현황 — 그룹 뷰(전체·필수)에서 바로 고를 수 있다
let aggSum = {}, aggMax = 1;       // 마지막 합산 — 선택이 바뀔 때마다 색을 되돌리는 데 쓴다
let aggStarts = new Map();         // 시작 슬롯 → 후보. 여기 있는 칸만 클릭에 반응한다

/* 합산·후보를 다시 계산한다. 격자를 그리지는 않는다 — 그건 renderAggView 몫 */
function computeAgg() {
  aggSum = totals();
  aggMax = Math.max(...Object.values(aggSum), 0.001);
  const blocked = blockedSlots();

  document.getElementById('agg-sub').textContent =
    `필수 참여자 ${required().length}명의 의견이 같은 무게로 합산되었습니다`;

  /* 시작 가능한 칸: 회의 길이(30분 단위)만큼 연속으로 비어 있어야 한다. 점심을 가로지르면 제외한다. */
  const need = Math.ceil(DURATION / SLOT_MIN);
  aggStarts = new Map();
  DAYS.forEach((_, d) => {
    if (WEEKEND[d]) return; // 주말엔 회의가 시작될 수 없다
    SLOTS.forEach((t, i) => {
      const span = SLOTS.slice(i, i + need);
      if (span.length < need) return;
      if (span.some(isLunch)) return;
      const slots = span.map(x => key(d, x));
      if (slots.some(s => blocked.has(s))) return;
      aggStarts.set(key(d, t), { d, t, slots });
    });
  });

  document.getElementById('cands-empty').hidden = aggStarts.size > 0;
}

/* 피커가 고른 대상에 맞춰 격자를 다시 그린다. 후보 선택은 그룹 뷰(전체·필수) 어디서든 —
   전체 뷰는 선택 참여자의 일정까지 보이는 채로, 필수 뷰는 결정 기준만 남긴 채로 고른다.
   개인 뷰는 현황 확인용이라 선택을 얹지 않는다. */
function renderAggView() {
  renderAvatarPicker('agg-avatars', p3Selected);
  const grid = document.getElementById('grid-agg');
  document.getElementById('agg-legend-busy').textContent =
    p3Selected === 'REQUIRED' ? '필수 참여자 불가 · 후보 제외' : '캘린더상 일정 있음';

  if (p3Selected !== 'REQUIRED') {
    buildGrid(grid, 'in', resolveViewPerson(p3Selected));
    paintStatusGrid('grid-agg', p3Selected);
    if (p3Selected === 'ALL') overlayChoice(grid);
    return;
  }

  buildGrid(grid, 'ag');
  const blocked = blockedSlots();
  const titles = new Map(groupBusyEntries(required()).map(e => [e.key, e.title]));
  grid.querySelectorAll('.cell').forEach(c => {
    const slot = c.dataset.slot;
    const busy = blocked.has(slot) && !c.classList.contains('lunch');
    c.classList.toggle('busy', busy);
    // 연속된 칸마다 반복하지 않고, 그 일정이 시작하는 칸에만 라벨을 단다 (화면 1과 같은 원칙)
    const [d, t] = slot.split('-').map(Number);
    c.textContent = busy && !blocked.has(key(d, t - SLOT_MIN)) ? (titles.get(slot) || '다른 일정') : '';
  });
  paintAgg();
  overlayChoice(grid);
}

/* 필수 뷰의 합산 색 — 전체 뷰의 색은 paintStatusGrid 몫이다.
   renderAggView가 격자를 새로 지은 직후에만 불려서 이전 선택·라벨을 지울 필요가 없다. */
function paintAgg() {
  document.querySelectorAll('#grid-agg .cell').forEach(c => {
    const v = !c.classList.contains('busy') && aggSum[c.dataset.slot];
    c.style.backgroundColor = v ? ramp(v / aggMax) : '';
  });
}

/* 그룹 뷰 공통 — 후보 칸을 클릭 대상으로 표시하고, 선택된 시간을 진파랑 + 회의명으로 얹는다 */
function overlayChoice(grid) {
  grid.querySelectorAll('.cell').forEach(c =>
    c.classList.toggle('startable', aggStarts.has(c.dataset.slot)));
  if (!chosen) return;
  chosen.slots.forEach((s, i) => {
    const cell = grid.querySelector(`.cell[data-slot="${s}"]`);
    cell.classList.add('chosen');
    cell.style.backgroundColor = ''; // 인라인 합산 색을 걷어내야 .chosen의 진파랑이 보인다
    cell.textContent = i === 0 ? currentTitle() : '';
  });
}

/* 선택 → 격자에 진파랑 + 회의명, 아래 표에 일시·참석자 현황이 그 자리에서 반영된다 */
function applyChoice(c) {
  chosen = c;
  sent = false;
  if (typeof p3Selected === 'string') renderAggView(); // 그룹 뷰면 선택 표시를 다시 얹는다

  const btn = document.getElementById('confirm-send');
  btn.textContent = '확정하고 모든 참여자에게 알림 보내기';
  btn.disabled = !chosen;
  const when = document.getElementById('pick-when');
  const att = document.getElementById('pick-att');

  if (!chosen) {
    when.textContent = '테이블에서 원하는 일시를 선택해주세요';
    when.classList.add('placeholder');
    att.textContent = '—';
    document.getElementById('pick-avoid-row').hidden = true;
    return;
  }

  when.classList.remove('placeholder');
  when.textContent =
    `${DATES[chosen.d]}(${DAYS[chosen.d]}) ${fmtTime(chosen.t)}–${fmtTime(chosen.t + DURATION)}`;

  /* 필수는 후보 정의상 전원 가능. 선택 참여자만 캘린더와 대조해 실계산한다. */
  const free = optional().filter(p => {
    const b = busySlots(p);
    return !chosen.slots.some(s => b.has(s));
  });
  att.textContent =
    `필수 참여자 ${required().length}명 전원 참석 가능 · 선택 참여자 ${free.length}/${optional().length}명 참석 가능`;

  /* 주최자에게는 이름까지 — 이 시간을 피하고 싶다고 표시한 필수 참여자.
     참여자끼리는 익명(화면 2)이지만, 결정하는 사람은 선택의 대가를 알아야 한다. */
  const avoiders = required().filter(p => (p.picks || []).some(s => chosen.slots.includes(s)));
  document.getElementById('pick-avoid-row').hidden = !avoiders.length;
  document.getElementById('pick-avoid').textContent = avoiders.map(p => p.name).join(', ');
}

document.getElementById('agg-avatars').addEventListener('click', e => {
  const btn = e.target.closest('.cs-avatar-btn');
  if (!btn) return;
  p3Selected = btn.dataset.mode || PEOPLE[Number(btn.dataset.i)];
  renderAggView(); // 선택·확정 상태는 그대로 — 뷰만 바뀐다
});

document.getElementById('grid-agg').addEventListener('click', e => {
  const cell = e.target.closest('.cell.startable');
  if (!cell) return;
  const cand = aggStarts.get(cell.dataset.slot);
  applyChoice(chosen && chosen.slots[0] === cand.slots[0] ? null : cand); // 같은 칸 다시 누르면 해제
});

document.getElementById('confirm-send').addEventListener('click', e => {
  if (!chosen || sent) return;
  sent = true;
  e.target.textContent = '모든 참여자에게 알림을 보냈습니다';
  e.target.disabled = true; // 다른 시간을 고르면 applyChoice가 되살린다 — 그게 곧 일정 변경 흐름
});

document.getElementById('agg-refresh').addEventListener('click', e => {
  p3Selected = 'ALL'; // 새 데이터 = 처음부터 — 진입 때와 같은 전체 현황으로 돌아온다
  computeAgg();
  applyChoice(null);
  renderAggView();
  flashBtn(e.target, '새로고침됨');
});

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
    syncMeta(); // 마감일 등 화면 1 값이 바뀌었을 수 있다
    p2Selected = 'ALL'; // 들어올 때마다 전체 현황부터 — 여기서 바로 칠할 수 있다
    renderInputView();
  }
  if (n === 3) {
    ensureMe();
    p3Selected = 'ALL'; // 들어올 때마다 전체 현황부터 — 여기서 바로 고를 수 있다 (화면 2와 같은 규칙)
    computeAgg();
    applyChoice(null);
    renderAggView();
  }
  window.scrollTo(0, 0);
}

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-goto]'); // 버튼 안의 <b> 등 자식을 눌러도 이동해야 한다
  if (btn) goto(Number(btn.dataset.goto));
});

normalizeFixtures();
setDefaultDates();
rebuildDays();
renderTitleOptions();
renderDurationOptions();
syncMeta();
renderPeople();
buildGrid(document.getElementById('grid-agg'), 'ag');
renderInputView();
