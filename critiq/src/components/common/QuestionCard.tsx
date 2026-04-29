import React from "react";
import { View, Text } from "react-native";

interface QuestionCardProps {
  question: string;
  topicLabel: string;
  questionNumber: number;
  isNewTopic?: boolean;
}

export function QuestionCard({ question, topicLabel, questionNumber, isNewTopic }: QuestionCardProps) {
  return (
    <View className="bg-surface-secondary rounded-2xl p-5 shadow-sm border border-surface-tertiary">
      {isNewTopic && (
        <View className="bg-primary/10 self-start px-3 py-1 rounded-full mb-3">
          <Text className="text-primary text-xs font-semibold">{topicLabel}</Text>
        </View>
      )}
      <Text className="text-text-secondary text-xs mb-2 font-medium">
        Q{questionNumber}
      </Text>
      <Text className="text-text text-base leading-6">{question}</Text>
    </View>
  );
}
