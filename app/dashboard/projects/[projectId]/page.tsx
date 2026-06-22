"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  loadFFmpegClient as getFFmpeg,
  preloadFFmpeg,
  resetFFmpeg,
} from "@/lib/ffmpegClient";
import {
  exportVideo as exportTrimmedVideoWithFFmpeg,
  extractAudio as extractAudioWithFFmpeg,
} from "@/lib/exportUtils";
import { saveUserProfile } from "@/lib/userProfile";

const MEDIA_DB_NAME = "lumeo-local-media";
const MEDIA_STORE_NAME = "project-media";

type ToolKey =
  | "media"
  | "cut"
  | "frame"
  | "canvas"
  | "edit"
  | "text"
  | "audio"
  | "effects"
  | "project"
  | "export";

type CanvasFormat = "9:16" | "1:1" | "4:5" | "16:9";
type FitMode = "contain" | "cover" | "blurredBackground";
type BackgroundStyle = "blur" | "black" | "gradient";
type BackgroundBlurStyle = "soft" | "premium" | "strong";
type BackgroundDimStyle = "balanced" | "dark";
type ExportResolution = "720p" | "1080p" | "2k";
type VideoFormat = "mp4" | "webm";
type AudioFormat = "mp3" | "wav";
type ExportQuality = "standard" | "high" | "max";
type ExportFps = 24 | 30 | 60;
type TitleStyle =
  | "cleanLower"
  | "creatorBold"
  | "minimalTag"
  | "cinematic"
  | "softCaption";
type TitleAlign = "left" | "center" | "right";
type TitleSize = "small" | "medium" | "large" | "xl";
type TitlePosition = "top" | "center" | "lower" | "bottom";
type ReframeState = {
  scale: number;
  x: number;
  y: number;
  safeZones: boolean;
};

const tools: { key: ToolKey; label: string; description: string; icon: string }[] =
  [
    { key: "media", label: "Media", description: "Video and music", icon: "◉" },
    { key: "canvas", label: "Frame", description: "Layout and view", icon: "▣" },
    { key: "edit", label: "Cut", description: "Trim and motion", icon: "✂" },
    { key: "text", label: "Titles", description: "Hooks and overlays", icon: "T" },
    { key: "audio", label: "Sound", description: "Audio mix", icon: "♫" },
    { key: "effects", label: "Effects", description: "Look and color", icon: "✦" },
    { key: "export", label: "Export", description: "Output settings", icon: "⇩" },
    { key: "project", label: "Project", description: "Save and manage", icon: "✓" },
  ];

const studioTools: { key: ToolKey; label: string; description: string }[] =
  [
    { key: "media", label: "Media", description: "Video status" },
    { key: "cut", label: "Cut", description: "Trim controls" },
    { key: "frame", label: "Frame", description: "Canvas format" },
    { key: "text", label: "Titles", description: "Hooks and overlays" },
    { key: "audio", label: "Sound", description: "Audio levels" },
    { key: "export", label: "Export", description: "Output settings" },
  ];

const frameOptions: { value: CanvasFormat; label: string }[] = [
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
  { value: "16:9", label: "16:9" },
];

const backgroundBlurOptions: { value: BackgroundBlurStyle; label: string }[] = [
  { value: "soft", label: "Soft" },
  { value: "premium", label: "Premium" },
  { value: "strong", label: "Strong" },
];

const backgroundDimOptions: { value: BackgroundDimStyle; label: string }[] = [
  { value: "balanced", label: "Balanced" },
  { value: "dark", label: "Dark" },
];

const titleStyles: { value: TitleStyle; label: string; description: string }[] = [
  {
    value: "cleanLower",
    label: "Clean Lower",
    description: "Premium lower-third style",
  },
  {
    value: "creatorBold",
    label: "Creator Bold",
    description: "Bold centered creator title",
  },
  {
    value: "minimalTag",
    label: "Minimal Tag",
    description: "Small compact label",
  },
  {
    value: "cinematic",
    label: "Cinematic",
    description: "Elegant wide title",
  },
  {
    value: "softCaption",
    label: "Soft Caption",
    description: "Readable caption-style title",
  },
];

const titlePositions: { value: TitlePosition; label: string; x: number; y: number }[] = [
  { value: "top", label: "Top", x: 50, y: 16 },
  { value: "center", label: "Center", x: 50, y: 50 },
  { value: "lower", label: "Lower", x: 50, y: 76 },
  { value: "bottom", label: "Bottom", x: 50, y: 86 },
];

const reframeDefaults: ReframeState = {
  scale: 1,
  x: 0,
  y: 0,
  safeZones: false,
};

const subjectSizePresets: { label: string; scale: number }[] = [
  { label: "Wide", scale: 0.9 },
  { label: "Natural", scale: 1 },
  { label: "Close", scale: 1.18 },
  { label: "Hero", scale: 1.35 },
];

const focusPresets: { label: string; x: number; y: number }[] = [
  { label: "Center", x: 0, y: 0 },
  { label: "Face left", x: 16, y: 0 },
  { label: "Face right", x: -16, y: 0 },
  { label: "Higher", x: 0, y: 14 },
  { label: "Lower", x: 0, y: -14 },
];

function getOutputDimensions(
  canvasFormat: CanvasFormat,
  resolution: ExportResolution
) {
  if (canvasFormat === "9:16") {
    if (resolution === "720p") return { width: 720, height: 1280 };
    if (resolution === "1080p") return { width: 1080, height: 1920 };
    return { width: 1440, height: 2560 };
  }

  if (canvasFormat === "1:1") {
    if (resolution === "720p") return { width: 720, height: 720 };
    if (resolution === "1080p") return { width: 1080, height: 1080 };
    return { width: 1440, height: 1440 };
  }

  if (canvasFormat === "4:5") {
    if (resolution === "720p") return { width: 720, height: 900 };
    if (resolution === "1080p") return { width: 1080, height: 1350 };
    return { width: 1440, height: 1800 };
  }

  if (resolution === "720p") return { width: 1280, height: 720 };
  if (resolution === "1080p") return { width: 1920, height: 1080 };
  return { width: 2560, height: 1440 };
}

function clampReframeScale(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return reframeDefaults.scale;

  return Math.min(1.6, Math.max(0.85, parsed));
}

function clampReframeOffset(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 0;

  return Math.min(40, Math.max(-40, parsed));
}

function normalizeReframeState(
  savedReframe: unknown,
  legacyCanvas: Record<string, unknown> = {},
): ReframeState {
  const source =
    savedReframe && typeof savedReframe === "object"
      ? (savedReframe as Record<string, unknown>)
      : {};

  return {
    scale: clampReframeScale(
      source.scale ?? Number(legacyCanvas.videoZoom || 100) / 100,
    ),
    x: clampReframeOffset(source.x ?? legacyCanvas.videoX),
    y: clampReframeOffset(source.y ?? legacyCanvas.videoY),
    safeZones: source.safeZones === true,
  };
}

function openMediaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("Browser storage is not supported"));
      return;
    }

    const request = indexedDB.open(MEDIA_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(MEDIA_STORE_NAME)) {
        database.createObjectStore(MEDIA_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveMediaToBrowser(key: string, file: File) {
  const database = await openMediaDB();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE_NAME, "readwrite");
    const store = transaction.objectStore(MEDIA_STORE_NAME);

    store.put(file, key);

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };

    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function getMediaFromBrowser(key: string): Promise<File | null> {
  const database = await openMediaDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE_NAME, "readonly");
    const store = transaction.objectStore(MEDIA_STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => {
      database.close();
      resolve((request.result as File) || null);
    };

    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  });
}

async function deleteMediaFromBrowser(key: string) {
  const database = await openMediaDB();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE_NAME, "readwrite");
    const store = transaction.objectStore(MEDIA_STORE_NAME);

    store.delete(key);

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };

    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-[1.6rem] border border-white/10 bg-[#111018]/90 shadow-2xl shadow-black/25 backdrop-blur-2xl">
      <div className="shrink-0 border-b border-white/10 px-5 py-4">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-white/32">
          Studio Panel
        </p>

        <h2 className="mt-1.5 text-lg font-black tracking-tight text-white">
          {title}
        </h2>

        {subtitle && (
          <p className="mt-1.5 text-xs leading-5 text-white/48">{subtitle}</p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
    </div>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="text-sm font-bold text-white/58">{label}</label>

        <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-black text-white/70">
          {value}
          {suffix}
        </span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-fuchsia-300"
      />
    </div>
  );
}

function OptionButton({
  active,
  children,
  onClick,
  small = false,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border font-black transition ${
        small ? "px-3 py-3 text-xs" : "px-4 py-3 text-sm"
      } ${
        active
          ? "border-white/20 bg-white text-black shadow-lg shadow-white/10"
          : "border-white/10 bg-white/[0.06] text-white/62 hover:bg-white/[0.12] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function LumeoStudioMark({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/12 bg-[#090812] shadow-lg shadow-fuchsia-500/12 ${
        small ? "h-9 w-9" : "h-10 w-10"
      }`}
    >
      <span
        className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(245,230,188,0.38),transparent_34%),linear-gradient(135deg,rgba(217,70,239,0.34),rgba(34,211,238,0.18))]"
        style={{ animation: "lumeoPulse 3.8s ease-in-out infinite" }}
      />
      <svg
        viewBox="0 0 24 24"
        className="relative z-10 h-5 w-5 text-[#f8eed0]"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M7 5.5v13h9.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M13 9.2l4.7 2.8-4.7 2.8V9.2z" fill="currentColor" />
      </svg>
    </span>
  );
}

function StudioToolIcon({
  tool,
  active,
}: {
  tool: ToolKey;
  active: boolean;
}) {
  const iconClass = "h-[21px] w-[21px]";
  const strokeProps = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <span
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition ${
        active
          ? "border-cyan-200/24 bg-gradient-to-br from-fuchsia-300/22 via-violet-300/16 to-cyan-200/22 text-cyan-50 shadow-lg shadow-cyan-300/10"
          : "border-white/8 bg-white/[0.055] text-white/58 group-hover:border-white/14 group-hover:bg-white/[0.09] group-hover:text-white/82"
      }`}
      style={active ? { animation: "subtleShimmer 3.2s ease-in-out infinite" } : undefined}
    >
      {tool === "media" && (
        <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
          <rect x="4" y="6" width="16" height="12" rx="2.2" {...strokeProps} />
          <path d="M11 9.5l4 2.5-4 2.5v-5z" fill="currentColor" />
        </svg>
      )}

      {tool === "cut" && (
        <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
          <circle cx="6.5" cy="7" r="2.2" {...strokeProps} />
          <circle cx="6.5" cy="17" r="2.2" {...strokeProps} />
          <path d="M8.4 8.4L18.5 18M18.5 6L8.4 15.6" {...strokeProps} />
        </svg>
      )}

      {tool === "frame" && (
        <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
          <path d="M7 4H4v3M17 4h3v3M7 20H4v-3M20 17v3h-3" {...strokeProps} />
          <rect x="7" y="7" width="10" height="10" rx="1.8" {...strokeProps} />
        </svg>
      )}

      {tool === "text" && (
        <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
          <path d="M5 6h14M12 6v12M8.5 18h7" {...strokeProps} />
          <path d="M7 6l1-2h8l1 2" {...strokeProps} />
        </svg>
      )}

      {tool === "audio" && (
        <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
          <path d="M4 14v-4M8 17V7M12 19V5M16 16V8M20 13v-2" {...strokeProps} />
        </svg>
      )}

      {tool === "export" && (
        <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
          <path d="M12 15V4M8 8l4-4 4 4" {...strokeProps} />
          <path d="M5 14v3.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V14" {...strokeProps} />
        </svg>
      )}
    </span>
  );
}

function StudioEmptyState() {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center px-8 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(217,70,239,0.16),transparent_34%),radial-gradient(circle_at_52%_55%,rgba(34,211,238,0.12),transparent_28%)]" />
      <div
        className="relative flex h-24 w-24 items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.045] shadow-2xl shadow-fuchsia-500/10"
        style={{ animation: "lumeoFloat 4.5s ease-in-out infinite" }}
      >
        <span className="absolute inset-[-14px] rounded-[2.4rem] border border-fuchsia-200/10" />
        <span className="absolute inset-[-28px] rounded-[2.8rem] border border-cyan-200/8" />
        <LumeoStudioMark />
      </div>

      <p className="relative mt-7 text-2xl font-black tracking-tight">
        Start with your first clip
      </p>

      <p className="relative mt-3 max-w-xs text-sm leading-6 text-white/48">
        Upload a video to begin editing in Lumeo Studio.
      </p>

      <span className="relative mt-5 rounded-full border border-white/10 bg-black/35 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/52">
        Media Library
      </span>
    </div>
  );
}

function UploadDropzone({
  id,
  title,
  subtitle,
  accept,
  onChange,
}: {
  id: string;
  title: string;
  subtitle: string;
  accept: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <input
        id={id}
        type="file"
        accept={accept}
        onChange={onChange}
        className="sr-only"
      />

      <label
        htmlFor={id}
        className="group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[1.75rem] border border-dashed border-white/14 bg-gradient-to-br from-white/[0.075] via-white/[0.035] to-cyan-200/[0.045] px-5 py-8 text-center shadow-xl shadow-black/10 transition hover:border-cyan-200/28 hover:bg-white/[0.08] hover:shadow-cyan-300/10"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,230,188,0.14),transparent_42%)] opacity-80" />

        <div
          className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/12 bg-[#090812] text-[#f8eed0] shadow-xl shadow-fuchsia-500/10 transition group-hover:scale-105"
          style={{ animation: "lumeoFloat 4.8s ease-in-out infinite" }}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
            <path
              d="M12 15V5M8 9l4-4 4 4"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M5 15.5V17a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <p className="relative mt-4 text-base font-black text-white">{title}</p>

        <p className="relative mt-2 max-w-[260px] text-sm leading-6 text-white/45">
          {subtitle}
        </p>

        <span className="relative mt-5 rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/62">
          Choose from device
        </span>
      </label>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/32">
        {label}
      </p>

      <p className="mt-1 text-sm font-black text-white/82">{value}</p>
    </div>
  );
}

