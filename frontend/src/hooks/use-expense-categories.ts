import { useQuery } from "@tanstack/react-query";
import type { CustomCategory } from "@shared/schema";
import { EXPENSE_CATEGORY_GROUPS } from "@/lib/constants";

export type CategoryItem = { value: string; emoji: string; isCustom?: boolean; customId?: number };
export type CategoryGroup = { groupKey: string; items: CategoryItem[] };

export function useExpenseCategories(): CategoryGroup[] {
  const { data: customCats = [] } = useQuery<CustomCategory[]>({
    queryKey: ["/api/custom-categories"],
  });

  return EXPENSE_CATEGORY_GROUPS.map(group => {
    const customForGroup = customCats
      .filter(c => c.type === group.groupKey)
      .map(c => ({ value: c.name, emoji: c.emoji ?? "📌", isCustom: true, customId: c.id }));

    return {
      groupKey: group.groupKey,
      items: [
        ...group.items.map(i => ({ value: i.value, emoji: i.emoji })),
        ...customForGroup,
      ],
    };
  });
}
