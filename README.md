# Tastic — Claude Code 프로젝트 설정

문화 콘텐츠 감상 → LLM 인터뷰 → 개인 평론 작성 앱의 Claude Code 설정 파일입니다.

## 파일 구조

```
tastic-claude-config/
├── CLAUDE.md                          # 프로젝트 루트 설정 (기본 컨텍스트)
├── .env.example                       # 환경변수 템플릿
├── docs/
│   ├── feature-spec.md                # 전체 기능 명세서
│   ├── architecture.md                # 시스템 아키텍처
│   └── ux/                            # 화면별 UI/UX 워크플로우 (상세)
│       ├── auth.md                    # 로그인/회원가입 플로우
│       ├── review-home.md             # 평론(홈) 탭 — 4단계 화면 전환, 인터뷰 UX
│       ├── history.md                 # 히스토리 탭 — 캘린더, 리스트, 팝업
│       ├── recommend.md               # 추천 탭 — 프롬프트 입력, 카드 결과
│       ├── analysis.md                # 분석 탭 — 3가지 상태, 재분석, 추천 유도
│       └── mypage.md                  # 마이페이지 — 프로필, 설정, 구독
└── .claude/
    ├── settings.json                  # 권한 및 모델 설정
    ├── agents/                        # 서브에이전트 (3개)
    │   ├── ui-builder.md              # React Native UI 구현 전문
    │   ├── api-builder.md             # Supabase 백엔드 + Claude API 전문
    │   └── prompt-engineer.md         # LLM 프롬프트 설계 전문
    ├── commands/                      # 슬래시 커맨드 (6개)
    │   ├── setup.md                   # /setup - 프로젝트 초기 셋업
    │   ├── plan.md                    # /plan - 기능 구현 계획 수립
    │   ├── new-screen.md              # /new-screen - 새 화면 구현
    │   ├── new-function.md            # /new-function - Edge Function 생성
    │   ├── migrate.md                 # /migrate - DB 마이그레이션 생성
    │   └── design-prompt.md           # /design-prompt - LLM 프롬프트 설계
    ├── skills/                        # 자동 트리거 스킬 (5개)
    │   ├── review-flow/SKILL.md       # 평론 작성 인터뷰 플로우
    │   ├── llm-prompt/SKILL.md        # LLM 프롬프트 관리 패턴
    │   ├── taste-analysis/SKILL.md    # 취향 분석 로직
    │   ├── content-recommend/SKILL.md # 크로스 카테고리 추천
    │   └── db-schema/SKILL.md         # Supabase DB 스키마
    └── rules/                         # 항상 적용되는 규칙 (5개)
        ├── code-style.md              # 코드 스타일
        ├── testing.md                 # 테스트 규칙
        ├── security.md                # 보안 규칙
        ├── git-workflow.md            # Git 워크플로우
        └── i18n.md                    # 다국어 규칙
```

## 정보가 흐르는 구조 (Progressive Disclosure)

```
CLAUDE.md (항상 로드, 간결)
  ├── 참조 → docs/ux/*.md (화면 구현 시에만 로드)
  ├── 참조 → docs/feature-spec.md
  └── 참조 → docs/architecture.md

.claude/rules/ (항상 로드)
  └── 코드 스타일, 보안, 테스트 등 전역 규칙

.claude/skills/ (관련 작업 시 자동 로드)
  └── 각 스킬 내부에서 docs/ux/*.md 참조 안내

.claude/agents/ (위임 시 로드)
  └── ui-builder가 docs/ux/*.md를 필수 참조

.claude/commands/ (사용자가 /명령 실행 시)
  └── /new-screen이 docs/ux/*.md 읽기를 첫 단계로 지시
```

## 사용법

### 1. 프로젝트 루트에 복사
```bash
mkdir tastic && cd tastic
cp path/to/tastic-claude-config/CLAUDE.md .
cp path/to/tastic-claude-config/.env.example .
cp -r path/to/tastic-claude-config/.claude .
cp -r path/to/tastic-claude-config/docs .
```

### 2. Claude Code 시작 → 초기 셋업
```
claude
/setup
```

### 3. 기능 개발 워크플로우
```
/plan 평론 작성 화면        # 계획 수립 (UX 문서 자동 참조)
/new-screen ReviewHome      # 화면 구현 (UX 문서 먼저 읽음)
/new-function generate-question  # Edge Function 생성
/design-prompt 인터뷰 첫 질문    # 프롬프트 설계
/migrate add-review-tables  # DB 마이그레이션
```

### 4. 에이전트 직접 호출
```
@ui-builder 히스토리 캘린더 컴포넌트를 구현해줘
@api-builder 취향 분석 Edge Function을 만들어줘
@prompt-engineer 평론 생성 프롬프트를 개선해줘
```