"use client";

import Image from "next/image";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase"; // ← өөрийн client Firebase init
import { useAuth } from "@/components/auth-provider";   // ← танай одоо байгаа AuthProvider

const roleToPath = (role?: string | null) => {
  switch (role) {
    case "admin":
      return "/admin";
    case "teacher":
      return "/teacher";
    case "student":
      return "/student";
    case "parent":
      return "/parent";
    default:
      return "/"; // role тодорхойгүй бол нүүр
  }
};

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  // 1) Хэрэв аль хэдийн нэвтэрсэн байвал автоматаар чиглүүлнэ
  useEffect(() => {
    if (!loading && user) {
      router.replace(roleToPath(user.role));
    }
  }, [user, loading, router]);

  // 2) Google login товч
  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      // Custom claims шинэчилж уншихын тулд токеныг дахин авах (role шууд орохын тулд)
      await result.user.getIdToken(true);
      // Redirect: AuthProvider дахин render хийгдээд дээрх useEffect ажиллана
      router.replace("/");
    } catch (err) {
      console.error("Google login error:", err);
    }
  };

  // Нэвтэрч дуусахыг хүлээж байх үед товчоо түр нуух/loader үзүүлэх
  const showLogin = useMemo(() => !loading && !user, [loading, user]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg">
      <main className="flex flex-col items-center gap-6">
        {showLogin && (
         <button
         onClick={handleGoogleLogin}
         className="group relative inline-flex items-center gap-3 rounded-xl border border-stroke bg-white/95 px-6 py-3 text-sm font-semibold text-[#3c4043] shadow-sm ring-1 ring-black/5 transition-all
                    hover:bg-white hover:shadow-md active:shadow-sm
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4285F4]
                    dark:bg-card dark:text-text dark:border-stroke dark:hover:bg-card2"
         aria-label="Google-ээр нэвтрэх"
       >
         {/* Google лого (inline SVG — өгсөн файлыг жижигрүүлж орууллаа) */}
         <span className="inline-flex h-5 w-5 items-center justify-center">
           <svg viewBox="-3 0 262 262" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" aria-hidden>
             <path d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027" fill="#4285F4"/>
             <path d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1" fill="#34A853"/>
             <path d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602л42.356-32.782" fill="#FBBC05"/>
             <path d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947л42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251" fill="#EB4335"/>
           </svg>
         </span>
       
         <span className="tracking-tight">Google-ээр нэвтрэх</span>
       
         {/* subtle pressed overlay */}
         <span className="pointer-events-none absolute inset-0 rounded-xl bg-black/0 transition group-active:bg-black/5" />
       </button>
        )}
        {!showLogin && (
          <div className="text-muted text-sm">Түр хүлээнэ үү…</div>
        )}
      </main>
    </div>
  );
}