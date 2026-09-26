import type { OrganizerItem } from "../pageOrganizer.ts";
import type { PlacedElement } from "../../sign/types.ts";
import type { WorkspacePage, WorkspacePageId } from "./model.ts";

export type WorkspacePlacedElement = Omit<PlacedElement, "pageIndex"> & {
  pageId: WorkspacePageId;
};

export function organizerItemsFromWorkspacePages(pages: readonly WorkspacePage[]): OrganizerItem[] {
  return pages
    .filter((page) => !page.deleted)
    .map((page) => ({
      id: page.id,
      sourcePage: page.provenance.sourcePageNumber,
      rotation: page.rotation,
    }));
}

export function signElementsToWorkspace(
  elements: readonly PlacedElement[],
  pages: readonly WorkspacePage[],
): WorkspacePlacedElement[] {
  const visible = pages.filter((page) => !page.deleted);
  return elements.flatMap((element) => {
    const page = visible[element.pageIndex];
    return page ? [{ ...element, pageId: page.id, pageIndex: undefined } as unknown as WorkspacePlacedElement] : [];
  });
}

export function signElementsFromWorkspace(
  elements: readonly WorkspacePlacedElement[],
  pages: readonly WorkspacePage[],
): PlacedElement[] {
  const visible = pages.filter((page) => !page.deleted);
  return elements.flatMap((element) => {
    const pageIndex = visible.findIndex((page) => page.id === element.pageId);
    if (pageIndex < 0) return [];
    const { pageId: _pageId, ...placed } = element;
    return [{ ...placed, pageIndex } as PlacedElement];
  });
}
