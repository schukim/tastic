# /new-screen — 새 화면 구현

새로운 화면(Screen) 컴포넌트를 생성합니다.

## 사용법

```
/new-screen <ScreenName>
```

## 실행 내용

1. `src/screens/<ScreenName>/` 디렉토리 생성
2. 메인 화면 컴포넌트 파일 생성 (`<ScreenName>Screen.tsx`)
3. 화면 전용 컴포넌트 파일 생성 (필요시)
4. 화면 전용 훅 생성 (필요시)
5. React Navigation에 화면 등록
6. TypeScript 타입 정의
7. i18n 키 추가 (ko, en)

## 생성 규칙

- 컴포넌트명은 PascalCase
- Props 인터페이스 필수 정의
- NativeWind 스타일링 사용
- 다국어 텍스트 하드코딩 금지
