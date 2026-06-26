"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { createProject, listenToUserProjects } from "@/lib/projects";
import { saveUserProfile } from "@/lib/userProfile";

export default function DashboardPage() {
  const router = useRouter();
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
      router.push("/");
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
            <Link
              href="/"
              className="inline-flex rounded-full border border-[#F3E7C8]/12 bg-white/[0.035] px-5 py-2.5 text-sm font-bold text-[#F7F0DE]/60 transition hover:border-[#F3E7C8]/30 hover:text-white"
            >
              Home
            </Link>
          </div>
        </div>

        <footer className="absolute inset-x-0 bottom-6 px-6 text-center font-serif text-[11px] italic leading-5 text-[#F7F0DE]/34">
          <p>© 2026 Lumeo. All rights reserved.</p>
          <p>Built by Govardhan Gudapakam</p>
        </footer>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07070A] px-4 py-5 text-[#F7F0DE] sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(167,139,250,0.15),transparent_34%),radial-gradient(circle_at_84%_12%,rgba(244,114,182,0.10),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(243,231,200,0.08),transparent_34%)]" />

      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between rounded-[1.5rem] border border-[#F3E7C8]/10 bg-[#111018]/74 px-4 py-3 shadow-2xl shadow-black/25 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-2xl border border-[#F3E7C8]/16 bg-[#090812] text-[#F3E7C8] shadow-lg shadow-fuchsia-500/10">
            <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(243,231,200,0.32),transparent_34%),linear-gradient(135deg,rgba(217,70,239,0.28),rgba(34,211,238,0.14))]" />
            <span className="relative font-black">L</span>
          </div>
          <span className="text-lg font-black tracking-tight">Lumeo</span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="rounded-full border border-[#F3E7C8]/12 bg-white/[0.035] px-4 py-2 text-sm font-semibold text-[#F7F0DE]/65 transition hover:border-[#F3E7C8]/30 hover:text-white"
          >
            Home
          </Link>

          <button
            onClick={handleLogout}
            className="rounded-full bg-[#F3E7C8] px-4 py-2 text-sm font-bold text-[#111018] transition hover:bg-white"
          >
            Sign out
          </button>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-7xl py-8 sm:py-10">
        <div className="rounded-[2rem] border border-[#F3E7C8]/10 bg-[#111018]/70 p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-7 lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_420px] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#D8C48E]">
                Studio
              </p>

              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
                Welcome to Lumeo Studio
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-6 text-[#F7F0DE]/58 sm:text-base">
                A calm workspace for turning source clips into polished short videos.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-[#F3E7C8]/10 bg-white/[0.035] px-4 py-3 text-sm text-[#F7F0DE]/58">
              <span className="font-bold text-[#F7F0DE]/82">Signed in</span>
              <span className="mt-1 block truncate">{user.email}</span>
            </div>
          </div>

          <div className="mt-7 rounded-[1.75rem] border border-[#F3E7C8]/10 bg-black/25 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#F3E7C8]/12 bg-[#F3E7C8]/10 text-[#F3E7C8]">
                <span className="text-lg font-black">+</span>
              </div>
              <div>
                <h2 className="text-xl font-black">New Project</h2>
                <p className="mt-1 text-sm text-[#F7F0DE]/55">
                  Name it, create it, start editing.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleCreateProject}
              className="mt-5 grid gap-3 md:grid-cols-[1fr_150px]"
            >
              <input
                value={projectTitle}
                onChange={(event) => setProjectTitle(event.target.value)}
                placeholder="Project title"
                className="rounded-2xl border border-[#F3E7C8]/10 bg-white/[0.06] px-4 py-3.5 text-[#F7F0DE] outline-none placeholder:text-[#F7F0DE]/35 focus:border-[#F3E7C8]/35"
              />

              <button
                disabled={saving}
                className="rounded-2xl bg-[#F3E7C8] px-5 py-3.5 font-black text-[#111018] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Create"}
              </button>
            </form>
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-black">Your Projects</h2>
              <span className="rounded-full border border-[#F3E7C8]/10 bg-white/[0.035] px-3 py-1.5 text-xs font-bold text-[#F7F0DE]/48">
                {projects.length} {projects.length === 1 ? "project" : "projects"}
              </span>
            </div>

            {projects.length === 0 ? (
              <div className="mt-5 rounded-[1.75rem] border border-white/10 bg-black/25 p-8 text-center text-white/55">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#F3E7C8]/10 bg-[#F3E7C8]/10 text-[#F3E7C8]">
                  <span className="text-xl font-black">L</span>
                </div>
                No projects yet. Start your first project above.
              </div>
            ) : (
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="group rounded-[1.75rem] border border-[#F3E7C8]/10 bg-black/25 p-5 shadow-xl shadow-black/20 transition hover:border-[#F3E7C8]/22 hover:bg-white/[0.045]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="line-clamp-2 text-xl font-black">
                        {project.title}
                      </h3>
                      <span className="rounded-full border border-emerald-300/15 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100">
                        {project.status || "Draft"}
                      </span>
                    </div>

                    <p className="mt-4 text-sm leading-6 text-[#F7F0DE]/48">
                      Open the editor, continue your cut, and export when ready.
                    </p>

                    <Link
                      href={`/dashboard/projects/${project.id}`}
                      className="mt-5 inline-flex rounded-full bg-[#F3E7C8] px-5 py-2 text-sm font-black text-[#111018] transition hover:bg-white"
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
        <p>Built by Govardhan Gudapakam</p>
      </footer>
    </main>
  );
}
