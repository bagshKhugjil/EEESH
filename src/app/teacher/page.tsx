// src/app/teacher/page.tsx
"use client";

import Link from 'next/link';
import { withRole } from '@/components/withRole';
import { Upload, BarChart2 } from 'lucide-react';

function TeacherHomePage() {
  return (
    <div className="text-center mt-12">
      <div className="card border border-stroke bg-card p-12 rounded-2xl inline-block">
        <h1 className="text-3xl font-bold">ЕШ сорилын дүнгийн систем</h1>
        <p className="text-muted max-w-md mx-auto my-6">
          Та доорх сонголтуудаас хийх үйлдлээ сонгоно уу.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Link
            href="/teacher/upload"
            className="group flex items-center justify-center gap-3 bg-primary-bg text-primary-text font-bold px-8 py-4 rounded-lg text-base transition-transform hover:scale-105"
          >
            <Upload className="w-5 h-5 transition-transform group-hover:-translate-y-1" />
            <span>Сорил дүн оруулах</span>
          </Link>

          <Link
            href="/teacher/results"
            className="group flex items-center justify-center gap-3 border border-stroke bg-card2 text-text font-bold px-8 py-4 rounded-lg text-base transition-all hover:scale-105 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-300"
          >
            <BarChart2 className="w-5 h-5 transition-transform group-hover:scale-110" />
            <span>Дүн харах</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default withRole(TeacherHomePage, ['teacher']);