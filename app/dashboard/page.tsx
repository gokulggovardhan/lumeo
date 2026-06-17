"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setChecking(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
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

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-black/25 p-6">
              <h2 className="text-2xl font-bold">Projects</h2>
              <p className="mt-3 text-white/55">
                Your video and content projects will appear here.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/25 p-6">
              <h2 className="text-2xl font-bold">Uploads</h2>
              <p className="mt-3 text-white/55">
                Uploads will be added after storage setup.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/25 p-6">
              <h2 className="text-2xl font-bold">Creator Tools</h2>
              <p className="mt-3 text-white/55">
                Shorts Creator and editor tools will be added next.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}