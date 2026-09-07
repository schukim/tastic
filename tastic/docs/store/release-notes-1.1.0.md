# 출시 노트 — 1.1.0

빌드: iOS 1.1.0 (16) / Android 1.1.0 (22) · 커밋 `89909a6`
이전 출시: 1.0.1 (양 스토어)

글자수 제한 — **Google Play 500자** / **App Store 4000자**.
Play 쪽이 빠듯하므로 Play용과 App Store용을 따로 둔다.

---

## 1. Google Play — 변경사항 (≤500자)

### 한국어 (251자)

```
■ 첫 3편은 하루 제한 없이
가입 후 처음 쓰는 평론 3편은 하루 한 편 제한 없이 이어서 쓸 수 있어요. 첫날에 바로 취향 분석과 추천까지 만나보세요.

■ 더 깊어진 인터뷰
질문이 한 가지 이야기만 파고들지 않고 다른 각도로 넘어갑니다. 감상의 여러 면이 담긴 평론이 나와요. 무료 플랜 문답도 6개로 늘었습니다.

■ 작품 검색 정확도 개선
한국어 제목을 훨씬 잘 찾습니다. 찾는 작품이 없으면 재검색을 눌러보세요 — 원제로 다시 찾아드려요.
```

### English (462 chars)

```
■ Your first 3 reviews, no daily limit
Write your first three reviews back to back. Unlock taste analysis and recommendations on day one.

■ Deeper interviews
Questions now move to a new angle instead of digging into one thread, so your review covers more of what you felt. The free plan now includes 6 questions.

■ Better title search
Korean titles are found far more reliably. Not the work you meant? Tap search again — we'll look it up by its original title.
```

---

## 2. App Store — 새로운 기능 (≤4000자)

### 한국어

```
첫 평론을 남기기까지의 문턱을 낮추고, 인터뷰가 더 깊은 이야기를 끌어내도록 다듬었습니다.

■ 첫 3편은 하루 제한 없이
가입 후 처음 작성하는 평론 3편은 하루 한 편 제한을 받지 않습니다. 기다리지 않고 이어서 쓸 수 있어요.
평론 3편이 모이면 취향 분석과 맞춤 추천이 열립니다. 이제 가입 첫날에 Tastic의 모든 기능을 만나볼 수 있습니다.
평론 홈에서 남은 편수를 확인하세요.

■ 한 가지만 파고들지 않는 인터뷰
이전에는 첫 질문에 이어 비슷한 꼬리질문이 반복되면서, 감상의 한 면만 담긴 평론이 나오곤 했습니다.
이제 인터뷰가 중간에 다른 각도로 넘어갑니다. 연출에서 사운드로, 캐릭터에서 읽기 경험으로 —
서로 다른 두 축을 각각 깊이 다루고, 아쉬웠던 점까지 짚은 뒤 마무리합니다.
무료 플랜의 문답 수도 5개에서 6개로 늘려 이 흐름을 온전히 담았습니다.

■ 작품을 훨씬 잘 찾습니다
한국어 제목으로 검색했을 때 작품을 찾지 못하던 문제를 고쳤습니다.
띄어쓰기가 다르게 표기된 제목도 인식하고, 국내 개봉명과 원제를 함께 확인합니다.
찾는 작품이 목록에 없다면 '재검색'을 눌러보세요. 원제와 영문 표기로 다시 찾아드립니다.

■ 그 밖의 개선
평론 생성 안정성을 높이고, 검색 응답 시간을 줄였습니다.
```

### English

```
We lowered the barrier to your first review, and reshaped the interview to draw out a fuller story.

■ Your first 3 reviews, no daily limit
The first three reviews on a new account aren't subject to the one-per-day limit. Write them back to back, no waiting.
Three reviews unlock taste analysis and personalized recommendations — so you can now experience all of Tastic on your first day.
Check how many are left on the review home screen.

■ Interviews that don't dwell on one thread
Before, the opening question was followed by similar follow-ups, and reviews often captured only one facet of what you felt.
Now the interview shifts to a new angle partway through — from directing to sound, from character to the reading experience.
It explores two distinct threads in depth, asks what fell short, and then closes.
The free plan now includes 6 questions instead of 5, so the full arc fits.

■ Much better title search
Fixed an issue where works couldn't be found when searched by their Korean title.
Alternate spacing in titles is now recognized, and local release titles are cross-checked against original titles.
Not seeing the work you meant? Tap "Search again" — we'll look it up by its original and English titles.

■ Other improvements
Improved review generation reliability and reduced search response times.
```

---

## 3. Android 전용 추가 문구 (선택)

Android 1.0.1 에는 Apple 로그인 버튼이 있었으나, 네이티브 SDK 가 없어 웹 리다이렉트로
동작하던 경로라 1.1.0 에서 제거했다. **기존에 Android 에서 Apple 로 가입한 사용자가 있다면
로그인 수단이 사라진다** — 아래 리스크 항목 참고. 넣을 경우 Play 500자 예산 안에서 조정할 것.

```
■ 안내
Android에서는 Apple 로그인을 더 이상 지원하지 않습니다. Apple 계정으로 가입하셨다면 고객센터로 문의해 주세요.
```

---

## 4. 확인이 필요한 리스크

- **Android + Apple 로그인 사용자 잠금**: 위 3번 참고. 세션이 남아 있는 동안은 계속 쓸 수 있지만,
  로그아웃하거나 기기를 바꾸면 다시 로그인할 방법이 없다(OAuth 가입이라 비밀번호가 없고,
  Supabase 는 기본적으로 이메일이 같아도 provider 를 자동 연결하지 않는다).
  Supabase 대시보드 → Authentication → Users 에서 provider 가 apple 인 계정을 확인할 것.
- **스토어에 준비 중인 1.1.0 버전이 없는지** 확인 후 제출할 것.
- 잘못 만든 1.0.1 빌드(iOS 16 이전 build 15 / Android build 21)는 제출하지 말 것.
