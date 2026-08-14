import Loading from '@/components/Loading';

/**
 * 화면을 옮길 때 나오는 표시.
 *
 * 대시보드·기한처럼 서버에서 그려 오는 화면은, 준비되기 전까지 아무것도
 * 바뀌지 않는다. 누른 사람 입장에서는 "눌렸나? 고장났나?" 로 읽힌다.
 * App Router 는 이 파일을 그 사이에 대신 띄워 주므로, 화면마다 따로
 * 넣지 않아도 모든 이동에 표시가 붙는다.
 */
export default function RouteLoading() {
  return <Loading size="lg" style={{ padding: '80px 14px' }} />;
}
