const DAYS_KO  = ['월','화','수','목','금'];
const DAYS_EN  = ['Mon','Tue','Wed','Thu','Fri'];
const DAYS_ALL = ['월','화','수','목','금','토'];
const API_URL  = 'https://script.google.com/macros/s/AKfycbyxmp3Uo40feKuXIOWRMrS9AqcZMHZs4v3hiDqUBNsfcXHIJ285yybZoLpq988X3lcXcQ/exec';
const ANCHOR   = new Date(2026,3,27);
const THIRTY_MIN_MS = 30 * 60 * 1000;

const COLOR_SLOTS = [
  {key:'ysh',name:'청록'}, {key:'psj',name:'주황'}, {key:'kkh',name:'회색'},
  {key:'c4', name:'보라'}, {key:'c5', name:'파랑'}, {key:'c6', name:'분홍'},
  {key:'c7', name:'에메랄드'}, {key:'c8', name:'레드'},
];

let PERSON = {};
let MEMBERS_LIST = [];
let PROJECTS_LIST = [];        // 프로젝트 목록 (시트 '프로젝트' 탭)
// 프로젝트 접힘 상태 (localStorage 유지: {프로젝트명: 'open'|'closed'})
let projCollapseState = (()=>{ try{ return JSON.parse(localStorage.getItem('fox_proj_collapse')||'{}'); }catch(e){ return {}; } })();
function saveProjCollapse(){ try{ localStorage.setItem('fox_proj_collapse', JSON.stringify(projCollapseState)); }catch(e){} }
const PROJECT_HIDE_MS = 60 * 60 * 1000;  // 완료 프로젝트 자동 숨김까지 시간 (1시간)
let projHideTimer = null;                 // 다음 자동 숨김 시점 재렌더 타이머
// 프로젝트별 고유 색 슬롯 (이름 해시 → 항상 같은 색). '기타'는 중립 회색.
const PROJ_PALETTE = ['c4','c5','c6','c7','c8','ysh','psj'];
function projColorSlot(name){
  if(name === '기타') return 'kkh';
  let h=0; for(let i=0;i<name.length;i++) h=(h*31 + name.charCodeAt(i))>>>0;
  return PROJ_PALETTE[h % PROJ_PALETTE.length];
}
let overdueTasksCache = [];
let pendingReload = false;     // 모달 닫을 때 전체 새로고침 필요 여부
const taskTimers = {};

// 완료 업무 상태
let COMPLETED_TASKS = [];
let completedFilter = { member: 'all', period: 'all' };

// 반복 업무 상태
let RECURRING_TASKS = [];

// 댓글 모달 상태
let currentCommentRow = null;
let selectedCommentAuthor = null;

// 캘린더 상태
let CALENDAR_EVENTS = [];                 // 시트에서 온 사용자 일정
let LEAVE_EVENTS = [];                    // 근무일정에서 자동 추출한 연차/반차 (읽기 전용)
let calViewYear  = new Date().getFullYear();
let calViewMonth = new Date().getMonth(); // 0~11
let editingEventRow = null;               // null=추가, 숫자=수정
let selectedEventType = '계획';

// 2026~2027 대한민국 공휴일 (코드 내장, 읽기 전용)
// 음력·대체공휴일은 공식 월력요항 기준
const HOLIDAYS = {
  // 2026
  '2026-01-01':'신정',
  '2026-02-16':'설날 연휴','2026-02-17':'설날','2026-02-18':'설날 연휴',
  '2026-03-01':'삼일절','2026-03-02':'대체공휴일',
  '2026-05-05':'어린이날',
  '2026-05-24':'부처님오신날','2026-05-25':'대체공휴일',
  '2026-06-06':'현충일',
  '2026-08-15':'광복절','2026-08-17':'대체공휴일',
  '2026-09-24':'추석 연휴','2026-09-25':'추석','2026-09-26':'추석 연휴',
  '2026-10-03':'개천절','2026-10-05':'대체공휴일',
  '2026-10-09':'한글날',
  '2026-12-25':'성탄절',
  // 2027
  '2027-01-01':'신정',
  '2027-02-06':'설날 연휴','2027-02-07':'설날','2027-02-08':'설날 연휴','2027-02-09':'대체공휴일',
  '2027-03-01':'삼일절',
  '2027-05-05':'어린이날',
  '2027-05-13':'부처님오신날',
  '2027-06-06':'현충일',
  '2027-08-15':'광복절','2027-08-16':'대체공휴일',
  '2027-09-14':'추석 연휴','2027-09-15':'추석','2027-09-16':'추석 연휴',
  '2027-10-03':'개천절','2027-10-04':'대체공휴일',
  '2027-10-09':'한글날','2027-10-11':'대체공휴일',
  '2027-12-25':'성탄절','2027-12-27':'대체공휴일',
};

