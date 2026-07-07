// main.js — app.js 분리 (클래식 스크립트: 전역 스코프 공유)

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

document.addEventListener('visibilitychange', () => {
  if(!document.hidden){
    const elapsed = Date.now() - lastVisibleTs;
    if(elapsed > 5*60*1000 && pollEnabled) checkVersionAndLoad();
    lastVisibleTs = Date.now();
  } else {
    lastVisibleTs = Date.now();
  }
});

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
