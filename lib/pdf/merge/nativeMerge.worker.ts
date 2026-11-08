import { mergeNativeDocuments, type NativeMergeInput, type NativeMergeOptions } from "./nativeMerge.ts";

type MergeWorkerRequest = {
  type: "merge";
  inputs: NativeMergeInput[];
  options: Pick<NativeMergeOptions, "format" | "marginPoints">;
};

self.onmessage = async (event: MessageEvent<MergeWorkerRequest>) => {
  if (event.data?.type !== "merge") return;
  try {
    const result = await mergeNativeDocuments(event.data.inputs, {
      ...event.data.options,
      onProgress: (completed, total) => {
        self.postMessage({ type: "progress", completed, total });
      },
    });
    self.postMessage({ type: "result", value: result }, { transfer: [result.bytes] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to merge these PDF files.";
    self.postMessage({ type: "error", message });
  }
};