// yyyy-MM-dd 키 생성
function ymd(y, m, d){
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function ymdFromDate(dt){
  return ymd(dt.getFullYear(), dt.getMonth(), dt.getDate());
}
// "yyyy-MM-dd" → Date (로컬 자정)
function ymdToDate(s){
  const p = String(s).split('-');
  if(p.length !== 3) return null;
  const d = new Date(+p[0], +p[1]-1, +p[2]);
  return isNaN(d) ? null : d;
}

function midnight(d){const c=new Date(d);c.setHours(0,0,0,0);return c;}
function getMonday(d){const c=midnight(d),w=c.getDay();c.setDate(c.getDate()+(w===0?-6:1-w));return c;}
function addDays(d,n){const c=new Date(d);c.setDate(c.getDate()+n);return c;}
function sameDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
function fmt(d){return `${d.getMonth()+1}/${d.getDate()}`;}
function fmtFull(d){const w=['일','월','화','수','목','금','토'][d.getDay()];return `${d.getFullYear()}. ${d.getMonth()+1}. ${d.getDate()} (${w})`;}
function parseDate(v){
  if(!v) return null;
  if(v instanceof Date) return v;
  const s=String(v).trim();
  if(!s||s==='-') return null;
  if(s.includes('T')||/^\d{4}-/.test(s)){const d=new Date(s);return isNaN(d)?null:d;}
  // "M/d HH:mm" 또는 "M/d" 형식
  const sp=s.split(' ');
  const p=sp[0].split('/');
  if(p.length===2){
    const year=new Date().getFullYear();
    const d=new Date(year,+p[0]-1,+p[1]);
    if(sp[1]){const t=sp[1].split(':');d.setHours(+t[0]||0,+t[1]||0,0,0);}
    // 6개월 이상 미래면 작년으로 보정 (연말 마감기한을 새해에 볼 때 D+364 오류 방지)
    if(d-new Date()>180*86400000) d.setFullYear(year-1);
    return isNaN(d)?null:d;
  }
  if(p.length===3){const d=new Date(+p[2],+p[0]-1,+p[1]);return isNaN(d)?null:d;}
  return null;
}

function buildPerson(membersList){
  const obj = {};
  membersList.forEach(m => {
    const full = String(m['이름']||'').trim();
    if(!full) return;
    const short = full.length>=2 ? full.slice(-2) : full;
    obj[full] = {
      full, short,
      cls:  String(m['색상']||'ysh').trim(),
      role: String(m['역할']||'').trim(),
    };
  });
  return obj;
}

function getAssigneeList(task){
  const s = String(task['담당']||'').trim();
  if(!s) return [];
  if(s === 'AI 연구원') return MEMBERS_LIST.map(m=>String(m['이름']||'').trim()).filter(Boolean);
  return s.split(',').map(x=>x.trim()).filter(Boolean);
}

function parsePersonalComplete(raw){
  if(!raw) return {};
  try{ return JSON.parse(raw); }catch(e){ return {}; }
}

function isPersonDone(personal, name){
  return !!(personal && personal[name]);
}

function parseComments(raw){
  if(!raw) return [];
  try{ return JSON.parse(raw); }catch(e){ return []; }
}

function renderMembersBar(){
  const bar = document.getElementById('membersBar');
  bar.innerHTML = Object.values(PERSON).map(p => {
    const safe = p.full.replace(/'/g,'').replace(/"/g,'');
    return `
    <div class="member" role="button" tabindex="0" title="${p.full} 업무 현황 보기" onclick="openMemberModal('${safe}')">
      <div class="av av-${p.cls}">${p.short}</div>
      <div><div class="m-name">${p.full}</div><div class="m-role">${p.role}</div></div>
    </div>`;
  }).join('');
}

// ───────── 연구원별 업무 현황 모달 ─────────
// 특정 멤버 기준 업무 완료 여부 ('done' | 'pending')
function memberTaskStatus(task, name){
  const assignees = getAssigneeList(task);
  if(assignees.length > 1){
    const personal = parsePersonalComplete(task['개별완료']);
    return (task['완료'] || isPersonDone(personal, name)) ? 'done' : 'pending';
  }
  return task['완료'] ? 'done' : 'pending';
}

// 멤버별 업무 통계 (팝업·대시보드 공유)
function computeMemberStats(name){
  const today = midnight(new Date());
  const mine = currentTasksCache.filter(t => getAssigneeList(t).includes(name));
  let done = 0, overdue = 0;
  mine.forEach(t => {
    if(memberTaskStatus(t, name) === 'done'){ done++; }
    else { const dl = parseDate(t['마감기한']); if(dl && dl < today) overdue++; }
  });
  const total = mine.length;
  return { mine, total, done, pending: total-done, overdue, pct: total ? Math.round(done/total*100) : 0 };
}

// 멤버 리포트(제목/부제/본문 HTML) 생성 — 개인 팝업이 사용
function buildMemberReport(name){
  const p = PERSON[name];
  if(!p) return null;
  const today = midnight(new Date());
  const { mine, total, done, pending, overdue, pct } = computeMemberStats(name);

  const title = `${p.full} 업무 현황`;
  const sub = p.role ? `${p.role} · 담당 업무 ${total}건` : `담당 업무 ${total}건`;

  // 프로젝트별 그룹
  const groups = {};
  mine.forEach(t => { const k = String(t['프로젝트']||'').trim() || '기타'; (groups[k]=groups[k]||[]).push(t); });

  let body = `
    <div class="mem-hero">
      <div class="av av-${p.cls} mem-av">${p.short}</div>
      <div class="mem-hero-info">
        <div class="mem-hero-name">${p.full}</div>
        <div class="mem-hero-role">${p.role||''}</div>
      </div>
      <div class="mem-hero-pct">
        <div class="mem-pct-num">${pct}<span>%</span></div>
        <div class="mem-pct-label">완료율</div>
      </div>
    </div>
    <div class="mem-progress-track"><div class="mem-progress-fill${total&&done===total?' full':''}" style="width:${pct}%"></div></div>
    <div class="mem-stats">
      <div class="mem-stat"><div class="mem-stat-num">${total}</div><div class="mem-stat-label">전체</div></div>
      <div class="mem-stat"><div class="mem-stat-num mem-done">${done}</div><div class="mem-stat-label">완료</div></div>
      <div class="mem-stat"><div class="mem-stat-num">${pending}</div><div class="mem-stat-label">진행중</div></div>
      <div class="mem-stat"><div class="mem-stat-num ${overdue?'mem-danger':''}">${overdue}</div><div class="mem-stat-label">마감 지남</div></div>
    </div>`;

  if(!total){
    body += `<div class="empty-state">담당 중인 업무가 없습니다.</div>`;
  }else{
    body += `<div class="mem-tasklist">`;
    Object.keys(groups).forEach(pn => {
      const slot = projColorSlot(pn);
      const list = groups[pn].slice().sort((a,b)=>{
        const da = memberTaskStatus(a,name)==='done', db = memberTaskStatus(b,name)==='done';
        if(da!==db) return da?1:-1;
        const pa=parseDate(a['마감기한']), pb=parseDate(b['마감기한']);
        if(pa&&pb) return pa-pb; if(pa) return -1; if(pb) return 1; return 0;
      });
      const gdone = list.filter(t=>memberTaskStatus(t,name)==='done').length;
      body += `<div class="mem-proj">
        <div class="mem-proj-head"><span class="project-dot" style="background:var(--${slot})"></span><span class="mem-proj-name">${pn}</span><span class="mem-proj-count">${gdone}/${list.length}</span></div>`;
      list.forEach(t => {
        const st = memberTaskStatus(t,name);
        const dl = parseDate(t['마감기한']);
        let badge = '';
        if(st!=='done' && dl){ const diff=Math.floor((dl-today)/86400000); badge=buildCountdownBadge(diff); }
        body += `<div class="mem-task ${st}">
          <span class="mem-task-check ${st==='done'?'on':''}">${st==='done'?'<svg viewBox="0 0 12 12"><polyline points="1.5,6 4.5,9.5 10.5,2.5"/></svg>':''}</span>
          <span class="mem-task-name">${t['업무']}</span>
          ${badge}
          <span class="mem-task-dl">${dl?fmtDeadline(dl):''}</span>
        </div>`;
      });
      body += `</div>`;
    });
    body += `</div>`;
  }

  return { title, sub, body };
}

function openMemberModal(name){
  const r = buildMemberReport(name);
  if(!r) return;
  document.getElementById('memberModalTitle').textContent = r.title;
  document.getElementById('memberModalSub').textContent = r.sub;
  document.getElementById('memberModalBody').innerHTML = r.body;
  document.getElementById('memberOverlay').classList.add('show');
  document.getElementById('memberModal').classList.add('show');
}

function closeMemberModal(){
  document.getElementById('memberOverlay').classList.remove('show');
  document.getElementById('memberModal').classList.remove('show');
}

// ───────── 전체 인원 업무 현황 대시보드 (전체 크기 새 창) ─────────
function buildTeamDashboardBody(){
  const members = Object.values(PERSON);
  const teamTotal = currentTasksCache.length;
  const teamDone  = currentTasksCache.filter(t => t['완료']).length;
  const teamPct   = teamTotal ? Math.round(teamDone/teamTotal*100) : 0;

  let html = `
    <div class="dash-summary">
      <div class="dash-sum-row">
        <span class="dash-sum-label">팀 전체 완료율</span>
        <span class="dash-sum-pct">${teamPct}%</span>
      </div>
      <div class="mem-progress-track"><div class="mem-progress-fill${teamTotal&&teamDone===teamTotal?' full':''}" style="width:${teamPct}%"></div></div>
    </div>
    <div class="dash-members-grid">`;

  // 연구원별 상세(완료율·요약 + 프로젝트별 담당 업무 목록) — 개인 리포트 재사용
  members.forEach(p => {
    const rep = buildMemberReport(p.full);
    if(!rep) return;
    html += `<section class="dash-member">${rep.body}</section>`;
  });
  html += `</div>`;
  return { html, teamTotal, teamDone, teamPct };
}

function openTeamDashboard(){
  const r = buildTeamDashboardBody();
  const w = window.open('', '_blank');   // 크기 미지정 → 전체 크기 새 탭
  if(!w){ showToast('팝업이 차단됐어요 — 브라우저에서 팝업 허용 후 다시 시도', true); return; }
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  w.document.write(`<!doctype html><html lang="ko"${dark?' data-theme="dark"':''}><head><meta charset="utf-8"/>`
    + `<meta name="viewport" content="width=device-width,initial-scale=1"/>`
    + `<base href="${document.baseURI}"/><title>전체 인원 업무 현황 · FOX AI</title>`
    + `<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>`
    + `<link rel="stylesheet" href="styles.css"/>`
    + `<style>body{background:var(--bg);color:var(--text);margin:0;padding:34px 24px;} .dash-page{max-width:1180px;margin:0 auto;} .dash-page-title{font-size:22px;font-weight:800;margin:0 0 4px;} .dash-page-sub{font-size:13px;color:var(--sub);margin:0 0 22px;}</style>`
    + `</head><body><div class="dash-page"><div class="dash-page-title">전체 인원 업무 현황</div>`
    + `<div class="dash-page-sub">전체 업무 ${r.teamTotal}건 · 완료 ${r.teamDone}건 · 완료율 ${r.teamPct}%</div>`
    + `${r.html}</div></body></html>`);
  w.document.close();
}

function renderVal(val){
  const s=String(val||'').trim();
  if(!s) return `<span style="color:var(--faint)">—</span>`;
  if(s==='공휴일') return `<span class="s-공휴일">공휴일</span>`;
  if(s==='휴무')   return `<span class="s-휴무">휴무</span>`;
  if(s==='연차')   return `<span class="s-연차">연차</span>`;
  if(s.includes('반차')) return `<span class="s-반차">${s}</span>`;
  if(/\d{1,2}:\d{2}/.test(s)) return `<span class="time-range">${s}</span>`;
  return `<span style="font-size:12px">${s}</span>`;
}

// 타임아웃 있는 fetch (GAS가 가끔 느려져 무한 대기하는 것 방지)
function fetchWithTimeout(url, ms){
  if(!('AbortController' in window)) return fetch(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

let _slowTimer = null;
async function loadData(force){
  // force=true: 명시적 갱신(저장/삭제 등) - 인디케이터 표시
  // force=false 또는 생략: 폴링 - 변경 있을 때만 다시 그림
  if(force) updatePollIndicator('updating');

  // 첫 로딩(데이터 없음)이 오래 걸리면 "느림" 안내
  const firstLoad = !lastDataHash;
  if(force && firstLoad){
    clearTimeout(_slowTimer);
    _slowTimer = setTimeout(() => {
      const el = document.getElementById('monthGrid');
      if(el && el.querySelector('.loading')) el.querySelector('.loading').textContent = '응답이 느려요 · 다시 시도 중...';
    }, 7000);
  }

  try{
    // 최대 2회 시도 (타임아웃 22초), 무거운 전체 GET 대비
    let res, lastErr;
    for(let attempt=0; attempt<2; attempt++){
      try{ res = await fetchWithTimeout(API_URL, 22000); break; }
      catch(e){ lastErr = e; if(attempt===0) await new Promise(r=>setTimeout(r,800)); }
    }
    if(!res) throw lastErr || new Error('네트워크 오류');
    const data = await res.json();
    clearTimeout(_slowTimer);
    MEMBERS_LIST = data.members || [];
    PERSON       = buildPerson(MEMBERS_LIST);
    if(data.v) lastServerVersion = data.v;  // 서버 버전 동기화

    const tasks         = data.tasks || [];
    const completedList = data.completedTasks || [];
    const recurringList = data.recurringTasks || [];
    const calendarList  = data.calendarEvents || [];
    const projectList   = data.projects || [];
    PROJECTS_LIST = projectList;
    const newHash       = hashTasks(tasks) + '|' + (data.workSchedule||[]).length + '|' + completedList.length + '|' + hashTasks(recurringList) + '|cal' + calendarList.length + calendarList.map(e=>e.row+e.start+e.end+e.title+e.type).join(',') + '|proj' + projectList.map(p=>p.row+'·'+(p['프로젝트명']||'')+'·'+(p['담당']||'')+'·'+(p['마감기한']||'')+'·'+(p['설명']||'')).join(',');

    // 폴링이고 변경 없으면 렌더 스킵
    if(!force && newHash === lastDataHash){
      updatePollIndicator(pollEnabled ? 'idle' : 'paused');
      return;
    }
    lastDataHash = newHash;

    currentTasksCache = tasks;
    CALENDAR_EVENTS = calendarList;
    LAST_WORK_SCHEDULE = data.workSchedule||[];
    renderMembersBar();
    buildCalendar(data.schedule||[]);
    buildTasks(tasks);
    buildRecurring(recurringList);
    buildCompleted(completedList);
    buildWork(data.workSchedule||[]);
    buildTodayHero(data.schedule||[], tasks, data.workSchedule||[]);
    renderMonthGrid();  // 인라인 캘린더 항상 렌더
    updatePollIndicator(pollEnabled ? 'idle' : 'paused');
  }catch(err){
    console.error(err);
    clearTimeout(_slowTimer);
    const slow = (err && err.name === 'AbortError');
    if(force){
      const msg = slow ? '서버 응답이 너무 느립니다 (일시적일 수 있어요)' : '데이터를 불러오지 못했습니다';
      const mg = document.getElementById('monthGrid');
      if(mg) mg.innerHTML =
        `<div class="loading" style="display:flex;flex-direction:column;gap:12px;align-items:center;">
          <span>${msg}</span>
          <button class="add-task-btn" onclick="loadData(true)" style="background:var(--accent);color:var(--accent-fg);">다시 시도</button>
        </div>`;
      if(lastDataHash===''){
        const lv=document.getElementById('leaveList');
        if(lv) lv.innerHTML='<div class="empty-state">연차계획을 불러오지 못했습니다.</div>';
      }
    }
    updatePollIndicator('error');
  }
}

let SCHEDULE_3WK = [];  // 3주 순환 담당표 데이터 (히어로 '오늘 담당' 계산용)

// v2: 3주 담당표 그리드는 제거. 데이터(SCHEDULE_3WK)와 오늘 배지만 갱신.
function buildCalendar(schedule){
  SCHEDULE_3WK = schedule || [];
  const today=midnight(new Date()),tMon=getMonday(today);
  const diff=Math.round((tMon-midnight(ANCHOR))/864e5);
  const wkIdx=((Math.floor(diff/7)%3)+3)%3;
  const tb=document.getElementById('todayBadge');
  if(tb) tb.textContent=`오늘 ${fmtFull(today)} · ${wkIdx+1}주차`;
}

// ── 담당표 칸 클릭 → 멤버 선택 팝오버 ──
let LAST_WORK_SCHEDULE = [];  // 히어로 갱신용 캐시

function openDutyPicker(ev, week, day){
  ev.stopPropagation();
  const cell = ev.currentTarget;
  const picker = document.getElementById('dutyPicker');
  if(!picker) return;
  const cur = String((SCHEDULE_3WK[week-1]||{})[day] || '').trim();

  picker.innerHTML =
    `<div class="duty-pick-title">${week}주차 ${day}요일 담당</div>` +
    `<div class="duty-pick-list">` +
    Object.values(PERSON).map(p => {
      const active = p.full === cur ? ' active' : '';
      const safe = p.full.replace(/'/g,'');
      return `<button class="duty-pick-chip${active}" onclick="setDuty(${week},'${day}','${safe}')"><span class="mini-av av-${p.cls}">${p.short}</span>${p.full}</button>`;
    }).join('') +
    `<button class="duty-pick-chip duty-pick-clear" onclick="setDuty(${week},'${day}','')">비우기</button>` +
    `</div>`;

  // 위치: 셀 아래, 화면 밖이면 보정
  picker.style.display='block';
  const r = cell.getBoundingClientRect();
  const pw = picker.offsetWidth, ph = picker.offsetHeight;
  let left = r.left;
  if(left + pw > window.innerWidth - 10) left = window.innerWidth - pw - 10;
  let top = r.bottom + 6;
  if(top + ph > window.innerHeight - 10) top = r.top - ph - 6;  // 아래 공간 없으면 위로
  picker.style.left = Math.max(10,left)+'px';
  picker.style.top  = Math.max(10,top)+'px';
}

function closeDutyPicker(){
  const picker = document.getElementById('dutyPicker');
  if(picker) picker.style.display='none';
}

async function setDuty(week, day, name){
  closeDutyPicker();
  // 낙관적 반영
  if(!SCHEDULE_3WK[week-1]) SCHEDULE_3WK[week-1] = {};
  SCHEDULE_3WK[week-1][day] = name;
  buildCalendar(SCHEDULE_3WK);
  buildTodayHero(SCHEDULE_3WK, currentTasksCache, LAST_WORK_SCHEDULE);
  showToast(name ? `✓ ${week}주차 ${day}요일 → ${name}` : `✓ ${week}주차 ${day}요일 비움`);

  try{
    const res = await fetch(`${API_URL}?action=setSchedule&week=${week}&day=${encodeURIComponent(day)}&name=${encodeURIComponent(name)}`);
    const json = await res.json();
    if(!json.ok) throw new Error(json.error||'error');
  }catch(err){
    showToast('⚠ 저장 실패 — 새로고침 후 확인', true);
    loadData(true).catch(()=>{});
  }
}

// ───────── 오늘 요약 히어로 ─────────
const HERO_ICONS = {
  duty:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
  deadline:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/></svg>',
  off:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"/></svg>',
  overdue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9.5 16.5h-19z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17.5" x2="12.01" y2="17.5"/></svg>',
};

function buildTodayHero(schedule, tasks, workSchedule){
  const hero = document.getElementById('todayHero');
  if(!hero) return;

  const today = midnight(new Date());
  const dow   = today.getDay();              // 0=일 ... 6=토

  // 날짜 + 주차
  const tMon  = getMonday(today);
  const diff  = Math.round((tMon - midnight(ANCHOR)) / 864e5);
  const wkIdx = ((Math.floor(diff/7) % 3) + 3) % 3;
  const wname = ['일','월','화','수','목','금','토'][dow];

  // 오늘 마감 (미완료) — 업무명 표시용 배열
  const dueToday = (tasks||[]).filter(t => {
    if(t['완료']) return false;
    const dl = parseDate(t['마감기한']);
    return dl && sameDay(dl, today);
  });

  // 누락 (기한 지난 미완료) — 이미 계산된 캐시 사용
  const overdue = overdueTasksCache.length;

  const deadlineHtml = dueToday.length
    ? `<div class="hero-deadline-list">${dueToday.map(t=>{
        const who = String(t['담당']||'').trim();
        return `<span class="hero-deadline-name">${t['업무']}${who?`<span class="hero-deadline-who">${who}</span>`:''}</span>`;
      }).join('')}</div>`
    : `<div class="hero-deadline-empty">오늘 마감 업무 없음</div>`;

  hero.innerHTML = `
    <div class="hero-date">
      <div class="hero-date-big">${today.getMonth()+1}월 ${today.getDate()}일 <span class="hero-dow">${wname}요일</span></div>
      <div class="hero-date-sub">AI 연구소 ${wkIdx+1}주차</div>
    </div>
    <div class="hero-deadline ${dueToday.length?'has':'none'}">
      <div class="hero-stat-label">오늘 마감</div>
      ${deadlineHtml}
    </div>
    <div class="hero-stats hero-stats-2">
      <div class="hero-stat ${overdue?'hero-stat-alert':''}" ${overdue?'onclick="openOverdueModal()" role="button" title="누락 업무 보기"':''}>
        <div class="hero-stat-icon">${HERO_ICONS.overdue}</div>
        <div class="hero-stat-body"><div class="hero-stat-label">누락 업무</div><div class="hero-stat-val ${overdue?'hero-danger':'hero-zero'}">${overdue}건</div></div>
      </div>
    </div>`;
}

// 업무들을 프로젝트별로 묶어 카드로 렌더 (프로젝트 = 안의 업무 전부 완료 시 자동 완료)
function buildTasks(tasks){
  const today=midnight(new Date());
  const now = Date.now();
  const root=document.getElementById('taskList');
  root.innerHTML='';

  // 누락(기한 지난 미완료) 캐시 + 배지
  overdueTasksCache = tasks.filter(t => {
    if(t['완료']) return false;
    const dl = parseDate(t['마감기한']);
    return dl && dl < today;
  });
  const btn = document.getElementById('overdueBtn');
  const cnt = document.getElementById('overdueCount');
  if(overdueTasksCache.length > 0){btn.style.display='flex';cnt.textContent=overdueTasksCache.length;}
  else{btn.style.display='none';}

  // 프로젝트별 그룹핑 (프로젝트명 없으면 '기타')
  const groups = {};
  tasks.forEach(t => {
    const key = String(t['프로젝트']||'').trim() || '기타';
    (groups[key] = groups[key] || []).push(t);
  });

  // 표시 순서: 등록된 프로젝트(시트 순) → 이름만 있는 프로젝트 → '기타' 맨 뒤
  const projByName = {};
  const order = [];
  PROJECTS_LIST.forEach(p => {
    const n = String(p['프로젝트명']||'').trim();
    if(!n) return;
    projByName[n] = p;
    if(order.indexOf(n) < 0) order.push(n);
  });
  Object.keys(groups).forEach(n => { if(n!=='기타' && order.indexOf(n)<0) order.push(n); });
  if(groups['기타'] && groups['기타'].length) order.push('기타');

  if(!order.length){
    root.innerHTML='<div class="empty-state">등록된 프로젝트가 없습니다. “프로젝트 추가”로 시작하세요.</div>';
    fireDeadlineNotifications(tasks);
    return;
  }

  const sortTasks = (list)=>list.sort((a,b)=>{
    if(a['완료']!==b['완료']) return a['완료']?1:-1;
    const da=parseDate(a['마감기한']), db=parseDate(b['마감기한']);
    if(da && db){ const diff=da-db; return diff!==0 ? diff : (a.row||0)-(b.row||0); }
    if(da) return -1;
    if(db) return 1;
    return (a.row||0)-(b.row||0);
  });

  const makeCard = (pname)=>{
    const meta  = projByName[pname];
    const isEtc = (pname === '기타');
    const list  = sortTasks((groups[pname]||[]).slice());
    const total = list.length;
    const doneCount = list.filter(t=>!!t['완료']).length;
    const allDone = total>0 && doneCount===total;
    const pct = total ? Math.round(doneCount/total*100) : 0;

    // 접힘 상태: 사용자가 지정한 게 있으면 그것, 없으면 완료 프로젝트는 기본 접힘
    const state = projCollapseState[pname] || (allDone ? 'closed' : 'open');
    const collapsed = state === 'closed';
    // 프로젝트별 고유 색 (이름 기반 → 항상 동일)
    const slot = projColorSlot(pname);

    // PM + 마감
    const pm  = meta ? String(meta['담당']||'').trim() : '';
    const pmP = PERSON[pm];
    const pmHtml = pm
      ? `<span class="project-pm"><span class="mini-av av-${pmP?pmP.cls:'kkh'}">${pmP?pmP.short:pm.slice(-2)}</span>${pm}</span>`
      : '';
    const pdl = meta ? parseDate(meta['마감기한']) : null;
    let pBadge='';
    if(!allDone && pdl){ const diff=Math.floor((pdl-today)/86400000); pBadge=buildCountdownBadge(diff); }
    const pdlHtml = pdl ? `<span class="project-deadline">~${fmtDeadline(pdl)}</span>` : '';

    const safePname = pname.replace(/'/g,'').replace(/\\/g,'');
    const addBtn = `<button class="project-add-btn" title="이 프로젝트에 업무 추가" onclick="event.stopPropagation();openTaskModal(undefined,null,'${safePname}')"><svg viewBox="0 0 12 12"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg>업무 추가</button>`;
    const editBtn = (meta && !isEtc)
      ? `<button class="task-action-btn" title="프로젝트 수정" onclick="event.stopPropagation();openProjectModal(${meta.row})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`
      : '';
    const chevron = `<span class="project-chevron"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="3,4.5 6,7.5 9,4.5"/></svg></span>`;

    const card=document.createElement('div');
    card.className='project-card'+(allDone?' project-done':'')+(collapsed?' project-collapsed':'');
    card.style.borderLeft = `4px solid var(--${slot})`;
    card.innerHTML=`
      <div class="project-head">
        <div class="project-head-main">
          <div class="project-title-row">
            ${chevron}
            <span class="project-dot" style="background:var(--${slot})"></span>
            <span class="project-name">${pname}</span>
            ${allDone?'<span class="project-badge-done">완료</span>':pBadge}
          </div>
          <div class="project-meta">
            ${pmHtml}
            ${pdlHtml}
            ${(meta&&meta['설명'])?`<span class="project-desc">${meta['설명']}</span>`:''}
          </div>
        </div>
        <div class="project-head-actions">${addBtn}${editBtn}</div>
      </div>
      <div class="project-progress">
        <div class="project-progress-track"><div class="project-progress-fill${allDone?' full':''}" style="width:${pct}%"></div></div>
        <span class="project-progress-text">${doneCount}/${total} 완료</span>
      </div>
      <div class="project-body"></div>`;

    const body = card.querySelector('.project-body');
    if(!total){
      body.innerHTML='<div class="project-empty">아직 등록된 업무가 없습니다.</div>';
    }else{
      list.forEach(task => body.appendChild(createTaskEl(task, today, now)));
    }

    // 헤더 클릭으로 펼치기/접기 (버튼 클릭은 제외) — 상태 저장
    card.querySelector('.project-head').addEventListener('click', (e)=>{
      if(e.target.closest('button')) return;
      const nowCollapsed = card.classList.toggle('project-collapsed');
      projCollapseState[pname] = nowCollapsed ? 'closed' : 'open';
      saveProjCollapse();
    });
    return card;
  };

  // 진행 중 vs 완료 분리 — 완료 프로젝트는 하단에 접어서 아카이브,
  // 완료 1시간 지난 프로젝트는 목록에서 자동 숨김 (시트에는 그대로 보존)
  const nowTs = Date.now();
  let nextHideAt = Infinity;
  const activeOrder = [], doneOrder = [];
  order.forEach(pname=>{
    const list = groups[pname]||[];
    const total = list.length;
    const dc = list.filter(t=>!!t['완료']).length;
    const allDone = total>0 && dc===total;
    if(allDone){
      const completedAt = Math.max(0, ...list.map(t=> t['완료시각']||0));
      if(completedAt && (nowTs - completedAt) >= PROJECT_HIDE_MS) return;  // 1시간 지남 → 숨김
      if(completedAt) nextHideAt = Math.min(nextHideAt, completedAt + PROJECT_HIDE_MS);
      doneOrder.push(pname);
    }else{
      activeOrder.push(pname);
    }
  });

  activeOrder.forEach(pname => root.appendChild(makeCard(pname)));

  if(doneOrder.length){
    const head = document.createElement('div');
    head.className='project-archive-head';
    head.innerHTML=`완료된 프로젝트 <span>${doneOrder.length}</span>`;
    root.appendChild(head);
    doneOrder.forEach(pname => root.appendChild(makeCard(pname)));
  }

  // 다음 자동 숨김 시점에 재렌더 예약 (그 시각이 되면 화면에서 사라지도록)
  if(projHideTimer){ clearTimeout(projHideTimer); projHideTimer = null; }
  if(nextHideAt !== Infinity){
    const delay = Math.max(1000, nextHideAt - Date.now());
    projHideTimer = setTimeout(()=> buildTasks(currentTasksCache), delay);
  }

  fireDeadlineNotifications(tasks);
}

// 개별 업무 아이템 DOM 생성 (프로젝트 카드 내부에 삽입)
function createTaskEl(task, today, now){
  const dl   = parseDate(task['마감기한']);
  const done = !!task['완료'];
  const row  = task['row'];
  const safeTaskName = (task['업무']||'').replace(/'/g,'').replace(/\\/g,'');
  const assignees = getAssigneeList(task);
  const isMulti = assignees.length > 1;
  const personal = parsePersonalComplete(task['개별완료']);
  const comments = parseComments(task['댓글']);
  const commentCount = comments.length;

  let state='', badge='';
  if(!done && dl){
    const diff = Math.floor((dl-today)/86400000);
    badge = buildCountdownBadge(diff);
    if(diff === 0)      state = 'urgent';
    else if(diff < 0)   state = 'overdue';
  }
  if(done) state='done';

  const el=document.createElement('div');
  el.className=`task-item ${state}`;
  el.dataset.row=row;

  const editBtnHtml=`<button class="task-action-btn" title="수정" onclick="event.stopPropagation();openTaskModal(${row})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`;
  const delBtnHtml=`<button class="task-action-btn btn-del" title="삭제" onclick="event.stopPropagation();deleteTaskRow(${row},'${safeTaskName}')"><svg viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6"/><path d="M19,6 l-1,14 a2,2 0 0 1 -2,2 H8 a2,2 0 0 1 -2,-2 L5,6"/><path d="M10 11v6M14 11v6"/></svg></button>`;
  const commentBtnHtml=`<button class="task-action-btn${commentCount>0?' has-comments':''}" title="댓글${commentCount>0?' ('+commentCount+')':''}" onclick="event.stopPropagation();openCommentModal(${row},'${safeTaskName}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${commentCount>0?`<span class="comment-badge">${commentCount}</span>`:''}</button>`;

  if(isMulti){
    const doneCount = assignees.filter(a=>isPersonDone(personal,a)).length;
    const allDone   = doneCount === assignees.length;
    if(allDone) el.classList.add('done');

    const personChecksHtml = assignees.map(name=>{
      const p = PERSON[name];
      const cls   = p ? p.cls  : 'kkh';
      const short = p ? p.short : (name.length>=2?name.slice(-2):name);
      const pd    = isPersonDone(personal, name);
      const safeName = name.replace(/'/g,'').replace(/"/g,'');
      return `<div class="person-check-row${pd?' done':''}" data-person="${name.replace(/"/g,'&quot;')}" onclick="event.stopPropagation();togglePersonalComplete(${row},'${safeName}',${pd})">
        <div class="person-check-box${pd?' checked':''}"><svg viewBox="0 0 12 12"><polyline points="1.5,6 4.5,9.5 10.5,2.5"/></svg></div>
        <span class="mini-av av-${cls}">${short}</span>
        <span class="person-check-name">${name}</span>
      </div>`;
    }).join('');

    el.innerHTML=`
      <div class="task-progress${allDone?' all-done':''}" title="${doneCount}/${assignees.length}명 완료">
        ${allDone?'<svg viewBox="0 0 12 12"><polyline points="1.5,6 4.5,9.5 10.5,2.5"/></svg>':`<span>${doneCount}<small>/${assignees.length}</small></span>`}
      </div>
      <div class="task-body">
        <div class="task-top">
          <div class="task-name">${task['업무']}${badge}</div>
          <div class="task-deadline">${dl?fmtDeadline(dl):'-'}</div>
        </div>
        <div class="task-person-checks">${personChecksHtml}</div>
        ${task['세부사항']?`<div class="task-desc">${task['세부사항']}</div>`:''}
      </div>
      <div class="task-actions">${commentBtnHtml}${editBtnHtml}${delBtnHtml}</div>`;
  }else{
    el.innerHTML=`
      <div class="task-check ${done?'checked':''}" title="완료 토글">
        <svg viewBox="0 0 12 12"><polyline points="1.5,6 4.5,9.5 10.5,2.5"/></svg>
      </div>
      <div class="task-body">
        <div class="task-top">
          <div class="task-name">${task['업무']}${badge}</div>
          <div class="task-deadline">${dl?fmtDeadline(dl):'-'}</div>
        </div>
        <div class="task-manager">담당 · ${task['담당']||'-'}</div>
        ${task['세부사항']?`<div class="task-desc">${task['세부사항']}</div>`:''}
      </div>
      <div class="task-actions">${commentBtnHtml}${editBtnHtml}${delBtnHtml}</div>`;

    const checkEl = el.querySelector('.task-check');
    checkEl.onclick = () => toggleTask(checkEl, el, row, done);
  }

  return el;
}

function fmtDeadline(d){
  if(!d) return '-';
  const h=d.getHours(), m=d.getMinutes();
  const base=fmt(d);
  if(h===0 && m===0) return base;
  const ampm=h<12?'오전':'오후';
  const h12=(h%12)||12;
  const mm=m>0?`:${String(m).padStart(2,'0')}`:''
  return `${base} ${ampm} ${h12}${mm}시`;
}

function buildCountdownBadge(diff){
  if(diff < 0)       return `<span class="dcount-badge dcount-overdue">${Math.abs(diff)}일 지남</span>`;
  if(diff === 0)     return `<span class="dcount-badge dcount-today">TODAY</span>`;
  if(diff === 1)     return `<span class="dcount-badge dcount-warn">D-1</span>`;
  if(diff === 2)     return `<span class="dcount-badge dcount-warn">D-2</span>`;
  if(diff <= 4)      return `<span class="dcount-badge dcount-soon">D-${diff}</span>`;
  if(diff <= 7)      return `<span class="dcount-badge dcount-week">D-${diff}</span>`;
  return                    `<span class="dcount-badge dcount-far">D-${diff}</span>`;
}

async function toggleTask(checkEl, itemEl, row, currentDone){
  checkEl.classList.add('loading-spin');
  checkEl.style.pointerEvents='none';
  const newValue = !currentDone;
  try{
    const res  = await fetch(`${API_URL}?action=setComplete&row=${row}&value=${newValue}`);
    const json = await res.json();
    if(!json.ok) throw new Error('error');

    const taskIdx = currentTasksCache.findIndex(t => t.row === row);
    if(taskIdx >= 0){
      currentTasksCache[taskIdx]['완료'] = newValue;
      currentTasksCache[taskIdx]['완료시각'] = newValue ? Date.now() : null;
    }

    checkEl.classList.remove('loading-spin');
    checkEl.style.pointerEvents='';

    // 프로젝트 진행률·자동완료 상태 갱신 위해 전체 재렌더
    buildTasks(currentTasksCache);
    showToast(newValue?'✓ 완료 처리':'↩ 완료 취소');
  }catch(err){
    console.error(err);
    checkEl.classList.remove('loading-spin');
    checkEl.style.pointerEvents='';
    showToast('⚠ 시트 반영 실패 — Apps Script 재배포 확인', true);
  }
}

function openOverdueModal(){
  const today = midnight(new Date());
  document.getElementById('overdueModalBody').innerHTML = overdueTasksCache.map(task=>{
    const dl = parseDate(task['마감기한']);
    const daysAgo = dl ? Math.abs(Math.floor((dl-today)/86400000)) : 0;
    return `<div class="modal-task">
      <div class="modal-task-top">
        <div class="modal-task-name">${task['업무']}</div>
        <div class="modal-days-ago">${daysAgo}일 초과</div>
      </div>
      <div class="modal-task-meta">담당 · <strong>${task['담당']}</strong> &nbsp;·&nbsp; 기한 ${task['마감기한']}</div>
      ${task['세부사항']?`<div class="modal-task-desc">${task['세부사항']}</div>`:''}
    </div>`;
  }).join('');
  document.getElementById('overdueOverlay').classList.add('show');
  document.getElementById('overdueModal').classList.add('show');
}
function closeOverdueModal(){
  document.getElementById('overdueOverlay').classList.remove('show');
  document.getElementById('overdueModal').classList.remove('show');
}

// ── 설정 모달 ──
let editingMemberIdx = -1;

function openSettings(){
  editingMemberIdx = -1;
  renderSettings();
  document.getElementById('settingsOverlay').classList.add('show');
  document.getElementById('settingsModal').classList.add('show');
}

async function closeSettings(){
  document.getElementById('settingsOverlay').classList.remove('show');
  document.getElementById('settingsModal').classList.remove('show');
  // 이름 변경이 있었던 경우에만 전체 새로고침
  if(pendingReload){
    pendingReload = false;
    await loadData();
  }
}

function renderSettings(){
  const body = document.getElementById('settingsBody');
  const usedColors = MEMBERS_LIST.map(m=>String(m['색상']||'').trim());

  let html = `<div class="settings-section">
    <div class="settings-section-label">멤버 관리 (${MEMBERS_LIST.length}명)</div>`;

  MEMBERS_LIST.forEach((m, idx) => {
    const cls = String(m['색상']||'ysh').trim();
    const name = String(m['이름']||'').trim();
    const role = String(m['역할']||'').trim();
    const short = name.length>=2 ? name.slice(-2) : name;

    if(editingMemberIdx === idx){
      html += `<div class="member-edit">
        <div class="field">
          <label class="field-label">이름</label>
          <input class="field-input" id="editName" value="${name}" maxlength="8"/>
        </div>
        <div class="field">
          <label class="field-label">역할</label>
          <input class="field-input" id="editRole" value="${role}" maxlength="10"/>
        </div>
        <div class="field">
          <label class="field-label">색상</label>
          <div class="color-grid" id="editColorGrid">
            ${COLOR_SLOTS.map(c => `
              <div class="color-swatch cs-${c.key} ${c.key===cls?'selected':''}"
                   data-color="${c.key}" title="${c.name}"
                   onclick="selectColor('${c.key}')"></div>`).join('')}
          </div>
        </div>
        <div class="form-actions">
          <button class="btn-secondary" onclick="cancelEdit()">취소</button>
          <button class="btn-primary" id="saveBtn" onclick="saveMemberEdit(${idx},'${name}')">저장</button>
        </div>
      </div>`;
    } else {
      html += `<div class="member-row">
        <div class="av av-${cls}">${short}</div>
        <div class="member-row-info">
          <div class="member-row-name">${name}</div>
          <div class="member-row-role">${role || '—'}</div>
        </div>
        <div class="member-row-actions">
          <button class="btn-icon" title="수정" onclick="startEdit(${idx})">
            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon btn-del" title="삭제" onclick="deleteMember(${idx},'${name}')">
            <svg viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6"/><path d="M19,6 l-1,14 a2,2 0 0 1 -2,2 H8 a2,2 0 0 1 -2,-2 L5,6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>`;
    }
  });

  if(editingMemberIdx === -2){
    const availColor = COLOR_SLOTS.find(c => !usedColors.includes(c.key))?.key || 'ysh';
    html += `<div class="member-edit">
      <div class="field">
        <label class="field-label">이름</label>
        <input class="field-input" id="editName" placeholder="이름 입력" maxlength="8"/>
      </div>
      <div class="field">
        <label class="field-label">역할</label>
        <input class="field-input" id="editRole" placeholder="역할 (예: 연구원)" maxlength="10"/>
      </div>
      <div class="field">
        <label class="field-label">색상</label>
        <div class="color-grid" id="editColorGrid">
          ${COLOR_SLOTS.map(c => `
            <div class="color-swatch cs-${c.key} ${c.key===availColor?'selected':''}"
                 data-color="${c.key}" title="${c.name}"
                 onclick="selectColor('${c.key}')"></div>`).join('')}
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-secondary" onclick="cancelEdit()">취소</button>
        <button class="btn-primary" id="saveBtn" onclick="saveMemberAdd()">추가</button>
      </div>
    </div>`;
  } else {
    html += `<button class="btn-add-member" onclick="startAdd()">
      <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      멤버 추가
    </button>`;
  }

  html += `</div>`;

  body.innerHTML = html;
}

function startEdit(idx){editingMemberIdx=idx;renderSettings();}
function startAdd(){editingMemberIdx=-2;renderSettings();}
function cancelEdit(){editingMemberIdx=-1;renderSettings();}

function selectColor(key){
  document.querySelectorAll('#editColorGrid .color-swatch').forEach(el=>{
    el.classList.toggle('selected', el.dataset.color===key);
  });
}

function getSelectedColor(){
  const sel = document.querySelector('#editColorGrid .color-swatch.selected');
  return sel ? sel.dataset.color : 'ysh';
}

function setSaveBtnLoading(loading){
  const btn = document.getElementById('saveBtn');
  if(!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? '저장 중...' : btn.textContent;
}

async function saveMemberAdd(){
  const name  = document.getElementById('editName').value.trim();
  const role  = document.getElementById('editRole').value.trim();
  const color = getSelectedColor();
  if(!name){showToast('이름을 입력해주세요', true); return;}

  const btn = document.getElementById('saveBtn');
  btn.disabled = true; btn.textContent = '추가 중...';

  try{
    const res = await fetch(`${API_URL}?action=addMember&name=${encodeURIComponent(name)}&role=${encodeURIComponent(role)}&color=${color}`);
    const json = await res.json();
    if(!json.ok) throw new Error(json.error||'error');

    // 로컬 상태만 즉시 업데이트 (loadData 호출 안 함)
    MEMBERS_LIST.push({'이름':name,'역할':role,'색상':color});
    PERSON = buildPerson(MEMBERS_LIST);
    renderMembersBar();

    editingMemberIdx = -1;
    renderSettings();
    showToast('✓ 멤버가 추가되었습니다');
  }catch(err){
    btn.disabled = false; btn.textContent = '추가';
    showToast('⚠ 추가 실패: '+err.message, true);
  }
}

async function saveMemberEdit(idx, originalName){
  const name  = document.getElementById('editName').value.trim();
  const role  = document.getElementById('editRole').value.trim();
  const color = getSelectedColor();
  if(!name){showToast('이름을 입력해주세요', true); return;}

  const btn = document.getElementById('saveBtn');
  btn.disabled = true; btn.textContent = '저장 중...';

  try{
    const res = await fetch(`${API_URL}?action=updateMember&original=${encodeURIComponent(originalName)}&name=${encodeURIComponent(name)}&role=${encodeURIComponent(role)}&color=${color}`);
    const json = await res.json();
    if(!json.ok) throw new Error(json.error||'error');

    // 로컬 상태만 즉시 업데이트
    MEMBERS_LIST[idx] = {'이름':name,'역할':role,'색상':color};
    PERSON = buildPerson(MEMBERS_LIST);
    renderMembersBar();

    // 이름이 바뀌었을 때만 모달 닫을 때 전체 새로고침 예약
    if(originalName !== name) pendingReload = true;

    editingMemberIdx = -1;
    renderSettings();
    showToast('✓ 저장되었습니다');
  }catch(err){
    btn.disabled = false; btn.textContent = '저장';
    showToast('⚠ 저장 실패: '+err.message, true);
  }
}

async function deleteMember(idx, name){
  if(!confirm(`${name}님을 멤버에서 제외하시겠습니까?\n시트의 다른 데이터(담당표, 근무일정)는 그대로 유지됩니다.`)) return;

  try{
    const res = await fetch(`${API_URL}?action=deleteMember&name=${encodeURIComponent(name)}`);
    const json = await res.json();
    if(!json.ok) throw new Error(json.error||'error');

    // 로컬 상태만 즉시 업데이트
    MEMBERS_LIST.splice(idx, 1);
    PERSON = buildPerson(MEMBERS_LIST);
    renderMembersBar();

    renderSettings();
    showToast('✓ 멤버가 제외되었습니다');
  }catch(err){
    showToast('⚠ 삭제 실패: '+err.message, true);
  }
}

document.addEventListener('keydown', e=>{
  if(e.key==='Escape'){closeOverdueModal();closeSettings();closeTaskModal();closeCommentModal();closeEventEditor();closeCalendarModal();closeDutyPicker();closeMemberModal();closeProjectModal();}
  // 단축키: N → 업무 추가 (입력 필드 포커스 중이면 무시)
  if(e.key==='n' || e.key==='N'){
    const t = e.target;
    if(t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT')) return;
    if(document.querySelector('.modal.show')) return;
    openTaskModal();
  }
});

// 탭이 다시 보일 때 해시 체크 (5분 이상 백그라운드였다면)
let lastVisibleTs = Date.now();
document.addEventListener('visibilitychange', () => {
  if(!document.hidden){
    const elapsed = Date.now() - lastVisibleTs;
    if(elapsed > 5*60*1000 && pollEnabled) checkVersionAndLoad();
    lastVisibleTs = Date.now();
  } else {
    lastVisibleTs = Date.now();
  }
});

function showToast(msg, isError=false){
  let t=document.getElementById('_toast');
  if(!t){
    t=document.createElement('div');t.id='_toast';
    t.style.cssText='position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(20px);background:#1c1c1e;color:#fff;font-size:13px;font-weight:600;font-family:\'Noto Sans KR\',sans-serif;padding:11px 22px;border-radius:999px;box-shadow:0 8px 28px rgba(0,0,0,.2);opacity:0;transition:opacity .25s,transform .25s;z-index:999;white-space:nowrap;pointer-events:none;';
    document.body.appendChild(t);
  }
  t.textContent=msg;
  t.style.background=isError?'#b91c1c':'#1c1c1e';
  t.style.opacity='1';t.style.transform='translateX(-50%) translateY(0)';
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(-50%) translateY(20px)';},2500);
}

// ───────── 업무 CRUD 모달 ─────────
let editingTaskRow = null;     // null = 추가 모드, 숫자 = 수정 모드
let taskModalMode  = 'add';    // 'add' | 'edit' | 'completed-add'
let taskModalProject = '';     // 업무가 속한 프로젝트명 (추가 시 프리셋, 수정 시 유지)
let currentTasksCache = [];    // 수정 시 기존 값을 찾기 위한 캐시
let selectedAssignees = new Set();  // 담당자 다중 선택 상태

// ── 담당자 picker ──
function renderAssigneePicker(){
  const root = document.getElementById('taskAssignee');
  if(!root) return;
  let html = '';

  // 전원 옵션
  const isAll = selectedAssignees.has('AI 연구원');
  html += `<button type="button" class="pick-chip ${isAll?'active':''}" onclick="toggleAssignee('AI 연구원')">AI 연구원 (전원)</button>`;

  // 구분선
  html += `<span class="pick-divider"></span>`;

  // 개별 멤버
  Object.values(PERSON).forEach(p => {
    const active = selectedAssignees.has(p.full);
    const safeName = p.full.replace(/'/g,'').replace(/"/g,'');
    html += `<button type="button" class="pick-chip ${active?'active':''}" onclick="toggleAssignee('${safeName}')">
      <span class="mini-av av-${p.cls}">${p.short}</span>${p.full}
    </button>`;
  });

  // PERSON에 없는 이름이 선택돼 있으면 (옛 데이터 등) 추가 표시
  selectedAssignees.forEach(name => {
    if(name === 'AI 연구원' || PERSON[name]) return;
    const safeName = name.replace(/'/g,'').replace(/"/g,'');
    html += `<button type="button" class="pick-chip active" onclick="toggleAssignee('${safeName}')">${name}</button>`;
  });

  root.innerHTML = html;
}

function toggleAssignee(name){
  if(name === 'AI 연구원'){
    if(selectedAssignees.has('AI 연구원')){
      selectedAssignees.delete('AI 연구원');
    } else {
      selectedAssignees.clear();
      selectedAssignees.add('AI 연구원');
    }
  } else {
    selectedAssignees.delete('AI 연구원'); // 개인 선택 시 전원 해제
    if(selectedAssignees.has(name)) selectedAssignees.delete(name);
    else selectedAssignees.add(name);
  }
  renderAssigneePicker();
}

function getAssigneeValue(){
  return Array.from(selectedAssignees).join(',');
}

function setAssigneeFromString(s){
  selectedAssignees = new Set();
  if(s){
    String(s).split(',').map(x => x.trim()).filter(Boolean).forEach(name => selectedAssignees.add(name));
  }
  renderAssigneePicker();
}

function openTaskModal(rowOrMode, extra, project){
  // rowOrMode: 'completed' | 'recurring' | 숫자(편집) | undefined(추가)
  // extra: 편집 모드일 때 'recurring' 이면 반복 업무 편집
  // project: 추가 모드에서 소속 프로젝트명 프리셋
  taskModalProject = project || '';
  if(rowOrMode === 'completed'){
    taskModalMode  = 'completed-add';
    editingTaskRow = null;
  } else if(rowOrMode === 'recurring'){
    taskModalMode  = 'recurring-add';
    editingTaskRow = null;
  } else if(typeof rowOrMode === 'number'){
    taskModalMode  = (extra === 'recurring') ? 'recurring-edit' : 'edit';
    editingTaskRow = rowOrMode;
  } else {
    taskModalMode  = 'add';
    editingTaskRow = null;
  }

  const completedField = document.getElementById('taskCompletedField');
  const completedInput = document.getElementById('taskCompletedAt');
  const subEl          = document.getElementById('taskModalSub');
  const assigneeField  = document.getElementById('assigneeField');
  const deadlineField  = document.getElementById('deadlineField');
  const recurringDaysField = document.getElementById('recurringDaysField');

  // 반복 업무 모드면 담당/마감 숨기고 요일 입력 표시
  const isRecurring = (taskModalMode === 'recurring-add' || taskModalMode === 'recurring-edit');
  assigneeField.style.display      = isRecurring ? 'none'  : 'block';
  deadlineField.style.display      = isRecurring ? 'none'  : 'block';
  recurringDaysField.style.display = isRecurring ? 'block' : 'none';

  if(taskModalMode === 'edit'){
    const t = currentTasksCache.find(x => x.row === editingTaskRow);
    taskModalProject = t ? (t['프로젝트']||'') : '';
    document.getElementById('taskModalTitle').textContent = '업무 수정';
    subEl.textContent = taskModalProject ? `프로젝트 “${taskModalProject}”의 업무` : "시트 '담당표' 탭에 저장됩니다";
    document.getElementById('taskName').value     = t ? (t['업무']||'') : '';
    setAssigneeFromString(t ? (t['담당']||'') : '');
    document.getElementById('taskDeadline').value = t ? toDateInputValue(t['마감기한']) : '';
    document.getElementById('taskDetail').value   = t ? (t['세부사항']||'') : '';
    document.getElementById('taskDeleteBtn').style.display = 'inline-flex';
    completedField.style.display = 'none';
  } else if(taskModalMode === 'recurring-edit'){
    const t = RECURRING_TASKS.find(x => x.row === editingTaskRow);
    document.getElementById('taskModalTitle').textContent = '반복 업무 수정';
    subEl.textContent = "시트 '반복 업무' 탭에 저장됩니다";
    document.getElementById('taskName').value      = t ? (t['업무']||'') : '';
    document.getElementById('recDay-mon').value    = t ? (t['월']||'') : '';
    document.getElementById('recDay-tue').value    = t ? (t['화']||'') : '';
    document.getElementById('recDay-wed').value    = t ? (t['수']||'') : '';
    document.getElementById('recDay-thu').value    = t ? (t['목']||'') : '';
    document.getElementById('recDay-fri').value    = t ? (t['금']||'') : '';
    document.getElementById('recDay-sat').value    = t ? (t['토']||'') : '';
    document.getElementById('taskDetail').value    = t ? (t['세부사항']||'') : '';
    document.getElementById('taskDeleteBtn').style.display = 'inline-flex';
    completedField.style.display = 'none';
  } else if(taskModalMode === 'recurring-add'){
    document.getElementById('taskModalTitle').textContent = '반복 업무 추가';
    subEl.textContent = "시트 '반복 업무' 탭에 저장됩니다";
    document.getElementById('taskName').value      = '';
    ['mon','tue','wed','thu','fri','sat'].forEach(d => {
      document.getElementById('recDay-'+d).value = '';
    });
    document.getElementById('taskDetail').value    = '';
    document.getElementById('taskDeleteBtn').style.display = 'none';
    completedField.style.display = 'none';
  } else if(taskModalMode === 'completed-add'){
    document.getElementById('taskModalTitle').textContent = '완료 업무 추가';
    subEl.textContent = "이미 완료한 업무를 시트 '완료 업무' 탭에 직접 추가합니다";
    document.getElementById('taskName').value     = '';
    setAssigneeFromString('');
    document.getElementById('taskDeadline').value = '';
    document.getElementById('taskDetail').value   = '';
    document.getElementById('taskDeleteBtn').style.display = 'none';
    completedField.style.display = 'block';
    // 기본값 = 지금
    const now = new Date();
    const off = now.getTimezoneOffset();
    const local = new Date(now.getTime() - off*60*1000);
    completedInput.value = local.toISOString().slice(0,16);
  } else {
    document.getElementById('taskModalTitle').textContent = '업무 추가';
    subEl.textContent = taskModalProject ? `프로젝트 “${taskModalProject}”에 업무 추가` : "시트 '담당표' 탭 8행 이하에 저장됩니다";
    document.getElementById('taskName').value     = '';
    setAssigneeFromString('');
    document.getElementById('taskDeadline').value = '';
    document.getElementById('taskDetail').value   = '';
    document.getElementById('taskDeleteBtn').style.display = 'none';
    completedField.style.display = 'none';
  }

  document.getElementById('taskOverlay').classList.add('show');
  document.getElementById('taskModal').classList.add('show');
  setTimeout(() => document.getElementById('taskName').focus(), 100);

  // 🔥 사용자가 모달 채우는 동안 GAS 워밍업 (저장 시 콜드 스타트 회피)
  fetch(`${API_URL}?action=getHash`).catch(()=>{});
}

function closeTaskModal(){
  document.getElementById('taskOverlay').classList.remove('show');
  document.getElementById('taskModal').classList.remove('show');
  editingTaskRow = null;
}

// ───────── 프로젝트 모달 ─────────
let editingProjectRow = null;   // null = 추가, 숫자 = 수정
let selectedProjectPM = '';     // 선택된 담당(PM) 이름

function renderProjectPMPicker(){
  const box = document.getElementById('projectPMPicker');
  if(!box) return;
  let html = '';
  Object.values(PERSON).forEach(p => {
    const active = p.full === selectedProjectPM ? 'active' : '';
    const safe = p.full.replace(/'/g,'').replace(/"/g,'');
    html += `<button type="button" class="pick-chip ${active}" onclick="pickProjectPM('${safe}')"><span class="mini-av av-${p.cls}">${p.short}</span>${p.full}</button>`;
  });
  html += `<button type="button" class="pick-chip ${selectedProjectPM?'':'active'}" onclick="pickProjectPM('')">없음</button>`;
  box.innerHTML = html;
}
function pickProjectPM(name){
  selectedProjectPM = name || '';
  renderProjectPMPicker();
}

function openProjectModal(row){
  editingProjectRow = (typeof row === 'number') ? row : null;
  const isEdit = editingProjectRow !== null;
  const p = isEdit ? PROJECTS_LIST.find(x=>x.row===editingProjectRow) : null;

  document.getElementById('projectModalTitle').textContent = isEdit ? '프로젝트 수정' : '프로젝트 추가';
  document.getElementById('projectName').value     = p ? (p['프로젝트명']||'') : '';
  document.getElementById('projectDeadline').value = p ? toDateInputValue(p['마감기한']).slice(0,10) : '';
  document.getElementById('projectDetail').value   = p ? (p['설명']||'') : '';
  selectedProjectPM = p ? (p['담당']||'') : '';
  renderProjectPMPicker();
  document.getElementById('projectDeleteBtn').style.display = isEdit ? 'inline-flex' : 'none';

  document.getElementById('projectOverlay').classList.add('show');
  document.getElementById('projectModal').classList.add('show');
  setTimeout(()=>document.getElementById('projectName').focus(), 100);
  fetch(`${API_URL}?action=getHash`).catch(()=>{});
}
function closeProjectModal(){
  document.getElementById('projectOverlay').classList.remove('show');
  document.getElementById('projectModal').classList.remove('show');
  editingProjectRow = null;
}

async function saveProject(){
  const name     = document.getElementById('projectName').value.trim();
  const manager  = selectedProjectPM || '';
  const deadline = document.getElementById('projectDeadline').value.trim();
  const detail   = document.getElementById('projectDetail').value.trim();
  if(!name){ showToast('프로젝트명을 입력해주세요', true); return; }

  const btn = document.getElementById('projectSaveBtn');
  btn.disabled = true; const orig = btn.textContent; btn.textContent = '저장 중...';
  const isEdit  = editingProjectRow !== null;
  const eRow    = editingProjectRow;
  const oldName = isEdit ? String((PROJECTS_LIST.find(x=>x.row===eRow)||{})['프로젝트명']||'') : '';
  closeProjectModal();

  try{
    const params = new URLSearchParams({ action: isEdit?'updateProject':'addProject', name, manager, deadline, detail });
    if(isEdit) params.set('row', eRow);
    const res  = await fetch(`${API_URL}?${params.toString()}`);
    const json = await res.json();
    if(!json.ok) throw new Error(json.error||'error');

    if(isEdit){
      const idx = PROJECTS_LIST.findIndex(x=>x.row===eRow);
      if(idx>=0) PROJECTS_LIST[idx] = { ...PROJECTS_LIST[idx], 프로젝트명:name, 담당:manager, 마감기한:deadlineToShort(deadline), 설명:detail };
      if(oldName && oldName!==name){
        currentTasksCache = currentTasksCache.map(t => (String(t['프로젝트']||'').trim()===oldName.trim()) ? {...t, 프로젝트:name} : t);
      }
    }else{
      PROJECTS_LIST.push({ row: json.row, 프로젝트명:name, 담당:manager, 마감기한:deadlineToShort(deadline), 설명:detail });
    }
    buildTasks(currentTasksCache);
    showToast(isEdit?'✓ 프로젝트가 수정되었습니다':'✓ 프로젝트가 추가되었습니다');
  }catch(err){
    showToast('⚠ 저장 실패: '+err.message+' (새로고침 후 확인)', true);
    loadData(true).catch(()=>{});
  }finally{
    btn.disabled = false; btn.textContent = orig;
  }
}

async function deleteCurrentProject(){
  if(editingProjectRow === null) return;
  const eRow = editingProjectRow;
  const p = PROJECTS_LIST.find(x=>x.row===eRow);
  const pname = p ? String(p['프로젝트명']||'') : '';
  if(!confirm(`프로젝트 “${pname}”을(를) 삭제할까요?\n안의 업무는 삭제되지 않고 '기타'로 이동합니다.`)) return;
  closeProjectModal();
  try{
    const res  = await fetch(`${API_URL}?action=deleteProject&row=${eRow}`);
    const json = await res.json();
    if(!json.ok) throw new Error(json.error||'error');
    PROJECTS_LIST = PROJECTS_LIST.filter(x=>x.row!==eRow).map(x=> x.row>eRow ? {...x, row:x.row-1} : x);
    currentTasksCache = currentTasksCache.map(t => (String(t['프로젝트']||'').trim()===pname.trim()) ? {...t, 프로젝트:''} : t);
    buildTasks(currentTasksCache);
    showToast('✓ 프로젝트가 삭제되었습니다');
  }catch(err){
    showToast('⚠ 삭제 실패 — 새로고침 후 확인', true);
    loadData(true).catch(()=>{});
  }
}

function toDateInputValue(v){
  const d = parseDate(v);
  if(!d) return '';
  const y  = d.getFullYear();
  const mo = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  const h  = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  return `${y}-${mo}-${dd}T${h}:${mi}`;
}

// "yyyy-MM-ddTHH:mm" → "M/d HH:mm" (GAS fmtDate 출력 형식과 맞춤)
function deadlineToShort(v){
  if(!v) return '';
  const s = String(v);
  const tIdx = s.indexOf('T');
  const datePart = tIdx >= 0 ? s.slice(0, tIdx) : s;
  const timePart = tIdx >= 0 ? s.slice(tIdx+1) : '';
  const dp = datePart.split('-');
  if(dp.length !== 3) return v;
  const base = `${parseInt(dp[1])}/${parseInt(dp[2])}`;
  if(timePart && timePart !== '00:00') return `${base} ${timePart}`;
  return base;
}

async function saveTask(){
  const name        = document.getElementById('taskName').value.trim();
  const assignee    = getAssigneeValue();
  const deadline    = document.getElementById('taskDeadline').value.trim();
  const detail      = document.getElementById('taskDetail').value.trim();
  const completedAt = document.getElementById('taskCompletedAt').value.trim();

  if(!name){ showToast('업무명을 입력해주세요', true); return; }
  if(taskModalMode === 'completed-add' && !completedAt){
    showToast('완료시각을 입력해주세요', true); return;
  }

  const btn = document.getElementById('taskSaveBtn');
  btn.disabled = true;
  const origText = btn.textContent;
  btn.textContent = '저장 중...';

  // 모달 닫고 진행 — 사용자는 빠르게 반응한다고 느낌
  const mode  = taskModalMode;
  const eRow  = editingTaskRow;
  closeTaskModal();

  try{
    // 반복 업무는 요일별 입력
    const isRecurring = (mode === 'recurring-add' || mode === 'recurring-edit');
    const recDays = isRecurring ? {
      mon: document.getElementById('recDay-mon').value.trim(),
      tue: document.getElementById('recDay-tue').value.trim(),
      wed: document.getElementById('recDay-wed').value.trim(),
      thu: document.getElementById('recDay-thu').value.trim(),
      fri: document.getElementById('recDay-fri').value.trim(),
      sat: document.getElementById('recDay-sat').value.trim(),
    } : null;

    let action;
    if(mode === 'completed-add')      action = 'addCompletedTask';
    else if(mode === 'recurring-add') action = 'addRecurringTask';
    else if(mode === 'recurring-edit')action = 'updateRecurringTask';
    else if(eRow)                     action = 'updateTask';
    else                              action = 'addTask';

    const params = new URLSearchParams({ action, name, detail });
    if(!isRecurring){
      params.set('assignee', assignee);
      params.set('deadline', deadline);
    }
    if(action === 'addTask' || action === 'updateTask'){
      params.set('project', taskModalProject || '');
    }
    if(isRecurring){
      Object.entries(recDays).forEach(([k,v]) => params.set(k, v));
    }
    if(eRow) params.set('row', eRow);
    if(mode === 'completed-add') params.set('completedAt', completedAt);

    const res  = await fetch(`${API_URL}?${params.toString()}`);
    const json = await res.json();
    if(!json.ok) throw new Error(json.error || 'error');

    // 🚀 낙관적 UI 업데이트 — 전체 새로고침 없이 로컬 상태만 갱신
    if(mode === 'completed-add'){
      const ts = new Date(completedAt).getTime();
      COMPLETED_TASKS.unshift({
        업무: name, 담당: assignee,
        마감기한: deadlineToShort(deadline),
        세부사항: detail, 완료시각: ts,
      });
      buildCompleted(COMPLETED_TASKS);
    } else if(mode === 'recurring-add'){
      RECURRING_TASKS.push({
        row: json.row,
        업무: name,
        월: recDays.mon, 화: recDays.tue, 수: recDays.wed,
        목: recDays.thu, 금: recDays.fri, 토: recDays.sat,
        세부사항: detail,
      });
      buildRecurring(RECURRING_TASKS);
    } else if(mode === 'recurring-edit'){
      const idx = RECURRING_TASKS.findIndex(t => t.row === eRow);
      if(idx >= 0){
        RECURRING_TASKS[idx] = {
          ...RECURRING_TASKS[idx],
          업무: name,
          월: recDays.mon, 화: recDays.tue, 수: recDays.wed,
          목: recDays.thu, 금: recDays.fri, 토: recDays.sat,
          세부사항: detail,
        };
      }
      buildRecurring(RECURRING_TASKS);
    } else if(eRow){
      const idx = currentTasksCache.findIndex(t => t.row === eRow);
      if(idx >= 0){
        currentTasksCache[idx] = {
          ...currentTasksCache[idx],
          업무: name, 담당: assignee,
          마감기한: deadlineToShort(deadline),
          세부사항: detail,
          프로젝트: taskModalProject || '',
        };
      }
      buildTasks(currentTasksCache);
    } else {
      // addTask — 서버가 반환한 행 번호 사용
      currentTasksCache.push({
        row: json.row,
        업무: name, 담당: assignee,
        마감기한: deadlineToShort(deadline),
        세부사항: detail,
        완료: false, 완료시각: null,
        프로젝트: taskModalProject || '',
      });
      buildTasks(currentTasksCache);
    }

    const msg = (mode === 'completed-add')   ? '✓ 완료 업무가 추가되었습니다'
              : (mode === 'recurring-add')   ? '✓ 반복 업무가 추가되었습니다'
              : (mode === 'recurring-edit')  ? '✓ 반복 업무가 수정되었습니다'
              : eRow                          ? '✓ 업무가 수정되었습니다'
                                              : '✓ 업무가 추가되었습니다';
    showToast(msg);
  }catch(err){
    showToast('⚠ 저장 실패: ' + err.message + ' (새로고침 후 확인 필요)', true);
    // 실패 시 서버 진실로 복원
    loadData(true).catch(()=>{});
  }finally{
    btn.disabled = false;
    btn.textContent = origText;
  }
}

// 로컬 캐시에서 행 삭제 + 그 아래 행번호 −1 시프트 (시트 동작 모사)
function removeFromTaskCache(row){
  currentTasksCache = currentTasksCache
    .filter(t => t.row !== row)
    .map(t => t.row > row ? {...t, row: t.row - 1} : t);
  buildTasks(currentTasksCache);
}

async function deleteCurrentTask(){
  if(!editingTaskRow) return;
  const target = editingTaskRow;
  const isRecurring = (taskModalMode === 'recurring-edit');
  const list = isRecurring ? RECURRING_TASKS : currentTasksCache;
  const t = list.find(x => x.row === target);
  const taskName = t ? t['업무'] : '이 업무';
  if(!confirm(`'${taskName}'을(를) 삭제하시겠습니까?`)) return;

  closeTaskModal();
  if(isRecurring){
    RECURRING_TASKS = RECURRING_TASKS
      .filter(t => t.row !== target)
      .map(t => t.row > target ? {...t, row: t.row - 1} : t);
    buildRecurring(RECURRING_TASKS);
    showToast('✓ 반복 업무가 삭제되었습니다');
  } else {
    removeFromTaskCache(target);
    showToast('✓ 업무가 삭제되었습니다');
  }

  try{
    const apiAction = isRecurring ? 'deleteRecurringTask' : 'deleteTask';
    const res = await fetch(`${API_URL}?action=${apiAction}&row=${target}`);
    const json = await res.json();
    if(!json.ok) throw new Error(json.error || 'error');
  }catch(err){
    showToast('⚠ 삭제 실패 — 서버 동기화 중', true);
    loadData(true).catch(()=>{});
  }
}

async function deleteTaskRow(row, taskName){
  if(!confirm(`'${taskName}'을(를) 삭제하시겠습니까?`)) return;
  // 낙관적 제거
  removeFromTaskCache(row);
  showToast('✓ 업무가 삭제되었습니다');

  try{
    const res = await fetch(`${API_URL}?action=deleteTask&row=${row}`);
    const json = await res.json();
    if(!json.ok) throw new Error(json.error || 'error');
  }catch(err){
    showToast('⚠ 삭제 실패 — 서버 동기화 중', true);
    loadData(true).catch(()=>{});
  }
}

// ───────── 개별 완료 체크 (다중 담당자) ─────────
async function togglePersonalComplete(row, person, currentPersonDone){
  const newPersonDone = !currentPersonDone;

  // 낙관적 업데이트: 캐시 즉시 반영
  const taskIdx = currentTasksCache.findIndex(t => t.row === row);
  if(taskIdx < 0) return;

  const task = currentTasksCache[taskIdx];
  const personal = parsePersonalComplete(task['개별완료']);
  personal[person] = newPersonDone ? Date.now() : null;
  task['개별완료'] = JSON.stringify(personal);

  // 전원 완료 여부 로컬 계산
  const assignees = getAssigneeList(task);
  const allDone = assignees.length > 0 && assignees.every(a => personal[a]);

  if(allDone && !task['완료']){
    task['완료'] = true;
    task['완료시각'] = Date.now();
  }else if(!allDone && task['완료']){
    task['완료'] = false;
    task['완료시각'] = null;
    if(taskTimers[row]){ clearTimeout(taskTimers[row]); delete taskTimers[row]; }
  }

  buildTasks(currentTasksCache);

  showToast(newPersonDone ? `✓ ${person} 완료` : `↩ ${person} 완료 취소`);

  try{
    const res  = await fetch(`${API_URL}?action=setPersonalComplete&row=${row}&person=${encodeURIComponent(person)}&value=${newPersonDone}`);
    const json = await res.json();
    if(!json.ok) throw new Error('error');
  }catch(err){
    console.error(err);
    showToast('⚠ 시트 반영 실패 — Apps Script 재배포 확인', true);
    loadData(true).catch(()=>{});
  }
}

// ───────── 댓글 모달 ─────────
function openCommentModal(row, taskName){
  currentCommentRow = row;
  selectedCommentAuthor = null;   // 작성자 매번 새로 선택하도록 초기화
  document.getElementById('commentModalTitle').textContent = `댓글 · ${taskName}`;
  renderCommentAuthorPicker();
  renderCommentList();
  document.getElementById('commentText').value = '';
  document.getElementById('commentOverlay').classList.add('show');
  document.getElementById('commentModal').classList.add('show');
  setTimeout(()=>document.getElementById('commentText').focus(), 100);
  fetch(`${API_URL}?action=getHash`).catch(()=>{});
}

function closeCommentModal(){
  document.getElementById('commentOverlay').classList.remove('show');
  document.getElementById('commentModal').classList.remove('show');
  currentCommentRow = null;
}

function renderCommentAuthorPicker(){
  const root = document.getElementById('commentAuthorPicker');
  if(!root) return;
  root.innerHTML = Object.values(PERSON).map(p=>{
    const active = selectedCommentAuthor === p.full;
    const safeName = p.full.replace(/'/g,'').replace(/"/g,'');
    return `<button type="button" class="pick-chip${active?' active':''}" onclick="selectCommentAuthor('${safeName}')">
      <span class="mini-av av-${p.cls}">${p.short}</span>${p.full}
    </button>`;
  }).join('');
}

function selectCommentAuthor(name){
  selectedCommentAuthor = name;
  renderCommentAuthorPicker();
}

function renderCommentList(){
  const root = document.getElementById('commentList');
  if(!root) return;
  const task = currentTasksCache.find(t => t.row === currentCommentRow);
  const comments = task ? parseComments(task['댓글']) : [];

  if(!comments.length){
    root.innerHTML = '<div class="comment-empty">첫 댓글을 남겨보세요.</div>';
    return;
  }

  root.innerHTML = comments.map(c=>{
    const p = PERSON[c.author];
    const cls   = p ? p.cls  : 'kkh';
    const short = p ? p.short : (String(c.author||'').length>=2?String(c.author||'').slice(-2):String(c.author||''));
    const safeText = String(c.text||'').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    return `<div class="comment-item">
      <div class="comment-header">
        <div class="comment-author-info">
          <span class="mini-av av-${cls}">${short}</span>
          <strong>${c.author||''}</strong>
          <span class="comment-time">${fmtDateTime(c.ts)}</span>
        </div>
        <button class="comment-del-btn" title="삭제" onclick="deleteCommentItem(${currentCommentRow},${c.ts})">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="comment-text">${safeText}</div>
    </div>`;
  }).join('');
}

async function submitComment(){
  if(!currentCommentRow) return;
  const author = selectedCommentAuthor || '';
  const text   = (document.getElementById('commentText').value||'').trim();
  if(!author){ showToast('작성자를 선택해주세요', true); return; }
  if(!text){ showToast('댓글 내용을 입력해주세요', true); return; }

  const btn = document.getElementById('commentSaveBtn');
  btn.disabled = true; btn.textContent = '등록 중...';

  try{
    const params = new URLSearchParams({ action:'addComment', row:currentCommentRow, author, text });
    const res  = await fetch(`${API_URL}?${params.toString()}`);
    const json = await res.json();
    if(!json.ok) throw new Error(json.error||'error');

    // 캐시 업데이트
    const taskIdx = currentTasksCache.findIndex(t => t.row === currentCommentRow);
    if(taskIdx >= 0){
      const t = currentTasksCache[taskIdx];
      const cs = parseComments(t['댓글']);
      cs.push({ author, text, ts: json.ts });
      t['댓글'] = JSON.stringify(cs);
    }

    renderCommentList();
    buildTasks(currentTasksCache);
    document.getElementById('commentText').value = '';
    showToast('✓ 댓글이 등록되었습니다');
  }catch(err){
    showToast('⚠ 등록 실패: '+err.message, true);
  }finally{
    btn.disabled = false; btn.textContent = '등록';
  }
}

async function deleteCommentItem(row, ts){
  if(!confirm('댓글을 삭제하시겠습니까?')) return;

  try{
    const res  = await fetch(`${API_URL}?action=deleteComment&row=${row}&ts=${ts}`);
    const json = await res.json();
    if(!json.ok) throw new Error(json.error||'error');

    const taskIdx = currentTasksCache.findIndex(t => t.row === row);
    if(taskIdx >= 0){
      const t = currentTasksCache[taskIdx];
      const cs = parseComments(t['댓글']).filter(c => c.ts !== ts);
      t['댓글'] = cs.length ? JSON.stringify(cs) : '';
    }

    renderCommentList();
    buildTasks(currentTasksCache);
    showToast('✓ 댓글이 삭제되었습니다');
  }catch(err){
    showToast('⚠ 삭제 실패', true);
  }
}

// ───────── 연간 캘린더 ─────────
const CAL_TYPES = [
  { key:'공휴일', cls:'holiday' },
  { key:'행사',   cls:'event'   },
  { key:'계획',   cls:'plan'    },
];

// v2: 캘린더는 인라인이라 모달 없음. 호환용 stub (Esc 핸들러 등에서 호출돼도 안전).
function openCalendarModal(){ renderMonthGrid(); }
function closeCalendarModal(){}

function calendarPrevMonth(){
  calViewMonth--;
  if(calViewMonth < 0){ calViewMonth = 11; calViewYear--; }
  renderMonthGrid();
}
function calendarNextMonth(){
  calViewMonth++;
  if(calViewMonth > 11){ calViewMonth = 0; calViewYear++; }
  renderMonthGrid();
}
function calendarGoToday(){
  const now = new Date();
  calViewYear  = now.getFullYear();
  calViewMonth = now.getMonth();
  renderMonthGrid();
}

// 특정 날짜(yyyy-MM-dd)에 걸치는 모든 일정 반환 (공휴일 + 연차/반차 + 사용자 일정)
function eventsOnDate(dateKey){
  const list = [];
  // 공휴일
  if(HOLIDAYS[dateKey]){
    list.push({ holiday:true, title:HOLIDAYS[dateKey], type:'공휴일' });
  }
  // 사용자 일정 (기간 포함)
  CALENDAR_EVENTS.forEach(ev => {
    if(dateKey >= ev.start && dateKey <= (ev.end || ev.start)){
      list.push({ ...ev, holiday:false });
    }
  });
  // 프로젝트 마감 (자동, 읽기 전용)
  PROJECTS_LIST.forEach(p => {
    const d = parseDate(p['마감기한']);
    if(d && ymdFromDate(d) === dateKey){
      list.push({ projEvent:true, title:String(p['프로젝트명']||''), pm:String(p['담당']||'') });
    }
  });
  // 업무 마감 (자동, 읽기 전용)
  currentTasksCache.forEach(t => {
    const d = parseDate(t['마감기한']);
    if(d && ymdFromDate(d) === dateKey){
      list.push({ taskEvent:true, title:String(t['업무']||''), who:String(t['담당']||''), done:!!t['완료'], proj:String(t['프로젝트']||'') });
    }
  });
  return list;
}

function typeCls(type){
  const t = CAL_TYPES.find(x => x.key === type);
  return t ? t.cls : 'plan';
}

function renderMonthGrid(){
  const title = document.getElementById('calendarNavTitle');
  title.textContent = `${calViewYear}년 ${calViewMonth+1}월`;

  const grid = document.getElementById('monthGrid');
  const todayKey = ymdFromDate(new Date());

  // 요일 헤더
  const dayNames = ['일','월','화','수','목','금','토'];
  let html = '<div class="mg-head">' +
    dayNames.map((d,i)=>`<div class="mg-head-cell ${i===0?'sun':''} ${i===6?'sat':''}">${d}</div>`).join('') +
    '</div><div class="mg-body">';

  const first = new Date(calViewYear, calViewMonth, 1);
  const startWeekday = first.getDay();              // 0=일
  const daysInMonth = new Date(calViewYear, calViewMonth+1, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  for(let i=0; i<totalCells; i++){
    const dayNum = i - startWeekday + 1;
    if(dayNum < 1 || dayNum > daysInMonth){
      html += '<div class="mg-cell mg-empty"></div>';
      continue;
    }
    const dateKey = ymd(calViewYear, calViewMonth, dayNum);
    const weekday = (startWeekday + dayNum - 1) % 7;
    const isToday = dateKey === todayKey;
    const isHoliday = !!HOLIDAYS[dateKey];
    const isSun = weekday === 0 || isHoliday;
    const isSat = weekday === 6;

    const evs = eventsOnDate(dateKey);

    // 여러 날 일정(막대) vs 하루짜리(칩) 분리
    const bars = [], singles = [];
    evs.forEach(ev => {
      const isMulti = !ev.holiday && !ev.leave && ev.start && ev.end && ev.end > ev.start;
      (isMulti ? bars : singles).push(ev);
    });
    // 막대는 시작일 순으로 정렬 → 여러 날에 걸쳐 같은 줄(레인)에 표시되도록
    bars.sort((a,b)=> a.start<b.start?-1 : a.start>b.start?1 : (a.row||0)-(b.row||0));

    const isWeekStart = (weekday === 0) || (dayNum === 1);

    // 연속 막대: 제목은 시작일 또는 매주 첫날에만, 시작/끝만 둥글게
    const barHtml = bars.map(ev => {
      const cls = typeCls(ev.type);
      const isStart = dateKey === ev.start;
      const isEnd   = dateKey === ev.end;
      const showTitle = isStart || isWeekStart;
      const rnd = (isStart?' mg-bar-l':'') + (isEnd?' mg-bar-r':'');
      const safeTitle = String(ev.title||'').replace(/"/g,'&quot;');
      const tip = safeTitle + (ev.memo?' — '+String(ev.memo).replace(/"/g,'&quot;'):'');
      return `<div class="mg-bar mg-bar-${cls}${rnd}" title="${tip}" onclick="event.stopPropagation();openEventEditor(${ev.row})">${showTitle?ev.title:'&nbsp;'}</div>`;
    }).join('');

    // 하루짜리 칩 (공휴일·연차/반차·프로젝트/업무 마감·단일 일정)
    const singleHtml = singles.slice(0,5).map(ev => {
      if(ev.holiday){
        return `<div class="mg-chip mg-chip-holiday" title="${ev.title}">${ev.title}</div>`;
      }
      if(ev.leave){
        const lvCls = String(ev.type).includes('반차') ? 'mg-chip-half' : 'mg-chip-leave';
        const p = PERSON[ev.name];
        const dot = p ? `<span class="mg-leave-dot av-${p.cls}"></span>` : '';
        return `<div class="mg-chip ${lvCls}" title="${ev.title}">${dot}${ev.title}</div>`;
      }
      if(ev.projEvent){
        const safe = String(ev.title||'').replace(/"/g,'&quot;');
        const pm = ev.pm ? ' · '+ev.pm : '';
        return `<div class="mg-chip mg-chip-project" title="프로젝트 마감: ${safe}${pm}">${ev.title}</div>`;
      }
      if(ev.taskEvent){
        const safe = String(ev.title||'').replace(/"/g,'&quot;');
        const who = ev.who ? ' · '+ev.who : '';
        const proj = ev.proj ? ' ['+String(ev.proj).replace(/"/g,'&quot;')+']' : '';
        return `<div class="mg-chip mg-chip-task${ev.done?' done':''}" title="업무 마감: ${safe}${who}${proj}">${ev.title}</div>`;
      }
      const cls = typeCls(ev.type);
      const safeTitle = String(ev.title||'').replace(/"/g,'&quot;');
      return `<div class="mg-chip mg-chip-${cls}" title="${safeTitle}${ev.memo?' — '+String(ev.memo).replace(/"/g,'&quot;'):''}" onclick="event.stopPropagation();openEventEditor(${ev.row})">${ev.title}</div>`;
    }).join('');
    const hidden = singles.length > 5 ? singles.length - 5 : 0;
    const moreCount = hidden ? `<div class="mg-more">+${hidden}</div>` : '';

    html += `<div class="mg-cell ${isToday?'mg-today':''}" onclick="openEventEditor(null,'${dateKey}')">
      <div class="mg-date ${isSun?'sun':''} ${isSat?'sat':''}">${dayNum}</div>
      <div class="mg-bars">${barHtml}</div>
      <div class="mg-chips">${singleHtml}${moreCount}</div>
    </div>`;
  }
  html += '</div>';
  grid.innerHTML = html;

  // 네비게이션 버튼 한계 (2026-01 ~ 2027-12)
  const atStart = (calViewYear === 2026 && calViewMonth === 0);
  const atEnd   = (calViewYear === 2027 && calViewMonth === 11);
  document.querySelectorAll('.cal-nav-btn')[0].style.opacity = atStart ? .3 : 1;
  document.querySelectorAll('.cal-nav-btn')[1].style.opacity = atEnd ? .3 : 1;
}

// ── 일정 추가/수정 서브 모달 ──
function renderEventTypePicker(){
  const root = document.getElementById('eventTypePicker');
  root.innerHTML = CAL_TYPES.map(t => {
    const active = selectedEventType === t.key;
    return `<button type="button" class="pick-chip cal-type-chip cal-type-${t.cls}${active?' active':''}" onclick="selectEventType('${t.key}')">${t.key}</button>`;
  }).join('');
}
function selectEventType(key){
  selectedEventType = key;
  renderEventTypePicker();
}

function openEventEditor(row, prefillDate){
  editingEventRow = (typeof row === 'number') ? row : null;

  if(editingEventRow){
    const ev = CALENDAR_EVENTS.find(x => x.row === editingEventRow);
    document.getElementById('eventModalTitle').textContent = '일정 수정';
    document.getElementById('eventTitle').value = ev ? ev.title : '';
    document.getElementById('eventStart').value = ev ? ev.start : '';
    document.getElementById('eventEnd').value   = ev ? (ev.end && ev.end !== ev.start ? ev.end : '') : '';
    document.getElementById('eventMemo').value  = ev ? ev.memo : '';
    selectedEventType = ev ? ev.type : '계획';
    document.getElementById('eventDeleteBtn').style.display = 'inline-flex';
  } else {
    document.getElementById('eventModalTitle').textContent = '일정 추가';
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventStart').value = prefillDate || ymdFromDate(new Date());
    document.getElementById('eventEnd').value   = '';
    document.getElementById('eventMemo').value  = '';
    selectedEventType = '계획';
    document.getElementById('eventDeleteBtn').style.display = 'none';
  }
  renderEventTypePicker();

  document.getElementById('eventOverlay').classList.add('show');
  document.getElementById('eventModal').classList.add('show');
  setTimeout(()=>document.getElementById('eventTitle').focus(), 100);
}

function closeEventEditor(){
  document.getElementById('eventOverlay').classList.remove('show');
  document.getElementById('eventModal').classList.remove('show');
  editingEventRow = null;
}

async function saveEvent(){
  const title = document.getElementById('eventTitle').value.trim();
  const start = document.getElementById('eventStart').value.trim();
  let   end   = document.getElementById('eventEnd').value.trim();
  const memo  = document.getElementById('eventMemo').value.trim();
  const type  = selectedEventType;

  if(!title){ showToast('제목을 입력해주세요', true); return; }
  if(!start){ showToast('시작일을 선택해주세요', true); return; }
  if(end && end < start){ showToast('종료일이 시작일보다 빠릅니다', true); return; }
  if(!end) end = start;

  const eRow = editingEventRow;
  closeEventEditor();

  // 🚀 낙관적 UI — 서버 응답 기다리지 않고 즉시 화면 반영
  let tempObj = null;
  if(eRow){
    const idx = CALENDAR_EVENTS.findIndex(x => x.row === eRow);
    if(idx >= 0) CALENDAR_EVENTS[idx] = { row:eRow, start, end, title, type, memo };
  } else {
    tempObj = { row:-Date.now(), start, end, title, type, memo };  // 임시 행번호
    CALENDAR_EVENTS.push(tempObj);
  }
  renderMonthGrid();
  showToast(eRow ? '✓ 일정이 수정되었습니다' : '✓ 일정이 추가되었습니다');

  // 서버는 뒤에서 처리
  try{
    const params = new URLSearchParams({
      action: eRow ? 'updateCalendarEvent' : 'addCalendarEvent',
      start, end, title, type, memo,
    });
    if(eRow) params.set('row', eRow);

    const res  = await fetch(`${API_URL}?${params.toString()}`);
    const json = await res.json();
    if(!json.ok) throw new Error(json.error || 'error');

    // 추가였으면 임시 행번호를 실제 행번호로 교체 후 다시 렌더 (즉시)
    if(!eRow && tempObj){
      tempObj.row = json.row;
      renderMonthGrid();
    }
  }catch(err){
    showToast('⚠ 저장 실패 — 새로고침 후 확인', true);
    loadData(true).catch(()=>{});
  }
}

async function deleteCurrentEvent(){
  if(!editingEventRow) return;
  const target = editingEventRow;
  const ev = CALENDAR_EVENTS.find(x => x.row === target);
  if(!confirm(`'${ev ? ev.title : '이 일정'}'을(를) 삭제하시겠습니까?`)) return;

  closeEventEditor();
  CALENDAR_EVENTS = CALENDAR_EVENTS
    .filter(x => x.row !== target)
    .map(x => x.row > target ? {...x, row:x.row-1} : x);
  renderMonthGrid();
  showToast('✓ 일정이 삭제되었습니다');

  try{
    const res = await fetch(`${API_URL}?action=deleteCalendarEvent&row=${target}`);
    const json = await res.json();
    if(!json.ok) throw new Error(json.error || 'error');
  }catch(err){
    showToast('⚠ 삭제 실패 — 서버 동기화 중', true);
    loadData(true).catch(()=>{});
  }
}

// ───────── 폴링 (자동 갱신, 해시 기반) ─────────
const POLL_INTERVAL = 30000;
let pollTimer = null;
let pollEnabled = true;
let lastDataHash = '';
let lastServerVersion = null;  // 서버가 반환한 v 값. getHash와 비교.

function startPolling(){
  stopPolling();
  pollTimer = setInterval(() => {
    if(document.hidden) return;                          // 탭 백그라운드면 건너뜀
    if(document.querySelector('.modal.show')) return;    // 모달 열려있으면 건너뜀
    if(editingMemberIdx >= 0 || editingMemberIdx === -2) return;
    checkVersionAndLoad();
  }, POLL_INTERVAL);
  pollEnabled = true;
  updatePollIndicator('idle');
}

// 가벼운 핑 → 버전 다를 때만 전체 데이터 갱신
async function checkVersionAndLoad(){
  try{
    const res = await fetch(`${API_URL}?action=getHash`);
    const json = await res.json();
    if(json.v !== lastServerVersion){
      // 변경 감지 → 전체 갱신
      await loadData(false);
    } else {
      // 변경 없음 → 아무것도 안 함
      updatePollIndicator(pollEnabled ? 'idle' : 'paused');
    }
  }catch(err){
    updatePollIndicator('error');
  }
}

function stopPolling(){
  if(pollTimer){ clearInterval(pollTimer); pollTimer = null; }
  pollEnabled = false;
  updatePollIndicator('paused');
}

function togglePolling(){
  if(pollEnabled) stopPolling();
  else startPolling();
}

function updatePollIndicator(state){
  const el  = document.getElementById('pollIndicator');
  const lbl = document.getElementById('pollLabel');
  if(!el) return;
  el.classList.remove('updating','paused','error');
  if(state === 'updating'){ el.classList.add('updating'); lbl.textContent = '갱신 중...'; }
  else if(state === 'paused'){ el.classList.add('paused'); lbl.textContent = '자동 갱신 OFF'; }
  else if(state === 'error'){ el.classList.add('error'); lbl.textContent = '연결 오류'; }
  else { lbl.textContent = '자동 갱신 ON · 30초'; }
}

function hashTasks(tasks){
  return tasks.map(t => `${t.row}|${t['업무']}|${t['담당']}|${t['마감기한']}|${t['완료']?1:0}|${t['개별완료']||''}|${t['댓글']||''}|${t['프로젝트']||''}`).join('||');
}

// ───────── 브라우저 알림 ─────────
const NOTIF_STORAGE_KEY = 'fox_notif_sent';

function refreshNotifBtn(){
  const btn = document.getElementById('notifBtn');
  const lbl = document.getElementById('notifLabel');
  if(!('Notification' in window)){
    btn.style.display = 'none';
    return;
  }
  btn.classList.remove('enabled','denied');
  if(Notification.permission === 'granted'){ btn.classList.add('enabled'); lbl.textContent = '알림 ON'; }
  else if(Notification.permission === 'denied'){ btn.classList.add('denied'); lbl.textContent = '알림 차단됨'; }
  else { lbl.textContent = '알림 사용'; }
}

async function requestNotifPermission(){
  if(!('Notification' in window)){ showToast('이 브라우저는 알림을 지원하지 않습니다', true); return; }
  if(Notification.permission === 'denied'){
    showToast('브라우저 설정에서 알림 허용을 다시 켜주세요', true);
    return;
  }
  if(Notification.permission === 'default'){
    const result = await Notification.requestPermission();
    refreshNotifBtn();
    if(result === 'granted') showToast('✓ 알림이 활성화되었습니다');
  }else{
    showToast('이미 알림이 활성화되어 있습니다');
  }
}

function getSentNotifs(){
  try { return JSON.parse(localStorage.getItem(NOTIF_STORAGE_KEY) || '{}'); }
  catch(e){ return {}; }
}
function saveSentNotifs(obj){
  try { localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(obj)); } catch(e){}
}
function todayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

function fireDeadlineNotifications(tasks){
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  const today = midnight(new Date());
  const tKey = todayKey();
  const sent = getSentNotifs();

  // 오래된 기록 정리 (오늘 날짜 외 항목 삭제)
  Object.keys(sent).forEach(k => { if(sent[k] !== tKey) delete sent[k]; });

  tasks.forEach(t => {
    if(t['완료']) return;
    const dl = parseDate(t['마감기한']);
    if(!dl) return;
    const diff = Math.floor((dl-today)/86400000);
    if(diff !== 0) return;                  // 당일만 알림
    const key = `${t.row}_${tKey}`;
    if(sent[key]) return;                   // 이미 보냄

    try{
      new Notification('📌 오늘 마감 업무', {
        body: `${t['업무']} · 담당 ${t['담당']||'-'}`,
        tag:  `task-${t.row}`,
        icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2.5" fill="%231c1c1e"/></svg>',
      });
      sent[key] = tKey;
    }catch(e){ console.error(e); }
  });

  saveSentNotifs(sent);
}

// ───────── 반복 업무 리스트 (요일별 담당) ─────────
function buildRecurring(tasks){
  RECURRING_TASKS = tasks || [];

  const cntEl = document.getElementById('recurringCount');
  if(RECURRING_TASKS.length > 0){
    cntEl.style.display = 'inline-flex';
    cntEl.textContent = RECURRING_TASKS.length;
  } else {
    cntEl.style.display = 'none';
  }

  const root = document.getElementById('recurringList');
  root.innerHTML = '';
  if(!RECURRING_TASKS.length){
    root.innerHTML = '<div class="empty-state">반복 업무가 없습니다. + 버튼으로 추가하세요.</div>';
    return;
  }

  const todayDay = ['일','월','화','수','목','금','토'][new Date().getDay()];
  const dayKeys = ['월','화','수','목','금','토'];

  RECURRING_TASKS.forEach(task => {
    const row = task['row'];
    const safeName = (task['업무']||'').replace(/'/g,'');

    // 요일 칩 생성 (값이 있는 요일만)
    const chips = dayKeys.map(d => {
      const val = task[d];
      if(!val) return '';
      const isToday = d === todayDay;
      return `<span class="rec-day-chip ${isToday?'rec-day-today':''}">
        <span class="rec-day-label">${d}</span>
        <span class="rec-day-value">${val}</span>
      </span>`;
    }).filter(Boolean).join('');

    const el = document.createElement('div');
    el.className = 'task-item';
    el.dataset.row = row;
    el.innerHTML = `
      <div class="task-body">
        <div class="task-name">${task['업무']}</div>
        <div class="rec-days">${chips || '<span style="font-size:12px;color:var(--faint);">요일별 담당이 비어있어요</span>'}</div>
        ${task['세부사항']?`<div class="task-desc" style="margin-top:6px;">${task['세부사항']}</div>`:''}
      </div>
      <div class="task-actions">
        <button class="task-action-btn" title="수정" onclick="event.stopPropagation();openTaskModal(${row},'recurring')">
          <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="task-action-btn btn-del" title="삭제" onclick="event.stopPropagation();deleteRecurringTaskRow(${row},'${safeName}')">
          <svg viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6"/><path d="M19,6 l-1,14 a2,2 0 0 1 -2,2 H8 a2,2 0 0 1 -2,-2 L5,6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>`;
    root.appendChild(el);
  });
}

async function deleteRecurringTaskRow(row, taskName){
  if(!confirm(`'${taskName}'을(를) 삭제하시겠습니까?`)) return;
  RECURRING_TASKS = RECURRING_TASKS
    .filter(t => t.row !== row)
    .map(t => t.row > row ? {...t, row: t.row - 1} : t);
  buildRecurring(RECURRING_TASKS);
  showToast('✓ 반복 업무가 삭제되었습니다');

  try{
    const res = await fetch(`${API_URL}?action=deleteRecurringTask&row=${row}`);
    const json = await res.json();
    if(!json.ok) throw new Error(json.error || 'error');
  }catch(err){
    showToast('⚠ 삭제 실패 — 서버 동기화 중', true);
    loadData(true).catch(()=>{});
  }
}

// ───────── 섹션 접기/펼치기 (상태 localStorage 저장) ─────────
const COLLAPSE_MAP = {
  tasks:     { content:'tasksContent',     btn:'tasksCollapseBtn',     label:'tasksCollapseLabel',     def:false },
  recurring: { content:'recurringContent', btn:'recurringCollapseBtn', label:'recurringCollapseLabel', def:false },
  completed: { content:'completedContent',  btn:'completedCollapseBtn',  label:'completedCollapseLabel',  def:true  },
};

function getCollapsedState(){
  try{ return JSON.parse(localStorage.getItem('fox_collapsed') || '{}'); }catch(e){ return {}; }
}
function applyCollapse(name, collapsed){
  const m = COLLAPSE_MAP[name]; if(!m) return;
  const content = document.getElementById(m.content);
  const btn     = document.getElementById(m.btn);
  const label   = document.getElementById(m.label);
  if(!content || !btn || !label) return;
  content.classList.toggle('collapsed', collapsed);
  btn.classList.toggle('collapsed', collapsed);
  label.textContent = collapsed ? '펼치기' : '접기';
}
function toggleCollapse(name){
  const s = getCollapsedState();
  const cur = (s[name] !== undefined) ? s[name] : COLLAPSE_MAP[name].def;
  s[name] = !cur;
  try{ localStorage.setItem('fox_collapsed', JSON.stringify(s)); }catch(e){}
  applyCollapse(name, s[name]);
}
function initCollapse(){
  const s = getCollapsedState();
  Object.keys(COLLAPSE_MAP).forEach(name => {
    const c = (s[name] !== undefined) ? s[name] : COLLAPSE_MAP[name].def;
    applyCollapse(name, c);
  });
}

// ───────── 완료 업무 리스트 ─────────

function buildCompleted(tasks){
  COMPLETED_TASKS = (tasks || []).map(t => ({
    업무:     t['업무'] || '',
    담당:     t['담당'] || '',
    마감기한: t['마감기한'] || '',
    세부사항: t['세부사항'] || '',
    완료시각: t['완료시각'] || null,
  })).sort((a,b) => (b.완료시각 || 0) - (a.완료시각 || 0));

  const cntEl = document.getElementById('completedCount');
  if(COMPLETED_TASKS.length > 0){
    cntEl.style.display = 'inline-flex';
    cntEl.textContent = COMPLETED_TASKS.length;
  } else {
    cntEl.style.display = 'none';
  }

  renderCompletedControls();
  renderCompletedList();
}

function getCompletedMemberNames(){
  const set = new Set();
  COMPLETED_TASKS.forEach(t => {
    if(!t.담당) return;
    // 콤마로 구분된 담당자 각각을 칩으로
    String(t.담당).split(',').map(x => x.trim()).filter(Boolean).forEach(n => set.add(n));
  });
  return Array.from(set);
}

function renderCompletedControls(){
  const memberNames = getCompletedMemberNames();
  const memberChips = ['<button class="filter-chip '+(completedFilter.member==='all'?'active':'')+'" onclick="setCompletedFilter(\'member\',\'all\')">전체</button>']
    .concat(memberNames.map(name => {
      const p = PERSON[name];
      const cls = p ? p.cls : 'kkh';
      const short = p ? p.short : (name.length>=2?name.slice(-2):name);
      const active = completedFilter.member === name ? 'active' : '';
      return `<button class="filter-chip ${active}" onclick="setCompletedFilter('member','${encodeURIComponent(name)}')">
        <span class="mini-av av-${cls}">${short}</span>${name}
      </button>`;
    })).join('');

  const periods = [
    {key:'all',    label:'전체'},
    {key:'week',   label:'이번 주'},
    {key:'month',  label:'이번 달'},
    {key:'7days',  label:'최근 7일'},
    {key:'30days', label:'최근 30일'},
  ];
  const periodChips = periods.map(p =>
    `<button class="filter-chip ${completedFilter.period===p.key?'active':''}" onclick="setCompletedFilter('period','${p.key}')">${p.label}</button>`
  ).join('');

  document.getElementById('completedControls').innerHTML = `
    <div class="filter-row">
      <span class="filter-label">담당자</span>
      ${memberChips}
    </div>
    <div class="filter-row">
      <span class="filter-label">기간</span>
      ${periodChips}
    </div>
  `;
}

function setCompletedFilter(type, value){
  if(type === 'member'){
    completedFilter.member = value === 'all' ? 'all' : decodeURIComponent(value);
  } else if(type === 'period'){
    completedFilter.period = value;
  }
  renderCompletedControls();
  renderCompletedList();
}

function getPeriodStart(key){
  const now = new Date();
  const today = midnight(now);
  if(key === 'week')   return getMonday(today);
  if(key === 'month')  return new Date(today.getFullYear(), today.getMonth(), 1);
  if(key === '7days')  return addDays(today, -6);
  if(key === '30days') return addDays(today, -29);
  return null;
}

function fmtDateTime(ts){
  if(!ts) return '-';
  const d = new Date(ts);
  const M = d.getMonth()+1, D = d.getDate();
  const h = String(d.getHours()).padStart(2,'0');
  const m = String(d.getMinutes()).padStart(2,'0');
  return `${M}/${D} ${h}:${m}`;
}

function compareTiming(deadlineStr, completedAt){
  if(!completedAt) return null;
  const dl = parseDate(deadlineStr);
  if(!dl) return null;
  const compDay = midnight(new Date(completedAt));
  const diff = Math.floor((compDay - dl) / 86400000);
  if(diff < 0)  return { type:'early', label:`${Math.abs(diff)}일 빠름`, cls:'timing-early' };
  if(diff === 0) return { type:'ontime', label:'당일 완료', cls:'timing-ontime' };
  return { type:'late', label:`${diff}일 지각`, cls:'timing-late' };
}

function renderCompletedList(){
  const root = document.getElementById('completedList');
  const start = getPeriodStart(completedFilter.period);
  const startTs = start ? start.getTime() : null;

  const filtered = COMPLETED_TASKS.filter(t => {
    if(completedFilter.member !== 'all'){
      // 콤마로 구분된 담당자 중 하나라도 일치하면 통과
      const assignees = String(t.담당 || '').split(',').map(x => x.trim());
      if(!assignees.includes(completedFilter.member)) return false;
    }
    if(startTs !== null){
      if(!t.완료시각) return false;
      if(t.완료시각 < startTs) return false;
    }
    return true;
  });

  if(!filtered.length){
    root.innerHTML = '<div class="empty-state">조건에 맞는 완료 업무가 없습니다.</div>';
    return;
  }

  root.innerHTML = filtered.map(t => {
    const p = PERSON[String(t.담당).trim()];
    const cls = p ? p.cls : 'kkh';
    const short = p ? p.short : (String(t.담당).length>=2 ? String(t.담당).slice(-2) : String(t.담당));
    const timing = compareTiming(t.마감기한, t.완료시각);
    const timingHtml = timing
      ? `<span class="timing-badge ${timing.cls}">${timing.label}</span>`
      : (t.마감기한 ? '' : '<span class="timing-badge timing-none">기한없음</span>');

    return `<div class="completed-item">
      <div class="completed-icon">
        <svg viewBox="0 0 12 12"><polyline points="1.5,6 4.5,9.5 10.5,2.5"/></svg>
      </div>
      <div class="completed-body">
        <div class="completed-top">
          <div class="completed-name">${t.업무}</div>
          <div class="completed-time">완료 ${fmtDateTime(t.완료시각)}</div>
        </div>
        <div class="completed-meta">
          <span><span class="mini-av av-${cls}">${short}</span><strong>${t.담당||'-'}</strong></span>
          <span>기한 · ${t.마감기한||'-'}</span>
          ${timingHtml}
        </div>
        ${t.세부사항?`<div class="completed-desc">${t.세부사항}</div>`:''}
      </div>
    </div>`;
  }).join('');
}

function buildWork(weeks){
  const workRoot  = document.getElementById('workTableWrap');
  const leaveRoot = document.getElementById('leaveList');

  LEAVE_EVENTS = [];  // 항상 초기화 (캘린더 자동 표시용)

  if(!weeks||!weeks.length){
    if(workRoot) workRoot.innerHTML='<div class="empty-state">근무일정 시트에 데이터를 입력해주세요.</div>';
    if(leaveRoot) leaveRoot.innerHTML='<div class="empty-state">근무일정에서 자동으로 추출됩니다.</div>';
    return;
  }

  const today      = midnight(new Date());
  const leaveItems = [];
  let html = '';

  weeks.forEach((week, wi)=>{
    const memberNames = Object.keys(week.members);
    const containsToday = DAYS_ALL.some(d=>{
      const obj=parseDate(week.dates[d]);
      return obj&&sameDay(obj,today);
    });
    const dateFilled = DAYS_ALL.map(d=>week.dates[d]).filter(Boolean);
    const weekLabel  = dateFilled.length?`${dateFilled[0]} ~ ${dateFilled[dateFilled.length-1]}`:`${wi+1}주차`;

    html+=`<div class="week-block ${containsToday?'week-current':''}">
      <div class="week-label">${weekLabel}${containsToday?'<span class="now-badge">이번 주</span>':''}</div>
      <div class="work-table-wrap"><table class="work-table">
        <thead><tr>
          <th class="member-col"></th>
          ${DAYS_ALL.map(d=>{
            const ds=week.dates[d]||'';
            const dobj=parseDate(ds);
            const isT=dobj&&sameDay(dobj,today);
            return `<th class="${isT?'today-col':''}">${d}<span class="date-num ${isT?'today-num':''}">${ds}</span></th>`;
          }).join('')}
        </tr></thead>
        <tbody>
          ${memberNames.map(name=>{
            const p=PERSON[name];
            const sched=week.members[name]||{};
            return `<tr>
              <td class="member-col">${p?`<span class="mini-av av-${p.cls}">${p.short}</span>`:''}<span class="member-name">${name}</span></td>
              ${DAYS_ALL.map(d=>{
                const ds=week.dates[d];
                if(!ds) return `<td class="noday-cell"></td>`;  // 날짜 없는 칸(월초/월말 여백)은 비움
                const dobj=parseDate(ds);
                const isT=dobj&&sameDay(dobj,today);
                const val=sched[d]||'';
                if(val==='연차'||val.includes('반차')){
                  leaveItems.push({name,date:dobj,type:val});
                }
                return `<td class="${isT?'today-cell':''}">${renderVal(val)}</td>`;
              }).join('')}
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>`;
  });

  if(workRoot) workRoot.innerHTML=html;

  // 캘린더 자동 표시용 — 연차/반차를 yyyy-MM-dd 키로 저장
  LEAVE_EVENTS = leaveItems
    .filter(it => it.date)
    .map(it => ({ dateKey: ymdFromDate(it.date), name: it.name, type: it.type }));
  if(document.getElementById('monthGrid')){
    renderMonthGrid();  // 연차 갱신되면 인라인 캘린더 다시 렌더
  }

  if(!leaveItems.length){
    if(leaveRoot) leaveRoot.innerHTML='<div class="empty-state">등록된 연차·반차가 없습니다.</div>';
    return;
  }
  leaveItems.sort((a,b)=>a.date-b.date);
  if(leaveRoot){
    leaveRoot.innerHTML='';
    leaveItems.forEach(item=>{
      const p=PERSON[item.name];
      const isPast=item.date&&item.date<today&&!sameDay(item.date,today);
      const daysUntil=item.date?Math.floor((item.date-today)/86400000):null;
      const isSoon=daysUntil!==null&&daysUntil>=0&&daysUntil<=7;
      const typeCls=item.type.includes('반차')?'type-반차':'type-연차';
      leaveRoot.innerHTML+=`<div class="leave-item ${isPast?'leave-past':isSoon?'leave-soon':''}">
        ${p?`<div class="leave-av av-${p.cls}">${p.short}</div>`
          :`<div class="leave-av" style="background:#f0ede8;color:var(--sub)">${String(item.name).slice(0,1)}</div>`}
        <div class="leave-body">
          <div>
            <span class="leave-who">${item.name}</span>
            <span class="leave-type-badge ${typeCls}">${item.type}</span>
            ${isSoon&&!isPast?`<span class="soon-badge">${daysUntil===0?'오늘':daysUntil+'일 후'}</span>`:''}
          </div>
          <div>
            <div class="leave-date">${item.date?fmt(item.date):''}</div>
          </div>
        </div>
      </div>`;
    });
  }
}

// ───────── 다크 모드 ─────────
// 페이지 로드 직후 <head>의 인라인 스크립트가 이미 data-theme을 세팅함.
// 여기는 토글과 시스템 테마 변경 감지만 담당.
function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  if(next === 'dark') document.documentElement.setAttribute('data-theme','dark');
  else                document.documentElement.removeAttribute('data-theme');
  try{ localStorage.setItem('fox_theme', next); }catch(e){}
  showToast(next === 'dark' ? '🌙 다크 모드' : '☀ 라이트 모드');
}

// 시스템 테마 변경 추적 — 사용자가 명시 설정 안 한 경우에만 따라감
if(window.matchMedia){
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = e => {
    if(localStorage.getItem('fox_theme')) return;  // 명시 저장 있으면 무시
    if(e.matches) document.documentElement.setAttribute('data-theme','dark');
    else          document.documentElement.removeAttribute('data-theme');
  };
  if(mq.addEventListener) mq.addEventListener('change', handler);
  else mq.addListener(handler);  // older browsers
}

// ───────── PWA Service Worker 등록 ─────────
// 홈 화면 추가 + 정적 파일 캐시(2번째 방문부터 즉시 로딩) + 오프라인 시 마지막 화면 표시
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        // 새 버전이 대기 중이면 다음 reload 때 자동 적용 (sw.js의 skipWaiting + clients.claim 덕분)
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if(!nw) return;
          nw.addEventListener('statechange', () => {
            if(nw.state === 'activated' && navigator.serviceWorker.controller){
              // 새 SW가 활성화됨 — 다음 진입부터 최신 코드. 사용자에게 알림은 굳이 안 함.
              console.log('[SW] 새 버전 활성화');
            }
          });
        });
      })
      .catch(err => console.warn('[SW] 등록 실패', err));
  });
}

// ───────── 사이드 목차 스크롤 스파이 ─────────
function initPageToc(){
  const toc = document.getElementById('pageToc');
  if(!toc || !('IntersectionObserver' in window)) return;
  const items   = Array.from(toc.querySelectorAll('.toc-item'));
  const targets = items.map(it => document.getElementById(it.dataset.target)).filter(Boolean);
  if(!targets.length) return;

  function setActive(id){
    items.forEach(it => it.classList.toggle('active', it.dataset.target === id));
  }

  const obs = new IntersectionObserver(entries => {
    const visible = entries.filter(e => e.isIntersecting)
      .sort((a,b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if(visible.length) setActive(visible[0].target.id);
  }, { rootMargin: '-12% 0px -78% 0px', threshold: 0 });

  targets.forEach(t => obs.observe(t));
}

// 담당표 팝오버: 바깥 클릭 시 닫기
document.addEventListener('click', e => {
  const picker = document.getElementById('dutyPicker');
  if(picker && picker.style.display==='block' && !picker.contains(e.target) && !e.target.closest('.cal-cell-edit')){
    closeDutyPicker();
  }
});
window.addEventListener('resize', closeDutyPicker);

// ───── 초기화 ─────
refreshNotifBtn();
initCollapse();
initPageToc();
loadData(true).then(() => { startPolling(); });
