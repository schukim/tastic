# 보안 규칙

## API 키 관리
- Claude API 키는 Supabase Edge Function 환경변수로만 관리
- 클라이언트 코드에 API 키 절대 노출 금지
- `.env` 파일은 `.gitignore`에 포함

## Supabase RLS
- 모든 테이블에 Row Level Security 필수 적용
- 기본 정책: `auth.uid() = user_id`
- 공개 데이터 없음 — 모든 데이터는 사용자 소유

## 인증
- Supabase Auth 토큰 검증 필수 (Edge Function)
- 토큰 만료 처리
- 민감한 작업 시 추가 인증 고려

## 입력 검증
- 사용자 입력 서버 측 검증 필수
- SQL Injection 방지 (Supabase 클라이언트 사용 시 자동 처리)
- XSS 방지
