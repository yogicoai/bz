# emailData — B2B·영문메일 관리 대시보드

회사 메일함(이카운트 웹메일)으로 들어오는 **B2B 문의·영문 메일**을 자동 수집해
광고를 걸러내고, 한글 번역과 핵심 정리를 붙여, **답변 필요 / 기한**으로 관리하는 도구.

Next.js 16 · React 19 · MongoDB · Claude API · IMAP/SMTP · 포트 **5900**

---

## 파이프라인 한눈에

```
[하루 1회 · 평일 오전 9시 KST]  /api/cron/daily
   ↓  [무료] IMAP 수신 → 파싱 (mailparser)
   ↓  [무료] 규칙 필터 — 광고·자동발송·차단도메인 걸러냄  → classification
   ↓  [무료] 로컬 1차 분석 — 답변필요·기한 후보·핵심문장  → analysis(method:'local')
   ↓  [유료] AI 요약 — 제안 메일만, 하루 상한 내에서
   ↓         한글 번역 + 정밀 요약 + 기한          → analysis(method:'ai') + translation
   ↓  일일 브리핑 생성 → 화면(/briefing) + 브리핑 메일 발송(옵션)
   ↓
사용자: 브리핑을 위에서부터 체크 → 상세에서 답장 초안 → SMTP 발송
```

**핵심 사용 흐름은 "하루 한 번 브리핑"이다.** 대시보드·메일함·기한관리는 그 뒤를 받치는 보조 화면.

**비용이 드는 지점은 AI 요약과 답장 초안 생성, 이 둘뿐이다.** 수집·필터·기한 추출은 전부 로컬.
일일 크론의 AI 요약은 **제안 분류(b2b·inquiry·partner·unknown)에만** 적용되고 `dailyAnalyzeLimit`(기본 20통)으로 상한이 걸린다 — 광고가 쏟아져도 하루 비용이 튀지 않는다.

---

## 비용 설계 (중요)

| 단계 | 비용 | 비고 |
|---|---|---|
| IMAP 수집·파싱 | 0원 | |
| 규칙 광고 필터 | 0원 | `src/lib/mail/classify.js` |
| 로컬 1차 분석 | 0원 | `src/lib/mail/localAnalyze.js` — 정규식으로 기한·답변필요 판정 |
| 예상 비용 표시 | 0원 | `src/lib/ai/estimate.js` — 로컬 추정, API 호출 없음 |
| **AI 번역·요약** | 유료 | 메일 1통 = Claude 1회 호출 |
| **답장 초안 생성** | 유료 | |

- `settings.autoAnalyze` 기본값 **false** — 수집만으로는 절대 과금되지 않는다.
- 메일함 상단과 상세 화면 버튼에 **예상 금액이 항상 먼저 표시**된다.
- 실제 사용량은 분석 후 `analysis.usage` 에 기록되어 화면에서 확인 가능.
- 모델은 설정에서 교체 (`claude-opus-5` 기본 → `claude-sonnet-5` / `claude-haiku-4-5`).

---

## 거래처 자동 분류 (group)

대표가 웹메일의 **'내 메일함' 하위 폴더**로 거래처를 손수 나눠 두었다
(`INBOX.Yogibo Japan`, `INBOX.Distribution Group Turkey`, `INBOX.사업개발` …).
**이 폴더가 곧 학습 데이터다.** 폴더의 메일을 수집하면 "이 발신자는 이 거래처"를 배우고,
새로 들어온 미분류함 메일을 **AI 없이(무료)** 같은 거래처로 분류한다.

판정 순서 (`src/lib/mail/groups.js`):

| 순위 | 근거 | `groupBy` | 비고 |
|---|---|---|---|
| 1 | 거래처 폴더에서 수집 | `folder` | 확정 |
| 2 | 발신자 주소 일치 | `sender:address` | 가장 정확 |
| 3 | 발신 도메인 일치 | `sender:domain` | Gmail·네이버 등 개인메일 도메인은 제외 |
| 4 | **제목**의 거래처명 | `name:<매칭어>` | 보조 |
| — | 사람이 지정 | `manual` | 자동 분류가 덮어쓰지 않음 |

