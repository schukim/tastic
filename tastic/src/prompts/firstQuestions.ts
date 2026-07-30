import type { ContentCategory } from "../types/database";
import type { LlmLanguage } from "../utils/llmLanguage";

type TemplateCategory = Exclude<ContentCategory, "music">;

const FIRST_QUESTIONS_KO: Record<TemplateCategory, string[]> = {
  series: [
    "이 시리즈를 다 보고 난 직후, 가장 먼저 떠오른 감정이나 장면이 있었나요?",
    "전체를 통틀어 가장 오래 기억에 남을 것 같은 에피소드나 순간은 언제였나요?",
    "시리즈를 보는 내내 가장 마음이 끌렸던 캐릭터가 있었나요?",
    "이 시리즈의 분위기나 톤을 한 단어나 색으로 표현한다면 무엇일까요?",
    "처음 몇 화를 보고 나서, 끝까지 보게 만든 결정적인 순간이 있었나요?",
  ],
  movie: [
    "영화를 다 보고 난 직후, 어떤 감정이나 생각이 가장 먼저 떠올랐나요?",
    "이 영화에서 가장 오래 기억에 남을 것 같은 순간은 언제였나요?",
    "영화를 보는 동안 특별히 마음이 끌렸던 캐릭터가 있었나요?",
    "이 영화의 분위기나 톤을 한 단어나 색으로 표현한다면 무엇일까요?",
    "이 영화의 첫 장면이 당신에게 어떤 첫인상을 주었나요?",
  ],
  book: [
    "이 책을 읽으면서 가장 강렬하게 느꼈던 감정은 무엇이었나요?",
    "책을 덮은 직후, 가장 먼저 머릿속에 떠오른 생각이나 장면은 무엇이었나요?",
    "이 책을 읽는 속도는 어떠했나요? 빨리 넘기셨나요, 아니면 천천히 음미하셨나요?",
    "등장인물 중 가장 인상 깊었던 인물은 누구였나요?",
    "읽으면서 밑줄을 긋고 싶었던 문장이나 장면이 있었나요?",
  ],
  art: [
    "작품 앞에 섰을 때 처음 눈에 들어온 것은 무엇이었나요?",
    "이 작품에서 가장 먼저 어떤 감정이 느껴졌나요?",
    "작품을 오래 바라볼수록 새롭게 발견한 것이 있었나요?",
    "이 작품의 색채나 형태가 어떤 기억이나 감각을 떠올리게 했나요?",
    "작가가 이 작품을 통해 무엇을 말하고 싶었다고 느끼셨나요?",
  ],
};

// 영어 세트는 한국어 문항의 직역이 아니라 같은 의도(첫인상·감정·기억에 남은 순간을 여는
// 열린 질문)를 영어권 화자가 자연스럽게 답할 수 있는 어투로 옮긴 것이다.
const FIRST_QUESTIONS_EN: Record<TemplateCategory, string[]> = {
  series: [
    "Right after finishing this series, what feeling or scene came to mind first?",
    "Across the whole run, which episode or moment do you think will stay with you longest?",
    "Was there a character you found yourself drawn to throughout the series?",
    "If you had to capture this series' mood in a single word or color, what would it be?",
    "After the first few episodes, was there a moment that made you commit to finishing it?",
  ],
  movie: [
    "Right after the credits rolled, what feeling or thought surfaced first?",
    "Which moment from this film do you think will stay with you the longest?",
    "Was there a character you felt particularly drawn to while watching?",
    "If you had to capture this film's mood in a single word or color, what would it be?",
    "What first impression did the opening scene leave on you?",
  ],
  book: [
    "What was the strongest emotion you felt while reading this book?",
    "Right after you closed the book, what thought or image came to mind first?",
    "How did you read it — racing through the pages, or slowly savoring them?",
    "Which character left the deepest impression on you?",
    "Was there a sentence or passage you wanted to underline as you read?",
  ],
  art: [
    "When you first stood in front of the work, what caught your eye?",
    "What was the first emotion this work stirred in you?",
    "Did you notice anything new the longer you looked at it?",
    "Did the colors or forms bring back any particular memory or sensation?",
    "What did you feel the artist was trying to say through this work?",
  ],
};

