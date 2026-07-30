// 앱 재실행 시 게스트 모드로 복귀할지 판단한다.
//
// 문제: 게스트는 순전히 메모리 상태(guestStore.isGuest)라 앱을 종료하면 사라진다. 그런데
// 인트로(기능 가이드)는 기기당 1회라 이미 본 것으로 기록돼 있어, 재실행하면 '먼저 둘러보기'
// 버튼이 있는 화면 자체에 다시 닿을 수 없다 — 체험을 시작만 하고 앱을 껐던 사용자가
// 로그인 화면에 갇힌다.
//
// 해결: 인트로에서 게스트를 시작한 사실을 기기에 남기고(markGuestSessionStarted),
// 체험이 아직 끝나지 않았으면 다음 실행에서 게스트 모드로 되돌린다.
//
// 복귀시키지 않는 경우 — 이 셋이 요구사항 그대로다.
//   1) 세션이 있다(로그인·회원가입 완료) → 정상 인증 경로가 우선
//   2) 인트로에서 게스트를 시작한 적이 없다 → 로그인 화면에 상시 게스트 진입로를 만들지 않는다
//   3) 이미 평론을 생성했다(체험 1회 소진) → 다음 단계는 가입이지 재체험이 아니다

export function shouldRestoreGuest(params: {
  /** 유효한 로그인 세션이 있는가 */
  hasSession: boolean;
  /** 인트로에서 '먼저 둘러보기'로 게스트를 시작한 기록이 있는가 */
  sessionStarted: boolean;
  /** 체험 인터뷰 1회를 이미 소진했는가(= 평론 생성 완료) */
  interviewUsed: boolean;
}): boolean {
  const { hasSession, sessionStarted, interviewUsed } = params;

  if (hasSession) return false;
  if (!sessionStarted) return false;
  return !interviewUsed;
}
