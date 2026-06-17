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
  const [script, setScript] = useState("");
  const [notes, setNotes] = useState("");

  const [localVideoURL, setLocalVideoURL] = useState("");
  const [localVideoName, setLocalVideoName] = useState("");
  const [localVideoSize, setLocalVideoSize] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);

  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  const [saving, setSaving] = useState(false);

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

            setProject(data);
            setTitle(data.title || "");
            setStatus(data.status || "Draft");
            setScript(data.script || "");
            setNotes(data.notes || "");
            setTrimStart(data.timeline?.trimStart || 0);
            setTrimEnd(data.timeline?.trimEnd || 0);
            setVideoDuration(data.timeline?.videoDuration || 0);
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

  const handleLoadedMetadata = () => {
    const duration = videoRef.current?.duration || 0;
    const roundedDuration = Math.floor(duration);

    setVideoDuration(roundedDuration);

    if (!trimEnd || trimEnd === 0) {
      setTrimEnd(roundedDuration);
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
        script,
        notes,
        timeline: {
          trimStart: Number(trimStart) || 0,
          trimEnd: Number(trimEnd) || 0,
          videoDuration: Number(videoDuration) || 0,
          localVideoName:
            localVideoName || project?.timeline?.localVideoName || "",
        },
        updatedAt: serverTimestamp(),
      });

      alert("Project saved successfully");
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
            Please sign in with Google to open your project.
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
            Project Workspace
          </p>

          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            {project.title}
          </h1>

          <p className="mt-4 text-lg text-white/60">
            Type: {project.type} · Status: {project.status}
          </p>

          <div className="mt-10 grid gap-5 xl:grid-cols-[1fr_0.8fr]">
            <div className="space-y-5">
              <div className="rounded-3xl border border-white/10 bg-black/25 p-6">
                <h2 className="text-2xl font-bold">Local Video Preview</h2>

                <p className="mt-3 text-white/55">
                  Select a video from your laptop. The video stays in your
                  browser and is not uploaded.
                </p>

                <input
                  type="file"
                  accept="video/*"
                  onChange={handleVideoSelect}
                  className="mt-6 block w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-white file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:font-bold file:text-black"
                />

                {localVideoURL ? (
                  <div className="mt-6">
                    <video
                      ref={videoRef}
                      src={localVideoURL}
                      controls
                      onLoadedMetadata={handleLoadedMetadata}
                      className="w-full rounded-3xl border border-white/10 bg-black"
                    />

                    <div className="mt-4 grid gap-3 text-sm text-white/60 sm:grid-cols-3">
                      <p>File: {localVideoName}</p>
                      <p>Size: {localVideoSize}</p>
                      <p>Duration: {videoDuration}s</p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center text-white/45">
                    No local video selected.
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/25 p-6">
                <h2 className="text-2xl font-bold">Timeline Settings</h2>

                <p className="mt-3 text-white/55">
                  Save trim start and end time to Firestore.
                </p>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm text-white/50">
                      Trim start seconds
                    </label>

                    <input
                      type="number"
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
                      value={trimEnd}
                      onChange={(event) =>
                        setTrimEnd(Number(event.target.value))
                      }
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-white outline-none"
                    />
                  </div>
                </div>

                <button
                  onClick={handlePlayTrimPreview}
                  disabled={!localVideoURL}
                  className="mt-5 rounded-2xl bg-white px-6 py-3 font-bold text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Preview From Trim Start
                </button>
              </div>
            </div>

            <div className="space-y-5">
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
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/25 p-6">
                <h2 className="text-2xl font-bold">Script</h2>

                <textarea
                  value={script}
                  onChange={(event) => setScript(event.target.value)}
                  placeholder="Write your video script here..."
                  className="mt-5 min-h-52 w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-white outline-none placeholder:text-white/35"
                />
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/25 p-6">
                <h2 className="text-2xl font-bold">Notes</h2>

                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Add project notes, ideas, captions, scenes..."
                  className="mt-5 min-h-40 w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-white outline-none placeholder:text-white/35"
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-2xl bg-white px-6 py-4 font-bold text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Project"}
                </button>

                <button
                  onClick={handleDelete}
                  className="rounded-2xl border border-red-400/30 bg-red-500/10 px-6 py-4 font-bold text-red-200 transition hover:bg-red-500/20"
                >
                  Delete Project
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}