import type { NextConfig } from "next";

// 모든 응답에 붙는 기본 보안 헤더
const securityHeaders = [
  // 다른 사이트가 뚝딱을 프레임으로 띄워 클릭을 유도하지 못하게
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // 항상 HTTPS 로만 접속
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // 파일 형식을 추측해 스크립트로 실행하지 않게
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 다른 사이트로 이동할 때 주소 전체(주문번호 등)를 넘기지 않게
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 쓰지 않는 기기 권한은 막는다
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
