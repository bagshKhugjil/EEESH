"use client";

import { usePathname } from "next/navigation";
import { Header } from "./header";

export function HeaderWrapper() {
  const pathname = usePathname();
  // нуух шаардлагатай хуудсууд
  const hideOn = ["/", "/teacher/upload","/teacher/files","/teacher/results"];

  if (hideOn.includes(pathname)) return null;
  return <Header />;
}