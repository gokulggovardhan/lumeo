"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { saveUserProfile } from "@/lib/userProfile";

export default function AuthButton() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        await saveUserProfile(currentUser);
      }
    });

    return () => unsubscribe();
  }, []);

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
        <Link
          href="/dashboard"
          className="rounded-full bg-[#F3E7C8] px-5 py-2 text-sm font-semibold text-[#111018] transition hover:bg-white"
        >
          Studio
        </Link>

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
    <Link
      href="/login"
      className="rounded-full bg-[#F3E7C8] px-5 py-2 text-sm font-semibold text-[#111018] transition hover:bg-white"
    >
      Sign in
    </Link>
  );
}
