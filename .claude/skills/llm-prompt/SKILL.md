# LLM 프롬프트 관리 패턴

프롬프트 관련 코드를 다룰 때 자동으로 적용되는 스킬입니다.

## 트리거 조건

- `src/prompts/` 파일 수정 시
- `supabase/functions/` 에서 Claude API 호출 코드 수정 시

## 규칙

### 프롬프트 구조
- 시스템 프롬프트와 유저 프롬프트 분리
- 변수는 `{{variable}}` 형식 사용
- 프롬프트는 `src/prompts/`에 파일로 분리 관리, 하드코딩 금지

### 프롬프트 파일 형식
```typescript
export const promptName = {
  system: `시스템 프롬프트 내용`,
  user: (vars: PromptVars) => `유저 프롬프트 with ${vars.variable}`,
};
```

### Claude API 호출
- 모델: `claude-sonnet-4-20250514`
- Edge Function을 통한 프록시 호출
- 적절한 max_tokens 설정
- temperature는 용도에 맞게 조절 (창의적 생성 vs 분석)