const FIRST_QUESTIONS_MUSIC_ALBUM_KO: string[] = [
  "이 앨범을 처음 들었을 때 전체적으로 어떤 느낌이나 분위기가 왔나요?",
  "앨범 전체를 통해 흐르는 감정의 색깔이 있다면 어떻게 표현하시겠어요?",
  "앨범에서 가장 먼저 당신을 사로잡은 트랙은 어떤 곡이었나요?",
  "이 앨범을 듣기 가장 어울리는 시간대나 장소가 있다면 어디일까요?",
  "앨범을 전부 듣고 나서 처음과 달라진 인상이나 감정이 있었나요?",
];

const FIRST_QUESTIONS_MUSIC_SONG_KO: string[] = [
  "이 곡을 처음 들었을 때 가장 먼저 귀를 사로잡은 것은 무엇이었나요?",
  "이 곡을 들으며 머릿속에 어떤 장면이나 이야기가 그려졌나요?",
  "이 곡이 가장 잘 어울린다고 느끼는 순간이나 감정이 있나요?",
  "가사, 멜로디, 사운드 중 어떤 요소가 가장 강하게 남았나요?",
  "이 곡을 처음 들은 순간을 기억하나요? 어떤 상황이었나요?",
];

const FIRST_QUESTIONS_MUSIC_ALBUM_EN: string[] = [
  "What overall feeling or atmosphere hit you on your first listen through this album?",
  "If there's an emotional color running through the whole album, how would you describe it?",
  "Which track grabbed you first?",
  "Is there a time of day or a place where this album feels most at home?",
  "After hearing it all the way through, did your first impression shift at all?",
];

const FIRST_QUESTIONS_MUSIC_SONG_EN: string[] = [
  "What caught your ear first when you played this track?",
  "Did any scene or story form in your head while you listened?",
  "Is there a moment or a mood this song fits perfectly?",
  "Which stayed with you most — the lyrics, the melody, or the production?",
  "Do you remember the first time you heard it? What were you doing?",
];

const MUSIC_QUESTIONS: Record<LlmLanguage, { album: string[]; song: string[] }> = {
  ko: { album: FIRST_QUESTIONS_MUSIC_ALBUM_KO, song: FIRST_QUESTIONS_MUSIC_SONG_KO },
  en: { album: FIRST_QUESTIONS_MUSIC_ALBUM_EN, song: FIRST_QUESTIONS_MUSIC_SONG_EN },
};

const CATEGORY_QUESTIONS: Record<LlmLanguage, Record<TemplateCategory, string[]>> = {
  ko: FIRST_QUESTIONS_KO,
  en: FIRST_QUESTIONS_EN,
};

// save-verified-work가 작품 확정 시 생성해 metadata.first_questions에 캐싱한
// 작품 특화 첫 질문을 우선 사용하고, 없으면(수동 입력·생성 실패) 카테고리 템플릿으로 폴백.
//
// 단 이 캐시는 works 행에 붙는 전역 값이고 서버가 한국어로만 생성한다
// (save-verified-work/index.ts 의 프롬프트 조건 7). 영어 사용자에게 그대로 내보내면
// 인터뷰 첫 화면이 한국어로 뜨므로, 영어일 때는 캐시를 쓰지 않고 영어 템플릿으로 간다.
function getCachedFirstQuestion(metadata?: Record<string, unknown>): string | null {
  const cached = metadata?.first_questions;
  if (!Array.isArray(cached)) return null;
  const valid = cached.filter(
    (q): q is string => typeof q === "string" && q.trim().length > 0
  );
  if (valid.length === 0) return null;
  return valid[Math.floor(Math.random() * valid.length)];
}

function pick(questions: string[]): string {
  return questions[Math.floor(Math.random() * questions.length)];
}

export function getFirstQuestion(
  category: ContentCategory,
  metadata?: Record<string, unknown>,
  language: LlmLanguage = "ko"
): string {
  if (language === "ko") {
    const cached = getCachedFirstQuestion(metadata);
    if (cached) return cached;
  }

  if (category === "music") {
    const set = MUSIC_QUESTIONS[language];
    return pick(metadata?.music_type === "song" ? set.song : set.album);
  }

  return pick(CATEGORY_QUESTIONS[language][category as TemplateCategory]);
}
