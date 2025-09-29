// src/components/header.tsx (img анхааруулгыг зассан, эцсийн хувилбар)

"use client";

import Link from 'next/link';
import Image from 'next/image'; // --- ЗАСВАР: Image компонент импортлох ---
import { usePathname, useRouter } from 'next/navigation';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from '@/lib/clientApp';
import { useAuth } from './auth-provider';
import { LogIn, LogOut, User as UserIcon, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

function ThemeToggle() {
    const { setTheme, resolvedTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    if (!mounted) return <div className="w-9 h-9"></div>
    return (
        <button
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="bg-card2 text-muted hover:text-text p-2.5 rounded-full transition-colors border border-stroke"
            title="Өнгө солих"
        >
            {resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
    )
}

export function Header() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter(); 
  const handleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Нэвтрэх үед алдаа гарлаа:", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.replace("/");     // ← НЭМЛЭЭ: / руу чиглүүлнэ
      router.refresh(); 
    } catch (error) {
      console.error("Гарах үед алдаа гарлаа:", error);
    }
  };

  let navLinks = [{ href: "/", label: "Нүүр" }];

  if (user?.role === 'admin') {
    navLinks = [{ href: "/admin", label: "Админ самбар" }];
  } else if (user?.role === 'teacher') {
    navLinks = [
        { href: "/teacher", label: "Нүүр" },
        { href: "/teacher/upload", label: "Дүн оруулах" },
        { href: "/teacher/files", label: "Файл удирдлага" },
    ];
  } else if (user?.role === 'student') {
    navLinks = [
        { href: "/student", label: "Нүүр" }
    ];
  }

  return (
    <header className="py-4 text-center sticky top-0 z-10 bg-bg/80 backdrop-blur-md">
       <div className="max-w-5xl mx-auto px-4 flex justify-between items-center">
        <nav className="bg-card inline-flex gap-2 p-2 rounded-xl border border-stroke">
            {navLinks.map((link) => (
            <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${
                pathname === link.href || (pathname.startsWith(link.href) && link.href !== '/') 
                    ? 'bg-card2 text-text'
                    : 'text-muted hover:bg-card2/50 hover:text-text'
                }`}
            >
                {link.label}
            </Link>
            ))}
        </nav>
        <div className="flex items-center gap-4">
            {loading ? (
                <div className="w-24 h-10 bg-card2 rounded-lg animate-pulse"></div>
            ) : user ? (
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-muted">
                        {user.photoURL ? (
                            // --- ЗАСВАР: <img>-г <Image>-ээр солив ---
                            <Image
                                src={user.photoURL}
                                alt={user.displayName || "User"}
                                width={24}
                                height={24}
                                className="w-6 h-6 rounded-full"
                            />
                        ) : (
                            <UserIcon className="w-5 h-5" />
                        )}
                        <span>{user.displayName || user.email}</span>
                    </div>
                    <button
                        onClick={handleSignOut}
                        className="bg-card2 text-muted hover:text-text p-2.5 rounded-full transition-colors border border-stroke"
                        title="Гарах"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            ) : (
                <button
                    onClick={handleSignIn}
                    className="flex items-center gap-2 bg-primary-bg text-primary-text font-bold px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity"
                >
                    <LogIn className="w-4 h-4" />
                    <span>Нэвтрэх</span>
                </button>
            )}
            <ThemeToggle />
        </div>
       </div>
    </header>
  );
}