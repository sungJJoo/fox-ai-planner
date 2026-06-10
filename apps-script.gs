/**
 * FOX AI 연구소 담당표 - Google Apps Script 백엔드
 *
 * 이 파일은 백업용입니다. 실제 실행은 Google Apps Script 편집기 안에서 이루어집니다.
 *
 * 스프레드시트: https://docs.google.com/spreadsheets/d/1JqEEkUFPM2kVNhesqyEeXePtPhmFy9NIiOe0uga8R2w/edit
 *
 * 배포 방법 (변경 후):
 *   1) 이 파일 전체 내용 복사
 *   2) GAS 편집기 (script.google.com)에서 코드 덮어쓰기
 *   3) 저장 (Ctrl+S)
 *   4) 배포 → 배포 관리 → 연필 아이콘 → 버전 "새 버전" 선택 → 배포
 *   5) URL이 변경되면 index.html의 API_URL 갱신 + 커밋/push
 *
 * 시트 구조:
 *   - 담당표:    A1:F4 = 3주 순환 스케줄 (헤더 + 3주 데이터)
 *                A7:H  = 업무 리스트 (헤더 + 업무행들)
 *                       A=업무, B=담당, C=마감기한, D=세부사항, E=완료(TRUE/FALSE), F=완료시각,
 *                       G=개별완료(JSON: {이름:timestamp}), H=댓글(JSON: [{author,text,ts}])
 *   - 멤버:      이름 | 역할 | 색상 (Apps Script가 없으면 자동 생성)
 *   - 근무일정:  날짜행 + 멤버행 반복 (시간/휴무/연차/반차/공휴일)
 *   - 완료 업무: 업무 | 담당 | 마감기한 | 세부사항 | 완료시각 (자동 생성)
 *
 * 액션:
 *   GET /                              → schedule, tasks, members, workSchedule, completedTasks, recurringTasks, v
 *   GET ?action=getHash                → { v } 만 (가벼운 변경 감지 핑)
 *   GET ?action=setComplete&row=N&value=true/false
 *   GET ?action=setSchedule&week=1~3&day=월~금&name=  (3주 순환 담당표 칸 변경, name='' 비우기)
 *   GET ?action=setPersonalComplete&row=N&person=name&value=true/false
 *   GET ?action=addComment&row=N&author=name&text=content  (author 필수 — 익명 불가)
 *   GET ?action=deleteComment&row=N&ts=timestamp
 *   GET ?action=addTask&name=&assignee=&deadline=&detail=
 *   GET ?action=updateTask&row=N&name=&assignee=&deadline=&detail=
 *   GET ?action=deleteTask&row=N
 *   GET ?action=addCompletedTask&name=&assignee=&deadline=&detail=&completedAt=
 *   GET ?action=addRecurringTask&name=&mon=&tue=&wed=&thu=&fri=&sat=&detail=
 *   GET ?action=updateRecurringTask&row=N&name=&mon=&tue=&wed=&thu=&fri=&sat=&detail=
 *   GET ?action=deleteRecurringTask&row=N
 *   GET ?action=addCalendarEvent&start=YYYY-MM-DD&end=YYYY-MM-DD&title=&type=공휴일/행사/계획&memo=
 *   GET ?action=updateCalendarEvent&row=N&start=&end=&title=&type=&memo=
 *   GET ?action=deleteCalendarEvent&row=N
 *   GET ?action=addMember&name=&role=&color=
 *   GET ?action=updateMember&original=&name=&role=&color=
 *   GET ?action=deleteMember&name=
 */

/**
 * 변경 버전 카운터 — 모든 mutation 액션 끝에서 호출
 * 클라이언트는 ?action=getHash로 이 값만 받아 변경 감지
 */
function bumpVersion() {
  PropertiesService.getScriptProperties().setProperty('v', String(Date.now()));
}
function currentVersion() {
  return PropertiesService.getScriptProperties().getProperty('v') || '0';
}

