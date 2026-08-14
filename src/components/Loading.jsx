/**
 * "지금 불러오는 중" 표시.
 *
 * 글씨만 띄우면 멈춘 것인지 고장난 것인지 구분이 안 된다 — 실제로 로딩이
 * 길어질 때 "오류인가?" 하는 문의가 나왔다. 돌아가는 표시를 함께 둔다.
 *
 * 서버 컴포넌트에서도 쓰므로 'use client' 를 붙이지 않는다 (CSS 애니메이션만 쓴다).
 */
// div 가 아니라 span 인 이유: 목록 제목 아래 <p> 안에서도 쓰인다.
// <p> 안의 <div> 는 브라우저가 <p> 를 강제로 닫아버려 서버·화면 결과가 어긋난다.
// .loading 이 display:flex 라 span 이어도 배치는 같다.
export default function Loading({ text = '불러오는 중…', size, inline = false, style }) {
  return (
    <span className={`loading${inline ? ' inline' : ''}`} style={style}>
      <span className={`spinner${size ? ` ${size}` : ''}`} aria-hidden="true" />
      <span role="status" aria-live="polite">{text}</span>
    </span>
  );
}

/** 버튼 안 등에 글자 없이 넣을 때 */
export function Spinner({ size = 'sm', style }) {
  return <span className={`spinner ${size}`} style={style} aria-hidden="true" />;
}
