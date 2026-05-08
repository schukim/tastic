import { useState, useCallback, useRef } from "react";
import type { Content, ConversationEntry } from "../types/database";
import type { GenerateQuestionResponse } from "../types/llm";
import { generateQuestion, generateReview } from "../services/claude";
import { createInterview, updateInterview } from "../services/review";
import { saveDraft, clearDraft } from "../utils/storage";
import { useAuthStore } from "../stores/authStore";
import { getFirstQuestion } from "../prompts/firstQuestions";

const MAX_RETRIES = 3;

export function useInterview(content: Content) {
  const user = useAuthStore((s) => s.user);
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<GenerateQuestionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isInterviewComplete, setIsInterviewComplete] = useState(false);
  const interviewIdRef = useRef<string | null>(null);

  const canPreview = questionCount >= 5;

  // Initialize interview in DB
  const initInterview = useCallback(async () => {
    if (!user || interviewIdRef.current) return;
    try {
      const interview = await createInterview({
        userId: user.id,
        contentId: content.id,
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

      if (response.should_end) {
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
    } catch (e) {
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

    // Max 6 turns — guard against extra calls
    if (newCount >= 6) {
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

    // Sync to DB
    if (interviewIdRef.current) {
      updateInterview(interviewIdRef.current, updatedConv, newCount).catch(() => {});
    }

    // Fetch next question
    return fetchQuestion(updatedConv, newCount);
  }, [conversation, questionCount, content, fetchQuestion]);

  // Generate review from conversation
  const finishInterview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await generateReview({
        content: {
          title: content.title,
          category: content.category,
          creator: content.creator,
          year: content.year,
        },
        conversation_history: conversation,
        language: user?.language ?? "ko",
      });

      // Mark interview completed
      if (interviewIdRef.current) {
        updateInterview(interviewIdRef.current, conversation, questionCount, "completed").catch(() => {});
      }

      await clearDraft();
      return response;
    } catch {
      setError("generate_failed");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [content, conversation, questionCount, user]);

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
  }, []);

  return {
    conversation,
    questionCount,
    currentQuestion,
    isLoading,
    error,
    canPreview,
    isInterviewComplete,
    interviewId: interviewIdRef.current,
    initInterview,
    fetchQuestion,
    submitAnswer,
    finishInterview,
    restoreFromDraft,
    setError,
  };
}
