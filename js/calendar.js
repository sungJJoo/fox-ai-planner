// calendar.js — app.js 분리 (클래식 스크립트: 전역 스코프 공유)

// v2: 3주 담당표 그리드는 제거. 데이터(SCHEDULE_3WK)와 오늘 배지만 갱신.
function buildCalendar(schedule){
  SCHEDULE_3WK = schedule || [];
  const today=midnight(new Date()),tMon=getMonday(today);
  const diff=Math.round((tMon-midnight(ANCHOR))/864e5);
  const wkIdx=((Math.floor(diff/7)%3)+3)%3;
  const tb=document.getElementById('todayBadge');
  if(tb) tb.textContent=`오늘 ${fmtFull(today)} · ${wkIdx+1}주차`;
}

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
  // 사용자 일정 (기간 포함 · 요일 필터: ev.days 있으면 해당 요일에만)
  CALENDAR_EVENTS.forEach(ev => {
    if(dateKey >= ev.start && dateKey <= (ev.end || ev.start)){
      const days = String(ev.days||'').trim();
      if(days){
        const wd = ymdToDate(dateKey).getDay();  // 0=일 ~ 6=토
        if(!days.split(',').includes(String(wd))) return;
        list.push({ ...ev, holiday:false, dayFiltered:true });
      } else {
        list.push({ ...ev, holiday:false });
      }
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
      const isMulti = !ev.holiday && !ev.leave && !ev.dayFiltered && ev.start && ev.end && ev.end > ev.start;
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

function renderEventDaysPicker(){
  const root = document.getElementById('eventDaysPicker');
  if(!root) return;
  root.innerHTML = EVENT_DOW.map((d,i)=>{
    const active = selectedEventDays.has(i) ? ' active' : '';
    return `<button type="button" class="pick-chip dow-chip${active}" onclick="toggleEventDay(${i})">${d}</button>`;
  }).join('');
}
function toggleEventDay(i){
  if(selectedEventDays.has(i)) selectedEventDays.delete(i); else selectedEventDays.add(i);
  renderEventDaysPicker();
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
    selectedEventDays = new Set((ev && ev.days ? String(ev.days).split(',') : []).filter(x=>x!=='').map(Number));
    document.getElementById('eventDeleteBtn').style.display = 'inline-flex';
  } else {
    document.getElementById('eventModalTitle').textContent = '일정 추가';
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventStart').value = prefillDate || ymdFromDate(new Date());
    document.getElementById('eventEnd').value   = '';
    document.getElementById('eventMemo').value  = '';
    selectedEventType = '계획';
    selectedEventDays = new Set();
    document.getElementById('eventDeleteBtn').style.display = 'none';
  }
  renderEventTypePicker();
  renderEventDaysPicker();

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
  const days  = [...selectedEventDays].sort((a,b)=>a-b).join(',');   // 예: "3" 또는 "1,3"

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
    if(idx >= 0) CALENDAR_EVENTS[idx] = { row:eRow, start, end, title, type, memo, days };
  } else {
    tempObj = { row:-Date.now(), start, end, title, type, memo, days };  // 임시 행번호
    CALENDAR_EVENTS.push(tempObj);
  }
  renderMonthGrid();
  showToast(eRow ? '✓ 일정이 수정되었습니다' : '✓ 일정이 추가되었습니다');

  // 서버는 뒤에서 처리
  try{
    const params = new URLSearchParams({
      action: eRow ? 'updateCalendarEvent' : 'addCalendarEvent',
      start, end, title, type, memo, days,
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

