// tasks.js — app.js 분리 (클래식 스크립트: 전역 스코프 공유)

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

function hashTasks(tasks){
  return tasks.map(t => `${t.row}|${t['업무']}|${t['담당']}|${t['마감기한']}|${t['완료']?1:0}|${t['개별완료']||''}|${t['댓글']||''}|${t['프로젝트']||''}`).join('||');
}

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

