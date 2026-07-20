// state.js — app.js 분리 (클래식 스크립트: 전역 스코프 공유)

const DAYS_KO  = ['월','화','수','목','금'];
const DAYS_EN  = ['Mon','Tue','Wed','Thu','Fri'];
const DAYS_ALL = ['월','화','수','목','금','토'];
const API_URL  = 'https://script.google.com/macros/s/AKfycbyxmp3Uo40feKuXIOWRMrS9AqcZMHZs4v3hiDqUBNsfcXHIJ285yybZoLpq988X3lcXcQ/exec';
// ★ 관리자 비밀번호 — 원하는 값으로 바꾸세요 (프론트 PIN 방식: GAS 토큰 설정 불필요)
//   더 강한 보안을 원하면 GAS Script Property 'ADMIN_TOKEN'을 이 값과 동일하게 설정하면 백엔드도 이중 검증함.
const ADMIN_PIN = 'fox2026';
let ADMIN_KEY  = '';       // 인증된 키(=PIN) · 삭제/멤버 요청에 첨부
let IS_ADMIN   = false;    // 관리자 모드 여부
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
const PROJECT_HIDE_MS = 60 * 60 * 1000;  // 완료 프로젝트 자동 숨김까지 시간 (1시간)
let projHideTimer = null;                 // 다음 자동 숨김 시점 재렌더 타이머
// 프로젝트별 고유 색 슬롯 (이름 해시 → 항상 같은 색). '기타'는 중립 회색.
const PROJ_PALETTE = ['c4','c5','c6','c7','c8','ysh','psj'];
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
let selectedEventDays = new Set();        // 일정 반복 요일(0=일~6=토) · 비면 매일

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

let _slowTimer = null;
let SCHEDULE_3WK = [];  // 3주 순환 담당표 데이터 (히어로 '오늘 담당' 계산용)

// ── 담당표 칸 클릭 → 멤버 선택 팝오버 ──
let LAST_WORK_SCHEDULE = [];  // 히어로 갱신용 캐시

// ───────── 오늘 요약 히어로 ─────────
const HERO_ICONS = {
  duty:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
  deadline:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/></svg>',
  off:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"/></svg>',
  overdue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9.5 16.5h-19z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17.5" x2="12.01" y2="17.5"/></svg>',
};

// ── 설정 모달 ──
let editingMemberIdx = -1;

// 탭이 다시 보일 때 해시 체크 (5분 이상 백그라운드였다면)
let lastVisibleTs = Date.now();
// ───────── 업무 CRUD 모달 ─────────
let editingTaskRow = null;     // null = 추가 모드, 숫자 = 수정 모드
let taskModalMode  = 'add';    // 'add' | 'edit' | 'completed-add'
let taskModalProject = '';     // 업무가 속한 프로젝트명 (추가 시 프리셋, 수정 시 유지)
let currentTasksCache = [];    // 수정 시 기존 값을 찾기 위한 캐시
let selectedAssignees = new Set();  // 담당자 다중 선택 상태

// ───────── 프로젝트 모달 ─────────
let editingProjectRow = null;   // null = 추가, 숫자 = 수정
let selectedProjectPM = '';     // 선택된 담당(PM) 이름

// ───────── 연간 캘린더 ─────────
const CAL_TYPES = [
  { key:'공휴일', cls:'holiday' },
  { key:'행사',   cls:'event'   },
  { key:'계획',   cls:'plan'    },
];

const EVENT_DOW = ['일','월','화','수','목','금','토'];
// ───────── 폴링 (자동 갱신, 해시 기반) ─────────
const POLL_INTERVAL = 30000;
let pollTimer = null;
let pollEnabled = true;
let lastDataHash = '';
let lastServerVersion = null;  // 서버가 반환한 v 값. getHash와 비교.

// ───────── 브라우저 알림 ─────────
const NOTIF_STORAGE_KEY = 'fox_notif_sent';

// ───────── 섹션 접기/펼치기 (상태 localStorage 저장) ─────────
const COLLAPSE_MAP = {
  tasks:     { content:'tasksContent',     btn:'tasksCollapseBtn',     label:'tasksCollapseLabel',     def:false },
  recurring: { content:'recurringContent', btn:'recurringCollapseBtn', label:'recurringCollapseLabel', def:false },
  completed: { content:'completedContent',  btn:'completedCollapseBtn',  label:'completedCollapseLabel',  def:true  },
};

