# /new-function — Edge Function 생성

Supabase Edge Function을 생성합니다.

## 사용법

```
/new-function <function-name>
```

## 실행 내용

1. `supabase/functions/<function-name>/` 디렉토리 생성
2. `index.ts` 파일 생성 (Deno 런타임)
3. CORS 헤더 설정
4. 인증 검증 로직 포함
5. Claude API 호출 로직 (LLM 관련 함수인 경우)
6. 에러 핸들링 및 응답 포맷 (`{ data, error, status }`)
7. 프론트엔드 서비스 함수 생성 (`src/services/`)

## 생성 규칙

- 함수명은 kebab-case
- API 키는 환경변수에서만 읽기
- 응답 형태 통일: `{ data, error, status }`
- rate limiting 고려
