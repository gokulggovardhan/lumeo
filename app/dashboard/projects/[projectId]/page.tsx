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
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import {
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, googleProvider, db } from "@/lib/firebase";
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
  | "canvas"
  | "edit"
  | "text"
  | "audio"
  | "effects"
  | "export"
  | "project";

type CanvasFormat = "9:16" | "1:1" | "16:9";
type FitMode = "contain" | "cover";
type BackgroundStyle = "blur" | "black" | "gradient";
type ExportResolution = "720p" | "1080p" | "2k";
type VideoFormat = "mp4" | "webm";
type AudioFormat = "mp3" | "wav";
type ExportQuality = "standard" | "high" | "max";
type ExportFps = 24 | 30 | 60;

const tools: { key: ToolKey; label: string; description: string; icon: string }[] =
  [
    { key: "media", label: "Media", description: "Video and music", icon: "◉" },
    { key: "canvas", label: "Canvas", description: "Frame and layout", icon: "▣" },
    { key: "edit", label: "Edit", description: "Trim and motion", icon: "✂" },
    { key: "text", label: "Text", description: "Titles and hooks", icon: "T" },
    { key: "audio", label: "Audio", description: "Sound mix", icon: "♫" },
    { key: "effects", label: "Effects", description: "Look and color", icon: "✦" },
    { key: "export", label: "Export", description: "Output settings", icon: "⇩" },
    { key: "project", label: "Project", description: "Save and manage", icon: "✓" },
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

  if (resolution === "720p") return { width: 1280, height: 720 };
  if (resolution === "1080p") return { width: 1920, height: 1080 };
  return { width: 2560, height: 1440 };
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
    <div className="rounded-[2rem] border border-white/10 bg-[#111018]/90 p-5 shadow-2xl shadow-black/25 backdrop-blur-2xl">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-white/32">
          Studio Panel
        </p>

        <h2 className="mt-2 text-xl font-black tracking-tight text-white">
          {title}
        </h2>

        {subtitle && (
          <p className="mt-2 text-sm leading-6 text-white/48">{subtitle}</p>
        )}
      </div>

      <div className="mt-6">{children}</div>
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
        className="group flex cursor-pointer flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-white/14 bg-white/[0.045] px-5 py-8 text-center transition hover:border-fuchsia-300/40 hover:bg-fuchsia-300/[0.08]"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl font-black text-black shadow-xl shadow-white/10 transition group-hover:scale-105">
          +
        </div>

        <p className="mt-4 text-base font-black text-white">{title}</p>

        <p className="mt-2 max-w-[260px] text-sm leading-6 text-white/45">
          {subtitle}
        </p>

        <span className="mt-5 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/55">
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
    };

const LEGACY_DEFAULT_OVERLAY_TEXT = "Your title here";

function createVideoFingerprint(file: File, projectId: string) {
  return `${projectId}:${file.name}:${file.size}:${file.lastModified}`;
}