- **제목만 본다.** 본문까지 뒤지면 인용된 이전 대화·서명의 다른 거래처명이 걸려 오분류가 난다(실측 확인).
- `Israel` `USA` `Group` `Beauty` 처럼 여러 거래처에 공통으로 나오는 낱말은 매칭에서 제외한다(`GENERIC`).
- 한국어 표기 차이는 `ALIASES` 로 보정 (`오스템파마` → `Osstem Pharma Vussen`).

```bash
node scripts/learn-folders.js 250   # 폴더당 250통 수집 → 학습 → 미분류 메일 재분류
```
`POST /api/groups/reassign` 은 학습이 늘어난 뒤 기존 메일에 소급 적용한다 (무과금).

---

## 스레드 묶기

실무 메일은 `Re: Re: RE: SV:` 가 스무 번 붙으며 같은 건이 계속 새 행으로 보인다.
대표가 보고 싶은 것은 "이 건이 어디까지 왔나"이므로 **대화 단위로 한 줄**만 보여주고
그 안에 몇 통이 오갔는지를 배지로 표시한다 (1,758통 → 대화 단위로 접힘).

묶는 기준은 **정규화한 제목**이다 (`src/lib/mail/thread.js`).
References/In-Reply-To 헤더가 더 정확하지만 폴더별로 나눠 수집하다 보면
대화의 시작 메일이 없는 경우가 많아 헤더만으로는 조각이 난다.
다만 제목만으로는 서로 다른 거래처의 같은 제목이 섞이므로 **거래처를 함께 묶는다**.

스레드 키는 거래처가 정해진 **뒤에** 계산한다 (`ingest.js`). 순서가 바뀌면
같은 대화가 거래처별로 쪼개진다.

기한은 **아직 지나지 않은 것 중 가장 이른 것**을 쓴다. 스레드 최소값을 그냥 쓰면
몇 달 전 끝난 기한이 계속 D-day 로 뜨고, 최신 메일만 보면 두 통 전의 기한을 놓친다.

---

## 인용부 제거

답장에는 이전 대화가 통째로 딸려온다. 이것을 그대로 분석하면
인용문의 영문 헤더 때문에 한국어 회신이 영어로 잡히고,
몇 달 전 인용문의 물음표·옛 날짜가 이번 질문·기한으로 오인된다.

`src/lib/mail/quoted.js` 의 `stripQuoted()` 를 언어 감지·답변필요·기한 판정
앞에 두어 이를 막는다. 한국어·영어·일본어·북유럽 메일 클라이언트의 인용 표지를 인식한다.

**언어 감지**는 URL·메일주소를 걷어내고 로마자를 단어 수로 환산해 비교한다.
낱글자끼리 세면 이카운트가 붙이는 수신확인 링크(로마자 200자 이상)와 영문 서명 때문에
한국어 메일이 영어로 넘어간다.

---

## 첨부파일

파일 내용은 **DB 에 저장하지 않는다.** 수집 시 IMAP 파트 번호(`attachments[].partId`)만 남기고,
사용자가 다운로드를 누를 때 `GET /api/mails/[id]/attachment?i=N` 이 메일 서버에서 그 파트만 받아 스트리밍한다.
저장 용량이 늘지 않고 원본과 항상 일치한다. 40MB 초과분은 거부(메모리 보호), 본문 삽입 이미지(서명 로고 등)는 목록에서 제외.

---

## 상태값

DB·CSS 는 영문 값, 화면은 한글 라벨. 소스: `src/lib/labels.js`

