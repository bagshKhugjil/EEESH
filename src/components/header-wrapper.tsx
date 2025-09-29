"use client";

import { usePathname } from "next/navigation";
import { Header } from "./header";

const HIDE_EXACT = new Set([
  "/",
  "/teacher/upload",
  "/teacher/files",
  "/teacher/results",
  "/teacher/quizzes", // хүсвэл хоосон жагсаалтын хуудсанд ч нууж болно
]);

const HIDE_PREFIXES = [
  "/teacher/quizzes/", // динамик: /teacher/quizzes/[id]
];

export function HeaderWrapper() {
  const pathname = usePathname() || "/";
  const normalized =
    pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;

  const shouldHide =
    HIDE_EXACT.has(normalized) ||
    HIDE_PREFIXES.some((p) => normalized.startsWith(p));

  if (shouldHide) return null;
  return <Header />;
}