# Critiq 테스트 가이드

## 사전 준비

### 필수 설치
- Node.js 18+
- Docker Desktop (Supabase 로컬 실행용)
- Expo Go 앱 (실제 기기 테스트 시, App Store / Play Store)
- iOS Simulator 또는 Android Emulator (선택)

### API 키
- Anthropic API 키: https://console.anthropic.com 에서 발급

---

## 1단계: Supabase 로컬 환경 구성

```bash
cd /home/sangwoo/artlog/critiq

# Docker가 실행 중인지 확인
docker info

# Supabase 초기화 + 로컬 시작 (npx로 실행)
npx supabase init        # 이미 supabase/ 폴더가 있으면 스킵
npx supabase start       # 첫 실행 시 Docker 이미지 다운로드로 수 분 소요
```

`supabase start` 완료 시 출력되는 값을 확인:

```
API URL:   http://127.0.0.1:54321
anon key:  eyJhbG...
service_role key: eyJhbG...
Studio URL: http://127.0.0.1:54323
```

### 환경변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 열고 위 출력값을 입력:

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...(위에서 복사)
ANTHROPIC_API_KEY=sk-ant-...(본인 키)
```

### DB 마이그레이션 적용

```bash
npx supabase db reset
```

이 명령이 `supabase/migrations/00001_initial_schema.sql`을 자동 실행하여 테이블, RLS, 트리거를 생성합니다.

확인: http://127.0.0.1:54323 (Supabase Studio) 에서 Table Editor 탭을 열면 `users`, `contents`, `reviews`, `interviews`, `taste_profiles`, `recommendations` 6개 테이블이 보여야 합니다.

### Edge Functions 로컬 실행

```bash
npx supabase functions serve --env-file .env
```

이 명령이 5개 Edge Function을 로컬에서 실행합니다:
- `verify-content`
- `generate-question`
- `generate-review`
- `analyze-taste`
- `recommend-content`

> **주의**: `supabase functions serve`와 `supabase start`를 별도 터미널에서 동시에 실행해야 합니다.

---

## 2단계: Expo 앱 실행

```bash
# 새 터미널에서
cd /home/sangwoo/artlog/critiq
npx expo start
```

실행 옵션:
- `i` — iOS Simulator
- `a` — Android Emulator
- QR 코드 스캔 — Expo Go 앱으로 실기기 테스트

> **실기기 테스트 시 주의**: `EXPO_PUBLIC_SUPABASE_URL`을 `http://127.0.0.1:54321` 대신 PC의 로컬 IP(예: `http://192.168.0.10:54321`)로 변경해야 합니다. 터미널에서 `ipconfig`(Windows) 또는 `ifconfig`(Mac/Linux)으로 확인하세요.

---

## 3단계: 기능별 테스트 체크리스트

### Auth (인증)

| # | 테스트 항목 | 확인 |
|---|---|---|
| 1 | 앱 시작 시 로그인 화면이 표시됨 | |
| 2 | 이메일 형식 오류 시 에러 텍스트 표시 | |
| 3 | 비밀번호 8자 미만 시 에러 텍스트 표시 | |
| 4 | "회원가입" 링크 터치 → 회원가입 화면 이동 | |
| 5 | 회원가입 1단계: 이메일 + 비밀번호 입력 → "다음" | |
| 6 | 회원가입 2단계: 닉네임 + 카테고리 1개 이상 선택 → "시작하기" | |
| 7 | 가입 완료 → 메인 탭(평론 홈)으로 자동 이동 | |
| 8 | 로그아웃 → 로그인 화면으로 복귀 | |
| 9 | 다시 로그인 → 메인 탭 진입 | |

### 평론 (홈) 탭

| # | 테스트 항목 | 확인 |
|---|---|---|
| 1 | "~님, 오늘은 무엇을 감상하셨나요?" 문구 표시 | |
| 2 | 제목 입력창 터치 시 문구가 상단으로 애니메이션 이동 | |
| 3 | 카테고리 칩 + 감상 일자 필드 표시 | |
| 4 | 제목 + 카테고리 선택 후 "다음" 활성화 | |
| 5 | 작품 확인 화면: 로딩 스켈레톤 → 후보 카드 표시 | |
| 6 | 카테고리가 "전시"/"공연"일 때 "직접 입력" 상단 노출 | |
| 7 | 후보 선택 → "다음" → 인터뷰 화면 진입 | |
| 8 | 첫 질문이 해당 작품에 특화된 질문인지 확인 | |
| 9 | 답변 입력 → 제출 → 다음 질문 로딩 → 표시 | |
| 10 | drill_down 질문: 세로 방향 페이드인 | |
| 11 | pivot 질문: 가로 슬라이드 + 새 topic_label 뱃지 | |
| 12 | 5개 답변 후 "평론 미리보기" + "답변 종료하기" 버튼 표시 | |
| 13 | "평론 미리보기" → 모달로 평론 초안 표시 → 닫기 후 계속 | |
| 14 | "답변 종료하기" → 평론 생성 로딩 → 평론 완성 화면 | |
| 15 | 평론 텍스트 편집 가능, 글자 수 카운터 동작 | |
| 16 | "다시 생성" → 새 평론 생성 | |
| 17 | "저장하기" → 성공 토스트 → 홈으로 복귀 | |
| 18 | 인터뷰 중 앱 강제 종료 후 재시작 → "이전 인터뷰" 복구 다이얼로그 | |

