"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { createProject, listenToUserProjects } from "@/lib/projects";
import { saveUserProfile } from "@/lib/userProfile";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectTitle, setProjectTitle] = useState("");
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
      await createProject(user, projectTitle.trim(), "Video Project");
      setProjectTitle("");
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05030a] text-white">
        <p className="text-lg text-[#F7F0DE]/70">Opening Studio...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07070A] px-6 text-[#F7F0DE]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_12%,rgba(167,139,250,0.16),transparent_34%),radial-gradient(circle_at_75%_0%,rgba(244,114,182,0.11),transparent_32%)]" />

        <div className="relative z-10 max-w-md rounded-[2rem] border border-[#F3E7C8]/12 bg-[#111018]/78 p-8 text-center shadow-2xl shadow-black/40 backdrop-blur-2xl">
          <h1 className="text-3xl font-black">Welcome to Lumeo Studio</h1>
          <p className="mt-4 text-[#F7F0DE]/60">
            Sign in to open your private creative workspace.
          </p>

          <Link
            href="/login"
            className="mt-8 inline-flex rounded-full bg-[#F3E7C8] px-6 py-3 font-bold text-[#111018] transition hover:bg-white"
          >
            Continue to Sign In
          </Link>

          <div className="mt-6">
            <Link href="/" className="text-sm text-[#F7F0DE]/50 hover:text-[#F7F0DE]">
              Back to home
            </Link>
          </div>
        </div>

        <footer className="absolute inset-x-0 bottom-6 px-6 text-center font-serif text-[11px] italic leading-5 text-[#F7F0DE]/34">
          <p>© 2026 Lumeo. All rights reserved.</p>
          <p>Developed by Govardhan Gudapakam</p>
        </footer>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07070A] px-6 py-8 text-[#F7F0DE] sm:px-10 lg:px-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(167,139,250,0.15),transparent_34%),radial-gradient(circle_at_84%_12%,rgba(244,114,182,0.10),transparent_30%)]" />

      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between rounded-3xl border border-[#F3E7C8]/10 bg-[#111018]/72 px-5 py-4 shadow-2xl shadow-black/25 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F3E7C8] font-bold text-[#111018]">
            L
          </div>
          <span className="text-xl font-bold tracking-tight">Lumeo</span>
        </Link>

        <button
          onClick={handleLogout}
          className="rounded-full bg-[#F3E7C8] px-5 py-2 text-sm font-semibold text-[#111018] transition hover:bg-white"
        >
          Sign out
        </button>
      </nav>

      <section className="relative z-10 mx-auto max-w-7xl py-16">
        <div className="rounded-[2.5rem] border border-[#F3E7C8]/10 bg-[#111018]/70 p-8 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-12">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-[#D8C48E]">
            Studio
          </p>

          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            Welcome to Lumeo Studio
          </h1>

          <p className="mt-4 text-lg text-[#F7F0DE]/60">
            You are signed in as {user.email}
          </p>

          <div className="mt-10 rounded-3xl border border-[#F3E7C8]/10 bg-black/25 p-6">
            <h2 className="text-2xl font-bold">New Project</h2>
            <p className="mt-2 text-[#F7F0DE]/55">
              Start a new creative workspace and save it to your account.
            </p>

            <form
              onSubmit={handleCreateProject}
              className="mt-6 grid gap-4 md:grid-cols-[1fr_160px]"
            >
              <input
                value={projectTitle}
                onChange={(event) => setProjectTitle(event.target.value)}
                placeholder="Project title"
                className="rounded-2xl border border-[#F3E7C8]/10 bg-white/[0.06] px-5 py-4 text-[#F7F0DE] outline-none placeholder:text-[#F7F0DE]/35 focus:border-[#F3E7C8]/35"
              />

              <button
                disabled={saving}
                className="rounded-2xl bg-[#F3E7C8] px-5 py-4 font-bold text-[#111018] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Create"}
              </button>
            </form>
          </div>

          <div className="mt-10">
            <h2 className="text-2xl font-bold">Your Projects</h2>

            {projects.length === 0 ? (
              <div className="mt-5 rounded-3xl border border-white/10 bg-black/25 p-6 text-white/55">
                No projects yet. Start your first project above.
              </div>
            ) : (
              <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="rounded-3xl border border-[#F3E7C8]/10 bg-black/25 p-6 shadow-xl shadow-black/20"
                  >
                    <h3 className="text-2xl font-bold">{project.title}</h3>
                    <p className="mt-3 text-[#F7F0DE]/50">Status: {project.status}</p>
                    
                    <Link
  href={`/dashboard/projects/${project.id}`}
  className="mt-5 inline-flex rounded-full bg-[#F3E7C8] px-5 py-2 text-sm font-bold text-[#111018] transition hover:bg-white"
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

      <footer className="relative z-10 mx-auto max-w-7xl pb-8 text-center font-serif text-[11px] italic leading-5 text-[#F7F0DE]/34 sm:text-right">
        <p>© 2026 Lumeo. All rights reserved.</p>
        <p>Developed by Govardhan Gudapakam</p>
      </footer>
    </main>
  );
}