- **classification**: B2B거래(`b2b`) · 문의견적(`inquiry`) · 제휴(`partner`) · 뉴스레터(`newsletter`) · 광고(`ad`) · 자동발송(`system`) · 미분류(`unknown`)
- **status**: 신규(`new`) · 확인중(`reviewing`) · 답변완료(`replied`) · 보관(`archived`) · 무시(`ignored`)
- **urgency**: 높음(`high`) · 보통(`mid`) · 낮음(`low`)
- **analysis.method**: `local`(무료 규칙) · `ai`(유료 Claude)

> **핵심 분류 규칙**: 상대가 *우리에게 팔려는* 메일 = `ad` / 상대가 *우리 제품을 사려는* 메일 = `b2b`·`inquiry`.
> 이 구분이 이 앱의 존재 이유이므로 AI 프롬프트(`src/lib/ai/analyze.js`)에 명시되어 있다.

---

## 화면 (http://localhost:5900)

| 경로 | 내용 |
|---|---|
| `/briefing` | **오늘의 브리핑** — 하루치 제안 메일 투두리스트. 체크하면 처리완료(보관) 처리. 날짜 이동·기간(1/3/7일) 선택 |
| `/` | 대시보드 — 답변필요·기한지남·임박 KPI, 답변 대기 목록, 기한 목록 |
| `/mails` | 메일함 — 필터·검색, 수집 버튼, **AI 분석 대기 통수와 예상 비용** |
| `/mails/[id]` | 상세 — 원문/한글번역 2단, 핵심 정리, 답장 초안·발송, 메모 |
| `/deadlines` | 기한 관리 — 지남 / 7일 이내 / 이후 / 기한없는 답변대기 |
| `/settings` | IMAP·SMTP·AI 모델·광고필터·**접근 비밀번호 변경** |
| `/login` | 접근 비밀번호 (최초 실행 시 설정 모드) |

---

## 컬렉션 (DB `emaildata`)

- **mails** — 메일 1통. `messageId` 유니크로 재수집 중복 방지.
  주요 필드: `raw{text,html}` `translation` `analysis` `classification` `status` `drafts[]` `doc` `threadKey` `group`
- **sync_state** — 폴더별 `lastUid` (증분 수집 기준점)
- **settings** — 싱글톤 `_id:'main'`. IMAP/SMTP/AI 설정 + `appPasswordHash`(scrypt)
  `imapFolders` 에 수집 대상 폴더를 배열로 둔다. **비어 있으면 INBOX 만 수집**되어
  거래처 폴더로 들어온 새 메일을 놓친다.

---

## 실행

```bash
npm install
cp .env.example .env.local     # 값 채우기
npm run dev                    # http://localhost:5900

npm run ingest                 # 1회 수집 (dev 서버 필요)
npm run ingest -- --recent 10  # 최근 10통 강제 수집 (최초 세팅용)
npm run poll                   # 상시 수집 루프 (상시 서버용)

node scripts/learn-folders.js 600   # 거래처 폴더 깊게 수집 (폴더당 최대 600통)
node scripts/reanalyze-local.js     # 기존 메일 로컬 재분석 (무과금)

node scripts/seed-demo.js          # 샘플 제안 메일 5통 (IMAP 연결 전 화면 확인용)
node scripts/seed-demo.js --clean  # 샘플만 삭제  ← 인계 전 반드시 실행
```

**요약 대상 뽑기** (API 키 없이 대화로 요약할 때):
```bash
npm run export-pending -- 20 --days 30                    # 최근 30일 20통
npm run export-pending -- 20 --group "Osstem Pharma Vussen"  # 특정 거래처
# _pending.json 을 읽혀 요약을 받고 _summaries.json 으로 저장한 뒤
npm run apply-summaries
```

**일일 브리핑 수동 실행** (평소엔 크론이 자동으로 함):
```bash
curl "http://localhost:5900/api/cron/daily?key=<CRON_SECRET>"
```

