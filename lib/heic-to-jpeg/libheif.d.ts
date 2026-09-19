declare module "libheif-js/libheif-wasm/libheif-bundle.mjs" {
  type ImageHandle = { handle: number; is_primary(): boolean; get_width(): number; get_height(): number; free(): void };
  type Channel = { id: number; width: number; height: number; stride: number; data: Uint8Array };
  type LibHeif = {
    HeifDecoder: new () => { decode(bytes: Uint8Array): ImageHandle[]; decoder: number };
    heif_js_decode_image2(handle: number, colorspace: number, chroma: number): Promise<{ code?: number; image: number; channels: Channel[] }>;
    heif_colorspace: { heif_colorspace_RGB: number };
    heif_chroma: { heif_chroma_interleaved_RGBA: number };
    heif_channel: { heif_channel_interleaved: number };
    heif_image_release(image: number): void;
    heif_context_free(context: number): void;
  };
  export default function createLibHeif(options?: { print?: () => void; printErr?: () => void }): Promise<LibHeif> | LibHeif;
}
