<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=Noto+Sans+KR&weight=800&size=30&pause=1000&color=1C1C1E&center=true&vCenter=true&width=600&height=60&lines=FOX+AI+%EC%97%B0%EA%B5%AC%EC%86%8C+%EB%8B%B4%EB%8B%B9%ED%91%9C;%EB%8B%B4%EB%8B%B9%ED%91%9C+%C2%B7+%EC%97%85%EB%AC%B4+%C2%B7+%EA%B7%BC%EB%AC%B4%EC%9D%BC%EC%A0%95+%C2%B7+%EC%BA%98%EB%A6%B0%EB%8D%94;%EC%84%9C%EB%B2%84%EB%A6%AC%EC%8A%A4+%C2%B7+%EC%9A%B4%EC%98%81%EB%B9%84+0%EC%9B%90" alt="FOX AI 연구소 담당표" />

![HTML](https://img.shields.io/badge/HTML-E34F26?style=flat&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Apps Script](https://img.shields.io/badge/Apps_Script-4285F4?style=flat&logo=google&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-222?style=flat&logo=github&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=flat&logo=pwa&logoColor=white)



</div>

---

3인 팀(팀장 1 · 연구원 2)의 **3주 순환 근무 담당표 + 업무 관리 + 근무 일정 + 연간 캘린더**를 한 화면에 모은 웹 대시보드입니다.
Google Sheets를 DB로, Google Apps Script를 백엔드로, GitHub Pages를 호스팅으로 쓰는 **서버리스 구조**라 운영비가 0원입니다.

---

## 🗺️ 전체 구조

```mermaid
flowchart LR
    U(["👤 팀원"]) -->|브라우저| FE["🖥️ 프론트엔드<br/>index.html · styles.css · app.js"]
    FE -->|fetch GET| GAS["⚙️ Google Apps Script<br/>Web App API"]
    GAS --> SHEET[("📊 Google Sheets<br/>담당표 · 멤버 · 근무일정<br/>완료업무 · 반복업무 · 캘린더")]
    GAS -.->|트리거 15분| T1["🧹 완료업무 자동정리"]
    GAS -.->|트리거 매일 1시| T2["📅 근무일정 월 전환"]
    FE -.->|배포| GP["🌐 GitHub Pages"]

    classDef fe fill:#dbeafe,stroke:#1d4ed8,color:#1e3a8a;
    classDef be fill:#dcfce7,stroke:#16a34a,color:#14532d;
    classDef db fill:#fef3c7,stroke:#d97706,color:#92400e;
    class FE,GP fe;
    class GAS,T1,T2 be;
    class SHEET db;
```

> 프론트는 **프레임워크 없이 순수 JS**. 백엔드는 **GAS Web App**. 데이터는 **내 구글 시트**에 그대로 남습니다.

---

## ⚡ 핵심 동작 흐름

### 업무 추가 — 즉시 반응(낙관적 UI)

```mermaid
sequenceDiagram
    actor U as 👤 사용자
    participant FE as 🖥️ 화면(app.js)
    participant GAS as ⚙️ Apps Script
    participant S as 📊 Sheets
    U->>FE: 업무 추가 · 저장
    FE-->>U: ✅ 즉시 화면에 반영
    FE->>GAS: addTask 요청 (뒤에서)
    GAS->>S: 담당표에 행 추가
    GAS-->>FE: ok + 행번호
    Note over FE,S: 실패할 때만 서버 기준으로 롤백
```

### 30초 자동 갱신 — 변경된 것만 다시 그림

```mermaid
flowchart TD
    A([⏱️ 30초마다]) --> B{getHash<br/>버전 바뀌었나?}
    B -->|같음| C["💤 아무것도 안 함<br/>(가벼운 핑만)"]
    B -->|다름| D["🔄 전체 받아서<br/>화면 갱신"]
    classDef y fill:#dcfce7,stroke:#16a34a;
    classDef n fill:#f3f4f6,stroke:#9ca3af;
    class D y; class C n;
```

### 근무일정 월 자동 전환 — 날짜만 바뀌고 패턴은 유지

```mermaid
flowchart TD
    A([📅 매일 새벽 1시]) --> B{이번 달이<br/>지난번과 다른가?}
    B -->|같음| C[그대로 둠]
    B -->|다름| D["그 달 날짜 계산<br/>월~토 · 일요일 제외"]
    D --> E["날짜만 교체<br/>근무패턴 · 색상 · 테두리 유지"]
    E --> F{"6주 필요한 달?"}
    F -->|예| G[마지막 주 블록<br/>자동 확장]
    F -->|아니오| H[완료]
    G --> H
    classDef act fill:#dbeafe,stroke:#1d4ed8;
    class D,E,G act;
```

---

## ✨ 기능 한눈에 보기

```mermaid
mindmap
  root((FOX 담당표))
    담당표·멤버
      3주 순환 자동 반복
      멤버 관리·색상
      이름 변경 전 시트 반영
    업무
      추가·수정·삭제 모달
      담당 다중·전원 지정
      개별 완료 체크
      마감 카운트다운
      누락 업무·댓글
    완료 업무
      30분 후 자동 보관
      담당자·기간 필터
      마감 대비 타이밍
    반복 업무
      요일별 담당
    근무일정
      월 자동 전환
      연차·반차 자동 추출
    캘린더
      행사·공휴일·계획
      한국 공휴일 자동
      연차 자동 표시
    UX
      다크 모드
      PWA 설치·오프라인
      브라우저 알림
      단축키
```

<details>
<summary><b>📋 기능 상세 (펼치기)</b></summary>

**담당표 · 멤버**
- 3주 순환 담당표(앵커 기준 무한 반복, 오늘 강조)
- 멤버 추가/수정/삭제 · 8색 슬롯 · 이름 변경 시 모든 시트 자동 반영

**업무 관리**
- 모달에서 추가/수정/삭제 · 담당 다중 선택("AI 연구원 전원" 포함)
- 개별 완료 체크(전원 완료 시 자동 완료) · 마감 카운트다운 배지
- 누락 업무 모아보기 · 업무별 댓글(작성자 필수, 익명 불가)

**완료 업무**
- 완료 30분 뒤 '완료 업무' 시트로 자동 아카이브
- 담당자/기간 필터 · 마감 대비 빠름·당일·지각 배지 · 수동 추가

**반복 업무**
- 요일별 담당(월~토 각 칸에 사람 또는 활동 키워드) · 오늘 요일 강조

**근무 일정**
- 매달 1일 기준 그 달로 날짜 자동 교체(패턴·서식 유지)
- 연차·반차 자동 추출(7일 이내 강조)

**연간 캘린더(2026~2027)**
- 행사/공휴일/계획 색상 구분 · 기간 일정 연속 막대
- 한국 공휴일 자동(설날·추석·대체공휴일) · 근무일정 연차 자동 표시

**UX · 성능**
- 30초 해시 폴링 · 낙관적 UI · 브라우저 알림 · 다크 모드 · PWA · 단축키(N/Esc)

</details>

---

## 🆚 기존 방식과 뭐가 다른가

| | 구글 시트만 | 노션·트렐로 | **이 대시보드** |
|---|:---:|:---:|:---:|
| 모바일 보기 | 🟥 불편 | 🟨 보통 | 🟩 PWA·반응형 |
| 3주 순환·근무일정 | 🟨 수동 | 🟥 직접 구성 | 🟩 내장 |
| 마감 알림·카운트다운 | 🟥 없음 | 🟨 일부 | 🟩 배지+알림 |
| 연차 ↔ 캘린더 | 🟥 수동 | 🟥 수동 | 🟩 자동 |
| 월 날짜 갱신 | 🟥 매번 손으로 | — | 🟩 매달 자동 |
| 비용 | 🟩 무료 | 🟨 제한/유료 | 🟩 무료 |
| 데이터 소유권 | 🟩 내 시트 | 🟥 외부 | 🟩 **내 시트 그대로** |

➡️ **구글 시트의 데이터 소유권은 그대로 두고**, 시트로는 불편한 모바일 UX·알림·필터·자동화를 얹은 형태입니다.

---

## 💻 다른 컴퓨터에서 작업하기

> 이 프로젝트는 GitHub에 올려두고 **여러 컴퓨터에서 작업**할 수 있게 되어 있습니다.
> 아래는 새 컴퓨터에서 처음 한 번만 하면 되는 설정이에요. (예전에 메모로 저장해둔 내용이 바로 이것)

**① 처음 1회 설정**
```bash
gh auth login                                                         # GitHub 로그인(브라우저 인증)
git clone https://github.com/sungJJoo/fox-ai-research-schedule.git    # 저장소 내려받기
cd fox-ai-research-schedule                                           # 폴더로 이동
git config --global user.name  "이름"
git config --global user.email "이메일"
```

**② 작업할 때마다**
```bash
git pull                     # 다른 PC에서 한 변경 먼저 받기 (충돌 방지)
# ...파일 수정...
git add .
git commit -m "변경 내용"
git push                     # 1~2분 뒤 사이트에 자동 반영
```

---

## 🔧 백엔드(GAS) 변경 시

1. `apps-script.gs` 수정
2. [Raw 파일](https://raw.githubusercontent.com/sungJJoo/fox-ai-research-schedule/main/apps-script.gs) 전체 복사 → GAS 편집기에 덮어쓰기 → 저장
3. **배포 → 배포 관리 → ✏️ → 버전 "새 버전" → 배포**
4. URL이 바뀌면 `app.js`의 `API_URL` 갱신 후 commit/push

**트리거 (GAS 편집기에서 1회 실행)**
- `installTrigger` — 완료 업무 자동 정리(15분마다)
- `installMonthTrigger` — 근무일정 월 자동 전환(매일 새벽 1시 점검)

---

## 📁 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html` | HTML 마크업 (PWA 메타 포함) |
| `styles.css` | 전체 스타일 (다크 모드 포함) |
| `app.js` | 클라이언트 로직 전체 |
| `apps-script.gs` | GAS 백엔드 코드 백업 |
| `manifest.json` · `sw.js` · `icon.svg` | PWA (설치·오프라인) |

<div align="center">

🤖 Built with [Claude Code](https://claude.com/claude-code)

</div>
