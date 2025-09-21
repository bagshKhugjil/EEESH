// src/components/teacher-header.tsx (img анхааруулгыг зассан, эцсийн хувилбар)

"use client";

import Link from 'next/link';
import Image from 'next/image'; // --- ЗАСВАР: Image компонент импортлох ---
import { usePathname } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/clientApp';
import { useAuth } from './auth-provider';
import { LogOut, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const ThemeToggle = () => {
    const { setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return <div className="w-9 h-9"></div>;
    return (
        <button
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="bg-card/80 text-muted hover:text-text p-2.5 rounded-full transition-colors border border-stroke"
            title="Өнгө солих"
        >
            {resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
    );
}

export function TeacherHeader() {
  const { user } = useAuth();
  const pathname = usePathname();

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      // unknown төрлийг ашиглан алдааг аюулгүй боловсруулах
      const errorMessage = error instanceof Error ? error.message : "Тодорхойгүй алдаа гарлаа.";
      console.error("Гарах үед алдаа гарлаа:", errorMessage);
    }
  };

  const navLinks = [
    { href: "/teacher", label: "Нүүр" },
    { href: "/teacher/upload", label: "Дүн оруулах" },
    { href: "/teacher/results", label: "Дүн харах" },
    { href: "/teacher/files", label: "Файл удирдлага" },
  ];

  return (
    <>
      <div className="fixed top-4 right-4 z-20 flex items-center gap-4">
        {user && (
          <div className="flex items-center gap-2 text-sm bg-card/80 backdrop-blur-sm p-2 rounded-full border border-stroke">
            {/* --- ЗАСВАР: <img>-г <Image>-ээр солив --- */}
            <Image
                src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || user.email}`}
                alt={user.displayName || 'User'}
                width={24}
                height={24}
                className="w-6 h-6 rounded-full"
            />
            <span className="text-muted pr-2">{user.displayName}</span>
            <button
              onClick={handleSignOut}
              className="bg-card2 text-muted hover:text-text p-1.5 rounded-full transition-colors"
              title="Гарах"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
        <ThemeToggle />
      </div>

      <header className="py-4 text-center">
        <nav className="bg-card inline-flex gap-2 p-2 rounded-xl border border-stroke">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${
                pathname === link.href ? 'bg-card2 text-text' : 'text-muted hover:bg-card2/50 hover:text-text'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
    </>
  );
}