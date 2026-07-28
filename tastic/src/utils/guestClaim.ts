// 게스트 체험 평론을 계정으로 이전할지 판단한다.
//
// 게스트 체험은 "가입 전 사용자가 평론을 만들어보고, 그 평론을 **새로 만든 계정**으로
// 가져가는" 흐름이다. 따라서 이미 계정이 있는 사람이 체험 후 로그인한 경우에는
// 이전하지 않는다 — 남의(혹은 지난) 체험물이 기존 계정에 꽂히거나, 그 계정의
// 오늘 무료 1편이 본인도 모르게 소진되는 것을 막기 위함.
//
// 판별은 서버가 준 auth 유저의 created_at 으로 한다. 클라이언트 플래그(가입 버튼을
// 눌렀는지)는 회원가입 화면에서 '로그인' 링크로 빠져나가면 어긋나므로 신뢰하지 않는다.

// 가입 직후로 인정하는 시간 창. 이메일 확인 링크를 받아 누르기까지 시간이 걸릴 수 있어
// 넉넉하게 1시간을 둔다. (계정 생성 후 1시간 넘게 지난 계정 = 기존 계정)
export const NEW_ACCOUNT_WINDOW_MS = 60 * 60 * 1000;

// 기기·서버 시계 차이로 created_at 이 미래로 보일 수 있어 약간의 음수를 허용한다.
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * @param createdAt auth 유저의 created_at (ISO 문자열)
 * @returns 갓 만들어진 계정이면 true — 이때만 게스트 평론을 이전한다
 */
export function shouldClaimGuestReview(
  createdAt: string | undefined | null,
  now: number = Date.now()
): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return false;

  const age = now - created;
  return age > -CLOCK_SKEW_TOLERANCE_MS && age < NEW_ACCOUNT_WINDOW_MS;
}
