import { redirect } from 'next/navigation';

/**
 * 첫 화면은 '오늘의 브리핑' 이다.
 *
 * 이 도구의 사용 흐름은 "아침에 열어 하루치를 위에서부터 체크"다.
 * 주소만 치고 들어왔을 때 대시보드(현황 숫자)가 먼저 나오면
 * 숫자를 보고 끝나기 쉬워서, 할 일 목록을 첫 화면으로 둔다.
 * 대시보드는 /dashboard 에 그대로 있다.
 */
export default function Home() {
  redirect('/briefing');
}
