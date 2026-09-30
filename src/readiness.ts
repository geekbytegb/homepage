export type ReadinessTarget =
  | "overview"
  | "privacy"
  | "members"
  | "notices"
  | "events"
  | "products"
  | "chatChannels";

export type LaunchReadinessInput = {
  firebaseConfigured: boolean;
  appCheckConfigured: boolean;
  privacyReady: boolean;
  contactEmailReady: boolean;
  administratorCount: number;
  intranetMemberCount: number;
  publishedChatChannelCount: number;
  publicContentCount: number;
  invalidEventDeadlineCount: number;
  missingProductAltCount: number;
  secureCustomDomain: boolean;
};

export type ReadinessCheck = {
  id: string;
  label: string;
  detail: string;
  ready: boolean;
  target?: ReadinessTarget;
};

export function buildLaunchReadiness(
  input: LaunchReadinessInput,
): ReadinessCheck[] {
  return [
    {
      id: "firebase",
      label: "Firebase 연결",
      detail: input.firebaseConfigured
        ? "인증과 데이터베이스 설정이 연결됨"
        : "배포 환경의 Firebase 설정값 확인 필요",
      ready: input.firebaseConfigured,
    },
    {
      id: "privacy",
      label: "개인정보 안내",
      detail: input.privacyReady
        ? "운영 주체·문의처·보유 기간과 본문이 게시됨"
        : "행사 신청을 받기 전에 필수 안내 게시 필요",
      ready: input.privacyReady,
      target: "privacy",
    },
    {
      id: "contact",
      label: "공식 문의 이메일",
      detail: input.contactEmailReady
        ? "문의 페이지에서 공식 메일 앱 연결 사용 가능"
        : "사이트 소개에서 공식 문의 이메일 입력 필요",
      ready: input.contactEmailReady,
      target: "overview",
    },
    {
      id: "administrator",
      label: "관리자 복구 경로",
      detail:
        input.administratorCount > 0
          ? `활성 관리자 ${input.administratorCount}명 확인됨`
          : "활성 관리자 계정을 한 명 이상 유지해야 함",
      ready: input.administratorCount > 0,
      target: "members",
    },
    {
      id: "intranet-member",
      label: "인트라넷 구성원",
      detail:
        input.intranetMemberCount > 0
          ? `활성 내부자 ${input.intranetMemberCount}명 확인됨`
          : "인트라넷 사용을 위해 내부자 역할 등록 필요",
      ready: input.intranetMemberCount > 0,
      target: "members",
    },
    {
      id: "intranet-chat",
      label: "팀 메신저 채널",
      detail:
        input.publishedChatChannelCount > 0
          ? `게시된 채널 ${input.publishedChatChannelCount}개 확인됨`
          : "인트라넷에서 사용할 대화 또는 공지 채널 게시 필요",
      ready: input.publishedChatChannelCount > 0,
      target: "chatChannels",
    },
    {
      id: "public-content",
      label: "공개 콘텐츠",
      detail:
        input.publicContentCount > 0
          ? `현재 공개 콘텐츠 ${input.publicContentCount}개`
          : "연혁·공지·제품·행사 중 공개 콘텐츠 등록 필요",
      ready: input.publicContentCount > 0,
      target: "notices",
    },
    {
      id: "event-deadline",
      label: "행사 신청 마감",
      detail:
        input.invalidEventDeadlineCount === 0
          ? "신청 중인 공개 행사의 서버 마감 시각이 유효함"
          : `마감 시각 확인이 필요한 행사 ${input.invalidEventDeadlineCount}개`,
      ready: input.invalidEventDeadlineCount === 0,
      target: "events",
    },
    {
      id: "product-alt",
      label: "제품 이미지 설명",
      detail:
        input.missingProductAltCount === 0
          ? "공개 제품 이미지의 접근성 설명이 준비됨"
          : `이미지 설명이 없는 공개 제품 ${input.missingProductAltCount}개`,
      ready: input.missingProductAltCount === 0,
      target: "products",
    },
    {
      id: "app-check",
      label: "Firebase App Check",
      detail: input.appCheckConfigured
        ? "reCAPTCHA Enterprise 기반 요청 검증이 설정됨"
        : "운영 키 등록과 모니터링 후 적용 필요",
      ready: input.appCheckConfigured,
    },
    {
      id: "custom-domain-https",
      label: "공식 도메인 HTTPS",
      detail: input.secureCustomDomain
        ? "geekbyte.kro.kr 보안 연결 확인됨"
        : "DNS와 GitHub Pages 인증서 설정 확인 필요",
      ready: input.secureCustomDomain,
    },
  ];
}