type VideoUploadResponse = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
};

type CloudinarySignUploadResponse =
  | {
      success: true;
      cloudName: string;
      apiKey: string;
      folder: string;
      timestamp: number;
      signature: string;
    }
  | {
      success: false;
      error?: string;
    };

type TemporaryCloudinaryUpload = {
  publicId: string;
  secureUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  fingerprint: string;
};

type CopyFromCloudinaryResponse =
  | ({
      success: true;
      cleanupComplete: boolean;
    } & VideoUploadResponse)
  | {
      success: false;
      error?: string;
    };

type CloudExportResponse =
  | {
      success: true;
      downloadUrl?: string;
      fileName: string;
      createdAt: string;
    }
  | {
      success: false;
      error?: string;
      failedStage?: string;
      details?: string;
    };

const LEGACY_DEFAULT_OVERLAY_TEXT = "Your title here";

function createVideoFingerprint(file: File, projectId: string) {
  return `${projectId}:${file.name}:${file.size}:${file.lastModified}`;
}

function normalizeOverlayText(value: unknown) {
  if (typeof value !== "string") return "";

  return value.trim() === LEGACY_DEFAULT_OVERLAY_TEXT ? "" : value;
}

function normalizeTitleStyle(value: unknown): TitleStyle {
  if (value === "creatorBold" || value === "creator") return "creatorBold";
  if (value === "minimalTag" || value === "minimal") return "minimalTag";
  if (value === "cinematic" || value === "luxury" || value === "neon") {
    return "cinematic";
  }
  if (value === "softCaption" || value === "caption") return "softCaption";
  return "cleanLower";
}

function normalizeTitleSize(value: unknown): TitleSize {
  return value === "small" || value === "medium" || value === "xl"
    ? value
    : "large";
}

function normalizeTitlePosition(value: unknown): TitlePosition {
  return value === "top" ||
    value === "center" ||
    value === "bottom"
    ? value
    : "lower";
}

function getTitlePositionCoordinates(position: TitlePosition) {
  return titlePositions.find((item) => item.value === position) || titlePositions[2];
}

function normalizeTitleScale(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 1;

  return Math.min(1.6, Math.max(0.8, parsed));
}

function getTitleScaleFromLegacySize(value: unknown) {
  if (value === "small") return 0.85;
  if (value === "medium") return 0.95;
  if (value === "xl") return 1.35;
  return 1;
}

function clampTitleCoordinate(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(max, Math.max(min, parsed));
}

function normalizeBackgroundBlurStyle(value: unknown): BackgroundBlurStyle {
  return value === "soft" || value === "strong" ? value : "premium";
}

function normalizeBackgroundDimStyle(value: unknown): BackgroundDimStyle {
  return value === "dark" ? value : "balanced";
}

async function createCloudinaryUploadSignature() {
  const response = await fetch("/api/cloudinary/sign-upload", {
    method: "POST",
  });
  const payload = (await response.json()) as CloudinarySignUploadResponse;

  if (!response.ok || !payload.success) {
    throw new Error(
      "error" in payload && payload.error ? payload.error : "Upload failed",
    );
  }

  return payload;
}

