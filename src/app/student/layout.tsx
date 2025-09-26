// src/app/student/layout.tsx

export default function StudentLayout({
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