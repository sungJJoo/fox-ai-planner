// projects.js — app.js 분리 (클래식 스크립트: 전역 스코프 공유)

function saveProjCollapse(){ try{ localStorage.setItem('fox_proj_collapse', JSON.stringify(projCollapseState)); }catch(e){} }
function projColorSlot(name){
  if(name === '기타') return 'kkh';
  let h=0; for(let i=0;i<name.length;i++) h=(h*31 + name.charCodeAt(i))>>>0;
  return PROJ_PALETTE[h % PROJ_PALETTE.length];
}
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

