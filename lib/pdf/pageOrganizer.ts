import { normalizeRotation } from "./rotation.ts";

export type OrganizerItem = {
  id: string;
  sourcePage: number;
  rotation: 0 | 90 | 180 | 270;
};

export function createInitialItems(pageCount: number): OrganizerItem[] {
  return Array.from({ length: pageCount }, (_, index) => ({
    id: `page-${index + 1}`,
    sourcePage: index + 1,
    rotation: 0,
  }));
}

export function moveItem(items: OrganizerItem[], fromIndex: number, toIndex: number): OrganizerItem[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function duplicateItem(items: OrganizerItem[], index: number, newId: string): OrganizerItem[] {
  const source = items[index];
  if (!source) return items;
  const next = [...items];
  next.splice(index + 1, 0, { ...source, id: newId });
  return next;
}

export function removeItem(items: OrganizerItem[], index: number): OrganizerItem[] {
  return items.filter((_, i) => i !== index);
}

export function removeItems(items: OrganizerItem[], indices: Set<number>): OrganizerItem[] {
  return items.filter((_, i) => !indices.has(i));
}

export function rotateItem(items: OrganizerItem[], index: number, direction: "left" | "right"): OrganizerItem[] {
  const target = items[index];
  if (!target) return items;
  const delta = direction === "right" ? 90 : -90;
  const rotation = normalizeRotation(target.rotation + delta);
  return items.map((item, i) => (i === index ? { ...item, rotation } : item));
}

export function rotateItems(
  items: OrganizerItem[],
  indices: Set<number>,
  direction: "left" | "right",
): OrganizerItem[] {
  const delta = direction === "right" ? 90 : -90;
  return items.map((item, i) =>
    indices.has(i) ? { ...item, rotation: normalizeRotation(item.rotation + delta) } : item,
  );
}

export function validateOrganizeItems(items: OrganizerItem[]): string | null {
  if (items.length === 0) return "Removing every page would leave an empty PDF.";
  return null;
}