**최초 세팅 순서**
1. `npm run dev` → `/login` 에서 접근 비밀번호 설정
2. `/settings` → 이카운트 웹메일 **환경설정 → IMAP/POP 설정**에서 확인한 수신 서버·포트·계정 입력
3. **연결 테스트** → 폴더 목록이 나오면 성공 (목록에서 폴더 클릭 시 수집 대상으로 지정)
4. `/mails` → **최근 20통 가져오기**
5. 목록에서 광고가 잘 걸러졌는지 확인 → 잘못 걸린 발신 도메인은 `/settings` 차단 목록에서 제거
6. 번역이 필요한 메일만 골라 **AI 번역·요약 실행** (버튼에 예상 금액 표시됨)

---

## 필요 환경변수

```bash
EMAILDATA_URI / MONGODB_URI   # Mongo (DB명 emaildata)
ANTHROPIC_API_KEY             # AI 분석·답장 초안
CLAUDE_MODEL=claude-opus-5    # 설정 화면에서도 변경 가능
APP_SECRET                    # 세션 쿠키 서명 (배포 시 필수)
CRON_SECRET                   # /api/cron/ingest 인증
MAIL_DRY_RUN=1                # 1이면 실제 발송 안 함 (개발 기본값)
APP_AUTH_DISABLED=1           # 로컬에서만 인증 끄기 (배포 시 절대 설정 금지)
DOC_WRITE_LOCAL=1             # 정리 문서를 data/mails/ 에도 저장 (로컬 전용)
```

IMAP/SMTP 접속 정보는 **설정 화면에서 DB 에 저장**되며, env 값은 초기 기본값으로만 쓰인다.

---

## 배포

- **Vercel** — `vercel.json` 의 cron 이 `/api/cron/daily` 를 **매일 00:00 UTC = 오전 9시 KST** 에 호출.
  브리핑이 담는 범위는 **직전 24시간**이다. 달력 하루로 잡으면 09시 크론이 그날 00~09시만 보는데
  실측상 메일의 89%가 09시 이후에 온다(유럽·이스라엘 업무시간 = 한국 오후).
  주말도 도는 이유는 이스라엘이 일요일 평일이기 때문이고, 새 제안이 없으면 발송은 건너뛴다.
  (Vercel Cron 은 UTC 기준이므로 KST 로 바꾸려면 9시간을 뺀 값을 써야 한다)
  서버리스 디스크는 휘발성이므로 `DOC_WRITE_LOCAL` 을 켜지 말 것 (정리 문서는 Mongo 에 저장됨).
- **상시 서버(클라우드타입 등)** — cron 대신 `npm run poll` 로 더 자주 수집할 수도 있다.
- 일일 크론은 **수집이 실패해도 요약·브리핑을 계속한다** — 메일 서버가 잠깐 죽었다고
  이미 받아둔 제안의 브리핑까지 걸러지면 안 되기 때문.
- 배포 시 `APP_SECRET`·`CRON_SECRET` 을 반드시 랜덤 값으로 설정하고, `APP_AUTH_DISABLED` 는 설정하지 말 것.

---

## 안전장치

- **발송**: `MAIL_DRY_RUN=1` 이면 실제로 나가지 않고 콘솔에만 기록. 발송 전 확인 모달에서 수신자·제목·본문을 최종 노출. 답장은 `In-Reply-To`/`References` 로 원 스레드에 연결.
- **분류 오판**: 광고로 걸러진 메일도 삭제하지 않는다. 메일함에서 필터를 풀면 조회·수동 재분류 가능하며, 수동 변경은 `classifiedBy:'manual'` 로 표시되어 재분석이 덮지 않는다.
- **AI 응답**: `stop_reason` 의 `refusal`·`max_tokens` 를 먼저 검사한다 (잘린 JSON 을 조용히 파싱하지 않음).
- **첨부**: 파일 내용은 저장하지 않고 메타데이터만 보관한다.

---

## 기술 스택

Next.js 16 (App Router, JS) · React 19 · MongoDB 6 · @anthropic-ai/sdk · imapflow · mailparser · nodemailer.
UI 는 Tailwind 없이 `globals.css` 의 CSS 변수 + 인라인 style 객체 (mktCl 과 동일한 규약).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
