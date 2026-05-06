import React from "react";
import { Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";
import type { ContentCategory } from "../../types/database";

const CATEGORY_ICONS: Record<ContentCategory, string> = {
  movie: "\uD83C\uDFAC",
  music: "\uD83C\uDFB5",
  book: "\uD83D\uDCDA",
  art: "\uD83C\uDFA8",
};

interface CategoryChipProps {
  category: ContentCategory;
  selected: boolean;
  onPress: (category: ContentCategory) => void;
}

export function CategoryChip({ category, selected, onPress }: CategoryChipProps) {
  const { t } = useTranslation();

  return (
    <Pressable
      className={`flex-row items-center px-4 py-2 rounded-full mr-2 mb-2 ${
        selected ? "bg-primary" : "bg-surface-tertiary"
      }`}
      onPress={() => onPress(category)}
    >
      <Text className="mr-1">{CATEGORY_ICONS[category]}</Text>
      <Text className={`text-sm font-medium ${selected ? "text-white" : "text-text"}`}>
        {t(`category.${category}`)}
      </Text>
    </Pressable>
  );
}

export { CATEGORY_ICONS };