### 히스토리 탭

| # | 테스트 항목 | 확인 |
|---|---|---|
| 1 | 저장한 평론이 캘린더에 색상 점으로 표시 | |
| 2 | 좌우 화살표로 이전/다음 달 이동 | |
| 3 | 날짜 터치 → 바텀시트 팝업 (평론 내용) | |
| 4 | 팝업에서 "수정" → 편집 모드 → "저장" | |
| 5 | 팝업에서 "복사" → 클립보드 복사 + 토스트 | |
| 6 | 하단 리스트에 최신순 정렬, 항목 터치 시 팝업 | |
| 7 | 평론 없을 때 빈 상태 메시지 표시 | |

### 분석 탭

| # | 테스트 항목 | 확인 |
|---|---|---|
| 1 | 평론 3개 미만 시 "평론이 더 필요해요" 메시지 + 비활성 버튼 | |
| 2 | 평론 3개 이상 시 "취향 분석하기" 버튼 활성화 | |
| 3 | 분석 진행 중: 3단계 로딩 텍스트 순환 | |
| 4 | 분석 완료: 프로파일 카드 (불릿 문장 5~8개) | |
| 5 | 하단 추천 유도 문구 표시 + 터치 시 추천 탭 이동 | |
| 6 | "취향 다시 분석하기" → 재분석 → 새 결과로 갱신 | |
| 7 | 새 평론 추가 후 돌아오면 "새 평론 N개 반영 가능" 뱃지 | |

### 추천 탭

| # | 테스트 항목 | 확인 |
|---|---|---|
| 1 | 프롬프트 입력 → 전송 → 스켈레톤 로딩 → 추천 카드 표시 | |
| 2 | 빠른 추천 칩("영화 추천", "책 추천" 등) 터치 시 자동 실행 | |
| 3 | 추천 카드: 카테고리 뱃지 + 제목 + 창작자 + 짧은 이유 | |
| 4 | 카드 터치 시 확장 → 상세 추천 이유 (accordion) | |
| 5 | 분석 탭에서 유도 문구 터치 시 → 프롬프트 자동 입력 + 실행 | |
| 6 | 평론 3개 미만 시 안내 메시지 표시 | |

### 마이 탭

| # | 테스트 항목 | 확인 |
|---|---|---|
| 1 | 닉네임 표시 + 터치 시 인라인 편집 | |
| 2 | 관심 카테고리 칩 토글 → 즉시 저장 | |
| 3 | 언어 설정 → 바텀시트 → "English" 선택 → 전체 UI 영어 전환 | |
| 4 | 로그아웃 → 확인 다이얼로그 → 로그인 화면 | |
| 5 | 계정 삭제 → 경고 다이얼로그 → 삭제 후 로그인 화면 | |

### 에러/오프라인 처리

| # | 테스트 항목 | 확인 |
|---|---|---|
| 1 | 비행기 모드 → 상단 "인터넷 연결이 없습니다" 배너 | |
| 2 | 네트워크 복구 → 배너 자동 사라짐 | |
| 3 | 인터뷰 중 네트워크 끊김 → "질문을 불러오지 못했어요" + "다시 시도" | |
| 4 | 3회 연속 실패 → "나중에 이어하기" 안내 | |
| 5 | 평론 저장 실패 → 로컬 임시 저장 + 재시도 안내 | |

---

## 4단계: Supabase Studio로 데이터 확인

테스트 후 http://127.0.0.1:54323 에서:

1. **Table Editor > users**: 가입한 사용자 프로필 확인
2. **Table Editor > contents**: 입력한 작품 메타데이터 확인
3. **Table Editor > interviews**: 인터뷰 대화 기록 (conversation JSON) 확인
4. **Table Editor > reviews**: 저장된 평론 확인
5. **Table Editor > taste_profiles**: 분석 결과 확인
6. **Table Editor > recommendations**: 추천 결과 확인

---

## 5단계: 종료

```bash
# Expo 서버 종료: Ctrl+C

# Supabase 종료
npx supabase stop
```

---

## 대안: Supabase 클라우드 사용 시

Docker 없이 테스트하려면:

1. https://supabase.com 에서 프로젝트 생성 (무료)
2. Project Settings > API 에서 URL + anon key 복사 → `.env`에 입력
3. SQL Editor에서 `supabase/migrations/00001_initial_schema.sql` 전체를 복사-붙여넣기 실행
4. Project Settings > Edge Functions에서 5개 함수를 배포:
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   npx supabase functions deploy verify-content
   npx supabase functions deploy generate-question
   npx supabase functions deploy generate-review
   npx supabase functions deploy analyze-taste
   npx supabase functions deploy recommend-content
   ```
5. `npx expo start`로 앱 실행
