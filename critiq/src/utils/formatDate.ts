export function formatRelativeDate(dateString: string, language: "ko" | "en" = "ko"): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (language === "ko") {
    if (diffMin < 1) return "방금 전";
    if (diffMin < 60) return `${diffMin}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    if (diffWeeks < 5) return `${diffWeeks}주 전`;
    return `${diffMonths}개월 전`;
  }

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 5) return `${diffWeeks}w ago`;
  return `${diffMonths}mo ago`;
}

export function formatDate(dateString: string, language: "ko" | "en" = "ko"): string {
  const date = new Date(dateString);
  if (language === "ko") {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
  }
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function toISODateString(date: Date): string {
  return date.toISOString().split("T")[0];
}
