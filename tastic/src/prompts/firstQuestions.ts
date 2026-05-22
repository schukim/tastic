import type { ContentCategory } from "../types/database";

const FIRST_QUESTIONS: Record<Exclude<ContentCategory, "music">, string[]> = {
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

const FIRST_QUESTIONS_MUSIC_ALBUM: string[] = [
  "이 앨범을 처음 들었을 때 전체적으로 어떤 느낌이나 분위기가 왔나요?",
  "앨범 전체를 통해 흐르는 감정의 색깔이 있다면 어떻게 표현하시겠어요?",
  "앨범에서 가장 먼저 당신을 사로잡은 트랙은 어떤 곡이었나요?",
  "이 앨범을 듣기 가장 어울리는 시간대나 장소가 있다면 어디일까요?",
  "앨범을 전부 듣고 나서 처음과 달라진 인상이나 감정이 있었나요?",
];

const FIRST_QUESTIONS_MUSIC_SONG: string[] = [
  "이 곡을 처음 들었을 때 가장 먼저 귀를 사로잡은 것은 무엇이었나요?",
  "이 곡을 들으며 머릿속에 어떤 장면이나 이야기가 그려졌나요?",
  "이 곡이 가장 잘 어울린다고 느끼는 순간이나 감정이 있나요?",
  "가사, 멜로디, 사운드 중 어떤 요소가 가장 강하게 남았나요?",
  "이 곡을 처음 들은 순간을 기억하나요? 어떤 상황이었나요?",
];

export function getFirstQuestion(
  category: ContentCategory,
  metadata?: Record<string, unknown>
): string {
  if (category === "music") {
    const questions =
      metadata?.music_type === "song"
        ? FIRST_QUESTIONS_MUSIC_SONG
        : FIRST_QUESTIONS_MUSIC_ALBUM;
    return questions[Math.floor(Math.random() * questions.length)];
  }
  const questions = FIRST_QUESTIONS[category as Exclude<ContentCategory, "music">];
  return questions[Math.floor(Math.random() * questions.length)];
}