function normalizeOverlayText(value: unknown) {
  if (typeof value !== "string") return "";

  return value.trim() === LEGACY_DEFAULT_OVERLAY_TEXT ? "" : value;
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

  const videoStorageKey = `project:${projectId}:video`;
  const audioStorageKey = `project:${projectId}:audio`;

  const [activeTool, setActiveTool] = useState<ToolKey>("media");

  const [user, setUser] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [project, setProject] = useState<any>(null);

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("Draft");
  const [saving, setSaving] = useState(false);

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
  const [fitMode, setFitMode] = useState<FitMode>("contain");
  const [backgroundStyle, setBackgroundStyle] =
    useState<BackgroundStyle>("blur");

  const [videoZoom, setVideoZoom] = useState(100);
  const [videoX, setVideoX] = useState(0);
  const [videoY, setVideoY] = useState(0);
  const [rotate, setRotate] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [videoVolume, setVideoVolume] = useState(100);
  const [mutedOriginal, setMutedOriginal] = useState(false);

  const [overlayText, setOverlayText] = useState("");
  const [overlayX, setOverlayX] = useState(50);
  const [overlayY, setOverlayY] = useState(45);
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

  const output = getOutputDimensions(canvasFormat, exportResolution);
  const phaseOneExportResolution =
    exportResolution === "1080p" ? "1080p" : "720p";
  const hasSavedSourceMedia = Boolean(videoStorageMetadata?.fileId);

  const selectedRange = Math.max(
    0,
    (trimEnd || videoDuration || 0) - trimStart
  );

  const videoFilter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) grayscale(${grayscale}%) blur(${blur}px)`;
  const visibleOverlayText = overlayText.trim();
  const hasVisibleOverlayText = visibleOverlayText.length > 0;
  const hasPreviewOnlyExportEdits =
    hasVisibleOverlayText ||
    brightness !== 100 ||
    contrast !== 100 ||
    saturation !== 100 ||
    grayscale !== 0 ||
    blur !== 0 ||
    playbackSpeed !== 1 ||
    rotate !== 0 ||
    flipX ||
    videoZoom !== 100 ||
    videoX !== 0 ||
    videoY !== 0 ||
    videoVolume !== 100 ||
    mutedOriginal ||
    Boolean(localAudioURL);

  const canvasFrameClass =
    canvasFormat === "9:16"
      ? "aspect-[9/16] h-[66vh] min-h-[440px] max-h-[760px]"
      : canvasFormat === "1:1"
        ? "aspect-square h-[60vh] min-h-[380px] max-h-[640px]"
        : "aspect-video w-full max-w-[1080px]";

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
              savedCanvasFormat === "1:1" || savedCanvasFormat === "16:9"
                ? savedCanvasFormat
                : "9:16"
            );

            const savedFitMode = editor.canvas?.fitMode;
            setFitMode(savedFitMode === "cover" ? "cover" : "contain");

            const savedBackground = editor.canvas?.backgroundStyle;
            setBackgroundStyle(
              savedBackground === "black" || savedBackground === "gradient"
                ? savedBackground
                : "blur"
            );

            setVideoZoom(editor.canvas?.videoZoom ?? 100);
            setVideoX(editor.canvas?.videoX ?? 0);
            setVideoY(editor.canvas?.videoY ?? 0);
            setRotate(editor.canvas?.rotate ?? 0);
            setFlipX(editor.canvas?.flipX ?? false);

            setPlaybackSpeed(editor.playback?.speed ?? 1);
            setVideoVolume(editor.playback?.videoVolume ?? 100);
            setMutedOriginal(editor.playback?.mutedOriginal ?? false);

            setOverlayText(normalizeOverlayText(editor.textOverlay?.text));
            setOverlayX(editor.textOverlay?.x ?? 50);
            setOverlayY(editor.textOverlay?.y ?? 45);
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
            setExportResolution(
              savedResolution === "1080p" || savedResolution === "2k"
                ? savedResolution
                : "720p"
            );

            const savedFps = editor.exportSettings?.fps;
            setExportFps(savedFps === 24 || savedFps === 60 ? savedFps : 30);

            const savedQuality = editor.exportSettings?.quality;
            setExportQuality(
              savedQuality === "high" || savedQuality === "max"
                ? savedQuality
                : "standard"
            );
          } else {
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

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await saveUserProfile(result.user);
    } catch (error: any) {
      alert(error.message);
    }
  };

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
    setVideoUploadStatus("Saving media...");
    setVideoUploadProgress(0);
    resetExportState();

    try {
      await saveMediaToBrowser(videoStorageKey, file);
    } catch {
      alert("Video preview works, but browser could not save it locally.");
    }

    if (oldMediaFileIds.length > 0) {
      await deletePermanentMediaFiles(oldMediaFileIds);

      try {
        await updateDoc(doc(db, "projects", projectId), {
          "editor.media.storage": null,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.error("Video replace metadata cleanup failed", error);
      }
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
      alert("Audio preview works, but browser could not save it locally.");
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

      setVideoStorageMetadata(storage);
      setPendingCloudinaryUpload(null);
      setVideoUploadProgress(100);
      setVideoUploadStatus("Media saved");
      console.info("[Lumeo Upload] final UI state", { status: "Media saved" });

      await updateDoc(doc(db, "projects", projectId), {
        "editor.media.storage": storage,
        updatedAt: serverTimestamp(),
      });
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
        resolution: phaseOneExportResolution,
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
            resolution: phaseOneExportResolution,
          },
        }),
      });

      const payload = (await response.json()) as CloudExportResponse;

      if (!response.ok || !payload.success || !payload.downloadUrl) {
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

  const handleSave = async () => {
    if (!projectId) return;

    if (!title.trim()) {
      alert("Project title cannot be empty");
      return;
    }

    if (Number(trimEnd) > 0 && Number(trimStart) >= Number(trimEnd)) {
      alert("Trim start should be less than trim end");
      return;
    }

    try {
      setSaving(true);

      await updateDoc(doc(db, "projects", projectId), {
        title: title.trim(),
        status,
        editor: {
          mode: "shorts-editor-v5-premium",
          media: {
            localVideoName:
              localVideoName ||
              project?.editor?.media?.localVideoName ||
              project?.editor?.localVideoName ||
              "",
            localAudioName:
              localAudioName ||
              project?.editor?.media?.localAudioName ||
              project?.editor?.localAudioName ||
              "",
            videoDuration: Number(videoDuration) || 0,
            storage:
              videoStorageMetadata ||
              project?.editor?.media?.storage ||
              null,
          },
          trim: {
            start: Number(trimStart) || 0,
            end: Number(trimEnd) || 0,
          },
          canvas: {
            format: canvasFormat,
            fitMode,
            backgroundStyle,
            videoZoom,
            videoX,
            videoY,
            rotate,
            flipX,
          },
          playback: {
            speed: Number(playbackSpeed) || 1,
            videoVolume: Number(videoVolume) || 100,
            mutedOriginal,
          },
          audio: {
            musicVolume: Number(musicVolume) || 80,
          },
          textOverlay: {
            text: visibleOverlayText,
            x: Number(overlayX) || 50,
            y: Number(overlayY) || 45,
            size: Number(overlaySize) || 34,
            color: overlayColor || "#ffffff",
            opacity: Number(overlayOpacity) || 100,
            background: overlayBg,
            uppercase: overlayUppercase,
            shadow: overlayShadow,
          },
          effects: {
            brightness: Number(brightness) || 100,
            contrast: Number(contrast) || 100,
            saturation: Number(saturation) || 100,
            grayscale: Number(grayscale) || 0,
            blur: Number(blur) || 0,
          },
          transitions: {
            in: transitionIn,
            out: transitionOut,
            duration: Number(transitionDuration) || 1,
          },
          exportSettings: {
            videoFormat: exportFormat,
            audioFormat,
            resolution: exportResolution,
            fps: exportFps,
            quality: exportQuality,
            maxResolution: "2k",
            outputWidth: output.width,
            outputHeight: output.height,
          },
          export: project?.editor?.export || null,
        },
        updatedAt: serverTimestamp(),
      });

      alert("Editor settings saved successfully");
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = confirm("Are you sure you want to delete this project?");

    if (!confirmed) return;

    const linkedMediaFileIds = collectPermanentMediaFileIds(
      project?.editor?.media?.storage,
      project?.editor?.export,
      project?.editor?.exports,
      project?.export,
      project?.exports,
    );

    try {
      await deleteDoc(doc(db, "projects", projectId));
      await deleteMediaFromBrowser(videoStorageKey);
      await deleteMediaFromBrowser(audioStorageKey);
      await deletePermanentMediaFiles(linkedMediaFileIds);
      router.push("/dashboard");
    } catch (error) {
      console.error("Project delete failed", error);
      alert("Something went wrong. Please try again.");
    }
  };

  const handleResetEdit = () => {
    const confirmed = confirm("Reset edit settings? Saved media will stay in place.");

    if (!confirmed) return;

    setTrimStart(0);
    setTrimEnd(videoDuration || 0);
    setCanvasFormat("9:16");
    setFitMode("contain");
    setBackgroundStyle("blur");
    setVideoZoom(100);
    setVideoX(0);
    setVideoY(0);
    setRotate(0);
    setFlipX(false);
    setPlaybackSpeed(1);
    setVideoVolume(100);
    setMutedOriginal(false);
    setOverlayText("");
    setOverlayX(50);
    setOverlayY(45);
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
    setActiveTool("edit");
  };

  const renderInspector = () => {
    if (activeTool === "media") {
      return (
        <Panel
          title="Media Library"
          subtitle="Import your video and music. Preview starts instantly, then save media when you are ready."
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
                className="group flex cursor-pointer flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-white/14 bg-white/[0.045] px-5 py-8 text-center transition hover:border-fuchsia-300/40 hover:bg-fuchsia-300/[0.08]"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl font-black text-black shadow-xl shadow-white/10 transition group-hover:scale-105">
                  +
                </div>

                <p className="mt-4 text-base font-black text-white">
                  Choose from device
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

            <UploadDropzone
              id="audio-upload"
              title="Add music or audio"
              subtitle="Upload music, voiceover, or background audio for the edit."
              accept="audio/*"
              onChange={handleAudioSelect}
            />

            {localAudioURL && (
              <div className="rounded-[1.5rem] border border-white/10 bg-black/30 p-4">
                <p className="truncate text-sm font-black text-white">
                  {localAudioName}
                </p>

                <audio
                  ref={audioPreviewRef}
                  src={localAudioURL}
                  controls
                  className="mt-4 w-full"
                />

                {audioRestored && (
                  <p className="mt-3 text-xs font-bold text-emerald-200">
                    Audio restored locally.
                  </p>
                )}
              </div>
            )}

            {(localVideoURL || localAudioURL) && (
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

    if (activeTool === "canvas") {
      return (
        <Panel title="Canvas Studio" subtitle="Set the video frame and background style.">
          <div className="space-y-6">
            <div>
              <label className="text-sm font-bold text-white/58">
                Canvas format
              </label>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["9:16", "1:1", "16:9"] as CanvasFormat[]).map((item) => (
                  <OptionButton
                    key={item}
                    active={canvasFormat === item}
                    onClick={() => setCanvasFormat(item)}
                  >
                    {item}
                  </OptionButton>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-white/58">
                Video framing
              </label>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <OptionButton
                  active={fitMode === "contain"}
                  onClick={() => setFitMode("contain")}
                >
                  Fit
                </OptionButton>

                <OptionButton
                  active={fitMode === "cover"}
                  onClick={() => setFitMode("cover")}
                >
                  Fill
                </OptionButton>
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-white/58">
                Background
              </label>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["blur", "black", "gradient"] as BackgroundStyle[]).map(
                  (item) => (
                    <OptionButton
                      key={item}
                      active={backgroundStyle === item}
                      onClick={() => setBackgroundStyle(item)}
                      small
                    >
                      {item}
                    </OptionButton>
                  )
                )}
              </div>
            </div>

            <RangeControl
              label="Video zoom"
              value={videoZoom}
              min={50}
              max={200}
              suffix="%"
              onChange={setVideoZoom}
            />

            <RangeControl
              label="Position X"
              value={videoX}
              min={-50}
              max={50}
              suffix="%"
              onChange={setVideoX}
            />

            <RangeControl
              label="Position Y"
              value={videoY}
              min={-50}
              max={50}
              suffix="%"
              onChange={setVideoY}
            />
          </div>
        </Panel>
      );
    }

    if (activeTool === "edit") {
      return (
        <Panel title="Edit Controls" subtitle="Fine-tune trim, speed, rotation, and movement.">
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
        <Panel title="Text Layer" subtitle="Create premium title hooks and overlays.">
          <div className="space-y-5">
            <textarea
              value={overlayText}
              onChange={(event) => setOverlayText(event.target.value)}
              placeholder="Type your title..."
              className="min-h-28 w-full rounded-[1.5rem] border border-white/10 bg-white/[0.08] px-4 py-3 text-white outline-none placeholder:text-white/32 transition focus:border-fuchsia-300/60"
            />

            <RangeControl
              label="Horizontal"
              value={overlayX}
              min={5}
              max={95}
              suffix="%"
              onChange={setOverlayX}
            />

            <RangeControl
              label="Vertical"
              value={overlayY}
              min={5}
              max={95}
              suffix="%"
              onChange={setOverlayY}
            />

            <RangeControl
              label="Size"
              value={overlaySize}
              min={18}
              max={82}
              suffix="px"
              onChange={setOverlaySize}
            />

            <RangeControl
              label="Opacity"
              value={overlayOpacity}
              min={10}
              max={100}
              suffix="%"
              onChange={setOverlayOpacity}
            />

            <div>
              <label className="text-sm font-bold text-white/58">Color</label>

              <input
                type="color"
                value={overlayColor}
                onChange={(event) => setOverlayColor(event.target.value)}
                className="mt-3 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.08] p-2"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <OptionButton
                active={overlayBg}
                onClick={() => setOverlayBg(!overlayBg)}
                small
              >
                BG
              </OptionButton>

              <OptionButton
                active={overlayUppercase}
                onClick={() => setOverlayUppercase(!overlayUppercase)}
                small
              >
                CAPS
              </OptionButton>

              <OptionButton
                active={overlayShadow}
                onClick={() => setOverlayShadow(!overlayShadow)}
                small
              >
                SHADOW
              </OptionButton>
            </div>
          </div>
        </Panel>
      );
    }

    if (activeTool === "audio") {
      return (
        <Panel title="Audio Mix" subtitle="Balance original video sound and background music.">
          <div className="space-y-6">
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

            <RangeControl
              label="Music volume"
              value={musicVolume}
              min={0}
              max={100}
              suffix="%"
              onChange={setMusicVolume}
            />

            {localAudioURL ? (
              <audio
                ref={audioRef}
                src={localAudioURL}
                controls
                className="w-full"
              />
            ) : (
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5 text-sm leading-6 text-white/45">
                Add music from the Media tab to control background audio.
              </div>
            )}
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
          <div className="space-y-6">
            <div className="rounded-[1.6rem] border border-fuchsia-300/15 bg-gradient-to-br from-fuchsia-300/12 via-white/[0.04] to-cyan-300/10 p-5">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-fuchsia-200">
                Output target
              </p>

              <p className="mt-3 text-3xl font-black text-white">
                {output.width} × {output.height}
              </p>

              <p className="mt-2 text-sm text-white/50">
                {canvasFormat} · {phaseOneExportResolution}
              </p>

              {localVideoBytes > 100 * 1024 * 1024 && (
                <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-xs font-bold leading-5 text-amber-100/78">
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
                {(["720p", "1080p"] as ExportResolution[]).map(
                  (item) => (
                    <OptionButton
                      key={item}
                      active={exportResolution === item}
                      onClick={() => setExportResolution(item)}
                      small
                    >
                      {item.toUpperCase()}
                    </OptionButton>
                  )
                )}
              </div>
            </div>

            {hasPreviewOnlyExportEdits && (
              <div className="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/10 p-4">
                <p className="text-sm font-bold leading-6 text-amber-100/82">
                  Some advanced edits are preview-only in this export version.
                </p>
              </div>
            )}

            <button
              onClick={handleExportVideo}
              disabled={exporting || !hasSavedSourceMedia}
              className="w-full rounded-2xl bg-white px-5 py-3 font-black text-black transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {exporting ? "Preparing export..." : "Export video"}
            </button>

            <details className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
              <summary className="cursor-pointer text-sm font-black text-white/72">
                Experimental export
              </summary>

              <div className="mt-4 grid gap-3">
                <button
                  onClick={handleExperimentalExportVideo}
                  disabled={exporting}
                  className="w-full rounded-2xl bg-white px-5 py-3 font-black text-black transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  Export video
                </button>

                <button
                  onClick={handleExtractAudio}
                  disabled={exporting}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 font-black text-white transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-55"
                >
                  Extract audio
                </button>

                {!userExportRequested && !downloadUrl && !exportError && localVideoURL && (
                  <p className="text-center text-xs font-bold text-white/36">
                    {engineReady
                      ? "Export tools ready"
                      : enginePreparing
                        ? "Preparing export tools quietly"
                        : "Export tools will prepare quietly"}
                  </p>
                )}
              </div>
            </details>

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

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-2xl bg-white px-5 py-3 font-black text-black transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save editor"}
          </button>

          <button
            onClick={() => setActiveTool("export")}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 font-black text-white transition hover:bg-white hover:text-black"
          >
            Open export settings
          </button>

          <button
            onClick={handleDelete}
            className="w-full rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-3 font-black text-red-200 transition hover:bg-red-500/20"
          >
            Delete project
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

          <button
            onClick={handleLogin}
            className="mt-8 rounded-full bg-white px-6 py-3 font-black text-black transition hover:bg-fuchsia-100"
          >
            Continue with Google
          </button>
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
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#07050d] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(236,72,153,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_bottom,rgba(168,85,247,0.13),transparent_34%)]" />

      <nav className="relative z-50 border-b border-white/10 bg-[#07050d]/86 px-4 py-3 backdrop-blur-2xl sm:px-6">
        <div className="mx-auto flex max-w-[1900px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/dashboard"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-300 via-purple-300 to-cyan-200 font-black text-black shadow-lg shadow-fuchsia-500/20"
            >
              L
            </Link>

            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <p className="truncate text-base font-black leading-none sm:text-lg">
                  {title || "Untitled project"}
                </p>

                <span className="hidden rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200 md:inline-flex">
                  Beta Studio
                </span>
              </div>

              <p className="mt-1 hidden text-xs text-white/38 sm:block">
                {canvasFormat} · {exportResolution} ·{" "}
                {exportFormat.toUpperCase()} · {output.width}×{output.height}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-black transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>

            <button
              onClick={() => setActiveTool("export")}
              className="hidden rounded-full border border-white/10 bg-white/[0.06] px-5 py-2.5 text-sm font-black text-white/72 transition hover:bg-white hover:text-black md:inline-flex"
            >
              Export
            </button>

            <Link
              href="/dashboard"
              className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white/72 transition hover:bg-white hover:text-black"
            >
              Back to dashboard
            </Link>

            <button
              onClick={handleResetEdit}
              className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white/72 transition hover:bg-white hover:text-black"
            >
              Reset edit
            </button>

            <button
              onClick={handleDelete}
              className="rounded-full border border-rose-300/20 bg-rose-300/10 px-4 py-2.5 text-sm font-bold text-rose-100 transition hover:bg-rose-200 hover:text-black"
            >
              Delete project
            </button>

            <button
              onClick={handleLogout}
              className="rounded-full border border-white/10 bg-white/[0.06] px-5 py-2.5 text-sm font-black text-white/72 transition hover:bg-white hover:text-black"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-[1900px] px-4 py-4 sm:px-6">
        <div className="grid gap-4 lg:h-[calc(100vh-92px)] lg:grid-cols-[280px_minmax(0,1fr)_390px]">
          <aside className="hidden min-h-0 overflow-hidden rounded-[2rem] border border-white/10 bg-[#111018]/82 shadow-2xl shadow-black/25 backdrop-blur-2xl lg:block">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-white/32">
                Lumeo tools
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <StatPill label="Duration" value={`${videoDuration || 0}s`} />
                <StatPill label="Range" value={`${selectedRange}s`} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <StatPill label="Canvas" value={canvasFormat} />
                <StatPill label="Output" value={exportResolution} />
              </div>
            </div>

            <div className="space-y-2 p-3">
              {tools.map((tool) => (
                <button
                  key={tool.key}
                  onClick={() => setActiveTool(tool.key)}
                  className={`group flex w-full items-center gap-3 rounded-2xl border px-3 py-3.5 text-left transition ${
                    activeTool === tool.key
                      ? "border-white/18 bg-white text-black shadow-xl shadow-white/10"
                      : "border-transparent bg-transparent text-white/58 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-black ${
                      activeTool === tool.key
                        ? "bg-black text-white"
                        : "bg-white/[0.08] text-white/70 group-hover:bg-white/[0.12]"
                    }`}
                  >
                    {tool.icon}
                  </span>

                  <span className="min-w-0">
                    <span className="block text-sm font-black">
                      {tool.label}
                    </span>

                    <span
                      className={`mt-0.5 block truncate text-xs ${
                        activeTool === tool.key
                          ? "text-black/55"
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
            <div className="flex gap-2 overflow-x-auto rounded-[1.5rem] border border-white/10 bg-[#111018]/82 p-2 backdrop-blur-2xl lg:hidden">
              {tools.map((tool) => (
                <button
                  key={tool.key}
                  onClick={() => setActiveTool(tool.key)}
                  className={`shrink-0 rounded-2xl px-4 py-3 text-sm font-black transition ${
                    activeTool === tool.key
                      ? "bg-white text-black"
                      : "bg-white/[0.06] text-white/60"
                  }`}
                >
                  {tool.icon} {tool.label}
                </button>
              ))}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#0d0b13]/88 shadow-2xl shadow-black/30 backdrop-blur-2xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap gap-2">
                  {(["9:16", "1:1", "16:9"] as CanvasFormat[]).map((item) => (
                    <button
                      key={item}
                      onClick={() => setCanvasFormat(item)}
                      className={`rounded-full px-4 py-2 text-xs font-black transition ${
                        canvasFormat === item
                          ? "bg-white text-black"
                          : "bg-white/[0.06] text-white/55 hover:bg-white/[0.12] hover:text-white"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFitMode("contain")}
                    className={`rounded-full px-4 py-2 text-xs font-black transition ${
                      fitMode === "contain"
                        ? "bg-white text-black"
                        : "bg-white/[0.06] text-white/55 hover:bg-white/[0.12] hover:text-white"
                    }`}
                  >
                    Fit
                  </button>

                  <button
                    onClick={() => setFitMode("cover")}
                    className={`rounded-full px-4 py-2 text-xs font-black transition ${
                      fitMode === "cover"
                        ? "bg-white text-black"
                        : "bg-white/[0.06] text-white/55 hover:bg-white/[0.12] hover:text-white"
                    }`}
                  >
                    Fill
                  </button>
                </div>
              </div>

              <div className="relative flex min-h-[480px] flex-1 items-center justify-center overflow-hidden p-4 sm:p-6">
                {localVideoURL && backgroundStyle === "blur" && (
                  <video
                    src={localVideoURL}
                    muted
                    className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-3xl"
                    style={{ filter: videoFilter }}
                  />
                )}

                {backgroundStyle === "gradient" && (
                  <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/18 via-black to-cyan-400/14" />
                )}

                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,rgba(0,0,0,0.38)_64%,rgba(0,0,0,0.86)_100%)]" />

                <div className={`relative z-10 max-w-full ${canvasFrameClass}`}>
                  <div className="absolute -inset-5 rounded-[3rem] bg-gradient-to-br from-fuchsia-500/22 via-transparent to-cyan-300/18 blur-2xl" />

                  <div className="relative h-full w-full overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl shadow-black">
                    {localVideoURL ? (
                      <video
                        ref={videoRef}
                        src={localVideoURL}
                        controls
                        playsInline
                        onLoadedMetadata={handleLoadedMetadata}
                        onTimeUpdate={handleVideoTimeUpdate}
                        className="h-full w-full"
                        style={{
                          objectFit: fitMode,
                          filter: videoFilter,
                          transform: `translate(${videoX}%, ${videoY}%) rotate(${rotate}deg) scale(${videoZoom / 100}) scaleX(${flipX ? -1 : 1})`,
                          transformOrigin: "center",
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center px-8 text-center">
                        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-white text-3xl font-black text-black shadow-xl shadow-white/10">
                          +
                        </div>

                        <p className="text-2xl font-black">Add your first clip</p>

                        <p className="mt-3 max-w-xs text-sm leading-6 text-white/45">
                          Import a video from the Media panel to start building
                          your premium short.
                        </p>

                        <button
                          onClick={() => setActiveTool("media")}
                          className="mt-6 rounded-full bg-white px-6 py-3 text-sm font-black text-black transition hover:bg-fuchsia-100"
                        >
                          Open media
                        </button>
                      </div>
                    )}

                    {localVideoURL && hasVisibleOverlayText && (
                      <div
                        className={`pointer-events-none absolute max-w-[86%] text-center font-black leading-tight ${
                          overlayBg ? "rounded-2xl bg-black/55 px-4 py-2" : ""
                        }`}
                        style={{
                          left: `${overlayX}%`,
                          top: `${overlayY}%`,
                          transform: "translate(-50%, -50%)",
                          fontSize: `${overlaySize}px`,
                          color: overlayColor,
                          opacity: overlayOpacity / 100,
                          textTransform: overlayUppercase
                            ? "uppercase"
                            : "none",
                          textShadow: overlayShadow
                            ? "0 8px 32px rgba(0,0,0,0.95), 0 2px 8px rgba(0,0,0,0.9)"
                            : "none",
                        }}
                      >
                        {visibleOverlayText}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-white/10 bg-black/22 p-4">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.24em] text-white/32">
                        Timeline
                      </p>

                      <p className="mt-1 text-sm text-white/48">
                        Selected range: {trimStart}s to{" "}
                        {trimEnd || videoDuration}s · {selectedRange}s
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handlePlayTrimPreview}
                        disabled={!localVideoURL}
                        className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Preview
                      </button>

                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-black text-white transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[110px_1fr_110px] xl:items-center">
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
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-fuchsia-300/60"
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
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-fuchsia-300/60"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="min-h-0 overflow-y-auto rounded-[2rem]">
            {renderInspector()}
          </aside>
        </div>
      </section>
    </main>
  );
}
