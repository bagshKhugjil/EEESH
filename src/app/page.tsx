"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useAuth } from "@/components/auth-provider";

const roleToPath = (role?: string | null) => {
  switch (role) {
    case "admin": return "/admin";
    case "teacher": return "/teacher";
    case "student": return "/student";
    case "parent": return "/parent";
    default: return "/";
  }
};

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [isInApp, setIsInApp] = useState(false);

  // ✨ copy feedback states
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Нэвтэрсэн бол чиглүүлэх (САЙЖРУУЛСАН ХЭСЭГ)
  useEffect(() => {
    // loading дууссан, user объект байгаа, мөн user-т role оноогдсон үед л чиглүүлнэ.
    if (!loading && user && user.role) {
      router.replace(roleToPath(user.role));
    }
    // Хэрэв role байхгүй бол нэвтрэх хуудсандаа үлдэнэ.
  }, [user, loading, router]);

  // In-App browser илрүүлэх
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const ua = navigator.userAgent.toLowerCase();
      const inApp =
        ua.includes("fbav") || // Facebook
        ua.includes("instagram") || // Instagram
        ua.includes("line") || // LINE
        ua.includes("wv") || // Android generic WebView
        ua.includes("okhttp"); // Android WebView
      setIsInApp(inApp);
    }
  }, []);

  // Google login
  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const token = await result.user.getIdToken();

      // Role байхгүй бол автоматаар илрүүлнэ
      const res = await fetch("/api/auth/detect-role", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.role) {
        // Custom claim тохируулсан тул token refresh хийнэ
        await result.user.getIdToken(true);
      }
      // Дээрх useEffect-ийн role шалгалт чиглүүлэх ажлыг хийнэ
    } catch (err) {
      console.error("Google login error:", err);
    }
  };

  // In-app → Линк хуулах + заавар (toast + товчны төлөвтэй)
  const copyLinkAndGuide = async () => {
    const href = typeof window !== "undefined" ? window.location.href : "/";
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(href);
      } else {
        // fallback: түр textarea
        const el = document.createElement("textarea");
        el.value = href;
        el.style.position = "fixed";
        el.style.left = "-9999px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }

      // feedback
      setCopied(true);
      setToast("Линк хуулагдлаа");
      if ("vibrate" in navigator) {
        try { (navigator as any).vibrate?.(20); } catch {}
      }
      window.setTimeout(() => setCopied(false), 2000);
      window.setTimeout(() => setToast(null), 2200);
    } catch {
      setToast("Хуулах боломжгүй байна. Гар аргаар хуулаарай.");
      window.setTimeout(() => setToast(null), 2500);
    }
  };

  const showLogin = useMemo(() => !loading && !user, [loading, user]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg">
      <main className="flex flex-col items-center gap-6">
        {showLogin && !isInApp && (
          <button
            onClick={handleGoogleLogin}
            className="group relative inline-flex items-center gap-3 rounded-xl border border-stroke px-6 py-3 text-sm font-semibold shadow-sm ring-1 ring-black/5 transition-all
                       hover:shadow-md active:shadow-sm
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{ background: "var(--card)", color: "var(--text)" }}
            aria-label="Google-ээр нэвтрэх"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center">
            <svg viewBox="-3 0 262 262" xmlns="http://www.w.org/2000/svg" className="h-5 w-5" aria-hidden="true">
    <path d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027" fill="#4285F4"/>
    <path d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1" fill="#34A853"/>
    <path d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782" fill="#FBBC05"/>
    <path d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251" fill="#EB4335"/>
</svg>
            </span>
            <span className="tracking-tight">Google-ээр нэвтрэх</span>
            <span className="pointer-events-none absolute inset-0 rounded-xl bg-black/0 transition group-active:bg-black/5" />
          </button>
        )}

        {showLogin && isInApp && (
          <div className="flex flex-col items-center gap-4 text-center max-w-[420px] px-4">
            <p className="text-sm text-muted">
              Энэ аппын дотор (in-app browser) Google нэвтрэлт ажиллахгүй.
              Линкийг хуулаад системийн browser (Safari/Chrome) дээр нээн үү.
            </p>

            <button
              onClick={copyLinkAndGuide}
              className="rounded-xl font-bold px-6 py-3 transition"
              style={{
                background: copied ? "var(--card2)" : "var(--primary-bg)",
                color: copied ? "var(--text)" : "var(--primary-text)",
                border: "1px solid transparent"
              }}
            >
              {copied ? "✅ Хуулсан!" : "Линк хуулах"}
            </button>

            <div className="text-[12px] leading-5 text-muted">
              Хуулсны дараа гадны browser-оо нээгээд адресийн мөрөнд <b>paste</b> хийж оруулна.
            </div>
          </div>
        )}

        {!showLogin && !user && (
          <div className="text-muted text-sm">Түр хүлээнэ үү…</div>
        )}

        {/* 🔔 Toast */}
        <div aria-live="polite" className="pointer-events-none fixed bottom-5 left-1/2 -translate-x-1/2">
          {toast && (
            <div
              className="px-3 py-2 rounded-lg text-sm font-semibold shadow"
              style={{ background: "var(--card)", border: "1px solid var(--stroke)", color: "var(--text)" }}
            >
              {toast}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}