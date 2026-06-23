"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { saveUserProfile } from "@/lib/userProfile";

function MiniSpinner({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`h-3.5 w-3.5 animate-spin rounded-full border-2 ${
        dark
          ? "border-[#111018]/25 border-t-[#111018]"
          : "border-white/25 border-t-white"
      }`}
      aria-hidden="true"
    />
  );
}

export default function AuthButton() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        await saveUserProfile(currentUser);
      }
    });

    return () => unsubscribe();
  }, []);

  const showTemporaryError = (message: string) => {
    setErrorMessage(message);

    window.setTimeout(() => {
      setErrorMessage("");
    }, 3500);
  };

  const handleLogin = async () => {
    let resetTimer: number | undefined;

    try {
      setErrorMessage("");
      setLoading(true);

      resetTimer = window.setTimeout(() => {
        setLoading(false);
      }, 15000);

      const result = await signInWithPopup(auth, googleProvider);
      await saveUserProfile(result.user);
      router.push("/dashboard");
    } catch (error: any) {
      const code = error?.code || "";

      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      ) {
        return;
      }

      console.error(error);
      showTemporaryError("Sign-in failed. Please try again.");
    } finally {
      if (resetTimer !== undefined) {
        window.clearTimeout(resetTimer);
      }

      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setErrorMessage("");
      setLoading(true);
      await signOut(auth);
      router.push("/");
    } catch (error) {
      console.error(error);
      showTemporaryError("Sign-out failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (user) {
    return (
      <div className="relative flex items-center gap-3">
        <button
          onClick={() => router.push("/dashboard")}
          disabled={loading}
          className="rounded-full bg-[#F3E7C8] px-5 py-2 text-sm font-semibold text-[#111018] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Studio
        </button>

        <button
          onClick={handleLogout}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading && <MiniSpinner />}
          {loading ? "Signing out..." : "Sign out"}
        </button>

        {errorMessage && (
          <span className="absolute right-0 top-full mt-2 w-max max-w-[240px] rounded-2xl border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs font-bold text-red-100 shadow-xl shadow-black/25 backdrop-blur-xl">
            {errorMessage}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={handleLogin}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-full bg-[#F3E7C8] px-5 py-2 text-sm font-semibold text-[#111018] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <MiniSpinner dark />}
        {loading ? "Opening..." : "Sign in"}
      </button>

      {errorMessage && (
        <span className="absolute right-0 top-full mt-2 w-max max-w-[240px] rounded-2xl border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs font-bold text-red-100 shadow-xl shadow-black/25 backdrop-blur-xl">
          {errorMessage}
        </span>
      )}
    </div>
  );
}