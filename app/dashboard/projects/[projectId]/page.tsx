"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

  const [user, setUser] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [project, setProject] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("Draft");
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
            const data = {
              id: snapshot.id,
              ...snapshot.data(),
            };

            setProject(data);
            setTitle(data.title || "");
            setStatus(data.status || "Draft");
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

  const handleSave = async () => {
    if (!projectId) return;

    if (!title.trim()) {
      alert("Project title cannot be empty");
      return;
    }

    try {
      setSaving(true);

      await updateDoc(doc(db, "projects", projectId), {
        title: title.trim(),
        status,
        updatedAt: serverTimestamp(),
      });

      alert("Project updated successfully");
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
        <Link href="/dashboard" className="text-sm text-white/50 hover:text-white">
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

          <div className="mt-10 grid gap-5 lg:grid-cols-[1fr_0.8fr]">
            <div className="rounded-3xl border border-white/10 bg-black/25 p-6">
              <h2 className="text-2xl font-bold">Project Settings</h2>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="text-sm text-white/50">Project title</label>
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

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-2xl bg-white px-6 py-4 font-bold text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Saving..." : "Save Changes"}
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

            <div className="rounded-3xl border border-white/10 bg-black/25 p-6">
              <h2 className="text-2xl font-bold">Workspace</h2>
              <p className="mt-3 text-white/55">
                This is where editor tools, uploads, and project assets will appear next.
              </p>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm text-white/40">Next features</p>
                <ul className="mt-3 space-y-2 text-white/65">
                  <li>Upload files</li>
                  <li>Attach media to project</li>
                  <li>Project asset library</li>
                  <li>Editor workspace</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}