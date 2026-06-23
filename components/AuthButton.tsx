"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { saveUserProfile } from "@/lib/userProfile";

export default function AuthButton() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        await saveUserProfile(currentUser);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      await saveUserProfile(result.user);
      router.push("/dashboard");
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/");
    } catch (error: any) {
      alert(error.message);
      console.log(error);
    }
  };

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/dashboard")}
          className="rounded-full bg-[#F3E7C8] px-5 py-2 text-sm font-semibold text-[#111018] transition hover:bg-white"
        >
          Studio
        </button>

        <button
          onClick={handleLogout}
          className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleLogin}
      disabled={loading}
      className="rounded-full bg-[#F3E7C8] px-5 py-2 text-sm font-semibold text-[#111018] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? "Opening..." : "Sign in"}
    </button>
  );
}