// api.js — app.js 분리 (클래식 스크립트: 전역 스코프 공유)

// 타임아웃 있는 fetch (GAS가 가끔 느려져 무한 대기하는 것 방지)
function fetchWithTimeout(url, ms){
  if(!('AbortController' in window)) return fetch(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

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
    const newHash       = hashTasks(tasks) + '|' + (data.workSchedule||[]).length + '|' + completedList.length + '|' + hashTasks(recurringList) + '|cal' + calendarList.length + calendarList.map(e=>e.row+e.start+e.end+e.title+e.type+(e.days||'')).join(',') + '|proj' + projectList.map(p=>p.row+'·'+(p['프로젝트명']||'')+'·'+(p['담당']||'')+'·'+(p['마감기한']||'')+'·'+(p['설명']||'')).join(',');

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

