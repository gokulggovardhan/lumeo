"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { saveUserProfile } from "@/lib/userProfile";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        await saveUserProfile(currentUser);
        router.push("/dashboard");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleLogin = async () => {
    try {
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      await saveUserProfile(result.user);
      router.push("/dashboard");
    } catch (error: any) {
      alert(error.message);
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07070A] px-6 py-12 text-[#F7F0DE]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(167,139,250,0.18),transparent_32%),radial-gradient(circle_at_78%_18%,rgba(244,114,182,0.14),transparent_30%),linear-gradient(135deg,rgba(243,231,200,0.06),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-x-8 top-8 h-px bg-gradient-to-r from-transparent via-[#F3E7C8]/35 to-transparent" />

      <section className="relative z-10 w-full max-w-md rounded-[2rem] border border-[#F3E7C8]/12 bg-[#111018]/78 p-8 text-center shadow-2xl shadow-black/40 backdrop-blur-2xl sm:p-10">
        <Link href="/" className="mx-auto flex w-max items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F3E7C8] text-base font-black text-[#111018] shadow-lg shadow-[#F3E7C8]/10">
            L
          </span>
          <span className="text-lg font-black tracking-tight">Lumeo</span>
        </Link>

        <h1 className="mt-4 text-4xl font-black tracking-tight">
          Welcome to Lumeo Studio
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[#F7F0DE]/58">
          Sign in to continue.
        </p>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="mt-8 w-full rounded-full bg-[#F3E7C8] px-6 py-3.5 text-sm font-black text-[#111018] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Opening Studio..." : "Continue with Google"}
        </button>

        <Link
          href="/"
          className="mt-8 inline-flex text-xs font-bold text-[#F3E7C8]/58 transition hover:text-[#F3E7C8]"
        >
          Return home
        </Link>
      </section>

      <footer className="absolute inset-x-0 bottom-6 px-6 text-center font-serif text-[11px] italic leading-5 text-[#F7F0DE]/34">
        <p>© 2026 Lumeo. All rights reserved.</p>
        <p>Built by Govardhan Gudapakam</p>
      </footer>
    </main>
  );
}
