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

const tools: { key: ToolKey; label: string; icon: string }[] = [
  { key: "media", label: "Media", icon: "◉" },
  { key: "canvas", label: "Canvas", icon: "▣" },
  { key: "edit", label: "Edit", icon: "✂" },
  { key: "text", label: "Text", icon: "T" },
  { key: "audio", label: "Audio", icon: "♫" },
  { key: "effects", label: "FX", icon: "✦" },
  { key: "export", label: "Export", icon: "⇩" },
  { key: "project", label: "Save", icon: "✓" },
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

function GlassPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/20 backdrop-blur-2xl">
      <div>
        <h2 className="text-lg font-black tracking-tight text-white">{title}</h2>

        {subtitle && (
          <p className="mt-1 text-sm leading-6 text-white/48">{subtitle}</p>
        )}
      </div>

      <div className="mt-5">{children}</div>
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
        <label className="text-sm font-semibold text-white/55">{label}</label>

        <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-bold text-white/60">
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
        className="w-full accent-cyan-300"
      />
    </div>
  );
}

function ToolButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-4 text-center transition duration-200 ${
        active
          ? "border-white/20 bg-white text-black shadow-xl shadow-white/10"
          : "border-white/10 bg-white/[0.045] text-white/58 hover:bg-white/[0.09] hover:text-white"
      }`}
    >
      <span className="text-lg font-black">{icon}</span>
      <span className="text-[11px] font-black uppercase tracking-wide">
        {label}
      </span>
    </button>
  );
}

export default function ProjectDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoRestored, setVideoRestored] = useState(false);

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

  const [overlayText, setOverlayText] = useState("Your title here");
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
    useState<ExportResolution>("1080p");
  const [exportFps, setExportFps] = useState<ExportFps>(30);
  const [exportQuality, setExportQuality] = useState<ExportQuality>("high");

  const output = getOutputDimensions(canvasFormat, exportResolution);

  const videoFilter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) grayscale(${grayscale}%) blur(${blur}px)`;

  const canvasFrameClass =
    canvasFormat === "9:16"
      ? "aspect-[9/16] h-[64vh] min-h-[420px] max-h-[720px]"
      : canvasFormat === "1:1"
        ? "aspect-square h-[58vh] min-h-[360px] max-h-[620px]"
        : "aspect-video w-full max-w-[980px]";

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

            setTrimStart(editor.trim?.start ?? editor.trimStart ?? timeline.trimStart ?? 0);
            setTrimEnd(editor.trim?.end ?? editor.trimEnd ?? timeline.trimEnd ?? 0);
            setVideoDuration(
              editor.media?.videoDuration ??
                editor.videoDuration ??
                timeline.videoDuration ??
                0
            );

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

            setOverlayText(editor.textOverlay?.text || "Your title here");
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

            const savedVideoFormat = editor.exportSettings?.videoFormat;
            setExportFormat(savedVideoFormat === "webm" ? "webm" : "mp4");

            const savedAudioFormat = editor.exportSettings?.audioFormat;
            setAudioFormat(savedAudioFormat === "wav" ? "wav" : "mp3");

            const savedResolution = editor.exportSettings?.resolution;
            setExportResolution(
              savedResolution === "720p" || savedResolution === "2k"
                ? savedResolution
                : "1080p"
            );

            const savedFps = editor.exportSettings?.fps;
            setExportFps(savedFps === 24 || savedFps === 60 ? savedFps : 30);

            const savedQuality = editor.exportSettings?.quality;
            setExportQuality(
              savedQuality === "standard" || savedQuality === "max"
                ? savedQuality
                : "high"
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
          setLocalVideoSize(`${(savedVideo.size / (1024 * 1024)).toFixed(2)} MB`);
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
    if (!videoRef.current) return;

    videoRef.current.playbackRate = playbackSpeed;
    videoRef.current.volume = Math.min(Math.max(videoVolume / 100, 0), 1);
    videoRef.current.muted = mutedOriginal;
  }, [playbackSpeed, videoVolume, mutedOriginal, localVideoURL]);

  useEffect(() => {
    if (!audioRef.current) return;

    audioRef.current.volume = Math.min(Math.max(musicVolume / 100, 0), 1);
  }, [musicVolume, localAudioURL]);

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

    if (!file) return;

    if (!file.type.startsWith("video/")) {
      alert("Please select a video file");
      return;
    }

    const url = URL.createObjectURL(file);

    setLocalVideoURL(url);
    setLocalVideoName(file.name);
    setLocalVideoSize(`${(file.size / (1024 * 1024)).toFixed(2)} MB`);
    setVideoRestored(false);

    try {
      await saveMediaToBrowser(videoStorageKey, file);
    } catch {
      alert("Video preview works, but browser could not save it locally.");
    }
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
      setVideoDuration(0);
      setVideoRestored(false);

      setLocalAudioURL("");
      setLocalAudioName("");
      setAudioRestored(false);
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

  const handleExportNotReady = () => {
    alert(
      "Export settings are ready and saved. FFmpeg integration is the next step to enable real MP4, WebM, MP3, and WAV export."
    );
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
          mode: "shorts-editor-v4",
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
            text: overlayText,
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

    try {
      await deleteDoc(doc(db, "projects", projectId));
      await deleteMediaFromBrowser(videoStorageKey);
      await deleteMediaFromBrowser(audioStorageKey);
      router.push("/dashboard");
    } catch (error: any) {
      alert(error.message);
    }
  };

  const renderInspector = () => {
    if (activeTool === "media") {
      return (
        <GlassPanel
          title="Media"
          subtitle="Add video and music. Files restore in this browser."
        >
          <div className="space-y-5">
            <div>
              <label className="text-sm font-bold text-white/55">
                Video file
              </label>

              <input
                type="file"
                accept="video/*"
                onChange={handleVideoSelect}
                className="mt-2 block w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-black file:text-black"
              />
            </div>

            {localVideoName && (
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/60">
                <p className="font-black text-white">{localVideoName}</p>
                <p className="mt-1">Size: {localVideoSize}</p>
                <p>Duration: {videoDuration}s</p>

                {videoRestored && (
                  <p className="mt-2 font-bold text-emerald-300">
                    Restored from browser storage.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="text-sm font-bold text-white/55">
                Music / audio
              </label>

              <input
                type="file"
                accept="audio/*"
                onChange={handleAudioSelect}
                className="mt-2 block w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-black file:text-black"
              />
            </div>

            {localAudioURL && (
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="mb-3 text-sm font-black text-white">
                  {localAudioName}
                </p>

                <audio ref={audioRef} src={localAudioURL} controls className="w-full" />

                {audioRestored && (
                  <p className="mt-2 text-sm font-bold text-emerald-300">
                    Restored from browser storage.
                  </p>
                )}
              </div>
            )}

            {(localVideoURL || localAudioURL) && (
              <button
                onClick={handleClearLocalMedia}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Clear Local Media
              </button>
            )}
          </div>
        </GlassPanel>
      );
    }

    if (activeTool === "canvas") {
      return (
        <GlassPanel title="Canvas" subtitle="Choose frame, background, and crop.">
          <div className="space-y-6">
            <div>
              <label className="text-sm font-bold text-white/55">
                Canvas format
              </label>

              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["9:16", "1:1", "16:9"] as CanvasFormat[]).map((item) => (
                  <button
                    key={item}
                    onClick={() => setCanvasFormat(item)}
                    className={`rounded-2xl px-3 py-3 text-sm font-black transition ${
                      canvasFormat === item
                        ? "bg-white text-black"
                        : "bg-white/8 text-white/60 hover:bg-white/12"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-white/55">
                Video fit
              </label>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setFitMode("contain")}
                  className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
                    fitMode === "contain"
                      ? "bg-white text-black"
                      : "bg-white/8 text-white/60 hover:bg-white/12"
                  }`}
                >
                  Fit
                </button>

                <button
                  onClick={() => setFitMode("cover")}
                  className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
                    fitMode === "cover"
                      ? "bg-white text-black"
                      : "bg-white/8 text-white/60 hover:bg-white/12"
                  }`}
                >
                  Fill
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-white/55">
                Background
              </label>

              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["blur", "black", "gradient"] as BackgroundStyle[]).map(
                  (item) => (
                    <button
                      key={item}
                      onClick={() => setBackgroundStyle(item)}
                      className={`rounded-2xl px-3 py-3 text-xs font-black capitalize transition ${
                        backgroundStyle === item
                          ? "bg-white text-black"
                          : "bg-white/8 text-white/60 hover:bg-white/12"
                      }`}
                    >
                      {item}
                    </button>
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
              label="Video X"
              value={videoX}
              min={-50}
              max={50}
              suffix="%"
              onChange={setVideoX}
            />

            <RangeControl
              label="Video Y"
              value={videoY}
              min={-50}
              max={50}
              suffix="%"
              onChange={setVideoY}
            />
          </div>
        </GlassPanel>
      );
    }

    if (activeTool === "edit") {
      return (
        <GlassPanel title="Edit" subtitle="Trim, rotate, speed, and transitions.">
          <div className="space-y-6">
            <button
              onClick={handlePlayTrimPreview}
              disabled={!localVideoURL}
              className="w-full rounded-2xl bg-white px-5 py-3 font-black text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Preview Trim
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
              className={`w-full rounded-2xl px-5 py-3 font-black transition ${
                flipX
                  ? "bg-white text-black"
                  : "border border-white/10 bg-white/5 text-white/65 hover:bg-white/10"
              }`}
            >
              {flipX ? "Flip Enabled" : "Flip Horizontal"}
            </button>

            <div>
              <label className="text-sm font-bold text-white/55">
                Intro transition
              </label>

              <select
                value={transitionIn}
                onChange={(event) => setTransitionIn(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none"
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
              <label className="text-sm font-bold text-white/55">
                Outro transition
              </label>

              <select
                value={transitionOut}
                onChange={(event) => setTransitionOut(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none"
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
        </GlassPanel>
      );
    }

    if (activeTool === "text") {
      return (
        <GlassPanel title="Text" subtitle="Design title and hook text.">
          <div className="space-y-5">
            <textarea
              value={overlayText}
              onChange={(event) => setOverlayText(event.target.value)}
              placeholder="Enter overlay text"
              className="min-h-28 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-white/35 transition focus:border-cyan-300/60"
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
              label="Text size"
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
              <label className="text-sm font-bold text-white/55">Color</label>

              <input
                type="color"
                value={overlayColor}
                onChange={(event) => setOverlayColor(event.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 p-2"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setOverlayBg(!overlayBg)}
                className={`rounded-2xl px-3 py-3 text-xs font-black transition ${
                  overlayBg
                    ? "bg-white text-black"
                    : "bg-white/8 text-white/60 hover:bg-white/12"
                }`}
              >
                BG
              </button>

              <button
                onClick={() => setOverlayUppercase(!overlayUppercase)}
                className={`rounded-2xl px-3 py-3 text-xs font-black transition ${
                  overlayUppercase
                    ? "bg-white text-black"
                    : "bg-white/8 text-white/60 hover:bg-white/12"
                }`}
              >
                CAPS
              </button>

              <button
                onClick={() => setOverlayShadow(!overlayShadow)}
                className={`rounded-2xl px-3 py-3 text-xs font-black transition ${
                  overlayShadow
                    ? "bg-white text-black"
                    : "bg-white/8 text-white/60 hover:bg-white/12"
                }`}
              >
                SHADOW
              </button>
            </div>
          </div>
        </GlassPanel>
      );
    }

    if (activeTool === "audio") {
      return (
        <GlassPanel title="Audio" subtitle="Control original and music volume.">
          <div className="space-y-6">
            <RangeControl
              label="Original video volume"
              value={videoVolume}
              min={0}
              max={100}
              suffix="%"
              onChange={setVideoVolume}
            />

            <button
              onClick={() => setMutedOriginal(!mutedOriginal)}
              className={`w-full rounded-2xl px-5 py-3 font-black transition ${
                mutedOriginal
                  ? "bg-white text-black"
                  : "border border-white/10 bg-white/5 text-white/65 hover:bg-white/10"
              }`}
            >
              {mutedOriginal ? "Original Muted" : "Mute Original Audio"}
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
              <audio ref={audioRef} src={localAudioURL} controls className="w-full" />
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/45">
                Add music from the Media tab.
              </div>
            )}
          </div>
        </GlassPanel>
      );
    }

    if (activeTool === "effects") {
      return (
        <GlassPanel title="Effects" subtitle="Apply presets or tune manually.">
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
                  className="rounded-2xl border border-white/10 bg-white/8 px-3 py-3 text-sm font-black text-white/68 transition hover:bg-white hover:text-black"
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
        </GlassPanel>
      );
    }

    if (activeTool === "export") {
      return (
        <GlassPanel
          title="Export"
          subtitle="Export options are ready. FFmpeg will be connected next."
        >
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-purple-300">
                Output
              </p>

              <p className="mt-3 text-3xl font-black">
                {output.width} × {output.height}
              </p>

              <p className="mt-1 text-sm text-white/50">
                {canvasFormat} · {exportResolution} · {exportFps} FPS
              </p>
            </div>

            <div>
              <label className="text-sm font-bold text-white/55">
                Video format
              </label>

              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["mp4", "webm"] as VideoFormat[]).map((item) => (
                  <button
                    key={item}
                    onClick={() => setExportFormat(item)}
                    className={`rounded-2xl px-4 py-3 text-sm font-black uppercase transition ${
                      exportFormat === item
                        ? "bg-white text-black"
                        : "bg-white/8 text-white/60 hover:bg-white/12"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-white/55">
                Resolution
              </label>

              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["720p", "1080p", "2k"] as ExportResolution[]).map(
                  (item) => (
                    <button
                      key={item}
                      onClick={() => setExportResolution(item)}
                      className={`rounded-2xl px-3 py-3 text-xs font-black uppercase transition ${
                        exportResolution === item
                          ? "bg-white text-black"
                          : "bg-white/8 text-white/60 hover:bg-white/12"
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-white/55">FPS</label>

              <div className="mt-2 grid grid-cols-3 gap-2">
                {([24, 30, 60] as ExportFps[]).map((item) => (
                  <button
                    key={item}
                    onClick={() => setExportFps(item)}
                    className={`rounded-2xl px-3 py-3 text-xs font-black transition ${
                      exportFps === item
                        ? "bg-white text-black"
                        : "bg-white/8 text-white/60 hover:bg-white/12"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-white/55">
                Quality
              </label>

              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["standard", "high", "max"] as ExportQuality[]).map(
                  (item) => (
                    <button
                      key={item}
                      onClick={() => setExportQuality(item)}
                      className={`rounded-2xl px-3 py-3 text-xs font-black capitalize transition ${
                        exportQuality === item
                          ? "bg-white text-black"
                          : "bg-white/8 text-white/60 hover:bg-white/12"
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-white/55">
                Extract audio format
              </label>

              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["mp3", "wav"] as AudioFormat[]).map((item) => (
                  <button
                    key={item}
                    onClick={() => setAudioFormat(item)}
                    className={`rounded-2xl px-4 py-3 text-sm font-black uppercase transition ${
                      audioFormat === item
                        ? "bg-white text-black"
                        : "bg-white/8 text-white/60 hover:bg-white/12"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleExportNotReady}
              className="w-full rounded-2xl bg-white px-5 py-3 font-black text-black transition hover:bg-amber-200"
            >
              Export Video Next
            </button>

            <button
              onClick={handleExportNotReady}
              className="w-full rounded-2xl border border-white/10 bg-white/8 px-5 py-3 font-black text-white transition hover:bg-white hover:text-black"
            >
              Extract Audio Next
            </button>

            <p className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100/80">
              These export settings are saved now. Actual MP4, WebM, MP3, and
              WAV generation will be enabled after FFmpeg integration.
            </p>
          </div>
        </GlassPanel>
      );
    }

    return (
      <GlassPanel title="Project" subtitle="Save your editor and export settings.">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-bold text-white/55">
              Project title
            </label>

            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none transition focus:border-cyan-300/60"
            />
          </div>

          <div>
            <label className="text-sm font-bold text-white/55">Status</label>

            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none transition focus:border-cyan-300/60"
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
            className="w-full rounded-2xl bg-white px-5 py-3 font-black text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Editor"}
          </button>

          <button
            onClick={() => setActiveTool("export")}
            className="w-full rounded-2xl border border-white/10 bg-white/8 px-5 py-3 font-black text-white transition hover:bg-white hover:text-black"
          >
            Open Export Settings
          </button>

          <button
            onClick={handleDelete}
            className="w-full rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-3 font-black text-red-200 transition hover:bg-red-500/20"
          >
            Delete Project
          </button>
        </div>
      </GlassPanel>
    );
  };

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05030a] text-white">
        <p className="text-lg text-white/70">Opening editor...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05030a] px-6 text-white">
        <div className="max-w-md rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center">
          <h1 className="text-3xl font-black">Sign in required</h1>

          <p className="mt-4 text-white/60">
            Please sign in with Google to open your editor.
          </p>

          <button
            onClick={handleLogin}
            className="mt-8 rounded-full bg-white px-6 py-3 font-black text-black transition hover:bg-amber-200"
          >
            Sign in with Google
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
            className="mt-8 inline-flex rounded-full bg-white px-6 py-3 font-black text-black transition hover:bg-amber-200"
          >
            Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#251143_0,#05030a_34%,#030207_100%)] text-white">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#05030a]/78 px-4 py-3 backdrop-blur-2xl sm:px-6">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-400 via-fuchsia-400 to-amber-300 font-black text-black shadow-lg shadow-purple-500/20">
              L
            </div>

            <div className="min-w-0">
              <p className="truncate text-base font-black leading-none">
                {title || "Lumeo Editor"}
              </p>
              <p className="mt-1 hidden text-xs text-white/45 sm:block">
                Premium short video workspace
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="hidden rounded-full bg-white px-5 py-2 text-sm font-black text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60 sm:inline-flex"
            >
              {saving ? "Saving..." : "Save"}
            </button>

            <Link
              href="/dashboard"
              className="hidden rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/65 transition hover:bg-white/10 hover:text-white md:inline-flex"
            >
              Dashboard
            </Link>

            <button
              onClick={handleLogout}
              className="rounded-full bg-white px-5 py-2 text-sm font-black text-black transition hover:bg-amber-200"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-[1800px] px-4 py-4 sm:px-6">
        <div className="mb-4 flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20 backdrop-blur-2xl sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <Link
              href="/dashboard"
              className="text-sm font-bold text-white/45 transition hover:text-white"
            >
              ← Back to Dashboard
            </Link>

            <h1 className="mt-3 truncate text-3xl font-black tracking-tight sm:text-4xl">
              {project.title}
            </h1>

            <p className="mt-2 text-sm text-white/52">
              {canvasFormat} · {exportResolution} export ·{" "}
              {exportFormat.toUpperCase()} · {output.width}×{output.height}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/65">
              {project.type}
            </span>

            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">
              {status}
            </span>

            {localVideoURL && (
              <span className="rounded-full border border-purple-400/20 bg-purple-400/10 px-4 py-2 text-sm font-bold text-purple-200">
                {videoRestored ? "Video restored" : "Video selected"}
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[86px_minmax(360px,1fr)_390px] lg:h-[calc(100vh-178px)]">
          <aside className="hidden rounded-[2rem] border border-white/10 bg-white/[0.045] p-3 shadow-2xl shadow-black/20 backdrop-blur-2xl lg:flex lg:flex-col lg:gap-3 lg:overflow-y-auto">
            {tools.map((tool) => (
              <ToolButton
                key={tool.key}
                icon={tool.icon}
                label={tool.label}
                active={activeTool === tool.key}
                onClick={() => setActiveTool(tool.key)}
              />
            ))}
          </aside>

          <div className="flex min-h-0 flex-col gap-4">
            <div className="flex gap-2 overflow-x-auto rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-2 backdrop-blur-2xl lg:hidden">
              {tools.map((tool) => (
                <button
                  key={tool.key}
                  onClick={() => setActiveTool(tool.key)}
                  className={`shrink-0 rounded-2xl px-4 py-3 text-sm font-black transition ${
                    activeTool === tool.key
                      ? "bg-white text-black"
                      : "bg-white/6 text-white/60"
                  }`}
                >
                  {tool.icon} {tool.label}
                </button>
              ))}
            </div>

            <div className="relative flex min-h-[620px] flex-1 items-center justify-center overflow-hidden rounded-[2rem] border border-white/10 bg-black/30 p-4 shadow-2xl shadow-black/30 backdrop-blur-2xl lg:min-h-0">
              {localVideoURL && backgroundStyle === "blur" && (
                <video
                  src={localVideoURL}
                  muted
                  className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-2xl"
                  style={{ filter: videoFilter }}
                />
              )}

              {backgroundStyle === "gradient" && (
                <div className="absolute inset-0 bg-gradient-to-br from-purple-700/30 via-black to-amber-400/20" />
              )}

              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,rgba(0,0,0,0.45)_65%,rgba(0,0,0,0.8)_100%)]" />

              <div className={`relative z-10 max-w-full ${canvasFrameClass}`}>
                <div className="absolute -inset-4 rounded-[2.75rem] bg-gradient-to-br from-purple-500/25 via-transparent to-amber-300/20 blur-2xl" />

                <div className="relative h-full w-full overflow-hidden rounded-[2.15rem] border border-white/10 bg-black shadow-2xl shadow-black">
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
                      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-white/10 bg-white/10 text-3xl shadow-xl">
                        ▶
                      </div>

                      <p className="text-2xl font-black">Add your video</p>

                      <p className="mt-3 max-w-xs text-sm leading-6 text-white/45">
                        Select a local video from the Media tab and start
                        shaping your short edit.
                      </p>

                      <button
                        onClick={() => setActiveTool("media")}
                        className="mt-6 rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-amber-200"
                      >
                        Open Media
                      </button>
                    </div>
                  )}

                  {localVideoURL && overlayText && (
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
                      {overlayText}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20 backdrop-blur-2xl">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.2em] text-white/35">
                      Timeline
                    </p>

                    <p className="mt-1 text-sm text-white/55">
                      Clean trim preview from {trimStart}s to{" "}
                      {trimEnd || videoDuration}s
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      onClick={handlePlayTrimPreview}
                      disabled={!localVideoURL}
                      className="rounded-2xl bg-white px-6 py-3 font-black text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Preview
                    </button>

                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="rounded-2xl border border-white/10 bg-white/8 px-6 py-3 font-black text-white transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[120px_1fr_120px] lg:items-center">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-[0.16em] text-white/35">
                      Start
                    </label>

                    <input
                      type="number"
                      min={0}
                      value={trimStart}
                      onChange={(event) =>
                        setTrimStart(Number(event.target.value))
                      }
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none transition focus:border-cyan-300/60"
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="mb-2 flex items-center justify-between text-xs font-bold text-white/45">
                      <span>0s</span>
                      <span>{videoDuration || 0}s</span>
                    </div>

                    <div className="relative h-4 overflow-hidden rounded-full border border-white/10 bg-black/40">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-purple-400 via-cyan-300 to-amber-200"
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
                        className="absolute top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-white shadow-lg"
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
                        className="absolute top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-white shadow-lg"
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

                    <div className="mt-3 flex items-center justify-between text-xs text-white/35">
                      <span>Selected range</span>
                      <span>
                        {Math.max(
                          0,
                          (trimEnd || videoDuration || 0) - trimStart
                        )}
                        s
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-[0.16em] text-white/35">
                      End
                    </label>

                    <input
                      type="number"
                      min={0}
                      value={trimEnd}
                      onChange={(event) =>
                        setTrimEnd(Number(event.target.value))
                      }
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none transition focus:border-cyan-300/60"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="min-h-0 overflow-y-auto rounded-[2rem] lg:pr-1">
            {renderInspector()}
          </aside>
        </div>
      </section>
    </main>
  );
}