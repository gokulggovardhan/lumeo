// html2canvas ships its own types under dist/types/index.d.ts, but its
// package.json has no "types"/"typings" field and no "exports" map entry
// pointing at it, so TypeScript's bundler resolution can't find them for a
// plain `import html2canvas from "html2canvas"`. This is the minimal shape
// this codebase actually uses.
declare module "html2canvas" {
  export type Html2CanvasOptions = {
    scale?: number;
    useCORS?: boolean;
    backgroundColor?: string | null;
    width?: number;
    height?: number;
    windowWidth?: number;
    windowHeight?: number;
  };

  const html2canvas: (
    element: HTMLElement,
    options?: Html2CanvasOptions,
  ) => Promise<HTMLCanvasElement>;

  export default html2canvas;
}
