// src/app/teacher/layout.tsx

import { TeacherHeader } from "@/components/teacher-header";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
    
      <main className="max-w-5xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}