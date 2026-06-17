"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
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

export default function ProjectDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const videoRef = useRef<HTMLVideoElement | null>(null);

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

  const [localAudioURL, setLocalAudioURL] = useState("");
  const [localAudioName, setLocalAudioName] = useState("");

  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  const [overlayText, setOverlayText] = useState("Your title here");
  const [overlayX, setOverlayX] = useState(50);
  const [overlayY, setOverlayY] = useState(45);
  const [overlaySize, setOverlaySize] = useState(34);
  const [overlayColor, setOverlayColor] = useState("#ffffff");

  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [grayscale, setGrayscale] = useState(0);
  const [blur, setBlur] = useState(0);

  const videoFilter = `brightness(${brightness}%) contrast(${contrast}%) grayscale(${grayscale}%) blur(${blur}px)`;

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

            setTrimStart(editor.trimStart ?? timeline.trimStart ?? 0);
            setTrimEnd(editor.trimEnd ?? timeline.trimEnd ?? 0);
            setVideoDuration(editor.videoDuration ?? timeline.videoDuration ?? 0);

            setOverlayText(editor.textOverlay?.text || "Your title here");
            setOverlayX(editor.textOverlay?.x ?? 50);
            setOverlayY(editor.textOverlay?.y ?? 45);
            setOverlaySize(editor.textOverlay?.size ?? 34);
            setOverlayColor(editor.textOverlay?.color || "#ffffff");

            setBrightness(editor.effects?.brightness ?? 100);
            setContrast(editor.effects?.contrast ?? 100);
            setGrayscale(editor.effects?.grayscale ?? 0);
            setBlur(editor.effects?.blur ?? 0);
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

  const handleVideoSelect = (event: ChangeEvent<HTMLInputElement>) => {
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
  };

  const handleAudioSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("audio/")) {
      alert("Please select an audio/music file");
      return;
    }

    const url = URL.createObjectURL(file);

    setLocalAudioURL(url);
    setLocalAudioName(file.name);
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
          mode: "shorts-editor",
          trimStart: Number(trimStart) || 0,
          trimEnd: Number(trimEnd) || 0,
          videoDuration: Number(videoDuration) || 0,
          localVideoName:
            localVideoName || project?.editor?.localVideoName || "",
          localAudioName:
            localAudioName || project?.editor?.localAudioName || "",
          textOverlay: {
            text: overlayText,
            x: Number(overlayX) || 50,
            y: Number(overlayY) || 45,
            size: Number(overlaySize) || 34,
            color: overlayColor || "#ffffff",
          },
          effects: {
            brightness: Number(brightness) || 100,
            contrast: Number(contrast) || 100,
            grayscale: Number(grayscale) || 0,
            blur: Number(blur) || 0,
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
      router.push("/dashboard");
    } catch (error: any) {
      alert(error.message);
    }
  };

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05030a] text-white">
        <p className="text-lg text-white/70">Checking login...</p>
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
            className="mt-8 rounded-full bg-white px-6 py-3 font-bold text-black transition hover:bg-amber-200"
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
            className="mt-8 inline-flex rounded-full bg-white px-6 py-3 font-bold text-black transition hover:bg-amber-200"
          >
            Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#05030a] px-6 py-8 text-white sm:px-10 lg:px-16">
      <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-xl">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-amber-300 font-bold text-black">
            L
          </div>
          <span className="text-xl font-bold tracking-tight">Lumeo</span>
        </Link>

        <button
          onClick={handleLogout}
          className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-200"
        >
          Sign out
        </button>
      </nav>

      <section className="mx-auto max-w-7xl py-16">
        <Link
          href="/dashboard"
          className="text-sm text-white/50 hover:text-white"
        >
          ← Back to Dashboard
        </Link>

        <div className="mt-6 rounded-[2.5rem] border border-white/10 bg-white/[0.04] p-8 sm:p-12">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-purple-300">
            Shorts Editor
          </p>

          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            {project.title}
          </h1>

          <p className="mt-4 text-lg text-white/60">
            30 sec to 3 min short-format editor · {project.type}
          </p>

          <div className="mt-10 grid gap-6 xl:grid-cols-[0.85fr_1.15fr_0.75fr]">
            <div className="space-y-5">
              <div className="rounded-3xl border border-white/10 bg-black/25 p-6">
                <h2 className="text-2xl font-bold">Media</h2>

                <p className="mt-3 text-white/55">
                  Select local video and music. Files are not uploaded.
                </p>

                <label className="mt-6 block text-sm text-white/50">
                  Select video
                </label>

                <input
                  type="file"
                  accept="video/*"
                  onChange={handleVideoSelect}
                  className="mt-2 block w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-white file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:font-bold file:text-black"
                />

                {localVideoName && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                    <p>Video: {localVideoName}</p>
                    <p>Size: {localVideoSize}</p>
                    <p>Duration: {videoDuration}s</p>
                  </div>
                )}

                <label className="mt-6 block text-sm text-white/50">
                  Select music/audio
                </label>

                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioSelect}
                  className="mt-2 block w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-white file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:font-bold file:text-black"
                />

                {localAudioURL && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="mb-3 text-sm text-white/60">
                      Music: {localAudioName}
                    </p>

                    <audio
                      src={localAudioURL}
                      controls
                      className="w-full"
                    />
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/25 p-6">
                <h2 className="text-2xl font-bold">Trim Controls</h2>

                <div className="mt-6 grid gap-4">
                  <div>
                    <label className="text-sm text-white/50">
                      Trim start seconds
                    </label>

                    <input
                      type="number"
                      min={0}
                      value={trimStart}
                      onChange={(event) =>
                        setTrimStart(Number(event.target.value))
                      }
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-white/50">
                      Trim end seconds
                    </label>

                    <input
                      type="number"
                      min={0}
                      value={trimEnd}
                      onChange={(event) =>
                        setTrimEnd(Number(event.target.value))
                      }
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-white outline-none"
                    />
                  </div>

                  <button
                    onClick={handlePlayTrimPreview}
                    disabled={!localVideoURL}
                    className="rounded-2xl bg-white px-6 py-3 font-bold text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Preview Trim
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/25 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">9:16 Preview</h2>
                  <p className="mt-2 text-white/55">
                    Reel / Shorts vertical preview.
                  </p>
                </div>

                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60">
                  9:16
                </span>
              </div>

              <div className="mx-auto mt-6 flex max-w-[380px] justify-center">
                <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl">
                  {localVideoURL ? (
                    <video
                      ref={videoRef}
                      src={localVideoURL}
                      controls
                      onLoadedMetadata={handleLoadedMetadata}
                      onTimeUpdate={handleVideoTimeUpdate}
                      className="h-full w-full object-cover"
                      style={{ filter: videoFilter }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-8 text-center text-white/40">
                      Select a video to start editing.
                    </div>
                  )}

                  {overlayText && (
                    <div
                      className="pointer-events-none absolute max-w-[85%] text-center font-black leading-tight"
                      style={{
                        left: `${overlayX}%`,
                        top: `${overlayY}%`,
                        transform: "translate(-50%, -50%)",
                        fontSize: `${overlaySize}px`,
                        color: overlayColor,
                        textShadow:
                          "0 4px 20px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.9)",
                      }}
                    >
                      {overlayText}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/55">
                <p>
                  Note: This editor currently previews local media only. The video
                  is not uploaded, so it will need to be selected again after refresh.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-3xl border border-white/10 bg-black/25 p-6">
                <h2 className="text-2xl font-bold">Text Overlay</h2>

                <div className="mt-6 space-y-4">
                  <div>
                    <label className="text-sm text-white/50">Text</label>

                    <textarea
                      value={overlayText}
                      onChange={(event) => setOverlayText(event.target.value)}
                      placeholder="Enter overlay text"
                      className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-white outline-none placeholder:text-white/35"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-white/50">
                      Horizontal position: {overlayX}%
                    </label>

                    <input
                      type="range"
                      min={5}
                      max={95}
                      value={overlayX}
                      onChange={(event) =>
                        setOverlayX(Number(event.target.value))
                      }
                      className="mt-2 w-full"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-white/50">
                      Vertical position: {overlayY}%
                    </label>

                    <input
                      type="range"
                      min={5}
                      max={95}
                      value={overlayY}
                      onChange={(event) =>
                        setOverlayY(Number(event.target.value))
                      }
                      className="mt-2 w-full"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-white/50">
                      Text size: {overlaySize}px
                    </label>

                    <input
                      type="range"
                      min={18}
                      max={72}
                      value={overlaySize}
                      onChange={(event) =>
                        setOverlaySize(Number(event.target.value))
                      }
                      className="mt-2 w-full"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-white/50">Text color</label>

                    <input
                      type="color"
                      value={overlayColor}
                      onChange={(event) => setOverlayColor(event.target.value)}
                      className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 p-2"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/25 p-6">
                <h2 className="text-2xl font-bold">Effects</h2>

                <div className="mt-6 space-y-5">
                  <div>
                    <label className="text-sm text-white/50">
                      Brightness: {brightness}%
                    </label>

                    <input
                      type="range"
                      min={50}
                      max={150}
                      value={brightness}
                      onChange={(event) =>
                        setBrightness(Number(event.target.value))
                      }
                      className="mt-2 w-full"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-white/50">
                      Contrast: {contrast}%
                    </label>

                    <input
                      type="range"
                      min={50}
                      max={180}
                      value={contrast}
                      onChange={(event) =>
                        setContrast(Number(event.target.value))
                      }
                      className="mt-2 w-full"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-white/50">
                      Grayscale: {grayscale}%
                    </label>

                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={grayscale}
                      onChange={(event) =>
                        setGrayscale(Number(event.target.value))
                      }
                      className="mt-2 w-full"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-white/50">
                      Blur: {blur}px
                    </label>

                    <input
                      type="range"
                      min={0}
                      max={8}
                      value={blur}
                      onChange={(event) => setBlur(Number(event.target.value))}
                      className="mt-2 w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/25 p-6">
                <h2 className="text-2xl font-bold">Project Settings</h2>

                <div className="mt-6 space-y-4">
                  <div>
                    <label className="text-sm text-white/50">
                      Project title
                    </label>

                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-white/50">Status</label>

                    <select
                      value={status}
                      onChange={(event) => setStatus(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-white outline-none"
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
                    className="w-full rounded-2xl bg-white px-6 py-4 font-bold text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Saving..." : "Save Editor Settings"}
                  </button>

                  <button
                    disabled
                    className="w-full cursor-not-allowed rounded-2xl border border-white/10 bg-white/5 px-6 py-4 font-bold text-white/35"
                  >
                    Export MP4 Coming Next
                  </button>

                  <button
                    onClick={handleDelete}
                    className="w-full rounded-2xl border border-red-400/30 bg-red-500/10 px-6 py-4 font-bold text-red-200 transition hover:bg-red-500/20"
                  >
                    Delete Project
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}