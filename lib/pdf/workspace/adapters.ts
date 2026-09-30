import type { OrganizerItem } from "../pageOrganizer.ts";
import type { PlacedElement } from "../../sign/types.ts";
import type { WorkspacePage, WorkspacePageId } from "./model.ts";
import { visibleWorkspacePages } from "./session.ts";

export type WorkspacePlacedElement = Omit<PlacedElement, "pageIndex"> & {
  pageId: WorkspacePageId;
};

export function organizerItemsFromWorkspacePages(
  pages: readonly WorkspacePage[],
): OrganizerItem[] {
  return visibleWorkspacePages(pages).map((page) => ({
    id: page.id,
    sourcePage: page.provenance.sourcePageNumber,
    rotation: page.rotation,
  }));
}

export function signElementsToWorkspace(
  elements: readonly PlacedElement[],
  pages: readonly WorkspacePage[],
): WorkspacePlacedElement[] {
  const visible = visibleWorkspacePages(pages);
  return elements.map((element) => {
    const page = visible[element.pageIndex];
    if (!page) {
      throw new RangeError(
        `Sign element ${element.id} references missing page index ${element.pageIndex}.`,
      );
    }
    const { pageIndex: _pageIndex, ...placement } = element;
    void _pageIndex;
    return { ...placement, pageId: page.id } as WorkspacePlacedElement;
  });
}

export function signElementsFromWorkspace(
  elements: readonly WorkspacePlacedElement[],
  pages: readonly WorkspacePage[],
): PlacedElement[] {
  const visible = visibleWorkspacePages(pages);
  return elements.flatMap((element) => {
    const pageIndex = visible.findIndex((page) => page.id === element.pageId);
    if (pageIndex < 0) {
      // A placement follows its stable page identity. If that page has been
      // deleted, the legacy index-based Sign engine must not move the
      // placement onto a different page.
      return [];
    }
    const { pageId: _pageId, ...placement } = element;
    void _pageId;
    return [{ ...placement, pageIndex } as PlacedElement];
  });
}
