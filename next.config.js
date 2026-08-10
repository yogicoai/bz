/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 서버 전용 패키지 — 번들에서 제외 (imapflow 는 ESM 전용이라 필수)
  serverExternalPackages: ['imapflow', 'mailparser', 'nodemailer'],
};

module.exports = nextConfig;
