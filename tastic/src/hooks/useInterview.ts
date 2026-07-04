import { useState, useCallback, useRef } from "react";
import type { Content, ConversationEntry } from "../types/database";
import type { GenerateQuestionResponse } from "../types/llm";
import { generateQuestion } from "../services/claude";
import { createInterview, updateInterview } from "../services/review";
import { saveDraft, clearDraft } from "../utils/storage";
import { useAuthStore } from "../stores/authStore";
import { getFirstQuestion } from "../prompts/firstQuestions";

const MAX_RETRIES = 3;
// 무료 플랜: 5번째 답변 즉시 평론 자동 생성·세션 종료
const FREE_MAX_QUESTIONS = 5;
// 멤버십: 6번째 질문 이상 진행 가능 — 비용 안전 상한만 둠
const MEMBERSHIP_MAX_QUESTIONS = 10;

export function useInterview(content: Content) {
  const user = useAuthStore((s) => s.user);
  // developer는 내부용 플랜 — 기능상 멤버십과 동일하게 동작 (UI 비노출)
  const isMembership = user?.plan === "membership" || user?.plan === "developer";
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<GenerateQuestionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isInterviewComplete, setIsInterviewComplete] = useState(false);
  // 멤버십: 5문답 이후 '미리보기/계속하기' 선택 대기 상태
  const [awaitingChoice, setAwaitingChoice] = useState(false);
  const interviewIdRef = useRef<string | null>(null);

  const canPreview = isMembership && questionCount >= FREE_MAX_QUESTIONS;

  // Initialize interview in DB
  const initInterview = useCallback(async () => {
    if (!user || interviewIdRef.current) return;
    try {
      const interview = await createInterview({
        userId: user.id,
        workId: content.id,
      });
      interviewIdRef.current = interview.id;
    } catch {
      // Non-blocking: interview will be created on first save
    }
  }, [user, content.id]);

  // Fetch next question — first question is always from the predefined list
  const fetchQuestion = useCallback(async (conv: ConversationEntry[], qCount: number) => {
    setIsLoading(true);
    setError(null);
    try {
      let response: GenerateQuestionResponse;

      if (qCount === 0) {
        // First question: pick from predefined category-specific list
        const question = getFirstQuestion(content.category, content.metadata);
        response = {
          question,
          question_type: "initial",
          topic_label: "첫인상",
        };
      } else {
        response = await generateQuestion({
          content: {
            title: content.title,
            category: content.category,
            creator: content.creator,
            year: content.year,
            genre: content.genre,
            metadata: content.metadata,
          },
          conversation_history: conv,
          question_count: qCount,
          language: user?.language ?? "ko",
        });
      }

      // Only honor should_end after the user has answered at least 5 questions
      if (response.should_end && qCount >= FREE_MAX_QUESTIONS) {
        setIsInterviewComplete(true);
        setRetryCount(0);
        return response;
      }

      setCurrentQuestion(response);
      setRetryCount(0);

      // Add question to conversation
      const questionEntry: ConversationEntry = {
        role: "interviewer",
        text: response.question,
        question_type: response.question_type,
        topic_label: response.topic_label,
      };
      const updated = [...conv, questionEntry];
      setConversation(updated);

      return response;
    } catch {
      const newRetryCount = retryCount + 1;
      setRetryCount(newRetryCount);
      setError(newRetryCount >= MAX_RETRIES ? "persist" : "retry");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [content, user, retryCount]);

  // Submit answer and get next question
  const submitAnswer = useCallback(async (answerText: string) => {
    const answerEntry: ConversationEntry = { role: "user", text: answerText };
    const updatedConv = [...conversation, answerEntry];
    const newCount = questionCount + 1;

    setConversation(updatedConv);
    setQuestionCount(newCount);

    // Sync to DB
    if (interviewIdRef.current) {
      updateInterview(interviewIdRef.current, updatedConv, newCount).catch(() => {});
    }

    // 플랜별 상한: 무료는 5문답 즉시 종료, 멤버십은 안전 상한까지
    const maxQuestions = isMembership ? MEMBERSHIP_MAX_QUESTIONS : FREE_MAX_QUESTIONS;
    if (newCount >= maxQuestions) {
      setIsInterviewComplete(true);
      return null;
    }

    // Auto-save draft
    await saveDraft({
      content,
      conversation: updatedConv,
      questionCount: newCount,
      interviewId: interviewIdRef.current,
      savedAt: new Date().toISOString(),
    });

    // 멤버십: 5문답부터는 자동 진행하지 않고 미리보기/계속하기 선택을 기다린다
    if (isMembership && newCount >= FREE_MAX_QUESTIONS) {
      setAwaitingChoice(true);
      return null;
    }

    // Fetch next question
    return fetchQuestion(updatedConv, newCount);
  }, [conversation, questionCount, content, fetchQuestion, isMembership]);

  // 멤버십: '인터뷰 계속하기' — 다음 질문 요청
  const continueInterview = useCallback(async () => {
    setAwaitingChoice(false);
    return fetchQuestion(conversation, questionCount);
  }, [conversation, questionCount, fetchQuestion]);

  // 이탈("저장하고 나가기") 시 현재 상태를 드래프트로 저장.
  // submitAnswer 의 자동 저장과 달리 답변 전(질문만 있는) 상태도 저장한다.
  const saveDraftNow = useCallback(async () => {
    await saveDraft({
      content,
      conversation,
      questionCount,
      interviewId: interviewIdRef.current,
      savedAt: new Date().toISOString(),
    });
  }, [content, conversation, questionCount]);

  // 인터뷰 종료 처리 — 평론 생성은 ReviewCompleteScreen에서 수행
  const completeInterview = useCallback(async () => {
    setAwaitingChoice(false);
    if (interviewIdRef.current) {
      updateInterview(interviewIdRef.current, conversation, questionCount, "completed").catch(() => {});
    }
    await clearDraft();
  }, [conversation, questionCount]);

  // Restore from draft
  const restoreFromDraft = useCallback((
    savedConversation: ConversationEntry[],
    savedQuestionCount: number,
    savedInterviewId: string | null
  ) => {
    setConversation(savedConversation);
    setQuestionCount(savedQuestionCount);
    interviewIdRef.current = savedInterviewId;

    // Find last question in conversation
    const lastQuestion = [...savedConversation]
      .reverse()
      .find((e) => e.role === "interviewer");

    if (lastQuestion) {
      setCurrentQuestion({
        question: lastQuestion.text,
        question_type: lastQuestion.question_type ?? "deep",
        topic_label: lastQuestion.topic_label ?? "",
      });
    }

    // 5문답 이후 답변까지 마친 드래프트 복원: 플랜에 따라 선택 대기 / 즉시 종료
    const lastEntry = savedConversation[savedConversation.length - 1];
    if (lastEntry?.role === "user" && savedQuestionCount >= FREE_MAX_QUESTIONS) {
      if (isMembership && savedQuestionCount < MEMBERSHIP_MAX_QUESTIONS) {
        setAwaitingChoice(true);
      } else {
        setIsInterviewComplete(true);
      }
    }
  }, [isMembership]);

  return {
    conversation,
    questionCount,
    currentQuestion,
    isLoading,
    error,
    canPreview,
    isInterviewComplete,
    awaitingChoice,
    isMembership,
    interviewId: interviewIdRef.current,
    initInterview,
    fetchQuestion,
    submitAnswer,
    continueInterview,
    completeInterview,
    saveDraftNow,
    restoreFromDraft,
    setError,
  };
}
