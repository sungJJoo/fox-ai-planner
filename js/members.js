// members.js — app.js 분리 (클래식 스크립트: 전역 스코프 공유)

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