async function uploadVideoToTemporaryCloudinary(
  file: File,
  projectId: string,
  fingerprint: string,
  onProgress: (progress: number) => void,
  onRequest?: (request: XMLHttpRequest) => boolean | void
) {
  const signature = await createCloudinaryUploadSignature();

  return new Promise<TemporaryCloudinaryUpload>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const formData = new FormData();

    formData.append("file", file);
    formData.append("api_key", signature.apiKey);
    formData.append("timestamp", String(signature.timestamp));
    formData.append("signature", signature.signature);
    formData.append("folder", signature.folder);

    request.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${signature.cloudName}/video/upload`,
    );

    console.info("[Lumeo Upload] Cloudinary upload started", {
      fileName: file.name,
      size: file.size,
      mimeType: file.type,
      projectId,
    });

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;

      const progress = Math.min(
        99,
        Math.round((event.loaded / event.total) * 100),
      );

      console.info("[Lumeo Upload] Cloudinary upload progress", { progress });
      onProgress(progress);
    };

    request.onload = () => {
      console.info("[Lumeo Upload] Cloudinary upload status code", {
        status: request.status,
      });

      try {
        const response = JSON.parse(request.responseText || "{}") as {
          public_id?: string;
          secure_url?: string;
          bytes?: number;
          mimeType?: string;
          resource_type?: string;
          error?: {
            message?: string;
          };
        };

        if (
          request.status >= 200 &&
          request.status < 300 &&
          response.public_id &&
          response.secure_url
        ) {
          console.info("[Lumeo Upload] Cloudinary upload completed", {
            publicId: response.public_id,
          });

          resolve({
            publicId: response.public_id,
            secureUrl: response.secure_url,
            fileName: file.name,
            mimeType: file.type,
            size: Number(response.bytes || file.size),
            fingerprint,
          });
          return;
        }

        console.error("[Lumeo Upload] Cloudinary upload failed", {
          status: request.status,
          message: response.error?.message,
        });
        reject(new Error(response.error?.message || "Upload failed"));
      } catch (error) {
        console.error("[Lumeo Upload] Cloudinary upload failed", error);
        reject(error);
      }
    };

    request.onerror = () => {
      console.error("[Lumeo Upload] Cloudinary upload failed", {
        status: request.status,
      });
      reject(new Error("Upload failed"));
    };
    request.onabort = () => {
      console.info("[Lumeo Upload] Cloudinary upload canceled");
      reject(new Error("Upload cancelled"));
    };
    const shouldUpload = onRequest?.(request);

    if (shouldUpload === false) {
      reject(new Error("Upload cancelled"));
      return;
    }

    request.send(formData);
  });
}

async function copyCloudinaryVideoToPermanentStorage(
  temporaryUpload: TemporaryCloudinaryUpload,
  projectId: string,
  signal?: AbortSignal,
) {
  console.info("[Lumeo Upload] copy to permanent storage started", {
    publicId: temporaryUpload.publicId,
    fileName: temporaryUpload.fileName,
    size: temporaryUpload.size,
  });

  const response = await fetch("/api/google-drive/copy-from-cloudinary", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      publicId: temporaryUpload.publicId,
      secureUrl: temporaryUpload.secureUrl,
      fileName: temporaryUpload.fileName,
      mimeType: temporaryUpload.mimeType,
      size: temporaryUpload.size,
      projectId,
    }),
  });

  const payload = (await response.json()) as CopyFromCloudinaryResponse;

  if (!response.ok || !payload.success) {
    throw new Error(
      "error" in payload && payload.error ? payload.error : "Upload failed",
    );
  }

  console.info("[Lumeo Upload] copy to permanent storage completed", {
    fileName: payload.fileName,
    size: payload.size,
    cleanupComplete: payload.cleanupComplete,
  });

  return payload;
}

async function deletePermanentMediaFile(fileId: string) {
  if (!fileId) return;

  const response = await fetch("/api/google-drive/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fileId }),
  });

  if (!response.ok) {
    throw new Error("Permanent media delete failed.");
  }
}

async function deletePermanentMediaFiles(fileIds: string[]) {
  const uniqueFileIds = Array.from(new Set(fileIds.filter(Boolean)));

  for (const fileId of uniqueFileIds) {
    try {
      await deletePermanentMediaFile(fileId);
    } catch (error) {
      console.error("Permanent media cleanup failed", error);
    }
  }
}

function collectFileIdsFromValue(value: unknown, fileIds: Set<string>) {
  if (!value || typeof value !== "object") return;

  if ("fileId" in value && typeof value.fileId === "string") {
    fileIds.add(value.fileId);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectFileIdsFromValue(item, fileIds);
    }

    return;
  }

  for (const item of Object.values(value)) {
    collectFileIdsFromValue(item, fileIds);
  }
}

function collectPermanentMediaFileIds(...values: unknown[]) {
  const fileIds = new Set<string>();

  for (const value of values) {
    collectFileIdsFromValue(value, fileIds);
  }

  return Array.from(fileIds);
}

export default function ProjectDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const videoUploadRequestRef = useRef<XMLHttpRequest | null>(null);
  const videoUploadCopyAbortRef = useRef<AbortController | null>(null);
  const videoUploadCancelledRef = useRef(false);
  const videoUploadInProgressRef = useRef(false);
  const videoUploadRunIdRef = useRef(0);
  const replacedMediaCleanupIdsRef = useRef<string[]>([]);

  const videoStorageKey = `project:${projectId}:video`;
  const audioStorageKey = `project:${projectId}:audio`;

  const [activeTool, setActiveTool] = useState<ToolKey>("media");

  const [user, setUser] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [project, setProject] = useState<any>(null);

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("Draft");
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState("Saved");
  const [projectDeleting, setProjectDeleting] = useState(false);

  const [localVideoURL, setLocalVideoURL] = useState("");
  const [localVideoName, setLocalVideoName] = useState("");
  const [localVideoSize, setLocalVideoSize] = useState("");
  const [localVideoBytes, setLocalVideoBytes] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoRestored, setVideoRestored] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [videoUploadStatus, setVideoUploadStatus] = useState("");
  const [videoStorageMetadata, setVideoStorageMetadata] = useState<any>(null);
  const [pendingCloudinaryUpload, setPendingCloudinaryUpload] =
    useState<TemporaryCloudinaryUpload | null>(null);

  const [localAudioURL, setLocalAudioURL] = useState("");
  const [localAudioName, setLocalAudioName] = useState("");
  const [audioRestored, setAudioRestored] = useState(false);

  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  const [canvasFormat, setCanvasFormat] = useState<CanvasFormat>("9:16");
  const [fitMode, setFitMode] = useState<FitMode>("cover");
  const [backgroundStyle, setBackgroundStyle] =
    useState<BackgroundStyle>("black");
  const [backgroundBlurStyle, setBackgroundBlurStyle] =
    useState<BackgroundBlurStyle>("premium");
  const [backgroundDimStyle, setBackgroundDimStyle] =
    useState<BackgroundDimStyle>("balanced");
  const [reframeScale, setReframeScale] = useState(reframeDefaults.scale);
  const [reframeX, setReframeX] = useState(reframeDefaults.x);
  const [reframeY, setReframeY] = useState(reframeDefaults.y);
  const [safeZones, setSafeZones] = useState(reframeDefaults.safeZones);

  const [rotate, setRotate] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [videoVolume, setVideoVolume] = useState(100);
  const [mutedOriginal, setMutedOriginal] = useState(false);

  const [titleStyle, setTitleStyle] = useState<TitleStyle>("cleanLower");
  const [titlePosition, setTitlePosition] = useState<TitlePosition>("lower");
  const [titleScale, setTitleScale] = useState(1);
  const [titleBackground, setTitleBackground] = useState(true);
  const [titleShadow, setTitleShadow] = useState(true);
  const [titleEnabled, setTitleEnabled] = useState(false);
  const [overlayText, setOverlayText] = useState("");
  const [overlayX, setOverlayX] = useState(50);
  const [overlayY, setOverlayY] = useState(78);
  const [overlaySize, setOverlaySize] = useState(34);
  const [overlayColor, setOverlayColor] = useState("#ffffff");
  const [overlayOpacity, setOverlayOpacity] = useState(100);
  const [overlayBg, setOverlayBg] = useState(false);
  const [overlayUppercase, setOverlayUppercase] = useState(false);
  const [overlayShadow, setOverlayShadow] = useState(true);

  const [musicVolume, setMusicVolume] = useState(80);

  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [grayscale, setGrayscale] = useState(0);
  const [blur, setBlur] = useState(0);

  const [transitionIn, setTransitionIn] = useState("none");
  const [transitionOut, setTransitionOut] = useState("none");
  const [transitionDuration, setTransitionDuration] = useState(1);

  const [exportFormat, setExportFormat] = useState<VideoFormat>("mp4");
  const [audioFormat, setAudioFormat] = useState<AudioFormat>("mp3");
  const [exportResolution, setExportResolution] =
    useState<ExportResolution>("720p");
  const [exportFps, setExportFps] = useState<ExportFps>(30);
  const [exportQuality, setExportQuality] = useState<ExportQuality>("standard");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("");
  const [engineReady, setEngineReady] = useState(false);
  const [enginePreparing, setEnginePreparing] = useState(false);
  const [engineProgress, setEngineProgress] = useState(0);
  const [exportError, setExportError] = useState("");
  const [exportPhase, setExportPhase] = useState("idle");
  const [userExportRequested, setUserExportRequested] = useState(false);
  const [lastExportAction, setLastExportAction] = useState<
    "video" | "audio" | null
  >(null);

  const exportRunIdRef = useRef(0);
  const exportProgressRef = useRef(0);
  const exportProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectLoadedRef = useRef(false);
  const initialAutoSaveSkippedRef = useRef(false);
  const projectDataRef = useRef<any>(null);

  const productionExportResolution =
    exportResolution === "1080p" ? "1080p" : "720p";
  const output = getOutputDimensions(canvasFormat, productionExportResolution);
  const productionExportFps = 30;
  const productionExportQualityLabel = `${productionExportResolution} · ${productionExportFps}fps`;
  const productionFrameModeLabel =
    fitMode === "blurredBackground"
      ? "Blurred Background"
      : fitMode === "cover"
        ? "Cinematic Fill"
        : "Original View";
  const productionExportSummary = `${canvasFormat} · ${productionFrameModeLabel} · ${productionExportQualityLabel} · MP4`;
  const hasSavedSourceMedia = Boolean(videoStorageMetadata?.fileId);
  const currentReframe = {
    scale: clampReframeScale(reframeScale),
    x: clampReframeOffset(reframeX),
    y: clampReframeOffset(reframeY),
  };
  const reframePreviewTransform = `translate(${currentReframe.x}%, ${currentReframe.y}%) rotate(${rotate}deg) scale(${currentReframe.scale}) scaleX(${flipX ? -1 : 1})`;

  const selectedRange = Math.max(
    0,
    (trimEnd || videoDuration || 0) - trimStart
  );

  const videoFilter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) grayscale(${grayscale}%) blur(${blur}px)`;
  const backgroundBlurPixels =
    backgroundBlurStyle === "soft"
      ? 28
      : backgroundBlurStyle === "strong"
        ? 48
        : 36;
  const backgroundBrightness = backgroundDimStyle === "dark" ? 0.42 : 0.55;
  const blurredBackgroundPreviewFilter = `blur(${backgroundBlurPixels}px) brightness(${backgroundBrightness}) saturate(1.15)`;
  const blurredBackgroundOverlayClass =
    backgroundDimStyle === "dark" ? "bg-black/40" : "bg-black/30";
  const visibleOverlayText = overlayText.trim().slice(0, 80);
  const hasActiveTitleOverlay = visibleOverlayText.length > 0;
  const titlePositionCoordinates = getTitlePositionCoordinates(titlePosition);
  const titleOverlayForExport = {
    enabled: titleEnabled && hasActiveTitleOverlay,
    text: hasActiveTitleOverlay ? visibleOverlayText : "",
    style: titleStyle,
    preset: titleStyle,
    position: titlePosition,
    x: titlePositionCoordinates.x,
    y: titlePositionCoordinates.y,
    align: "center" as TitleAlign,
    size: "large" as TitleSize,
    scale: normalizeTitleScale(titleScale),
    background: titleBackground,
    shadow: titleShadow,
  };
  const titlePreviewClass =
    titleStyle === "creatorBold"
      ? `${titleBackground ? "rounded-3xl bg-black/30 px-6 py-3 backdrop-blur-sm" : ""} text-[#FFF6D8] font-black tracking-tight ${titleShadow ? "[text-shadow:0_8px_30px_rgba(0,0,0,0.95),0_2px_8px_rgba(0,0,0,0.9)]" : ""}`
      : titleStyle === "minimalTag"
        ? `${titleBackground ? "rounded-full bg-black/62 px-4 py-2 backdrop-blur-md" : ""} text-[#F3E7C8] text-sm font-black uppercase tracking-[0.18em] ${titleShadow ? "shadow-2xl shadow-black/45" : ""}`
        : titleStyle === "cinematic"
          ? `${titleBackground ? "rounded-2xl bg-black/24 px-6 py-3 backdrop-blur-sm" : ""} font-serif text-[#F5E6BC] font-semibold uppercase tracking-[0.18em] ${titleShadow ? "[text-shadow:0_10px_34px_rgba(0,0,0,0.88)]" : ""}`
          : titleStyle === "softCaption"
            ? `${titleBackground ? "rounded-2xl bg-black/72 px-5 py-3 backdrop-blur-md" : ""} text-white font-black ${titleShadow ? "shadow-2xl shadow-black/55" : ""}`
            : `${titleBackground ? "rounded-2xl bg-black/58 px-5 py-3 backdrop-blur-md" : ""} text-[#F3E7C8] font-bold ${titleShadow ? "shadow-2xl shadow-black/45 [text-shadow:0_6px_24px_rgba(0,0,0,0.82)]" : ""}`;
  const titlePreviewAlignClass = "text-center";
  const titlePreviewTransform = "translate(-50%, -50%)";
  const titlePreviewSizeStyle = {
    fontSize: `clamp(1.35rem, ${3.05 * titleOverlayForExport.scale}vw, ${4.6 * titleOverlayForExport.scale}rem)`,
  };
  const canvasFrameClass =
    canvasFormat === "9:16"
      ? "aspect-[9/16] h-full max-h-[640px]"
      : canvasFormat === "1:1"
        ? "aspect-square h-full max-h-[560px]"
        : canvasFormat === "4:5"
          ? "aspect-[4/5] h-full max-h-[600px]"
          : "aspect-video w-full max-w-[980px]";

  useEffect(() => {
    projectLoadedRef.current = false;
    initialAutoSaveSkippedRef.current = false;
    setAutoSaveStatus("Saved");
  }, [projectId]);

  useEffect(() => {
    let unsubscribeProject: any;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setChecking(false);

      if (unsubscribeProject) {
        unsubscribeProject();
      }

      if (currentUser && projectId) {
        await saveUserProfile(currentUser);

        const projectRef = doc(db, "projects", projectId);

        unsubscribeProject = onSnapshot(projectRef, (snapshot) => {
          if (snapshot.exists()) {
            const data: any = {
              id: snapshot.id,
              ...snapshot.data(),
            };

            const editor = data.editor || {};
            const timeline = data.timeline || {};

            setProject(data);
            projectDataRef.current = data;
            setTitle(data.title || "");
            setStatus(data.status || "Draft");

            setTrimStart(
              editor.trim?.start ?? editor.trimStart ?? timeline.trimStart ?? 0
            );
            setTrimEnd(
              editor.trim?.end ?? editor.trimEnd ?? timeline.trimEnd ?? 0
            );

            setVideoDuration(
              editor.media?.videoDuration ??
                editor.videoDuration ??
                timeline.videoDuration ??
                0
            );
            setVideoStorageMetadata(editor.media?.storage ?? null);

            const savedCanvasFormat = editor.canvas?.format;
            setCanvasFormat(
              savedCanvasFormat === "1:1" ||
                savedCanvasFormat === "4:5" ||
                savedCanvasFormat === "16:9"
                ? savedCanvasFormat
                : "9:16"
            );

            const savedFitMode = editor.canvas?.frameMode || editor.canvas?.fitMode;
            setFitMode(
              savedFitMode === "blurredBackground"
                ? "blurredBackground"
                : savedFitMode === "contain"
                ? "contain"
                : "cover"
            );

            const savedBackground = editor.canvas?.backgroundStyle;
            setBackgroundStyle(savedBackground === "gradient" ? "gradient" : "black");
            setBackgroundBlurStyle(
              normalizeBackgroundBlurStyle(editor.canvas?.backgroundBlurStyle),
            );
            setBackgroundDimStyle(
              normalizeBackgroundDimStyle(editor.canvas?.backgroundDimStyle),
            );

            const savedReframe = normalizeReframeState(
              editor.canvas?.reframe,
              editor.canvas || {},
            );
            setReframeScale(savedReframe.scale);
            setReframeX(savedReframe.x);
            setReframeY(savedReframe.y);
            setSafeZones(savedReframe.safeZones);
            setRotate(editor.canvas?.rotate ?? 0);
            setFlipX(editor.canvas?.flipX ?? false);

            setPlaybackSpeed(editor.playback?.speed ?? 1);
            setVideoVolume(editor.playback?.videoVolume ?? 100);
            setMutedOriginal(editor.playback?.mutedOriginal ?? false);

            const savedTitles = editor.titles || {};
            const savedTitleOverlay = editor.titleOverlay || {};
            const savedTitleText = normalizeOverlayText(
              savedTitles.text || savedTitleOverlay.text || editor.textOverlay?.text,
            );
            setTitleEnabled(Boolean(savedTitles.enabled) || savedTitleText.length > 0);
            setTitleStyle(normalizeTitleStyle(savedTitles.preset || savedTitleOverlay.preset || savedTitleOverlay.style));
            setTitlePosition(normalizeTitlePosition(savedTitles.position || savedTitleOverlay.position));
            setTitleScale(
              normalizeTitleScale(
                savedTitles.size ??
                  savedTitleOverlay.scale ??
                  getTitleScaleFromLegacySize(savedTitleOverlay.size),
              ),
            );
            setTitleBackground(
              typeof savedTitles.background === "boolean"
                ? savedTitles.background
                : typeof savedTitleOverlay.background === "boolean"
                  ? savedTitleOverlay.background
                  : true,
            );
            setTitleShadow(
              typeof savedTitles.shadow === "boolean"
                ? savedTitles.shadow
                : typeof savedTitleOverlay.shadow === "boolean"
                  ? savedTitleOverlay.shadow
                  : true,
            );
            setOverlayText(savedTitleText);
            setOverlayX(
              clampTitleCoordinate(savedTitleOverlay.x ?? editor.textOverlay?.x, 0, 100, 50),
            );
            setOverlayY(
              clampTitleCoordinate(savedTitleOverlay.y ?? editor.textOverlay?.y, 8, 88, 78),
            );
            setOverlaySize(editor.textOverlay?.size ?? 34);
            setOverlayColor(editor.textOverlay?.color || "#ffffff");
            setOverlayOpacity(editor.textOverlay?.opacity ?? 100);
            setOverlayBg(editor.textOverlay?.background ?? false);
            setOverlayUppercase(editor.textOverlay?.uppercase ?? false);
            setOverlayShadow(editor.textOverlay?.shadow ?? true);

            setMusicVolume(editor.audio?.musicVolume ?? 80);

            setBrightness(editor.effects?.brightness ?? 100);
            setContrast(editor.effects?.contrast ?? 100);
            setSaturation(editor.effects?.saturation ?? 100);
            setGrayscale(editor.effects?.grayscale ?? 0);
            setBlur(editor.effects?.blur ?? 0);

            setTransitionIn(editor.transitions?.in ?? "none");
            setTransitionOut(editor.transitions?.out ?? "none");
            setTransitionDuration(editor.transitions?.duration ?? 1);

            setExportFormat("mp4");

            const savedAudioFormat = editor.exportSettings?.audioFormat;
            setAudioFormat(savedAudioFormat === "wav" ? "wav" : "mp3");

            const savedResolution = editor.exportSettings?.resolution;
            setExportResolution(savedResolution === "1080p" ? "1080p" : "720p");
            setExportFps(30);

            const savedQuality = editor.exportSettings?.quality;
            setExportQuality(
              savedQuality === "high" || savedQuality === "max"
                ? savedQuality
                : "standard"
            );
            projectLoadedRef.current = true;
            setAutoSaveStatus("Saved");
          } else {
            projectDataRef.current = null;
            projectLoadedRef.current = false;
            setProject(null);
          }
        });
      }
    });

    return () => {
      unsubscribeAuth();

      if (unsubscribeProject) {
        unsubscribeProject();
      }
    };
  }, [projectId]);

  useEffect(() => {
    let active = true;

    async function restoreLocalMedia() {
      try {
        const savedVideo = await getMediaFromBrowser(videoStorageKey);

        if (savedVideo && active) {
          const url = URL.createObjectURL(savedVideo);

          setLocalVideoURL(url);
          setLocalVideoName(savedVideo.name || "Restored local video");
          setLocalVideoSize(
            `${(savedVideo.size / (1024 * 1024)).toFixed(2)} MB`
          );
          setLocalVideoBytes(savedVideo.size);
          setVideoRestored(true);
        }

        const savedAudio = await getMediaFromBrowser(audioStorageKey);

        if (savedAudio && active) {
          const url = URL.createObjectURL(savedAudio);

          setLocalAudioURL(url);
          setLocalAudioName(savedAudio.name || "Restored local audio");
          setAudioRestored(true);
        }
      } catch {
        setVideoRestored(false);
        setAudioRestored(false);
      }
    }

    restoreLocalMedia();

    return () => {
      active = false;
    };
  }, [videoStorageKey, audioStorageKey]);

  useEffect(() => {
    return () => {
      if (localVideoURL) {
        URL.revokeObjectURL(localVideoURL);
      }
    };
  }, [localVideoURL]);

  useEffect(() => {
    return () => {
      if (localAudioURL) {
        URL.revokeObjectURL(localAudioURL);
      }
    };
  }, [localAudioURL]);

  useEffect(() => {
    return () => {
      if (downloadUrl.startsWith("blob:")) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  useEffect(() => {
    return () => {
      clearExportProgressTimer();
      exportRunIdRef.current += 1;
      videoUploadRunIdRef.current += 1;
      videoUploadRequestRef.current?.abort();
      videoUploadRequestRef.current = null;
      videoUploadCopyAbortRef.current?.abort();
      videoUploadCopyAbortRef.current = null;
      videoUploadCancelledRef.current = true;
      videoUploadInProgressRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;

    videoRef.current.playbackRate = playbackSpeed;
    videoRef.current.volume = Math.min(Math.max(videoVolume / 100, 0), 1);
    videoRef.current.muted = mutedOriginal;
  }, [playbackSpeed, videoVolume, mutedOriginal, localVideoURL]);

  useEffect(() => {
    if (!audioRef.current) return;

    audioRef.current.volume = Math.min(Math.max(musicVolume / 100, 0), 1);
  }, [musicVolume, localAudioURL]);

  useEffect(() => {
    if (activeTool !== "export" || !localVideoURL || engineReady || enginePreparing) {
      return;
    }

    let active = true;

    setEnginePreparing(true);

    preloadFFmpeg((progress) => {
      if (!active) return;
      setEngineProgress(Math.min(100, Math.max(0, Math.round(progress))));
    })
      .then(() => {
        if (!active) return;
        setEngineReady(true);
        setEngineProgress(100);
        setExportPhase("");
      })
      .catch((error) => {
        console.error("FFmpeg preload failed", error);

        if (!active) return;
        resetFFmpeg();
        setEngineReady(false);
        setEngineProgress(0);
      })
      .finally(() => {
        if (!active) return;
        setEnginePreparing(false);
      });

    return () => {
      active = false;
    };
  }, [activeTool, localVideoURL, engineReady, enginePreparing]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/");
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleVideoSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";

    if (!file) return;

    if (!file.type.startsWith("video/")) {
      alert("Please select a video file");
      return;
    }

    const oldMediaFileIds = collectPermanentMediaFileIds(
      videoStorageMetadata,
      project?.editor?.media?.storage,
    );
    const url = URL.createObjectURL(file);

    setLocalVideoURL(url);
    setLocalVideoName(file.name);
    setLocalVideoSize(`${(file.size / (1024 * 1024)).toFixed(2)} MB`);
    setLocalVideoBytes(file.size);
    setVideoRestored(false);
    resetVideoUploadState();
    replacedMediaCleanupIdsRef.current = oldMediaFileIds;
    setVideoUploadStatus("Saving media...");
    setVideoUploadProgress(0);
    resetExportState();

    try {
      await saveMediaToBrowser(videoStorageKey, file);
    } catch {
      alert("Video preview works, but browser could not save it locally.");
    }

    void handleUploadVideo(file);
  };

  const handleAudioSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("audio/")) {
      alert("Please select an audio/music file");
      return;
    }

    const url = URL.createObjectURL(file);

    setLocalAudioURL(url);
    setLocalAudioName(file.name);
    setAudioRestored(false);
    resetExportState();

    try {
      await saveMediaToBrowser(audioStorageKey, file);
    } catch {
      alert("Sound preview works, but browser could not save it locally.");
    }
  };

  const handleClearLocalMedia = async () => {
    const confirmed = confirm(
      "Clear locally saved video and music for this project?"
    );

    if (!confirmed) return;

    try {
      await deleteMediaFromBrowser(videoStorageKey);
      await deleteMediaFromBrowser(audioStorageKey);

      setLocalVideoURL("");
      setLocalVideoName("");
      setLocalVideoSize("");
      setLocalVideoBytes(0);
      setVideoDuration(0);
      setVideoRestored(false);
      resetVideoUploadState();

      setLocalAudioURL("");
      setLocalAudioName("");
      setAudioRestored(false);
      resetExportState();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleLoadedMetadata = () => {
    const duration = videoRef.current?.duration || 0;
    const roundedDuration = Math.floor(duration);

    setVideoDuration(roundedDuration);

    if (!trimEnd || trimEnd === 0) {
      setTrimEnd(roundedDuration);
    }
  };

  const handleVideoTimeUpdate = () => {
    if (!videoRef.current) return;

    if (trimEnd > 0 && videoRef.current.currentTime >= Number(trimEnd)) {
      videoRef.current.pause();
    }
  };

  const handlePlayTrimPreview = () => {
    if (!videoRef.current) return;

    videoRef.current.currentTime = Number(trimStart) || 0;
    videoRef.current.play();
  };

  const applyEffectPreset = (
    preset:
      | "clean"
      | "cinematic"
      | "warm"
      | "mono"
      | "soft"
      | "punchy"
  ) => {
    if (preset === "clean") {
      setBrightness(100);
      setContrast(100);
      setSaturation(100);
      setGrayscale(0);
      setBlur(0);
    }

    if (preset === "cinematic") {
      setBrightness(92);
      setContrast(128);
      setSaturation(90);
      setGrayscale(0);
      setBlur(0);
    }

    if (preset === "warm") {
      setBrightness(105);
      setContrast(112);
      setSaturation(130);
      setGrayscale(0);
      setBlur(0);
    }

    if (preset === "mono") {
      setBrightness(100);
      setContrast(125);
      setSaturation(100);
      setGrayscale(100);
      setBlur(0);
    }

    if (preset === "soft") {
      setBrightness(110);
      setContrast(90);
      setSaturation(105);
      setGrayscale(0);
      setBlur(1);
    }

    if (preset === "punchy") {
      setBrightness(102);
      setContrast(145);
      setSaturation(145);
      setGrayscale(0);
      setBlur(0);
    }
  };

  const getCurrentVideoFile = async () => {
    const file = await getMediaFromBrowser(videoStorageKey);

    if (!file) {
      throw new Error("Add or restore a local video before exporting.");
    }

    return file;
  };

  const resetVideoUploadState = () => {
    videoUploadRunIdRef.current += 1;
    videoUploadRequestRef.current?.abort();
    videoUploadRequestRef.current = null;
    videoUploadCopyAbortRef.current?.abort();
    videoUploadCopyAbortRef.current = null;
    videoUploadCancelledRef.current = false;
    videoUploadInProgressRef.current = false;
    setVideoUploading(false);
    setVideoUploadProgress(0);
    setVideoUploadStatus("");
    setVideoStorageMetadata(null);
    setPendingCloudinaryUpload(null);
  };

  const handleCancelVideoUpload = () => {
    videoUploadRunIdRef.current += 1;
    videoUploadCancelledRef.current = true;
    videoUploadRequestRef.current?.abort();
    videoUploadRequestRef.current = null;
    videoUploadCopyAbortRef.current?.abort();
    videoUploadCopyAbortRef.current = null;
    videoUploadInProgressRef.current = false;
    setVideoUploading(false);
    setVideoUploadProgress(0);
    setVideoUploadStatus("");
  };

  const handleUploadVideo = async (selectedFile?: File) => {
    if (videoUploadInProgressRef.current) {
      console.info("[Lumeo Upload] duplicate upload blocked");
      return;
    }

    videoUploadRunIdRef.current += 1;
    const runId = videoUploadRunIdRef.current;
    let temporaryUpload = selectedFile ? null : pendingCloudinaryUpload;

    try {
      videoUploadCancelledRef.current = false;
      videoUploadInProgressRef.current = true;
      setVideoUploading(true);
      setVideoUploadProgress(0);
      setVideoUploadStatus("Saving media...");

      const file = selectedFile || (await getCurrentVideoFile());
      const fingerprint = createVideoFingerprint(file, projectId);

      if (
        videoStorageMetadata &&
        videoStorageMetadata.fingerprint === fingerprint
      ) {
        console.info("[Lumeo Upload] duplicate upload blocked", {
          fingerprint,
        });
        setVideoUploadProgress(100);
        setVideoUploadStatus("Media already saved");
        return;
      }

      if (!temporaryUpload || temporaryUpload.fingerprint !== fingerprint) {
        temporaryUpload = await uploadVideoToTemporaryCloudinary(
          file,
          projectId,
          fingerprint,
          (progress) => {
            if (runId !== videoUploadRunIdRef.current) return;
            setVideoUploadProgress(progress);
          },
          (request) => {
            if (
              videoUploadCancelledRef.current ||
              runId !== videoUploadRunIdRef.current
            ) {
              return false;
            }

            videoUploadRequestRef.current = request;
            return true;
          }
        );

        setPendingCloudinaryUpload(temporaryUpload);
      } else {
        console.info("[Lumeo Upload] retrying permanent copy from temporary media", {
          publicId: temporaryUpload.publicId,
        });
        setVideoUploadProgress((progress) => Math.max(progress, 90));
      }

      if (
        videoUploadCancelledRef.current ||
        runId !== videoUploadRunIdRef.current
      ) {
        throw new Error("Upload cancelled");
      }

      const copyAbortController = new AbortController();
      videoUploadCopyAbortRef.current = copyAbortController;
      setVideoUploadProgress((progress) => Math.max(progress, 95));

      const uploaded = await copyCloudinaryVideoToPermanentStorage(
        temporaryUpload,
        projectId,
        copyAbortController.signal,
      );

      const storage = {
        provider: "google_drive",
        fileId: uploaded.fileId,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
        fingerprint,
        uploadedAt: new Date().toISOString(),
      };

      if (runId !== videoUploadRunIdRef.current) return;

      await updateDoc(doc(db, "projects", projectId), {
        "editor.media.storage": storage,
        updatedAt: serverTimestamp(),
      });

      const cleanupFileIds = replacedMediaCleanupIdsRef.current.filter(
        (fileId) => fileId !== uploaded.fileId,
      );
      replacedMediaCleanupIdsRef.current = [];

      await deletePermanentMediaFiles(cleanupFileIds);

      setVideoStorageMetadata(storage);
      setPendingCloudinaryUpload(null);
      setVideoUploadProgress(100);
      setVideoUploadStatus("Media saved");
      console.info("[Lumeo Upload] final UI state", { status: "Media saved" });
    } catch (error) {
      console.error("Video upload failed", error);

      if (runId !== videoUploadRunIdRef.current) {
        return;
      }

      if (videoUploadCancelledRef.current) {
        console.info("[Lumeo Upload] upload canceled");
        setVideoUploadProgress(0);
        setVideoUploadStatus("");
        return;
      }

      setVideoUploadProgress(0);
      setVideoUploadStatus("Upload failed. Please try again.");
      console.info("[Lumeo Upload] final UI state", {
        status: "Upload failed. Please try again.",
      });
    } finally {
      if (runId === videoUploadRunIdRef.current) {
        videoUploadRequestRef.current = null;
        videoUploadCopyAbortRef.current = null;
        videoUploadCancelledRef.current = false;
        videoUploadInProgressRef.current = false;
        setVideoUploading(false);
      }
    }
  };

  const handleRemoveVideo = async () => {
    const oldMediaFileIds = collectPermanentMediaFileIds(
      videoStorageMetadata,
      project?.editor?.media?.storage,
    );

    resetVideoUploadState();
    resetExportState();

    try {
      await deleteMediaFromBrowser(videoStorageKey);
    } catch (error) {
      console.error("Video remove failed", error);
    }

    await deletePermanentMediaFiles(oldMediaFileIds);
    replacedMediaCleanupIdsRef.current = [];

    setLocalVideoURL("");
    setLocalVideoName("");
    setLocalVideoSize("");
    setLocalVideoBytes(0);
    setVideoDuration(0);
    setVideoRestored(false);

    try {
      await updateDoc(doc(db, "projects", projectId), {
        "editor.media.localVideoName": "",
        "editor.media.videoDuration": 0,
        "editor.media.storage": null,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Video remove metadata update failed", error);
    }
  };

  const clearDownload = () => {
    if (downloadUrl.startsWith("blob:")) {
      URL.revokeObjectURL(downloadUrl);
    }

    setDownloadUrl("");
    setDownloadName("");
  };

  const clearExportProgressTimer = () => {
    if (!exportProgressTimerRef.current) {
      return;
    }

    clearInterval(exportProgressTimerRef.current);
    exportProgressTimerRef.current = null;
  };

  const updateExportProgress = (
    runId: number,
    source: string,
    value: number,
    phase: string,
  ) => {
    if (runId !== exportRunIdRef.current) {
      console.log("[Lumeo Export] progress update", {
        source,
        value,
        phase,
        runId,
        ignored: true,
      });
      return false;
    }

    const nextValue = Math.min(100, Math.max(0, Math.round(value)));

    console.log("[Lumeo Export] progress update", {
      source,
      value: nextValue,
      phase,
      runId,
    });

    exportProgressRef.current = nextValue;
    setExportProgress(nextValue);
    return true;
  };

  const startPreparationProgress = (runId: number, phase: string) => {
    clearExportProgressTimer();
    updateExportProgress(runId, "preparation-start", 1, phase);

    let simulatedProgress = 1;

    exportProgressTimerRef.current = setInterval(() => {
      if (runId !== exportRunIdRef.current) {
        clearExportProgressTimer();
        return;
      }

      simulatedProgress = Math.min(
        90,
        simulatedProgress + (simulatedProgress < 20 ? 2 : 1),
      );

      updateExportProgress(runId, "preparation-timer", simulatedProgress, phase);

      if (simulatedProgress >= 90) {
        clearExportProgressTimer();
      }
    }, 900);
  };

  const startExportRun = (phase: string) => {
    clearExportProgressTimer();
    exportRunIdRef.current += 1;

    const runId = exportRunIdRef.current;

    clearDownload();
    setExporting(true);
    exportProgressRef.current = 0;
    setExportProgress(0);
    setExportStatus(phase);
    setExportPhase(phase);
    setExportError("");
    setUserExportRequested(true);
    startPreparationProgress(runId, phase);

    return runId;
  };

  const resetExportState = () => {
    clearExportProgressTimer();
    exportRunIdRef.current += 1;
    clearDownload();
    setExporting(false);
    exportProgressRef.current = 0;
    setExportProgress(0);
    setExportStatus("");
    setExportError("");
    setExportPhase("idle");
    setUserExportRequested(false);
    setLastExportAction(null);
  };

  const resetExportResult = () => {
    resetExportState();
  };

  const createExportFileName = (kind: "video" | "audio", format: VideoFormat | AudioFormat) => {
    const baseName = (title || localVideoName || "lumeo-export")
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();

    return `${baseName || "lumeo-export"}-${kind}.${format}`;
  };

  const prepareExportEngine = async (
    runId: number,
    phase: "Preparing export" | "Preparing audio",
  ) => {
    if (engineReady) {
      setEngineProgress(100);
      return;
    }

    setEnginePreparing(true);
    setExportPhase(phase);
    setExportError("");

    try {
      console.info("[Lumeo export] FFmpeg/load started");
      await preloadFFmpeg((progress) => {
        setEngineProgress(Math.min(100, Math.max(0, Math.round(progress))));
      });

      setEngineReady(true);
      setEngineProgress(100);
      console.info("[Lumeo export] FFmpeg/load completed");
    } catch (error) {
      console.error("FFmpeg preparation failed", error);
      setEngineReady(false);
      resetFFmpeg();
      setExportError("Export failed. Please try again.");
      throw error;
    } finally {
      setEnginePreparing(false);
    }
  };

  const createFFmpegOptions = (
    runId: number,
    label: "Optimizing video" | "Extracting audio",
  ) => ({
    onProgress: ({ progress }: { progress: number }) => {
      const nextProgress = Math.min(
        98,
        Math.max(exportProgressRef.current, Math.round(progress * 100)),
      );

      if (!updateExportProgress(runId, "runtime-progress", nextProgress, label)) {
        return;
      }

      setExportStatus(label);
      setExportPhase(label);
    },
  });

  const handleExportVideo = async () => {
    if (exporting) return;

    const exportEnd = Number(trimEnd || videoDuration || 0);
    const exportStart = Number(trimStart) || 0;
    let runId = exportRunIdRef.current;

    if (exportEnd > 0 && exportStart >= exportEnd) {
      alert("Trim start should be less than trim end");
      return;
    }

    try {
      resetExportState();
      setLastExportAction("video");
      runId = startExportRun("Preparing export...");

      if (!hasSavedSourceMedia) {
        throw new Error("Saved media is required before export.");
      }

      console.info("[Lumeo Export] cloud export requested", {
        projectId,
        trimStart: exportStart,
        trimEnd: exportEnd,
        canvasFormat,
        frameMode: fitMode,
        resolution: productionExportResolution,
        fps: productionExportFps,
        reframe: currentReframe,
      });

      const response = await fetch("/api/export/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          settings: {
            trimStart: exportStart,
            trimEnd: exportEnd || undefined,
            canvasFormat,
            fitMode,
            frameMode: fitMode,
            resolution: productionExportResolution,
            fps: productionExportFps,
            reframe: currentReframe,
            background: {
              blurStyle: backgroundBlurStyle,
              dimStyle: backgroundDimStyle,
            },
            titleOverlay: titleOverlayForExport,
          },
        }),
      });

      const payload = (await response.json()) as CloudExportResponse;

      if (!response.ok || !payload.success || !payload.downloadUrl) {
        if (!payload.success) {
          console.error("[Lumeo Export] cloud export server diagnostics", {
            failedStage: payload.failedStage,
            details: payload.details,
          });
        }

        throw new Error(
          !payload.success && payload.error ? payload.error : "Export failed",
        );
      }

      if (runId !== exportRunIdRef.current) return;

      clearExportProgressTimer();
      setDownloadUrl(payload.downloadUrl);
      setDownloadName(payload.fileName);
      updateExportProgress(runId, "complete", 100, "Export complete");
      setExportStatus("Export complete");
      setExportPhase("Export complete");
    } catch (error) {
      console.error("[Lumeo Export] cloud export failed", error);

      if (runId !== exportRunIdRef.current) {
        return;
      }

      clearExportProgressTimer();
      updateExportProgress(runId, "failed", 0, "failed");
      setExportError("Export failed. Please try again.");
      setExportStatus("");
      setExportPhase("failed");
    } finally {
      if (runId === exportRunIdRef.current) {
        setExporting(false);
      }
    }
  };

  const handleExperimentalExportVideo = async () => {
    if (exporting) return;

    const exportEnd = Number(trimEnd || videoDuration || 0);
    const exportStart = Number(trimStart) || 0;

    if (exportEnd > 0 && exportStart >= exportEnd) {
      alert("Trim start should be less than trim end");
      return;
    }

    let nextDownloadUrl = "";
    let failurePoint = "starting video export";
    let runId = exportRunIdRef.current;

    try {
      resetExportState();
      setLastExportAction("video");
      runId = startExportRun("Preparing export");

      failurePoint = "reading local video";
      const file = await getCurrentVideoFile();

      console.info("[Lumeo export] selected video file name", file.name);
      console.info("[Lumeo export] selected video file size", file.size);
      console.info("[Lumeo export] selected export format", exportFormat);
      console.info("[Lumeo export] selected audio format", audioFormat);
      console.info("[Lumeo export] trimStart", trimStart);
      console.info("[Lumeo export] trimEnd", trimEnd);
      console.info("[Lumeo export] videoDuration", videoDuration);

      const ffmpeg = createFFmpegOptions(runId, "Optimizing video");

      failurePoint = "preparing export runtime";
      await prepareExportEngine(runId, "Preparing export");
      if (runId !== exportRunIdRef.current) return;

      failurePoint = "connecting export runtime";
      await getFFmpeg(ffmpeg);
      if (runId !== exportRunIdRef.current) return;

      clearExportProgressTimer();
      setExportStatus("Optimizing video");
      setExportPhase("Optimizing video");

      const exportOptions = {
        format: exportFormat,
        canvasFormat,
        resolution: exportResolution,
        quality: exportQuality,
        fps: exportFps,
        trim: {
          startSeconds: exportStart,
          endSeconds: exportEnd || undefined,
        },
        fileName: createExportFileName("video", exportFormat),
        ffmpeg,
      };

      failurePoint = "running video export";
      const result = await exportTrimmedVideoWithFFmpeg(file, exportOptions);
      if (runId !== exportRunIdRef.current) return;

      failurePoint = "finalizing download";
      clearExportProgressTimer();
      setExportStatus("Finalizing download");
      setExportPhase("Finalizing download");
      updateExportProgress(runId, "finalizing", 99, "Finalizing download");

      nextDownloadUrl = URL.createObjectURL(result.blob);
      setDownloadUrl(nextDownloadUrl);
      setDownloadName(result.fileName);
      updateExportProgress(runId, "complete", 100, "Export complete");
      setExportStatus("Export complete");
      setExportPhase("Export complete");
    } catch (error: any) {
      console.error("Video export failed", { failurePoint, error });

      if (runId !== exportRunIdRef.current) {
        return;
      }

      if (nextDownloadUrl) {
        URL.revokeObjectURL(nextDownloadUrl);
      }

      resetFFmpeg();
      setEngineReady(false);
      setEngineProgress(0);
      clearExportProgressTimer();
      updateExportProgress(runId, "failed", 0, "failed");
      setExportError("Export failed. Please try again.");
      setExportStatus("");
      setExportPhase("failed");
    } finally {
      if (runId === exportRunIdRef.current) {
        setExporting(false);
      }
    }
  };

  const handleExtractAudio = async () => {
    if (exporting) return;

    let nextDownloadUrl = "";
    let failurePoint = "starting audio extraction";
    let runId = exportRunIdRef.current;

    try {
      resetExportState();
      setLastExportAction("audio");
      runId = startExportRun("Preparing audio");

      failurePoint = "reading local video";
      const file = await getCurrentVideoFile();

      console.info("[Lumeo export] selected video file name", file.name);
      console.info("[Lumeo export] selected video file size", file.size);
      console.info("[Lumeo export] selected export format", exportFormat);
      console.info("[Lumeo export] selected audio format", audioFormat);
      console.info("[Lumeo export] trimStart", trimStart);
      console.info("[Lumeo export] trimEnd", trimEnd);
      console.info("[Lumeo export] videoDuration", videoDuration);

      const ffmpeg = createFFmpegOptions(runId, "Extracting audio");

      failurePoint = "preparing export runtime";
      await prepareExportEngine(runId, "Preparing audio");
      if (runId !== exportRunIdRef.current) return;

      failurePoint = "connecting export runtime";
      await getFFmpeg(ffmpeg);
      if (runId !== exportRunIdRef.current) return;

      clearExportProgressTimer();
      setExportStatus("Extracting audio");
      setExportPhase("Extracting audio");

      failurePoint = "running audio extraction";
      const result = await extractAudioWithFFmpeg(file, {
        format: audioFormat,
        fileName: createExportFileName("audio", audioFormat),
        ffmpeg,
      });
      if (runId !== exportRunIdRef.current) return;

      failurePoint = "finalizing download";
      clearExportProgressTimer();
      setExportStatus("Finalizing download");
      setExportPhase("Finalizing download");
      updateExportProgress(runId, "finalizing", 99, "Finalizing download");

      nextDownloadUrl = URL.createObjectURL(result.blob);
      setDownloadUrl(nextDownloadUrl);
      setDownloadName(result.fileName);
      updateExportProgress(runId, "complete", 100, "Export complete");
      setExportStatus("Export complete");
      setExportPhase("Export complete");
    } catch (error: any) {
      console.error("Audio extraction failed", { failurePoint, error });

      if (runId !== exportRunIdRef.current) {
        return;
      }

      if (nextDownloadUrl) {
        URL.revokeObjectURL(nextDownloadUrl);
      }

      resetFFmpeg();
      setEngineReady(false);
      setEngineProgress(0);
      clearExportProgressTimer();
      updateExportProgress(runId, "failed", 0, "failed");
      setExportError("Export failed. Please try again.");
      setExportStatus("");
      setExportPhase("failed");
    } finally {
      if (runId === exportRunIdRef.current) {
        setExporting(false);
      }
    }
  };

  const handleRetryExport = () => {
    if (lastExportAction === "video") {
      void handleExportVideo();
      return;
    }

    if (lastExportAction === "audio") {
      void handleExtractAudio();
    }
  };

  const buildEditorUpdatePayload = () => {
    const currentProject = projectDataRef.current;
    const currentEditor = currentProject?.editor || {};
    const exportQualityPreset = `${productionExportResolution}${productionExportFps}`;

    return {
      "editor.mode": "studio-foundation-v2",
      "editor.media": {
        localVideoName:
          localVideoName ||
          currentEditor.media?.localVideoName ||
          currentEditor.localVideoName ||
          "",
        localAudioName:
          localAudioName ||
          currentEditor.media?.localAudioName ||
          currentEditor.localAudioName ||
          "",
        videoDuration: Number(videoDuration) || 0,
        storage:
          videoStorageMetadata ||
          currentEditor.media?.storage ||
          null,
      },
      "editor.trim": {
        start: Number(trimStart) || 0,
        end: Number(trimEnd) || 0,
      },
      "editor.canvas": {
        format: canvasFormat,
        fitMode,
        frameMode: fitMode,
        backgroundStyle,
        backgroundBlurStyle,
        backgroundDimStyle,
        reframe: {
          scale: currentReframe.scale,
          x: currentReframe.x,
          y: currentReframe.y,
          safeZones,
        },
        videoZoom: Math.round(currentReframe.scale * 100),
        videoX: currentReframe.x,
        videoY: currentReframe.y,
        rotate: Number(rotate) || 0,
        flipX,
      },
      "editor.playback": {
        speed: Number(playbackSpeed) || 1,
        videoVolume: Number(videoVolume) || 100,
        mutedOriginal,
      },
      "editor.audio": {
        musicVolume: Number(musicVolume) || 80,
      },
      "editor.textOverlay": {
        text: visibleOverlayText,
        x: Number(overlayX) || 50,
        y: Number(overlayY) || 78,
        size: Number(overlaySize) || 34,
        color: overlayColor || "#ffffff",
        opacity: Number(overlayOpacity) || 100,
        background: overlayBg,
        uppercase: overlayUppercase,
        shadow: overlayShadow,
      },
      "editor.titles": {
        enabled: titleOverlayForExport.enabled,
        text: titleOverlayForExport.text,
        preset: titleOverlayForExport.preset,
        position: titleOverlayForExport.position,
        size: titleOverlayForExport.scale,
        background: titleOverlayForExport.background,
        shadow: titleOverlayForExport.shadow,
      },
      "editor.titleOverlay": {
        enabled: titleOverlayForExport.enabled,
        text: titleOverlayForExport.text,
        style: titleOverlayForExport.style,
        preset: titleOverlayForExport.preset,
        position: titleOverlayForExport.position,
        x: titleOverlayForExport.x,
        y: titleOverlayForExport.y,
        align: titleOverlayForExport.align,
        size: titleOverlayForExport.size,
        scale: titleOverlayForExport.scale,
        background: titleOverlayForExport.background,
        shadow: titleOverlayForExport.shadow,
      },
      "editor.effects": {
        brightness: Number(brightness) || 100,
        contrast: Number(contrast) || 100,
        saturation: Number(saturation) || 100,
        grayscale: Number(grayscale) || 0,
        blur: Number(blur) || 0,
      },
      "editor.transitions": {
        in: transitionIn,
        out: transitionOut,
        duration: Number(transitionDuration) || 1,
      },
      "editor.exportSettings": {
        videoFormat: "mp4",
        audioFormat,
        resolution: productionExportResolution,
        fps: productionExportFps,
        quality: exportQualityPreset,
        maxResolution: "1080p",
        outputWidth: output.width,
        outputHeight: output.height,
      },
      updatedAt: serverTimestamp(),
    };
  };

  const saveEditorSettings = async (silent = false) => {
    if (!projectId) return;

    if (Number(trimEnd) > 0 && Number(trimStart) >= Number(trimEnd)) {
      if (!silent) {
        alert("Trim start should be less than trim end");
      }
      return;
    }

    try {
      setSaving(true);
      setAutoSaveStatus("Saving...");

      await updateDoc(doc(db, "projects", projectId), buildEditorUpdatePayload());

      setAutoSaveStatus("Saved");
    } catch (error: any) {
      console.error("Editor settings save failed", error);
      if (!silent) {
        alert(error.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    await saveEditorSettings(false);
  };

  useEffect(() => {
    if (!user || !projectId || !projectLoadedRef.current) return;

    if (!initialAutoSaveSkippedRef.current) {
      initialAutoSaveSkippedRef.current = true;
      return;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    setAutoSaveStatus("Saving...");

    autoSaveTimerRef.current = setTimeout(() => {
      void saveEditorSettings(true);
    }, 900);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [
    projectId,
    user,
    trimStart,
    trimEnd,
    canvasFormat,
    fitMode,
    backgroundStyle,
    backgroundBlurStyle,
    backgroundDimStyle,
    reframeScale,
    reframeX,
    reframeY,
    safeZones,
    rotate,
    flipX,
    playbackSpeed,
    videoVolume,
    mutedOriginal,
    titleStyle,
    titlePosition,
    titleScale,
    titleBackground,
    titleShadow,
    titleEnabled,
    overlayText,
    overlayX,
    overlayY,
    overlaySize,
    overlayColor,
    overlayOpacity,
    overlayBg,
    overlayUppercase,
    overlayShadow,
    musicVolume,
    brightness,
    contrast,
    saturation,
    grayscale,
    blur,
    transitionIn,
    transitionOut,
    transitionDuration,
    audioFormat,
    productionExportResolution,
    productionExportFps,
    output.width,
    output.height,
    videoDuration,
    localVideoName,
    localAudioName,
  ]);

  const handleDelete = async () => {
    const confirmed = confirm("Are you sure you want to delete this project?");

    if (!confirmed) return;

    try {
      setProjectDeleting(true);
      if (!user) {
        throw new Error("Delete failed. Please try again.");
      }

      const idToken = await user?.getIdToken();
      const response = await fetch("/api/projects/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ projectId }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Delete failed. Please try again.");
      }

      await deleteMediaFromBrowser(videoStorageKey);
      await deleteMediaFromBrowser(audioStorageKey);
      router.push("/dashboard");
    } catch (error) {
      console.error("Project delete failed", error);
      alert("Delete failed. Please try again.");
      setProjectDeleting(false);
    }
  };

  const handleResetEdit = () => {
    const confirmed = confirm("Reset edit settings? Saved media will stay in place.");

    if (!confirmed) return;

    setTrimStart(0);
    setTrimEnd(videoDuration || 0);
    setCanvasFormat("9:16");
    setFitMode("cover");
    setBackgroundStyle("black");
    setBackgroundBlurStyle("premium");
    setBackgroundDimStyle("balanced");
    setReframeScale(reframeDefaults.scale);
    setReframeX(reframeDefaults.x);
    setReframeY(reframeDefaults.y);
    setSafeZones(reframeDefaults.safeZones);
    setRotate(0);
    setFlipX(false);
    setPlaybackSpeed(1);
    setVideoVolume(100);
    setMutedOriginal(false);
    setTitleStyle("cleanLower");
    setTitlePosition("lower");
    setTitleScale(1);
    setTitleBackground(true);
    setTitleShadow(true);
    setTitleEnabled(false);
    setOverlayText("");
    setOverlayX(50);
    setOverlayY(78);
    setOverlaySize(34);
    setOverlayColor("#ffffff");
    setOverlayOpacity(100);
    setOverlayBg(false);
    setOverlayUppercase(false);
    setOverlayShadow(true);
    setMusicVolume(80);
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setGrayscale(0);
    setBlur(0);
    setTransitionIn("none");
    setTransitionOut("none");
    setTransitionDuration(1);
    setExportFormat("mp4");
    setAudioFormat("mp3");
    setExportResolution("720p");
    setExportFps(30);
    setExportQuality("standard");
    resetExportState();
    setActiveTool("cut");
  };

  const renderInspector = () => {
    if (activeTool === "media") {
      return (
        <Panel
          title="Media Library"
              subtitle="Add, replace, or remove your source media."
        >
          <div className="space-y-5">
            <input
              id="video-upload"
              type="file"
              accept="video/*"
              onChange={handleVideoSelect}
              className="sr-only"
            />

            {!localVideoName && (
              <label
                htmlFor="video-upload"
                className="group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[1.75rem] border border-dashed border-white/14 bg-gradient-to-br from-white/[0.075] via-white/[0.035] to-cyan-200/[0.045] px-5 py-8 text-center shadow-xl shadow-black/10 transition hover:border-cyan-200/28 hover:bg-white/[0.08] hover:shadow-cyan-300/10"
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,230,188,0.14),transparent_42%)] opacity-80" />

                <div
                  className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/12 bg-[#090812] text-[#f8eed0] shadow-xl shadow-fuchsia-500/10 transition group-hover:scale-105"
                  style={{ animation: "lumeoFloat 4.8s ease-in-out infinite" }}
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
                    <path
                      d="M12 15V5M8 9l4-4 4 4"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M5 15.5V17a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>

                <p className="relative mt-4 text-base font-black text-white">
                  Choose from device
                </p>

                <p className="relative mt-2 text-sm text-white/45">
                  Upload your source video
                </p>
              </label>
            )}

            {localVideoName && (
              <div className="rounded-[1.5rem] border border-emerald-300/15 bg-emerald-300/[0.06] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-white">
                      {localVideoName}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-white/48">
                      {localVideoSize} · {videoDuration || 0}s
                    </p>
                  </div>

                  <span className="shrink-0 rounded-full bg-emerald-300/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">
                    Ready
                  </span>
                </div>

                {videoRestored && (
                  <p className="mt-3 text-xs font-bold text-emerald-200">
                    Restored locally.
                  </p>
                )}

                <div className="mt-4 space-y-3">
                  {!videoUploading &&
                    videoUploadStatus === "Upload failed. Please try again." && (
                      <button
                        onClick={() => handleUploadVideo()}
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-black text-white/72 transition hover:bg-white hover:text-black"
                      >
                        Retry upload
                      </button>
                    )}

                  {!videoUploading && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label
                        htmlFor="video-upload"
                        className="flex cursor-pointer items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-black text-black transition hover:bg-fuchsia-100"
                      >
                        Replace video
                      </label>

                      <button
                        onClick={handleRemoveVideo}
                        className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-black text-white/72 transition hover:bg-white hover:text-black"
                      >
                        Remove video
                      </button>
                    </div>
                  )}

                  {videoUploadStatus && (
                    <div className="rounded-2xl border border-white/10 bg-black/24 p-3">
                      <div className="flex items-center justify-between gap-3 text-xs font-black text-white/70">
                        <span>{videoUploadStatus}</span>
                        {(videoUploading || videoUploadProgress > 0) && (
                          <span>{videoUploadProgress}%</span>
                        )}
                      </div>

                      {(videoUploading || videoUploadProgress > 0) && (
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-fuchsia-300 via-cyan-200 to-emerald-200 transition-all"
                            style={{ width: `${videoUploadProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {localVideoURL && (
              <button
                onClick={handleClearLocalMedia}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-black text-white/65 transition hover:bg-white hover:text-black"
              >
                Clear local media
              </button>
            )}
          </div>
        </Panel>
      );
    }

    if (activeTool === "frame") {
      return (
        <Panel
          title="Reframe Studio"
          subtitle="Compose your video for shorts, reels, posts, and widescreen exports."
        >
          <div className="space-y-5">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-black text-white/70">Canvas</p>

              <div className="mt-3 grid grid-cols-4 gap-2">
                {frameOptions.map((item) => (
                  <OptionButton
                    key={item.value}
                    active={canvasFormat === item.value}
                    onClick={() => setCanvasFormat(item.value)}
                    small
                  >
                    {item.label}
                  </OptionButton>
                ))}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-black text-white/70">Composition</p>

              <div className="mt-3 grid gap-2">
                <OptionButton
                  active={fitMode === "cover"}
                  onClick={() => setFitMode("cover")}
                >
                  Cinematic Fill
                </OptionButton>

                <OptionButton
                  active={fitMode === "contain"}
                  onClick={() => setFitMode("contain")}
                >
                  Original View
                </OptionButton>

                <OptionButton
                  active={fitMode === "blurredBackground"}
                  onClick={() => setFitMode("blurredBackground")}
                >
                  Blurred Background
                </OptionButton>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-black text-white/70">Subject Size</p>

              <div className="mt-3 grid grid-cols-4 gap-2">
                {subjectSizePresets.map((item) => (
                  <OptionButton
                    key={item.label}
                    active={Math.abs(currentReframe.scale - item.scale) < 0.015}
                    onClick={() => setReframeScale(item.scale)}
                    small
                  >
                    {item.label}
                  </OptionButton>
                ))}
              </div>

              <div className="mt-4">
                <RangeControl
                  label="Fine scale"
                  value={Number(currentReframe.scale.toFixed(2))}
                  min={0.85}
                  max={1.6}
                  step={0.01}
                  suffix="x"
                  onChange={(value) => setReframeScale(clampReframeScale(value))}
                />
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-black text-white/70">Focus Point</p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {focusPresets.map((item) => (
                  <OptionButton
                    key={item.label}
                    active={
                      currentReframe.x === item.x && currentReframe.y === item.y
                    }
                    onClick={() => {
                      setReframeX(item.x);
                      setReframeY(item.y);
                    }}
                    small
                  >
                    {item.label}
                  </OptionButton>
                ))}
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <RangeControl
                    label="Horizontal focus"
                    value={currentReframe.x}
                    min={-40}
                    max={40}
                    onChange={(value) => setReframeX(clampReframeOffset(value))}
                  />
                  <div className="mt-1 flex justify-between text-[10px] font-black uppercase tracking-[0.18em] text-white/32">
                    <span>Left</span>
                    <span>Center</span>
                    <span>Right</span>
                  </div>
                </div>

                <div>
                  <RangeControl
                    label="Vertical focus"
                    value={currentReframe.y}
                    min={-40}
                    max={40}
                    onChange={(value) => setReframeY(clampReframeOffset(value))}
                  />
                  <div className="mt-1 flex justify-between text-[10px] font-black uppercase tracking-[0.18em] text-white/32">
                    <span>Top</span>
                    <span>Middle</span>
                    <span>Bottom</span>
                  </div>
                </div>
              </div>
            </div>

            {fitMode === "blurredBackground" && (
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-black text-white/70">
                  Background look
                </p>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {backgroundBlurOptions.map((item) => (
                    <OptionButton
                      key={item.value}
                      active={backgroundBlurStyle === item.value}
                      onClick={() => setBackgroundBlurStyle(item.value)}
                      small
                    >
                      {item.label}
                    </OptionButton>
                  ))}
                </div>

                <p className="mt-4 text-sm font-black text-white/70">Dim</p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {backgroundDimOptions.map((item) => (
                    <OptionButton
                      key={item.value}
                      active={backgroundDimStyle === item.value}
                      onClick={() => setBackgroundDimStyle(item.value)}
                      small
                    >
                      {item.label}
                    </OptionButton>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
              <button
                onClick={() => setSafeZones(!safeZones)}
                className={`w-full rounded-2xl border px-4 py-3 text-sm font-black transition ${
                  safeZones
                    ? "border-white/20 bg-white text-black"
                    : "border-white/10 bg-white/[0.06] text-white/65 hover:bg-white hover:text-black"
                }`}
              >
                Show safe zones
              </button>

              <button
                onClick={() => {
                  setReframeScale(reframeDefaults.scale);
                  setReframeX(reframeDefaults.x);
                  setReframeY(reframeDefaults.y);
                  setSafeZones(reframeDefaults.safeZones);
                }}
                className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-black text-white/65 transition hover:bg-white hover:text-black"
              >
                Reset composition
              </button>
            </div>
          </div>
        </Panel>
      );
    }

    if (activeTool === "cut") {
      return (
        <Panel title="Cut" subtitle="Set clean start and end points.">
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <StatPill label="Duration" value={`${videoDuration || 0}s`} />
              <StatPill label="Output" value={`${selectedRange}s`} />
            </div>

            <button
              onClick={handlePlayTrimPreview}
              disabled={!localVideoURL}
              className="w-full rounded-2xl bg-white px-5 py-3 font-black text-black transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Preview selected range
            </button>

            <RangeControl
              label="Trim start"
              value={trimStart}
              min={0}
              max={Math.max(videoDuration, 1)}
              suffix="s"
              onChange={setTrimStart}
            />

            <RangeControl
              label="Trim end"
              value={trimEnd || videoDuration || 0}
              min={0}
              max={Math.max(videoDuration, 1)}
              suffix="s"
              onChange={setTrimEnd}
            />

            <button
              onClick={() => {
                setTrimStart(0);
                setTrimEnd(videoDuration || 0);
              }}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 font-black text-white/72 transition hover:bg-white hover:text-black"
            >
              Clear trim
            </button>

          </div>
        </Panel>
      );
    }

    if (activeTool === "edit") {
      return (
        <Panel title="Cut Controls" subtitle="Fine-tune trim, speed, rotation, and movement.">
          <div className="space-y-6">
            <button
              onClick={handlePlayTrimPreview}
              disabled={!localVideoURL}
              className="w-full rounded-2xl bg-white px-5 py-3 font-black text-black transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Preview selected range
            </button>

            <RangeControl
              label="Speed"
              value={playbackSpeed}
              min={0.25}
              max={2}
              step={0.25}
              suffix="x"
              onChange={setPlaybackSpeed}
            />

            <RangeControl
              label="Rotate"
              value={rotate}
              min={-15}
              max={15}
              suffix="°"
              onChange={setRotate}
            />

            <button
              onClick={() => setFlipX(!flipX)}
              className={`w-full rounded-2xl border px-5 py-3 font-black transition ${
                flipX
                  ? "border-white/20 bg-white text-black"
                  : "border-white/10 bg-white/[0.06] text-white/65 hover:bg-white hover:text-black"
              }`}
            >
              {flipX ? "Flip enabled" : "Flip horizontal"}
            </button>

            <div>
              <label className="text-sm font-bold text-white/58">
                Intro transition
              </label>

              <select
                value={transitionIn}
                onChange={(event) => setTransitionIn(event.target.value)}
                className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-white outline-none"
              >
                <option className="bg-black" value="none">
                  None
                </option>
                <option className="bg-black" value="fade-in">
                  Fade in
                </option>
              </select>
            </div>

            <div>
              <label className="text-sm font-bold text-white/58">
                Outro transition
              </label>

              <select
                value={transitionOut}
                onChange={(event) => setTransitionOut(event.target.value)}
                className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-white outline-none"
              >
                <option className="bg-black" value="none">
                  None
                </option>
                <option className="bg-black" value="fade-out">
                  Fade out
                </option>
              </select>
            </div>

            <RangeControl
              label="Transition duration"
              value={transitionDuration}
              min={0.5}
              max={3}
              step={0.5}
              suffix="s"
              onChange={setTransitionDuration}
            />
          </div>
        </Panel>
      );
    }

    if (activeTool === "text") {
      return (
        <Panel title="Titles Studio" subtitle="Add clean, creator-ready text to your video.">
          <div className="space-y-5">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4">
              <label className="text-sm font-bold text-white/58">
                Title text
              </label>

              <textarea
                value={overlayText}
                onChange={(event) =>
                  {
                    const nextText = event.target.value.slice(0, 80);
                    setOverlayText(nextText);
                    setTitleEnabled(nextText.trim().length > 0);
                  }
                }
                placeholder="Add a title for your clip"
                maxLength={80}
                className="mt-3 min-h-24 w-full rounded-[1.25rem] border border-white/10 bg-black/25 px-4 py-3 text-white outline-none placeholder:text-white/32 transition focus:border-fuchsia-200/60 focus:bg-black/35"
              />

              <p className="mt-2 text-right text-xs font-bold text-white/34">
                {visibleOverlayText.length}/80
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4">
              <label className="text-sm font-bold text-white/58">
                Style presets
              </label>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {titleStyles.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setTitleStyle(item.value)}
                    className={`rounded-2xl border p-3 text-left transition ${
                      titleStyle === item.value
                        ? "border-fuchsia-200/50 bg-white/[0.12] shadow-lg shadow-fuchsia-500/10"
                        : "border-white/10 bg-white/[0.045] hover:border-white/18 hover:bg-white/[0.08]"
                    }`}
                  >
                    <span className="block text-xs font-black text-white/58">
                      {item.label}
                    </span>
                    <span className="mt-1 block text-[11px] leading-4 text-white/34">
                      {item.description}
                    </span>
                    <span
                      className={`mt-2 block truncate rounded-xl px-3 py-2 text-sm font-black ${
                        item.value === "creatorBold"
                          ? "bg-black/35 text-[#FFF6D8]"
                          : item.value === "minimalTag"
                            ? "bg-black/55 text-[#F3E7C8] uppercase tracking-[0.18em]"
                            : item.value === "cinematic"
                              ? "bg-gradient-to-r from-[#2c2415] to-black/30 font-serif text-[#F5E6BC] tracking-[0.12em]"
                              : item.value === "softCaption"
                                ? "bg-black/70 text-white"
                                : "bg-black/55 text-[#F3E7C8]"
                      }`}
                    >
                      Aa
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4">
              <label className="text-sm font-bold text-white/58">
                Position
              </label>

              <div className="mt-3 grid grid-cols-4 gap-2">
                {titlePositions.map((item) => (
                  <OptionButton
                    key={item.value}
                    active={titlePosition === item.value}
                    onClick={() => setTitlePosition(item.value)}
                    small
                  >
                    {item.label}
                  </OptionButton>
                ))}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4">
              <RangeControl
                label="Text size"
                value={Number(titleScale.toFixed(2))}
                min={0.8}
                max={1.6}
                step={0.05}
                suffix="x"
                onChange={(value) => setTitleScale(normalizeTitleScale(value))}
              />
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4">
              <p className="text-sm font-bold text-white/58">Finishing</p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  onClick={() => setTitleBackground(!titleBackground)}
                  className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${
                    titleBackground
                      ? "border-white/20 bg-white text-black"
                      : "border-white/10 bg-white/[0.06] text-white/65 hover:bg-white hover:text-black"
                  }`}
                >
                  Background plate
                </button>

                <button
                  onClick={() => setTitleShadow(!titleShadow)}
                  className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${
                    titleShadow
                      ? "border-white/20 bg-white text-black"
                      : "border-white/10 bg-white/[0.06] text-white/65 hover:bg-white hover:text-black"
                  }`}
                >
                  Soft shadow
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                setTitleEnabled(false);
                setOverlayText("");
                setTitleStyle("cleanLower");
                setTitlePosition("lower");
                setTitleScale(1);
                setTitleBackground(true);
                setTitleShadow(true);
              }}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-black text-white/72 transition hover:bg-white hover:text-black"
            >
              Reset title
            </button>
          </div>
        </Panel>
      );
    }

    if (activeTool === "audio") {
      return (
        <Panel title="Sound" subtitle="Balance original sound and music.">
          <div className="space-y-4">
            <RangeControl
              label="Original volume"
              value={videoVolume}
              min={0}
              max={100}
              suffix="%"
              onChange={setVideoVolume}
            />

            <button
              onClick={() => setMutedOriginal(!mutedOriginal)}
              className={`w-full rounded-2xl border px-5 py-3 font-black transition ${
                mutedOriginal
                  ? "border-white/20 bg-white text-black"
                  : "border-white/10 bg-white/[0.06] text-white/65 hover:bg-white hover:text-black"
              }`}
            >
              {mutedOriginal ? "Original muted" : "Mute original audio"}
            </button>

            {localAudioURL ? (
              <>
                <RangeControl
                  label="Music volume"
                  value={musicVolume}
                  min={0}
                  max={100}
                  suffix="%"
                  onChange={setMusicVolume}
                />

                <audio
                  ref={audioRef}
                  src={localAudioURL}
                  controls
                  className="w-full"
                />
              </>
            ) : null}
          </div>
        </Panel>
      );
    }

    if (activeTool === "effects") {
      return (
        <Panel title="Visual Effects" subtitle="Apply presets or tune the look manually.">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-2">
              {[
                ["clean", "Clean"],
                ["cinematic", "Cinematic"],
                ["warm", "Warm"],
                ["mono", "Mono"],
                ["soft", "Soft"],
                ["punchy", "Punchy"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => applyEffectPreset(key as any)}
                  className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3 text-sm font-black text-white/68 transition hover:bg-white hover:text-black"
                >
                  {label}
                </button>
              ))}
            </div>

            <RangeControl
              label="Brightness"
              value={brightness}
              min={50}
              max={150}
              suffix="%"
              onChange={setBrightness}
            />

            <RangeControl
              label="Contrast"
              value={contrast}
              min={50}
              max={180}
              suffix="%"
              onChange={setContrast}
            />

            <RangeControl
              label="Saturation"
              value={saturation}
              min={0}
              max={200}
              suffix="%"
              onChange={setSaturation}
            />

            <RangeControl
              label="Grayscale"
              value={grayscale}
              min={0}
              max={100}
              suffix="%"
              onChange={setGrayscale}
            />

            <RangeControl
              label="Blur"
              value={blur}
              min={0}
              max={8}
              suffix="px"
              onChange={setBlur}
            />
          </div>
        </Panel>
      );
    }

    if (activeTool === "export") {
      const visibleProgress = exportProgress;
      const visiblePhase = exportPhase || exportStatus || "Preparing export...";

      return (
        <Panel
          title="Export Studio"
          subtitle="Choose output format and quality, then create your download."
        >
          <div className="space-y-5">
            <div className="rounded-[1.6rem] border border-fuchsia-300/15 bg-gradient-to-br from-fuchsia-300/12 via-white/[0.04] to-cyan-300/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-fuchsia-200">
                Output target
              </p>

              <p className="mt-2 text-2xl font-black text-white">
                {output.width} × {output.height}
              </p>

              <p className="mt-2 text-sm text-white/50">
                {canvasFormat} ·{" "}
                {productionExportResolution === "1080p"
                  ? "1080p · 30fps"
                  : "720p · 30fps"}
              </p>

              {localVideoBytes > 100 * 1024 * 1024 && (
                <p className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-xs font-bold leading-5 text-amber-100/78">
                  Large exports may take longer. For best results, test with a
                  short 720p clip.
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-bold text-white/58">
                Video format
              </label>

              <div className="mt-3 grid grid-cols-1 gap-2">
                {(["mp4"] as VideoFormat[]).map((item) => (
                  <OptionButton
                    key={item}
                    active={exportFormat === item}
                    onClick={() => setExportFormat(item)}
                  >
                    {item.toUpperCase()}
                  </OptionButton>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-white/58">
                Resolution
              </label>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <OptionButton
                  active={productionExportResolution === "720p"}
                  onClick={() => setExportResolution("720p")}
                >
                  720p · 30fps
                </OptionButton>
                <OptionButton
                  active={productionExportResolution === "1080p"}
                  onClick={() => setExportResolution("1080p")}
                >
                  1080p · 30fps
                </OptionButton>
              </div>

            </div>

            <button
              onClick={handleExportVideo}
              disabled={exporting || !hasSavedSourceMedia}
              className="w-full rounded-2xl bg-white px-5 py-3 font-black text-black transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {exporting ? "Preparing export..." : "Export Video"}
            </button>

            {userExportRequested && !downloadUrl && !exportError && (
              <div className="rounded-[1.5rem] border border-cyan-300/20 bg-gradient-to-br from-cyan-300/12 via-white/[0.045] to-fuchsia-300/10 p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-black text-white">
                    {visiblePhase}
                  </span>

                  <span className="text-2xl font-black text-cyan-100">
                    {visibleProgress}%
                  </span>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/35">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-fuchsia-300 via-cyan-200 to-emerald-200 transition-all"
                    style={{ width: `${visibleProgress}%` }}
                  />
                </div>

                {exporting && (
                  <button
                    onClick={resetExportResult}
                    className="mt-4 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-black text-white/72 transition hover:bg-white hover:text-black"
                  >
                    Reset export
                  </button>
                )}
              </div>
            )}

            {exportError && (
              <div className="rounded-[1.5rem] border border-rose-300/20 bg-rose-300/10 p-4">
                <p className="text-sm font-bold leading-6 text-rose-100/82">
                  {exportError}
                </p>

                {exportPhase === "failed" && (
                  <div className="mt-4 grid gap-2">
                    <button
                      onClick={handleRetryExport}
                      disabled={exporting || !lastExportAction}
                      className="w-full rounded-2xl bg-white px-5 py-3 font-black text-black transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      Retry export
                    </button>

                    <button
                      onClick={resetExportResult}
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-black text-white/72 transition hover:bg-white hover:text-black"
                    >
                      Reset export
                    </button>
                  </div>
                )}
              </div>
            )}

            {downloadUrl && (
              <div className="rounded-[1.5rem] border border-emerald-300/20 bg-emerald-300/10 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-emerald-100">
                      Export complete
                    </p>
                    <p className="mt-1 text-xs font-bold text-emerald-100/62">
                      Click Download video to save it to your computer.
                    </p>
                    <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-emerald-100/50">
                      {hasActiveTitleOverlay
                        ? `Title included · ${productionExportQualityLabel} · MP4`
                        : `${productionExportQualityLabel} · MP4`}
                    </p>
                  </div>

                  <p className="text-2xl font-black text-emerald-100">100%</p>
                </div>

                <div className="grid gap-2">
                  <a
                    href={downloadUrl}
                    download={downloadName}
                    className="flex w-full items-center justify-center rounded-2xl bg-emerald-300 px-5 py-3 font-black text-black transition hover:bg-emerald-200"
                  >
                    Download video
                  </a>

                  <button
                    onClick={resetExportResult}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-black text-white/72 transition hover:bg-white hover:text-black"
                  >
                    Reset export
                  </button>
                </div>
              </div>
            )}
          </div>
        </Panel>
      );
    }

    return (
      <Panel title="Project Settings" subtitle="Save your editor setup and manage the project.">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-bold text-white/58">
              Project title
            </label>

            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-white outline-none transition focus:border-fuchsia-300/60"
            />
          </div>

          <div>
            <label className="text-sm font-bold text-white/58">Status</label>

            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-white outline-none transition focus:border-fuchsia-300/60"
            >
              <option className="bg-black">Draft</option>
              <option className="bg-black">In Progress</option>
              <option className="bg-black">Completed</option>
              <option className="bg-black">Archived</option>
            </select>
          </div>

          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-5 py-3 text-center text-sm font-black text-emerald-100">
            {autoSaveStatus}
          </div>

          <button
            onClick={() => setActiveTool("export")}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 font-black text-white transition hover:bg-white hover:text-black"
          >
            Open export settings
          </button>

          <button
            onClick={handleDelete}
            disabled={projectDeleting}
            className="w-full rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-3 font-black text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {projectDeleting ? "Deleting project..." : "Delete project"}
          </button>
        </div>
      </Panel>
    );
  };

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05030a] text-white">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-fuchsia-300 via-purple-300 to-cyan-200 font-black text-black shadow-2xl shadow-fuchsia-500/20">
            L
          </div>

          <p className="mt-6 text-lg font-black">Opening your Lumeo studio...</p>

          <p className="mt-2 text-sm text-white/42">
            Preparing your editing workspace.
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05030a] px-6 text-white">
        <div className="max-w-md rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center">
          <h1 className="text-3xl font-black">Continue to Lumeo</h1>

          <p className="mt-4 text-white/60">
            Sign in to open your premium short video editing studio.
          </p>

          <Link
            href="/login"
            className="mt-8 inline-flex rounded-full bg-white px-6 py-3 font-black text-black transition hover:bg-fuchsia-100"
          >
            Continue to Sign In
          </Link>
        </div>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05030a] px-6 text-white">
        <div className="max-w-md rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center">
          <h1 className="text-3xl font-black">Project not found</h1>

          <p className="mt-4 text-white/60">
            This project may not exist or you may not have access.
          </p>

          <Link
            href="/dashboard"
            className="mt-8 inline-flex rounded-full bg-white px-6 py-3 font-black text-black transition hover:bg-fuchsia-100"
          >
            Back to Studio
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-dvh overflow-hidden bg-[#07050d] text-white">
      <style>{`
        @keyframes lumeoPulse {
          0%, 100% { opacity: 0.78; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.06); }
        }

        @keyframes lumeoFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }

        @keyframes subtleShimmer {
          0%, 100% { box-shadow: 0 0 0 rgba(103, 232, 249, 0); }
          50% { box-shadow: 0 0 24px rgba(103, 232, 249, 0.16); }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(236,72,153,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_bottom,rgba(168,85,247,0.13),transparent_34%)]" />

      <div className="relative z-10 flex min-h-0 w-full flex-col">
        <nav className="shrink-0 border-b border-white/10 bg-[#07050d]/86 px-3 py-2.5 backdrop-blur-2xl sm:px-4">
        <div className="mx-auto flex max-w-[1900px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/dashboard"
              className="shrink-0"
            >
              <LumeoStudioMark />
            </Link>

            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <p className="truncate text-base font-black leading-none sm:text-lg">
                  {title || "Untitled project"}
                </p>

                <span className="hidden rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200 md:inline-flex">
                  Lumeo Studio
                </span>
              </div>

              <p className="mt-1 hidden text-xs text-white/38 sm:block">
                {productionExportSummary} · {output.width}×{output.height}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <span className="hidden rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100 sm:inline-flex">
              {autoSaveStatus}
            </span>

            <button
              onClick={() => setActiveTool("export")}
              className="hidden rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black text-white/72 transition hover:bg-white hover:text-black md:inline-flex"
            >
              Export
            </button>

            <Link
              href="/dashboard"
              className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-white/72 transition hover:bg-white hover:text-black"
            >
              Back to Studio
            </Link>

            <button
              onClick={handleResetEdit}
              className="hidden rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-white/72 transition hover:bg-white hover:text-black sm:inline-flex"
            >
              Reset edit
            </button>

            <button
              onClick={handleDelete}
              disabled={projectDeleting}
              className="hidden rounded-full border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs font-bold text-rose-100 transition hover:bg-rose-200 hover:text-black disabled:cursor-not-allowed disabled:opacity-55 md:inline-flex"
            >
              {projectDeleting ? "Deleting project..." : "Delete project"}
            </button>

            <button
              onClick={handleLogout}
              className="hidden rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black text-white/72 transition hover:bg-white hover:text-black lg:inline-flex"
            >
              Sign out
            </button>
          </div>
        </div>
        </nav>

        <section className="mx-auto flex min-h-0 w-full max-w-[1900px] flex-1 overflow-hidden px-3 py-3 sm:px-4">
        <div className="grid min-h-0 w-full grid-rows-[minmax(0,1fr)_minmax(0,42vh)] gap-3 lg:grid-cols-[270px_minmax(0,1fr)_380px] lg:grid-rows-none">
          <aside className="hidden min-h-0 overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-b from-[#12101a]/92 via-[#0c0a12]/88 to-[#080711]/92 shadow-2xl shadow-black/30 backdrop-blur-2xl lg:block">
            <div className="border-b border-white/10 bg-white/[0.025] p-4">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-white/32">
                Studio Tools
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <StatPill label="Duration" value={`${videoDuration || 0}s`} />
                <StatPill label="Range" value={`${selectedRange}s`} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <StatPill label="Frame" value={canvasFormat} />
                <StatPill label="Output" value={productionExportQualityLabel} />
              </div>
            </div>

            <div className="max-h-[calc(100dvh-205px)] space-y-2 overflow-y-auto p-3">
              {studioTools.map((tool) => (
                <button
                  key={tool.key}
                  onClick={() => setActiveTool(tool.key)}
                  className={`group flex w-full items-center gap-3 rounded-2xl border px-3 py-3.5 text-left transition ${
                    activeTool === tool.key
                      ? "border-cyan-200/18 bg-gradient-to-br from-white/[0.105] via-fuchsia-300/[0.075] to-cyan-200/[0.07] text-white shadow-xl shadow-cyan-300/10"
                      : "border-transparent bg-transparent text-white/58 hover:border-white/10 hover:bg-white/[0.055] hover:text-white"
                  }`}
                >
                  <StudioToolIcon tool={tool.key} active={activeTool === tool.key} />

                  <span className="min-w-0">
                    <span className="block text-sm font-black">
                      {tool.label}
                    </span>

                    <span
                      className={`mt-0.5 block truncate text-xs ${
                        activeTool === tool.key
                          ? "text-white/52"
                          : "text-white/34"
                      }`}
                    >
                      {tool.description}
                    </span>
                  </span>
                </button>
              ))}

            </div>
          </aside>

          <div className="flex min-h-0 flex-col gap-4">
            <div className="flex gap-2 overflow-x-auto rounded-[1.5rem] border border-white/10 bg-[#111018]/86 p-2 shadow-xl shadow-black/20 backdrop-blur-2xl lg:hidden">
              {studioTools.map((tool) => (
                <button
                  key={tool.key}
                  onClick={() => setActiveTool(tool.key)}
                  className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-black transition ${
                    activeTool === tool.key
                      ? "border-cyan-200/18 bg-white/[0.105] text-white shadow-lg shadow-cyan-300/10"
                      : "border-transparent bg-white/[0.045] text-white/60"
                  }`}
                >
                  <StudioToolIcon tool={tool.key} active={activeTool === tool.key} />
                  {tool.label}
                </button>
              ))}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.6rem] border border-white/10 bg-gradient-to-br from-[#100e18]/92 via-[#0b0912]/90 to-[#080711]/92 shadow-2xl shadow-black/35 backdrop-blur-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.025] px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/32">
                    Live Preview
                  </p>
                  <p className="mt-1 truncate text-sm font-black text-white/68">
                    {productionExportSummary}
                  </p>
                </div>

                <button
                  onClick={() => setActiveTool("frame")}
                  className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black text-white/60 transition hover:bg-white hover:text-black"
                >
                  Frame settings
                </button>
              </div>

              <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-4">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(245,230,188,0.08),transparent_32%),radial-gradient(circle_at_20%_80%,rgba(217,70,239,0.1),transparent_32%),radial-gradient(circle_at_80%_75%,rgba(34,211,238,0.08),transparent_28%)]" />
                {localVideoURL && backgroundStyle === "blur" && (
                  <video
                    src={localVideoURL}
                    muted
                    className="absolute inset-0 h-full w-full object-cover opacity-30"
                    style={{
                      filter: blurredBackgroundPreviewFilter,
                      transform: "scale(1.18)",
                    }}
                  />
                )}

                {backgroundStyle === "gradient" && (
                  <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/18 via-black to-cyan-400/14" />
                )}

                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,rgba(0,0,0,0.34)_64%,rgba(0,0,0,0.84)_100%)]" />

                <div className={`relative z-10 max-w-full ${canvasFrameClass}`}>
                  <div className="absolute -inset-5 rounded-[3rem] bg-gradient-to-br from-fuchsia-500/20 via-transparent to-cyan-300/18 blur-2xl" />

                  <div className="relative h-full w-full overflow-hidden rounded-[2rem] border border-white/12 bg-black shadow-2xl shadow-black ring-1 ring-white/[0.035]">
                    {localVideoURL ? (
                      <>
                        {fitMode === "blurredBackground" && (
                          <>
                            <video
                              src={localVideoURL}
                              muted
                              playsInline
                              className="absolute inset-0 h-full w-full object-cover opacity-85"
                              style={{
                                filter: blurredBackgroundPreviewFilter,
                                transform: "scale(1.2)",
                              }}
                            />
                            <div
                              className={`absolute inset-0 ${blurredBackgroundOverlayClass}`}
                            />
                          </>
                        )}

                        <video
                          ref={videoRef}
                          src={localVideoURL}
                          controls
                          playsInline
                          onLoadedMetadata={handleLoadedMetadata}
                          onTimeUpdate={handleVideoTimeUpdate}
                          className="relative z-10 h-full w-full"
                          style={{
                            objectFit:
                              fitMode === "blurredBackground" ? "contain" : fitMode,
                            filter: videoFilter,
                            transform: reframePreviewTransform,
                            transformOrigin: "center",
                            transition: "transform 180ms ease",
                          }}
                        />
                      </>
                    ) : (
                      <StudioEmptyState />
                    )}

                    {localVideoURL && safeZones && (
                      <div className="pointer-events-none absolute inset-[6%] z-20 rounded-[1.5rem] border border-white/35">
                        <span className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/70 backdrop-blur">
                          Safe zone
                        </span>
                        <div className="absolute inset-x-0 bottom-0 h-[22%] border-t border-white/24 bg-white/[0.045]" />
                      </div>
                    )}

                    {localVideoURL && hasActiveTitleOverlay && (
                      <div
                        className={`pointer-events-none absolute z-30 max-w-[86%] leading-tight ${titlePreviewAlignClass} ${titlePreviewClass}`}
                        style={{
                          left: `clamp(24px, ${titleOverlayForExport.x}%, calc(100% - 24px))`,
                          top: `clamp(24px, ${titleOverlayForExport.y}%, calc(100% - 24px))`,
                          transform: titlePreviewTransform,
                          ...titlePreviewSizeStyle,
                        }}
                      >
                        {visibleOverlayText}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="shrink-0 border-t border-white/10 bg-black/22 p-3">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.24em] text-white/32">
                        Timeline
                      </p>

                      <p className="mt-0.5 text-xs text-white/48">
                        Selected range: {trimStart}s to{" "}
                        {trimEnd || videoDuration}s · {selectedRange}s
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handlePlayTrimPreview}
                        disabled={!localVideoURL}
                        className="rounded-2xl bg-white px-4 py-2.5 text-xs font-black text-black transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Preview
                      </button>

                      <span className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-2.5 text-xs font-black text-emerald-100">
                        {autoSaveStatus}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-[96px_1fr_96px] xl:items-center">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-[0.18em] text-white/32">
                        Start
                      </label>

                      <input
                        type="number"
                        min={0}
                        value={trimStart}
                        onChange={(event) =>
                          setTrimStart(Number(event.target.value))
                        }
                        className="mt-1.5 w-full rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2.5 text-sm font-bold text-white outline-none transition focus:border-fuchsia-300/60"
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="mb-2 flex items-center justify-between text-xs font-bold text-white/38">
                        <span>0s</span>
                        <span>{videoDuration || 0}s</span>
                      </div>

                      <div className="relative h-4 overflow-hidden rounded-full border border-white/10 bg-black/45">
                        <div
                          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-fuchsia-300 via-cyan-200 to-amber-200"
                          style={{
                            width: `${
                              videoDuration > 0
                                ? Math.min(
                                    100,
                                    Math.max(
                                      0,
                                      ((trimEnd || videoDuration) /
                                        videoDuration) *
                                        100
                                    )
                                  )
                                : 0
                            }%`,
                          }}
                        />

                        <div
                          className="absolute top-1/2 h-7 w-1.5 -translate-y-1/2 rounded-full bg-white shadow-lg"
                          style={{
                            left: `${
                              videoDuration > 0
                                ? Math.min(
                                    100,
                                    Math.max(
                                      0,
                                      (trimStart / videoDuration) * 100
                                    )
                                  )
                                : 0
                            }%`,
                          }}
                        />

                        <div
                          className="absolute top-1/2 h-7 w-1.5 -translate-y-1/2 rounded-full bg-white shadow-lg"
                          style={{
                            left: `${
                              videoDuration > 0
                                ? Math.min(
                                    100,
                                    Math.max(
                                      0,
                                      ((trimEnd || videoDuration) /
                                        videoDuration) *
                                        100
                                    )
                                  )
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase tracking-[0.18em] text-white/32">
                        End
                      </label>

                      <input
                        type="number"
                        min={0}
                        value={trimEnd}
                        onChange={(event) =>
                          setTrimEnd(Number(event.target.value))
                        }
                        className="mt-1.5 w-full rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2.5 text-sm font-bold text-white outline-none transition focus:border-fuchsia-300/60"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="min-h-0 overflow-hidden rounded-[1.6rem]">
            {renderInspector()}
          </aside>
        </div>
        </section>
      </div>
    </main>
  );
}
