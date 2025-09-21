// src/app/teacher/page.tsx (Яг таны хүссэн загвараар)

"use client";

import Link from 'next/link';
import { withRole } from '@/components/withRole';
import { Upload, BarChart2 } from 'lucide-react';

function TeacherHomePage() {
  return (
    <div className="text-center mt-12">
      <div className="card border border-stroke bg-card p-12 rounded-2xl inline-block">
        <h1 className="text-3xl font-bold">ЭЕШ сорилын дүнгийн систем</h1>
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
             className="group flex items-center justify-center gap-3 bg-card2 border border-stroke text-text font-bold px-8 py-4 rounded-lg text-base transition-transform hover:scale-105"
          >
             <BarChart2 className="w-5 h-5 transition-transform group-hover:-translate-y-1" />
            <span>Дүн харах</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

// Энэ хуудсыг зөвхөн 'teacher' рольтой хэрэглэгч үзэх боломжтой
export default withRole(TeacherHomePage, ['teacher']);