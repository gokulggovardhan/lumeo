"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { createProject, listenToUserProjects } from "@/lib/projects";
import { saveUserProfile } from "@/lib/userProfile";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectType, setProjectType] = useState("Video Project");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let unsubscribeProjects: any;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setChecking(false);

      if (unsubscribeProjects) {
        unsubscribeProjects();
      }

      if (currentUser) {
        await saveUserProfile(currentUser);

        unsubscribeProjects = listenToUserProjects(currentUser.uid, (items) => {
          setProjects(items);
        });
      } else {
        setProjects([]);
      }
    });

    return () => {
      unsubscribeAuth();

      if (unsubscribeProjects) {
        unsubscribeProjects();
      }
    };
  }, []);

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
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleCreateProject = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!projectTitle.trim()) {
      alert("Please enter project title");
      return;
    }

    try {
      setSaving(true);
      await createProject(user, projectTitle.trim(), projectType);
      setProjectTitle("");
      setProjectType("Video Project");
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
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
          <h1 className="text-3xl font-black">Sign in to Lumeo</h1>
          <p className="mt-4 text-white/60">
            Please sign in with Google to access your creator dashboard.
          </p>

          <button
            onClick={handleLogin}
            className="mt-8 rounded-full bg-white px-6 py-3 font-bold text-black transition hover:bg-amber-200"
          >
            Sign in with Google
          </button>

          <div className="mt-6">
            <Link href="/" className="text-sm text-white/50 hover:text-white">
              Back to home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#05030a] px-6 py-8 text-white sm:px-10 lg:px-16">
      <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-3">
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
        <div className="rounded-[2.5rem] border border-white/10 bg-white/[0.04] p-8 sm:p-12">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-purple-300">
            Dashboard
          </p>

          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            Welcome to Lumeo
          </h1>

          <p className="mt-4 text-lg text-white/60">
            You are signed in as {user.email}
          </p>

          <div className="mt-10 rounded-3xl border border-white/10 bg-black/25 p-6">
            <h2 className="text-2xl font-bold">Create Project</h2>
            <p className="mt-2 text-white/55">
              Start a new creative workspace and save it to your account.
            </p>

            <form
              onSubmit={handleCreateProject}
              className="mt-6 grid gap-4 md:grid-cols-[1fr_220px_160px]"
            >
              <input
                value={projectTitle}
                onChange={(event) => setProjectTitle(event.target.value)}
                placeholder="Project title"
                className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-white outline-none placeholder:text-white/35"
              />

              <select
                value={projectType}
                onChange={(event) => setProjectType(event.target.value)}
                className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-white outline-none"
              >
                <option className="bg-black">Video Project</option>
                <option className="bg-black">Shorts Project</option>
                <option className="bg-black">Podcast Project</option>
                <option className="bg-black">Learning Project</option>
                <option className="bg-black">Developer Project</option>
              </select>

              <button
                disabled={saving}
                className="rounded-2xl bg-white px-5 py-4 font-bold text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Create"}
              </button>
            </form>
          </div>

          <div className="mt-10">
            <h2 className="text-2xl font-bold">Your Projects</h2>

            {projects.length === 0 ? (
              <div className="mt-5 rounded-3xl border border-white/10 bg-black/25 p-6 text-white/55">
                No projects yet. Create your first project above.
              </div>
            ) : (
              <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="rounded-3xl border border-white/10 bg-black/25 p-6"
                  >
                    <p className="text-sm text-purple-300">{project.type}</p>
                    <h3 className="mt-3 text-2xl font-bold">{project.title}</h3>
                    <p className="mt-3 text-white/50">Status: {project.status}</p>
                    
                    <Link
  href={`/dashboard/projects/${project.id}`}
  className="mt-5 inline-flex rounded-full bg-white px-5 py-2 text-sm font-bold text-black transition hover:bg-amber-200"
>
  Open Project
</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}