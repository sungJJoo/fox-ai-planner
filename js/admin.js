// admin.js — 관리자 모드 (백엔드 토큰 인증) · 삭제·멤버·설정 잠금

// 삭제/멤버 요청 URL에 붙일 관리자 키 파라미터
function adminParam(){
  return IS_ADMIN && ADMIN_KEY ? '&adminKey=' + encodeURIComponent(ADMIN_KEY) : '';
}

// 관리자 상태를 화면에 반영 (body 클래스 + 버튼 표시)
function applyAdminUI(){
  document.body.classList.toggle('is-admin', IS_ADMIN);
  const btn = document.getElementById('adminBtn');
  if(btn){
    btn.classList.toggle('on', IS_ADMIN);
    btn.title = IS_ADMIN ? '관리자 모드 ON — 클릭 시 해제' : '관리자 모드';
  }
}

// 삭제/설정 버튼 노출 갱신 위해 목록 재렌더
function rerenderForAdmin(){
  if(typeof buildTasks === 'function' && typeof currentTasksCache !== 'undefined') buildTasks(currentTasksCache);
  if(typeof buildRecurring === 'function' && typeof RECURRING_TASKS !== 'undefined') buildRecurring(RECURRING_TASKS);
  if(typeof renderMonthGrid === 'function') renderMonthGrid();
}

// 부팅 시: 저장된 PIN이 현재 PIN과 일치하면 관리자 유지
function initAdmin(){
  let saved = '';
  try{ saved = localStorage.getItem('fox_admin_key') || ''; }catch(e){ saved = ''; }
  if(saved && saved === ADMIN_PIN){
    ADMIN_KEY = saved; IS_ADMIN = true;
  }else{
    ADMIN_KEY = ''; IS_ADMIN = false;
    try{ localStorage.removeItem('fox_admin_key'); }catch(e){}
  }
  applyAdminUI();
}

function openAdminModal(){
  if(IS_ADMIN){ exitAdmin(); return; }   // 이미 관리자면 클릭 시 해제
  const inp = document.getElementById('adminInput');
  if(inp) inp.value = '';
  document.getElementById('adminOverlay').classList.add('show');
  document.getElementById('adminModal').classList.add('show');
  setTimeout(()=>{ if(inp) inp.focus(); }, 100);
}
function closeAdminModal(){
  document.getElementById('adminOverlay').classList.remove('show');
  document.getElementById('adminModal').classList.remove('show');
}

function submitAdminLogin(){
  const key = document.getElementById('adminInput').value.trim();
  if(!key){ showToast('관리자 비밀번호를 입력하세요', true); return; }
  if(key !== ADMIN_PIN){ showToast('비밀번호가 올바르지 않습니다', true); return; }
  ADMIN_KEY = key; IS_ADMIN = true;
  try{ localStorage.setItem('fox_admin_key', key); }catch(e){}
  applyAdminUI();
  closeAdminModal();
  rerenderForAdmin();
  showToast('✓ 관리자 모드 ON');
}

function exitAdmin(){
  IS_ADMIN = false; ADMIN_KEY = '';
  try{ localStorage.removeItem('fox_admin_key'); }catch(e){}
  applyAdminUI();
  rerenderForAdmin();
  showToast('관리자 모드 OFF');
}
