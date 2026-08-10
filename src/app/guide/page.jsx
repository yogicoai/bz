import Link from 'next/link';

export const metadata = { title: '사용 설명서 — 메일 관리' };

export default function GuidePage() {
  return (
    <>
      <h1 className="page-title">사용 설명서</h1>
      <p className="page-sub">
        이 도구가 무엇을 대신해 주는지, 매일 어떻게 쓰면 되는지 정리했습니다.
      </p>

      <Section title="한 줄로 말하면">
        <p style={{ margin: 0, fontSize: 16 }}>
          <b>회사 메일함에 쌓이는 제안·문의 메일을 매일 아침 한 번 정리해서, 오늘 뭘 처리해야 하는지 알려주는 도구</b>입니다.
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          광고는 걸러내고, 영문 메일은 한글로 번역하고, &ldquo;언제까지 답해야 하는지&rdquo;를 찾아서 목록으로 만들어 줍니다.
        </p>
      </Section>

      <Section title="매일 이렇게 쓰면 됩니다">
        <Step n="1" title="아침에 대시보드를 연다">
          들어오자마자 <b>&ldquo;오늘 처리할 메일 N건&rdquo;</b> 알림이 뜹니다. 하루에 한 번만 뜨고, 닫으면 화면 위쪽에 배너로 남습니다.
        </Step>
        <Step n="2" title="목록을 위에서부터 읽는다">
          급한 것(기한 임박 → 기한 있음 → 나머지) 순서로 정렬돼 있습니다. 각 건마다 <b>요약 · 기한 · 다음에 할 일</b>이 붙어 있어 메일을 열지 않아도 판단할 수 있습니다.
        </Step>
        <Step n="3" title="확인한 건 체크한다">
          체크하면 목록에서 빠지고 사이드바 숫자도 줄어듭니다. 삭제가 아니라 <b>보관</b> 처리라 언제든 다시 볼 수 있습니다.
        </Step>
        <Step n="4" title="답장이 필요하면 메일을 연다">
          왼쪽에 원문, 오른쪽에 한글 번역이 나란히 보입니다. 아래에 <b>&ldquo;전달할 내용&rdquo;</b>을 한국어로 편하게 적으면 상대 언어로 답장 초안을 만들어 줍니다. 확인 후 발송하면 원래 메일 스레드에 붙어서 나갑니다.
        </Step>
      </Section>

      <Section title="화면 안내">
        <Row name="오늘의 브리핑" href="/briefing">
          하루치 제안 메일 목록. <b>가장 자주 쓰게 될 화면</b>입니다. 날짜를 옮기거나 최근 3일·7일치를 한 번에 볼 수 있습니다.
        </Row>
        <Row name="대시보드" href="/">
          전체 현황. 답변 필요·기한 지남·임박 건수를 한눈에 봅니다.
        </Row>
        <Row name="메일함" href="/mails">
          수집된 모든 메일. 검색·필터가 있고, <b>광고는 기본으로 숨겨져</b> 있습니다. 체크를 풀면 광고도 보입니다.
        </Row>
        <Row name="기한·답변" href="/deadlines">
          기한이 있는 건만 모아 <b>지남 / 이번 주 / 이후</b>로 나눠 보여줍니다.
        </Row>
        <Row name="설정" href="/settings">
          메일 서버, AI 모델, 광고 필터, 브리핑 수신 주소.
        </Row>
        <Row name="계정·보안" href="/account">
          접속 비밀번호 변경, 로그아웃.
        </Row>
      </Section>

      <Section title="비용은 어떻게 되나요">
        <p style={{ marginTop: 0 }}>
          <b>대부분의 기능은 돈이 들지 않습니다.</b> 메일을 가져오고, 광고를 걸러내고, 기한을 찾아내는 것까지는 전부 이 서버 안에서 처리합니다.
        </p>
        <p>
          돈이 드는 건 <b>한글 번역과 내용 요약</b> 두 가지뿐입니다. AI(Claude)를 부르기 때문입니다.
        </p>
        <div className="card" style={{ background: 'var(--panel-2)', marginBottom: 14 }}>
          <table>
            <thead>
              <tr><th>모델</th><th style={{ textAlign: 'right' }}>메일 1건</th><th style={{ textAlign: 'right' }}>월 (하루 5건·22일)</th></tr>
            </thead>
            <tbody>
              <tr><td>Haiku 4.5 <span className="badge">현재 설정</span></td><td style={{ textAlign: 'right' }}>약 ₩5</td><td style={{ textAlign: 'right' }}><b>약 ₩550</b></td></tr>
              <tr><td>Sonnet 5</td><td style={{ textAlign: 'right' }}>약 ₩13</td><td style={{ textAlign: 'right' }}>약 ₩1,430</td></tr>
              <tr><td>Opus 5 (가장 정확)</td><td style={{ textAlign: 'right' }}>약 ₩21</td><td style={{ textAlign: 'right' }}>약 ₩2,310</td></tr>
            </tbody>
          </table>
        </div>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>버튼을 누르기 <b>전에</b> 예상 금액이 항상 표시됩니다.</li>
          <li>광고 메일은 요약하지 않으므로 아무리 많이 와도 비용이 늘지 않습니다.</li>
          <li>이미 요약한 메일은 다시 요약하지 않습니다.</li>
          <li>하루 요약 상한(기본 20건)이 있어 갑자기 몰려도 비용이 튀지 않습니다.</li>
        </ul>
      </Section>

      <Section title="광고는 어떻게 걸러지나요">
        <p style={{ marginTop: 0 }}>여러 신호를 점수로 합산해 판단합니다. 하나만 봐서는 오판이 나기 때문입니다.</p>
        <ul style={{ paddingLeft: 20 }}>
          <li><b>바로 광고 확정</b> — 제목의 <code>(광고)</code> <code>[광고]</code> 표기, 대량 발송 서비스(메일침프·스티비 등) 경유, 차단 등록한 도메인</li>
          <li><b>점수 누적</b> — 수신거부 헤더, 캠페인 헤더, &ldquo;무료 상담/한정 특가/unsubscribe&rdquo; 같은 문구, 발신자명이 &lsquo;마케팅팀&rsquo;, 링크 과다, 수신자 미표기</li>
        </ul>
        <p style={{ marginBottom: 0 }}>
          중요한 건 <b>진짜 제안 메일이 걸리지 않는 것</b>입니다. &ldquo;대량 구매 시 특별 할인 가능합니다&rdquo; 같은 문구가 들어간 실제 견적 회신은 통과하도록 맞춰 두었습니다.
          혹시 잘못 걸린 메일이 있으면 <Link href="/mails" style={{ color: 'var(--accent-text)' }}>메일함</Link>에서 <b>광고 숨김</b>을 끄고 찾아 분류를 바꾸면 되고, 사람이 바꾼 분류는 이후 자동 분석이 덮어쓰지 않습니다.
        </p>
      </Section>

      <Section title="거래처는 어떻게 자동으로 붙나요">
        <p style={{ marginTop: 0 }}>
          웹메일에서 <b>&lsquo;내 메일함&rsquo; 아래 만들어 두신 폴더</b>(Yogibo Japan, 사업개발 등)를 그대로 거래처 분류로 씁니다.
        </p>
        <p>
          그 폴더의 메일을 읽어 <b>&ldquo;이 사람이 보내면 이 거래처&rdquo;</b>를 기억합니다. 그래서 새 메일이 오면 손대지 않아도 같은 거래처가 자동으로 붙습니다.
          기억에 없는 발신자라면 <b>제목에 적힌 거래처명</b>으로 한 번 더 찾아봅니다.
        </p>
        <ul style={{ paddingLeft: 20 }}>
          <li>이 과정은 <b>전부 무료</b>입니다. AI를 쓰지 않습니다.</li>
          <li>거래처가 잘못 붙었으면 메일 상세에서 바꾸면 되고, <b>바꾼 것은 자동 분류가 다시 덮어쓰지 않습니다.</b></li>
          <li>폴더를 더 많이 읽을수록 정확해집니다.</li>
        </ul>
        <p className="muted" style={{ marginBottom: 0 }}>
          Gmail·네이버 같은 개인 메일 주소는 회사를 특정할 수 없어 도메인만으로는 판단하지 않습니다.
        </p>
      </Section>

      <Section title="첨부파일">
        <p style={{ marginTop: 0 }}>
          메일 상세 화면에서 <b>바로 내려받을 수 있습니다.</b> 파일을 따로 저장해 두지 않고 누르는 순간 메일 서버에서 가져오기 때문에,
          저장 공간을 차지하지 않고 항상 원본과 같습니다.
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          서명에 들어간 로고 같은 본문 삽입 이미지는 목록에서 빼두었고, 40MB가 넘는 파일은 원본 메일함에서 받으셔야 합니다.
        </p>
      </Section>

      <Section title="자동으로 도는 것">
        <p style={{ marginTop: 0 }}>
          <b>평일 오전 9시</b>에 한 번, 서버가 알아서 다음을 수행합니다.
        </p>
        <ol style={{ paddingLeft: 20, marginBottom: 14 }}>
          <li>새 메일 수집</li>
          <li>광고 걸러내기</li>
          <li>제안 메일만 골라 번역·요약 (이미 한 건은 건너뜀)</li>
          <li>브리핑 생성 + 설정된 주소로 브리핑 메일 발송</li>
        </ol>
        <p className="muted" style={{ marginBottom: 0 }}>
          새 제안이 없는 날은 메일을 보내지 않습니다. 메일 서버가 잠깐 안 되더라도 이미 받아둔 메일의 요약·브리핑은 그대로 진행됩니다.
        </p>
      </Section>

      <Section title="처음 설정할 때 (관리자)">
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 8 }}>
            <b>메일 서버 연결</b> — <Link href="/settings" style={{ color: 'var(--accent-text)' }}>설정</Link>에서 IMAP 서버 주소·포트·계정을 넣고 <b>연결 테스트</b>를 누릅니다. 성공하면 서버의 폴더 목록이 나오고, 클릭해서 수집할 폴더를 고릅니다.
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              IMAP 주소는 사용 중인 웹메일의 환경설정에서 확인합니다. 이카운트 웹메일을 쓰는 경우 관리자에서 IMAP 사용을 켜야 할 수 있습니다.
            </div>
          </li>
          <li style={{ marginBottom: 8 }}>
            <b>답장 발송 설정</b> — 같은 화면에서 SMTP 정보를 넣습니다. 처음에는 <b>실제로 발송되지 않는 안전 모드</b>로 동작하며, 확인 후 해제합니다.
          </li>
          <li style={{ marginBottom: 8 }}>
            <b>브리핑 수신 주소</b> — 매일 아침 브리핑을 받을 메일 주소를 넣습니다. 비워두면 화면에서만 확인합니다.
          </li>
          <li>
            <b>첫 수집</b> — <Link href="/mails" style={{ color: 'var(--accent-text)' }}>메일함</Link>에서 <b>최근 20통 가져오기</b>를 눌러 광고가 잘 걸러지는지 확인합니다.
          </li>
        </ol>
      </Section>

      <Section title="자주 나오는 상황">
        <Faq q="브리핑에 요약이 안 보이고 '요약 없음'이라고 나와요">
          AI 요약이 아직 실행되지 않은 상태입니다. 브리핑 화면 위쪽의 <b>[요약 생성]</b> 버튼을 누르거나, 자동 분석이 켜져 있으면 다음 날 아침에 자동으로 채워집니다.
        </Faq>
        <Faq q="답변이 필요한데 '답변 불필요'로 나와요">
          메일을 열어 <b>[AI 번역·요약 실행]</b>을 누르면 더 정확하게 다시 판정합니다. 요약 전 상태에서는 규칙만으로 대략 판단하기 때문입니다.
        </Faq>
        <Faq q="기한이 잘못 잡혔어요">
          메일 상세에서 직접 고칠 수 있습니다. 사람이 지정한 기한은 이후 분석이 덮어쓰지 않습니다.
        </Faq>
        <Faq q="발송 버튼을 눌렀는데 상대에게 안 갔어요">
          안전 모드(DRY RUN)일 가능성이 높습니다. 이 상태에서는 실제로 보내지 않고 내용만 기록합니다. 관리자에게 해제를 요청하세요.
        </Faq>
        <Faq q="첨부파일은 어디서 보나요">
          파일 이름과 크기만 보관하고 내용은 저장하지 않습니다. 원본 메일함에서 내려받으세요.
        </Faq>
      </Section>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-title">기억해 둘 것 하나</div>
        <p style={{ margin: 0 }}>
          이 도구는 <b>아무것도 삭제하지 않습니다.</b> 광고로 분류하거나 체크해서 정리해도 원본은 그대로 남아 있고, 필터만 풀면 다시 볼 수 있습니다.
          메일 서버의 원본 메일에도 손대지 않습니다.
        </p>
      </div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title">{title}</div>
      {children}
    </div>
  );
}

function Step({ n, title, children }) {
  return (
    <div style={{ display: 'flex', gap: 14, marginBottom: 18 }}>
      <div
        style={{
          flex: '0 0 30px', height: 30, borderRadius: 999,
          background: 'var(--accent-weak)', color: 'var(--accent-text)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 14,
        }}
      >
        {n}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, marginBottom: 3 }}>{title}</div>
        <div style={{ color: 'var(--text-2)' }}>{children}</div>
      </div>
    </div>
  );
}

function Row({ name, href, children }) {
  return (
    <div style={{ display: 'flex', gap: 14, padding: '12px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ flex: '0 0 130px' }}>
        <Link href={href} style={{ fontWeight: 700, color: 'var(--accent-text)' }}>{name}</Link>
      </div>
      <div style={{ flex: 1, color: 'var(--text-2)' }}>{children}</div>
    </div>
  );
}

function Faq({ q, children }) {
  return (
    <div style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Q. {q}</div>
      <div style={{ color: 'var(--text-2)' }}>{children}</div>
    </div>
  );
}
