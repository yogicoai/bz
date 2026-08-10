import './globals.css';
import Shell from '@/components/Shell';
import { themeInitScript } from '@/components/ThemeToggle';

export const metadata = {
  title: '메일 관리 — YOGI CORPORATION',
  description: '수신 메일을 자동으로 정리해 요약·기한·답변 필요 여부를 관리합니다.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 첫 페인트 전에 테마를 적용해 흰 화면 번쩍임을 막는다 */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