function doGet(e) {

  const action = e.parameter.action;
  const ss     = SpreadsheetApp.getActiveSpreadsheet();

  // ── 변경 감지용 가벼운 핑 (폴링이 이걸로 함) ──
  if (action === 'getHash') {
    return ContentService
      .createTextOutput(JSON.stringify({ v: currentVersion() }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 멤버 시트 자동 생성 ──
  function ensureMemberSheet() {
    let ms = ss.getSheetByName('멤버');
    if (!ms) {
      ms = ss.insertSheet('멤버');
      ms.getRange(1, 1, 4, 3).setValues([
        ['이름', '역할', '색상'],
        ['윤승희', '팀장',   'ysh'],
        ['박성주', '연구원', 'psj'],
        ['김기환', '연구원', 'kkh'],
      ]);
      ms.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#f0ede8');
    }
    return ms;
  }

  // ── 완료 업무 아카이브 시트 자동 생성 ──
  function ensureCompletedSheet() {
    let cs = ss.getSheetByName('완료 업무');
    if (!cs) {
      cs = ss.insertSheet('완료 업무');
      cs.getRange(1, 1, 1, 5).setValues([
        ['업무', '담당', '마감기한', '세부사항', '완료시각']
      ]);
      cs.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#f0ede8');
      cs.setColumnWidth(1, 220);
      cs.setColumnWidth(2, 90);
      cs.setColumnWidth(3, 100);
      cs.setColumnWidth(4, 280);
      cs.setColumnWidth(5, 160);
    }
    return cs;
  }

  // ── 반복 업무 시트 자동 생성 (요일별 담당 구조) ──
  function ensureRecurringSheet() {
    let rs = ss.getSheetByName('반복 업무');
    if (rs) {
      // 옛 스키마(B열 헤더가 '담당')이면 삭제 후 재생성
      const headerB = String(rs.getRange(1, 2).getValue()).trim();
      if (headerB === '담당') {
        ss.deleteSheet(rs);
        rs = null;
      }
    }
    if (!rs) {
      rs = ss.insertSheet('반복 업무');
      rs.getRange(1, 1, 1, 8).setValues([
        ['업무', '월', '화', '수', '목', '금', '토', '세부사항']
      ]);
      rs.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#f0ede8');
      rs.setColumnWidth(1, 200);
      rs.setColumnWidth(2, 80);
      rs.setColumnWidth(3, 80);
      rs.setColumnWidth(4, 80);
      rs.setColumnWidth(5, 80);
      rs.setColumnWidth(6, 80);
      rs.setColumnWidth(7, 80);
      rs.setColumnWidth(8, 220);
    }
    return rs;
  }

  // ── 캘린더 시트 자동 생성 (연간 일정/행사/공휴일) ──
  function ensureCalendarSheet() {
    let cs = ss.getSheetByName('캘린더');
    if (!cs) {
      cs = ss.insertSheet('캘린더');
      cs.getRange(1, 1, 1, 5).setValues([
        ['시작일', '종료일', '제목', '유형', '메모']
      ]);
      cs.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#f0ede8');
      cs.setColumnWidth(1, 110);
      cs.setColumnWidth(2, 110);
      cs.setColumnWidth(3, 220);
      cs.setColumnWidth(4, 80);
      cs.setColumnWidth(5, 280);
    }
    return cs;
  }

  // ── 완료 토글 ──
  if (action === 'setComplete') {
    const sheet = ss.getSheetByName('담당표');
    const row   = parseInt(e.parameter.row);
    const value = e.parameter.value === 'true';

    sheet.getRange(row, 5).setValue(value);
    const tsCell = sheet.getRange(row, 6);
    if (value) {
      tsCell.setValue(new Date());
      tsCell.setNumberFormat('yyyy-MM-dd HH:mm:ss');
    } else {
      tsCell.clearContent();
    }

    bumpVersion();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 3주 순환 담당표 칸 변경 (A1:F4) ──
  if (action === 'setSchedule') {
    const sheet = ss.getSheetByName('담당표');
    const week  = parseInt(e.parameter.week);   // 1,2,3
    const day   = e.parameter.day || '';        // 월~금
    const name  = e.parameter.name || '';       // 멤버 이름 또는 '' (비우기)
    const dayCols = { '월':2, '화':3, '수':4, '목':5, '금':6 };

    if (!week || week < 1 || week > 3 || !dayCols[day]) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: '주차/요일 오류' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 헤더가 1행이므로 week 1 = 2행, 2 = 3행, 3 = 4행
    sheet.getRange(week + 1, dayCols[day]).setValue(name);

    bumpVersion();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 개별 완료 토글 (다중 담당자) ──
  if (action === 'setPersonalComplete') {
    const sheet  = ss.getSheetByName('담당표');
    const row    = parseInt(e.parameter.row);
    const person = e.parameter.person || '';
    const value  = e.parameter.value === 'true';

    if (!person || !row || row < 8) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: '파라미터 오류' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // G열 개별완료 JSON 업데이트
    const gCell = sheet.getRange(row, 7);
    let personal = {};
    try { personal = JSON.parse(gCell.getValue() || '{}'); } catch(err) { personal = {}; }

    personal[person] = value ? Date.now() : null;
    gCell.setValue(JSON.stringify(personal));

    // 담당자 목록 확인 → 전원 완료 여부 결정
    const assigneeStr = String(sheet.getRange(row, 2).getValue() || '').trim();
    let assignees = [];
    if (assigneeStr === 'AI 연구원') {
      const ms = ensureMemberSheet();
      const mdata = ms.getDataRange().getValues();
      for (let i = 1; i < mdata.length; i++) {
        const n = String(mdata[i][0] || '').trim();
        if (n) assignees.push(n);
      }
    } else {
      assignees = assigneeStr.split(',').map(x => x.trim()).filter(Boolean);
    }

    const allDone = assignees.length > 0 && assignees.every(a => personal[a]);
    sheet.getRange(row, 5).setValue(allDone);
    const tsCell = sheet.getRange(row, 6);
    if (allDone) {
      tsCell.setValue(new Date());
      tsCell.setNumberFormat('yyyy-MM-dd HH:mm:ss');
    } else {
      tsCell.clearContent();
    }

    bumpVersion();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, allDone }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 댓글 추가 ──
  if (action === 'addComment') {
    const sheet  = ss.getSheetByName('담당표');
    const row    = parseInt(e.parameter.row);
    const author = e.parameter.author || '';
    const text   = e.parameter.text   || '';

    if (!text || !author || !row || row < 8) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: '작성자/내용 누락' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const hCell = sheet.getRange(row, 8);
    let comments = [];
    try { comments = JSON.parse(hCell.getValue() || '[]'); } catch(err) { comments = []; }

    const ts = Date.now();
    comments.push({ author, text, ts });
    hCell.setValue(JSON.stringify(comments));

    bumpVersion();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, ts }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 댓글 삭제 ──
  if (action === 'deleteComment') {
    const sheet = ss.getSheetByName('담당표');
    const row   = parseInt(e.parameter.row);
    const ts    = parseInt(e.parameter.ts);

    if (!row || row < 8 || !ts) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: '파라미터 오류' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const hCell = sheet.getRange(row, 8);
    let comments = [];
    try { comments = JSON.parse(hCell.getValue() || '[]'); } catch(err) { comments = []; }

    comments = comments.filter(c => c.ts !== ts);
    hCell.setValue(comments.length ? JSON.stringify(comments) : '');

    bumpVersion();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 업무 추가 ──
  if (action === 'addTask') {
    const sheet = ss.getSheetByName('담당표');
    const name     = e.parameter.name     || '';
    const assignee = e.parameter.assignee || '';
    const deadline = e.parameter.deadline || '';
    const detail   = e.parameter.detail   || '';

    if (!name) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: '업무명 누락' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    let deadlineValue = '';
    if (deadline) {
      const d = new Date(deadline);
      if (!isNaN(d.getTime())) deadlineValue = d;
    }

    const lastRow = sheet.getLastRow();
    const newRow = Math.max(lastRow + 1, 8);

    sheet.getRange(newRow, 1, 1, 8).setValues([[name, assignee, deadlineValue, detail, false, '', '', '']]);

    if (deadlineValue) {
      sheet.getRange(newRow, 3).setNumberFormat('yyyy-MM-dd');
    }

    bumpVersion();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, row: newRow }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 업무 수정 ──
  if (action === 'updateTask') {
    const sheet = ss.getSheetByName('담당표');
    const row      = parseInt(e.parameter.row);
    const name     = e.parameter.name     || '';
    const assignee = e.parameter.assignee || '';
    const deadline = e.parameter.deadline || '';
    const detail   = e.parameter.detail   || '';

    if (!row || row < 8) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: '행 번호 오류' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    let deadlineValue = '';
    if (deadline) {
      const d = new Date(deadline);
      if (!isNaN(d.getTime())) deadlineValue = d;
    }

    // A~D만 업데이트 (완료/완료시각은 건드리지 않음)
    sheet.getRange(row, 1, 1, 4).setValues([[name, assignee, deadlineValue, detail]]);

    if (deadlineValue) {
      sheet.getRange(row, 3).setNumberFormat('yyyy-MM-dd');
    }

    bumpVersion();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 업무 삭제 ──
  if (action === 'deleteTask') {
    const sheet = ss.getSheetByName('담당표');
    const row = parseInt(e.parameter.row);

    if (!row || row < 8) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: '행 번호 오류' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    sheet.deleteRow(row);

    bumpVersion();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 완료 업무 수동 추가 ──
  if (action === 'addCompletedTask') {
    const cs = ensureCompletedSheet();
    const name        = e.parameter.name        || '';
    const assignee    = e.parameter.assignee    || '';
    const deadline    = e.parameter.deadline    || '';
    const detail      = e.parameter.detail      || '';
    const completedAt = e.parameter.completedAt || '';

    if (!name) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: '업무명 누락' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    let deadlineValue = '';
    if (deadline) {
      const d = new Date(deadline);
      if (!isNaN(d.getTime())) deadlineValue = d;
    }

    let completedAtValue = new Date();  // 기본값: 지금
    if (completedAt) {
      const d = new Date(completedAt);
      if (!isNaN(d.getTime())) completedAtValue = d;
    }

    cs.appendRow([name, assignee, deadlineValue, detail, completedAtValue]);
    const newRow = cs.getLastRow();
    cs.getRange(newRow, 5).setNumberFormat('yyyy-MM-dd HH:mm:ss');
    if (deadlineValue) cs.getRange(newRow, 3).setNumberFormat('yyyy-MM-dd');

    bumpVersion();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, row: newRow }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 반복 업무 추가 (요일별 담당 구조) ──
  if (action === 'addRecurringTask') {
    const rs = ensureRecurringSheet();
    const name = e.parameter.name || '';
    const mon  = e.parameter.mon  || '';
    const tue  = e.parameter.tue  || '';
    const wed  = e.parameter.wed  || '';
    const thu  = e.parameter.thu  || '';
    const fri  = e.parameter.fri  || '';
    const sat  = e.parameter.sat  || '';
    const detail = e.parameter.detail || '';

    if (!name) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: '업무명 누락' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    rs.appendRow([name, mon, tue, wed, thu, fri, sat, detail]);
    const newRow = rs.getLastRow();

    bumpVersion();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, row: newRow }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 반복 업무 수정 ──
  if (action === 'updateRecurringTask') {
    const rs = ensureRecurringSheet();
    const row = parseInt(e.parameter.row);
    const name = e.parameter.name || '';
    const mon  = e.parameter.mon  || '';
    const tue  = e.parameter.tue  || '';
    const wed  = e.parameter.wed  || '';
    const thu  = e.parameter.thu  || '';
    const fri  = e.parameter.fri  || '';
    const sat  = e.parameter.sat  || '';
    const detail = e.parameter.detail || '';

    if (!row || row < 2) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: '행 번호 오류' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    rs.getRange(row, 1, 1, 8).setValues([[name, mon, tue, wed, thu, fri, sat, detail]]);

    bumpVersion();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 반복 업무 삭제 ──
  if (action === 'deleteRecurringTask') {
    const rs = ensureRecurringSheet();
    const row = parseInt(e.parameter.row);
    if (!row || row < 2) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: '행 번호 오류' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    rs.deleteRow(row);
    bumpVersion();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 캘린더 일정 추가 ──
  if (action === 'addCalendarEvent') {
    const cs = ensureCalendarSheet();
    const start = e.parameter.start || '';
    const end   = e.parameter.end   || '';
    const title = e.parameter.title || '';
    const type  = e.parameter.type  || '계획';
    const memo  = e.parameter.memo  || '';

    if (!start || !title) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: '날짜/제목 누락' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 날짜는 문자열(yyyy-MM-dd)로 그대로 저장 (자동 Date 변환 방지 위해 앞에 '를 안 붙이고 plain text)
    cs.appendRow([start, end || start, title, type, memo]);
    const newRow = cs.getLastRow();
    cs.getRange(newRow, 1, 1, 2).setNumberFormat('@');  // 텍스트 형식 고정

    bumpVersion();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, row: newRow }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 캘린더 일정 수정 ──
  if (action === 'updateCalendarEvent') {
    const cs = ensureCalendarSheet();
    const row   = parseInt(e.parameter.row);
    const start = e.parameter.start || '';
    const end   = e.parameter.end   || '';
    const title = e.parameter.title || '';
    const type  = e.parameter.type  || '계획';
    const memo  = e.parameter.memo  || '';

    if (!row || row < 2 || !start || !title) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: '파라미터 오류' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    cs.getRange(row, 1, 1, 5).setValues([[start, end || start, title, type, memo]]);
    cs.getRange(row, 1, 1, 2).setNumberFormat('@');

    bumpVersion();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 캘린더 일정 삭제 ──
  if (action === 'deleteCalendarEvent') {
    const cs = ensureCalendarSheet();
    const row = parseInt(e.parameter.row);
    if (!row || row < 2) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: '행 번호 오류' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    cs.deleteRow(row);
    bumpVersion();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 멤버 추가 ──
  if (action === 'addMember') {
    const ms    = ensureMemberSheet();
    const name  = e.parameter.name  || '';
    const role  = e.parameter.role  || '';
    const color = e.parameter.color || 'ysh';

    if (!name) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: '이름 누락' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    ms.appendRow([name, role, color]);
    bumpVersion();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 멤버 수정 (다른 시트 자동 반영) ──
  if (action === 'updateMember') {
    const ms       = ensureMemberSheet();
    const original = e.parameter.original || '';
    const name     = e.parameter.name     || '';
    const role     = e.parameter.role     || '';
    const color    = e.parameter.color    || 'ysh';

    // 1) 멤버 시트 업데이트
    const mdata = ms.getDataRange().getValues();
    let found = false;
    for (let i = 1; i < mdata.length; i++) {
      if (String(mdata[i][0]).trim() === original) {
        ms.getRange(i + 1, 1, 1, 3).setValues([[name, role, color]]);
        found = true;
        break;
      }
    }
    if (!found) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: '멤버 없음' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 2) 담당표 (A1:F4) 이름 일괄 치환
    const sheet = ss.getSheetByName('담당표');
    const sched = sheet.getRange('A1:F4').getValues();
    for (let i = 0; i < sched.length; i++) {
      for (let j = 0; j < sched[i].length; j++) {
        if (String(sched[i][j]).trim() === original) {
          sched[i][j] = name;
        }
      }
    }
    sheet.getRange('A1:F4').setValues(sched);

    // 3) 근무일정 시트 전체 이름 치환
    const wsheet = ss.getSheetByName('근무일정');
    if (wsheet) {
      const lastRow = wsheet.getLastRow();
      if (lastRow > 0) {
        const wdata = wsheet.getRange(1, 1, lastRow, 7).getValues();
        for (let i = 0; i < wdata.length; i++) {
          for (let j = 0; j < wdata[i].length; j++) {
            if (String(wdata[i][j]).trim() === original) {
              wdata[i][j] = name;
            }
          }
        }
        wsheet.getRange(1, 1, lastRow, 7).setValues(wdata);
      }
    }

    // 4) 완료 업무 아카이브에서도 담당자 이름 반영
    const csheet = ss.getSheetByName('완료 업무');
    if (csheet && csheet.getLastRow() > 1) {
      const cdata = csheet.getRange(2, 2, csheet.getLastRow() - 1, 1).getValues();
      let changed = false;
      for (let i = 0; i < cdata.length; i++) {
        if (String(cdata[i][0]).trim() === original) {
          cdata[i][0] = name;
          changed = true;
        }
      }
      if (changed) csheet.getRange(2, 2, cdata.length, 1).setValues(cdata);
    }

    // 5) 반복 업무에서도 담당자 이름 반영 (B~G의 6개 요일 컬럼 전체 스캔)
    const rsheet = ss.getSheetByName('반복 업무');
    if (rsheet && rsheet.getLastRow() > 1) {
      const rdata = rsheet.getRange(2, 2, rsheet.getLastRow() - 1, 6).getValues();
      let changed = false;
      for (let i = 0; i < rdata.length; i++) {
        for (let j = 0; j < 6; j++) {
          if (String(rdata[i][j]).trim() === original) {
            rdata[i][j] = name;
            changed = true;
          }
        }
      }
      if (changed) rsheet.getRange(2, 2, rdata.length, 6).setValues(rdata);
    }

    // 6) 담당표 업무행(8행~) B열 담당자 이름 치환 + G열 개별완료 키 + H열 댓글 작성자
    const taskLastRow = sheet.getLastRow();
    if (taskLastRow >= 8) {
      // B열
      const taskBData = sheet.getRange(8, 2, taskLastRow - 7, 1).getValues();
      let taskBChanged = false;
      for (let i = 0; i < taskBData.length; i++) {
        const cell = String(taskBData[i][0] || '').trim();
        if (!cell) continue;
        const newCell = cell.split(',').map(x => x.trim() === original ? name : x.trim()).join(',');
        if (newCell !== cell) { taskBData[i][0] = newCell; taskBChanged = true; }
      }
      if (taskBChanged) sheet.getRange(8, 2, taskLastRow - 7, 1).setValues(taskBData);

      // G열, H열
      const taskGHData = sheet.getRange(8, 7, taskLastRow - 7, 2).getValues();
      let taskGHChanged = false;
      for (let i = 0; i < taskGHData.length; i++) {
        if (taskGHData[i][0]) {
          try {
            const p = JSON.parse(taskGHData[i][0]);
            if (p.hasOwnProperty(original)) {
              p[name] = p[original]; delete p[original];
              taskGHData[i][0] = JSON.stringify(p); taskGHChanged = true;
            }
          } catch(err) {}
        }
        if (taskGHData[i][1]) {
          try {
            const cs = JSON.parse(taskGHData[i][1]);
            let c2 = false;
            cs.forEach(c => { if (c.author === original) { c.author = name; c2 = true; } });
            if (c2) { taskGHData[i][1] = JSON.stringify(cs); taskGHChanged = true; }
          } catch(err) {}
        }
      }
      if (taskGHChanged) sheet.getRange(8, 7, taskLastRow - 7, 2).setValues(taskGHData);
    }

    bumpVersion();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 멤버 삭제 ──
  if (action === 'deleteMember') {
    const ms   = ensureMemberSheet();
    const name = e.parameter.name || '';
    const data = ms.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === name) {
        ms.deleteRow(i + 1);
        bumpVersion();
        return ContentService
          .createTextOutput(JSON.stringify({ ok: true }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: '멤버 없음' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── 기본 데이터 읽기 (action 없거나 매칭 안 됨) ──
  const sheet = ss.getSheetByName('담당표');
  const tz    = Session.getScriptTimeZone();
  const memberSheet = ensureMemberSheet();
  ensureCompletedSheet();
  ensureRecurringSheet();
  ensureCalendarSheet();

  // 멤버 리스트
  const memRaw = memberSheet.getDataRange().getValues();
  const memHeaders = memRaw[0];
  const members = memRaw.slice(1).filter(r => r[0]).map(row => {
    const obj = {};
    memHeaders.forEach((h, i) => { obj[String(h)] = row[i]; });
    return obj;
  });

  const fmtDate = (v) => {
    if (!v && v !== 0) return '';
    if (typeof v === 'object' && v !== null && typeof v.getTime === 'function') {
      try {
        const h = v.getHours(), m = v.getMinutes();
        if (h === 0 && m === 0) return Utilities.formatDate(v, tz, 'M/d');
        return Utilities.formatDate(v, tz, 'M/d HH:mm');
      } catch(e) {}
    }
    return String(v).trim();
  };

  const scheduleValues = sheet.getRange('A1:F4').getValues();
  const taskValues     = sheet.getRange('A7:H').getValues().filter(r => r[0]);

  // 근무일정 파싱 (날짜행 + 멤버행 반복 구조)
  const workSheet = ss.getSheetByName('근무일정');
  let workSchedule = [];

  if (workSheet && workSheet.getLastRow() > 3) {
    const raw = workSheet
      .getRange(1, 1, workSheet.getLastRow(), 7)
      .getDisplayValues();

    const isDateRow = (row) => {
      if (String(row[0] || '').trim() !== '') return false;
      return /^\d{1,2}\/\d{1,2}/.test(String(row[1] || '').trim());
    };

    let i = 0;
    while (i < raw.length) {
      if (isDateRow(raw[i])) {
        const dates = {
          '월': String(raw[i][1] || '').trim(),
          '화': String(raw[i][2] || '').trim(),
          '수': String(raw[i][3] || '').trim(),
          '목': String(raw[i][4] || '').trim(),
          '금': String(raw[i][5] || '').trim(),
          '토': String(raw[i][6] || '').trim(),
        };
        const mem = {};
        i++;
        while (i < raw.length && String(raw[i][0] || '').trim() !== '') {
          const name = String(raw[i][0]).trim();
          mem[name] = {
            '월': String(raw[i][1] || '').trim(),
            '화': String(raw[i][2] || '').trim(),
            '수': String(raw[i][3] || '').trim(),
            '목': String(raw[i][4] || '').trim(),
            '금': String(raw[i][5] || '').trim(),
            '토': String(raw[i][6] || '').trim(),
          };
          i++;
        }
        workSchedule.push({ dates, members: mem });
      } else {
        i++;
      }
    }
  }

  const headers = scheduleValues[0];
  const schedule = scheduleValues.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });

  const THIRTY_MIN = 30 * 60 * 1000;
  const now       = new Date().getTime();

  const tasks = taskValues
    .slice(1)
    .map((row, idx) => {
      const completedAt = (typeof row[5] === 'object' && row[5] !== null && typeof row[5].getTime === 'function')
        ? row[5].getTime() : null;
      return {
        row:       idx + 8,
        업무:      row[0],
        담당:      row[1],
        마감기한:  fmtDate(row[2]),
        세부사항:  row[3],
        완료:      row[4] === true || row[4] === 'TRUE',
        완료시각:  completedAt,
        개별완료:  String(row[6] || '').trim(),
        댓글:      String(row[7] || '').trim(),
      };
    })
    .filter(task => {
      if (!task['완료']) return true;
      if (!task['완료시각']) return false;
      return (now - task['완료시각']) < THIRTY_MIN;
    });

  // 완료 업무 아카이브 읽기
  const completedSheet = ss.getSheetByName('완료 업무');
  let completedTasks = [];
  if (completedSheet && completedSheet.getLastRow() > 1) {
    const cRaw = completedSheet
      .getRange(2, 1, completedSheet.getLastRow() - 1, 5)
      .getValues();
    completedTasks = cRaw.filter(r => r[0]).map(row => {
      const completedAt = (typeof row[4] === 'object' && row[4] !== null && typeof row[4].getTime === 'function')
        ? row[4].getTime() : null;
      return {
        업무:     row[0],
        담당:     row[1],
        마감기한: fmtDate(row[2]),
        세부사항: row[3],
        완료시각: completedAt,
      };
    });
  }

  // 반복 업무 읽기 (요일별 담당 구조)
  const recurringSheet = ss.getSheetByName('반복 업무');
  let recurringTasks = [];
  if (recurringSheet && recurringSheet.getLastRow() > 1) {
    const rRaw = recurringSheet
      .getRange(2, 1, recurringSheet.getLastRow() - 1, 8)
      .getValues();
    recurringTasks = rRaw
      .map((row, idx) => ({
        row:      idx + 2,
        업무:     row[0],
        월:       String(row[1] || '').trim(),
        화:       String(row[2] || '').trim(),
        수:       String(row[3] || '').trim(),
        목:       String(row[4] || '').trim(),
        금:       String(row[5] || '').trim(),
        토:       String(row[6] || '').trim(),
        세부사항: String(row[7] || '').trim(),
      }))
      .filter(t => t['업무']);
  }

  // 캘린더 일정 읽기
  const calendarSheet = ss.getSheetByName('캘린더');
  let calendarEvents = [];
  if (calendarSheet && calendarSheet.getLastRow() > 1) {
    const calRaw = calendarSheet
      .getRange(2, 1, calendarSheet.getLastRow() - 1, 5)
      .getDisplayValues();  // 날짜를 화면 표시값(텍스트)으로 읽음
    calendarEvents = calRaw
      .map((row, idx) => ({
        row:    idx + 2,
        start:  String(row[0] || '').trim(),
        end:    String(row[1] || '').trim() || String(row[0] || '').trim(),
        title:  String(row[2] || '').trim(),
        type:   String(row[3] || '').trim() || '계획',
        memo:   String(row[4] || '').trim(),
      }))
      .filter(ev => ev.start && ev.title);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ members, schedule, tasks, workSchedule, completedTasks, recurringTasks, calendarEvents, v: currentVersion() }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 2시간 지난 완료 업무를 '완료 업무' 시트로 이동 후 담당표에서 제거
 * → installTrigger()로 1시간마다 자동 실행됨
 */
function cleanupCompleted() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('담당표');
  const last  = sheet.getLastRow();
  if (last < 8) return;

  let cs = ss.getSheetByName('완료 업무');
  if (!cs) {
    cs = ss.insertSheet('완료 업무');
    cs.getRange(1, 1, 1, 5).setValues([
      ['업무', '담당', '마감기한', '세부사항', '완료시각']
    ]);
    cs.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#f0ede8');
  }

  const data      = sheet.getRange(8, 1, last - 7, 8).getValues();
  const THIRTY_MIN = 30 * 60 * 1000;
  const now       = new Date().getTime();

  let changed = false;
  for (let i = data.length - 1; i >= 0; i--) {
    const isDone = data[i][4] === true || data[i][4] === 'TRUE';
    const ts     = (typeof data[i][5] === 'object' && data[i][5] !== null && typeof data[i][5].getTime === 'function')
      ? data[i][5].getTime() : null;
    if (isDone && ts && (now - ts) > THIRTY_MIN) {
      // 아카이브로 복사
      cs.appendRow([data[i][0], data[i][1], data[i][2], data[i][3], data[i][5]]);
      const newRow = cs.getLastRow();
      cs.getRange(newRow, 5).setNumberFormat('yyyy-MM-dd HH:mm:ss');
      if (data[i][2] instanceof Date) {
        cs.getRange(newRow, 3).setNumberFormat('yyyy-MM-dd');
      }
      // 담당표에서 삭제
      sheet.deleteRow(i + 8);
      changed = true;
    }
  }
  if (changed) bumpVersion();
}

/**
 * 15분마다 cleanupCompleted를 실행하는 트리거 설치
 * → GAS 편집기에서 직접 1회 실행 필요 (편집기 → installTrigger 선택 → 실행)
 * → 코드 업데이트 후에도 다시 한 번 실행해줘야 새 주기로 적용됨
 */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'cleanupCompleted') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cleanupCompleted').timeBased().everyMinutes(15).create();
}

/* ═══════════════════════ 근무일정 월 자동 전환 ═══════════════════════
 * 매달 1일 기준으로 근무일정 날짜를 그 달로 자동 교체.
 * - 멤버 근무패턴(근무시간·고정 휴무)과 모든 서식(색·테두리)은 그대로 유지, 날짜만 교체
 * - 월~토 레이아웃, 일요일은 칸 없음 → 1일이 일요일이면 자동으로 2일(월)부터 시작
 * - 한 달이 6주 필요하면(예: 1일이 토요일+31일) 마지막 블록을 복사해 자동 확장
 *
 * 사용:
 *   1) 재배포 후 GAS 편집기에서 rollWorkScheduleMonth 1회 직접 실행 → 이번 달로 전환되는지 확인
 *   2) 잘 되면 installMonthTrigger 1회 실행 → 매일 새벽 1시 자동 점검(월 바뀌면 전환)
 */

// 해당 월의 월~토 주 배열. 각 주 = [월,화,수,목,금,토] 'M/d' 문자열 또는 ''
function computeMonthWeeks_(year, month) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const weeks = [];
  let cur = ['', '', '', '', '', ''];
  let hasAny = false;
  for (let d = 1; d <= lastDay; d++) {
    const wd = new Date(year, month, d).getDay(); // 0=일 ... 6=토
    if (wd === 0) continue;                        // 일요일 칸 없음 → 건너뜀
    cur[wd - 1] = (month + 1) + '/' + d;           // 월=0 ... 토=5
    hasAny = true;
    if (wd === 6) { weeks.push(cur); cur = ['', '', '', '', '', '']; hasAny = false; }
  }
  if (hasAny) weeks.push(cur);
  return weeks;
}

// 근무일정을 지정 월(기본 오늘)로 전환. 날짜만 교체, 패턴/서식 유지.
function rollWorkScheduleMonth(optDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName('근무일정');
  if (!ws) return { ok: false, error: '근무일정 시트 없음' };

  const today = optDate || new Date();
  const year  = today.getFullYear();
  const month = today.getMonth();

  // 멤버 이름
  const ms = ss.getSheetByName('멤버');
  const memberNames = [];
  if (ms) {
    const md = ms.getDataRange().getValues();
    for (let i = 1; i < md.length; i++) {
      const n = String(md[i][0] || '').trim();
      if (n) memberNames.push(n);
    }
  }
  if (!memberNames.length) return { ok: false, error: '멤버 없음' };

  // 블록 탐지: colA 비어있고 바로 아래가 멤버행이면 그 행이 날짜행
  let lastRow = ws.getLastRow();
  const colA = ws.getRange(1, 1, lastRow, 1).getValues().map(r => String(r[0]).trim());
  const blocks = [];
  for (let r = 0; r < lastRow; r++) {
    if (colA[r] === '' && r + 1 < lastRow && memberNames.indexOf(colA[r + 1]) >= 0) {
      let cnt = 0;
      while (r + 1 + cnt < lastRow && memberNames.indexOf(colA[r + 1 + cnt]) >= 0) cnt++;
      blocks.push({ dateRow: r + 1, memberStart: r + 2, memberCount: cnt }); // 1-based
    }
  }
  if (!blocks.length) return { ok: false, error: '날짜 블록을 찾지 못함' };

  const weeks = computeMonthWeeks_(year, month);

  // 블록이 부족하면 마지막 블록 복사해서 확장 (서식·멤버 패턴 유지)
  while (blocks.length < weeks.length) {
    const last = blocks[blocks.length - 1];
    const blockRows = 1 + last.memberCount;
    const srcRange = ws.getRange(last.dateRow, 1, blockRows, 7); // A~G
    const lastMemberRow = last.memberStart + last.memberCount - 1;
    ws.insertRowsAfter(lastMemberRow, blockRows + 1);            // +1: 블록 사이 빈 줄
    const destStart = lastMemberRow + 2;
    srcRange.copyTo(ws.getRange(destStart, 1, blockRows, 7), { contentsOnly: false });
    blocks.push({ dateRow: destStart, memberStart: destStart + 1, memberCount: last.memberCount });
  }

  // 각 블록 날짜행(B~G)에 주 날짜 기입 (텍스트 고정). 남는 블록은 날짜 비움.
  for (let i = 0; i < blocks.length; i++) {
    const wk = weeks[i] || ['', '', '', '', '', ''];
    const rng = ws.getRange(blocks[i].dateRow, 2, 1, 6);
    rng.setNumberFormat('@');
    rng.setValues([wk]);
  }

  // 제목 갱신
  try { ws.getRange(1, 1).setValue((month + 1) + '월 출근 일자'); } catch (e) {}

  PropertiesService.getScriptProperties().setProperty('wsMonth', year + '-' + month);
  bumpVersion();
  return { ok: true, month: (month + 1), weeks: weeks.length, blocks: blocks.length };
}

// 트리거용: 저장된 월과 현재 월이 다르면 전환
function autoRollMonth() {
  const now = new Date();
  const key = now.getFullYear() + '-' + now.getMonth();
  const stored = PropertiesService.getScriptProperties().getProperty('wsMonth');
  if (stored === key) return;
  rollWorkScheduleMonth(now);
}

// 매일 새벽 1시 autoRollMonth 실행 트리거 설치 (1회 실행 필요)
function installMonthTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'autoRollMonth') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('autoRollMonth').timeBased().everyDays(1).atHour(1).create();
}
