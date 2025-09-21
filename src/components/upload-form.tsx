// src/components/upload-form.tsx (any төрлийг зассан, эцсийн хувилбар)

"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { UploadCloud, FileText, CheckCircle, AlertCircle } from 'lucide-react';

const SUBJECTS = ['ХИМИ','ФИЗИК','ТҮҮХ','ОРОС ХЭЛ','НИЙГЭМ','МОНГОЛ ХЭЛ','МАТЕМАТИК','ГАЗАРЗҮЙ','БИОЛОГИ','АНГЛИ ХЭЛ'];

// API-аас ирэх хариултын төрлийг тодорхойлох
interface ApiResponse {
    message?: string;
    error?: string;
}

export function UploadForm() {
  const { user } = useAuth();
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState({ message: '', type: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = (file: File | null) => {
    if (file) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!['xlsx', 'csv'].includes(ext)) {
        setStatus({ message: 'Зөвхөн .xlsx эсвэл .csv файл сонгоно уу.', type: 'error' });
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setStatus({ message: '', type: '' });
    }
  };

  const handleUpload = async () => {
    if (!user) {
      setStatus({ message: 'Файл хуулахын тулд эхлээд нэвтэрнэ үү.', type: 'error' });
      return;
    }
    if (!selectedSubject) {
      setStatus({ message: 'Хичээлээ сонгоно уу.', type: 'error' });
      return;
    }
    if (!selectedFile) {
      setStatus({ message: 'Файлаа сонгоно уу.', type: 'error' });
      return;
    }

    setIsLoading(true);
    setStatus({ message: 'Файлыг хуулж байна, түр хүлээнэ үү...', type: 'loading' });

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('subject', selectedSubject);
    
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        headers: {
            'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json() as ApiResponse;

      if (!response.ok) {
        throw new Error(result.error || 'Серверийн алдаа гарлаа');
      }

      setStatus({ message: result.message || "Амжилттай хууллаа", type: 'success' });
      setSelectedFile(null);
      setSelectedSubject(null);

    } catch (error: unknown) { // --- ЗАСВАР: any -> unknown ---
      // Алдааны төрлийг шалгаж, зөв мессеж гаргах
      const errorMessage = error instanceof Error ? error.message : "Тодорхойгүй алдаа гарлаа.";
      setStatus({ message: errorMessage, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card border border-stroke bg-card p-6 rounded-2xl max-w-3xl mx-auto">
        <div className="mb-4">
            <label className="block text-sm font-bold mb-2 text-text">1. Хичээлээ сонгоно уу</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {SUBJECTS.map((subject) => (
                <button
                key={subject}
                onClick={() => setSelectedSubject(subject)}
                className={`p-3 text-sm font-bold rounded-lg border transition-all duration-200 ${
                    selectedSubject === subject
                    ? 'bg-primary-bg/20 border-primary-bg text-primary-bg'
                    : 'bg-card2 border-stroke hover:border-primary-bg/50'
                }`}
                >
                {subject}
                </button>
            ))}
            </div>
        </div>

        <div className="mt-6">
            <label className="block text-sm font-bold mb-2 text-text">2. Файлаа оруулна уу</label>
            <div
            onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
            onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileChange(e.dataTransfer.files[0]);
                }
            }}
            onClick={() => {
                const fileInput = document.getElementById('file-input');
                if (fileInput instanceof HTMLInputElement) {
                    fileInput.click();
                }
            }}
            className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors duration-200 ${isDragOver ? 'border-primary-bg bg-primary-bg/10' : 'border-stroke hover:border-primary-bg'}`}
            >
            <input type="file" id="file-input" className="hidden" onChange={(e) => handleFileChange(e.target.files ? e.target.files[0] : null)} accept=".xlsx,.csv" />
            <div className="flex flex-col items-center justify-center text-muted">
                <UploadCloud className="w-10 h-10 mb-3" />
                <p className="font-bold text-text">Файлаа энд чирж оруулна уу</p>
                <p className="text-xs">эсвэл дарж сонгоно уу (.xlsx, .csv)</p>
            </div>
            </div>
        </div>

        {selectedFile && (
            <div className="mt-4 bg-card2 border border-stroke p-3 rounded-lg flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary-bg"/>
                    <span className="font-medium">{selectedFile.name}</span>
                </div>
                <button onClick={() => setSelectedFile(null)} className="text-muted hover:text-red-500 font-bold text-lg">&times;</button>
            </div>
        )}

        {status.message && (
            <div className={`mt-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
                status.type === 'success' ? 'bg-green-500/10 text-green-400' :
                status.type === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'
            }`}>
                {status.type === 'success' ? <CheckCircle size={16} /> : status.type === 'error' ? <AlertCircle size={16} /> : null}
                {status.message}
            </div>
        )}
        
        <div className="mt-6 flex justify-end gap-4">
             <a
                className="btn border border-stroke bg-card2 text-text px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity flex items-center"
                href="https://docs.google.com/spreadsheets/d/19jHswtR9uxTRexVvCxPIPEzuQSSjs-9O7_32IXGEF4g/export?format=xlsx"
                target="_blank"
                rel="noopener noreferrer"
             >
                Жишээ файл
            </a>
            <button
                onClick={handleUpload}
                disabled={isLoading || !selectedFile || !selectedSubject}
                className="bg-primary-bg text-primary-text font-bold px-6 py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
            {isLoading ? 'Хуулж байна...' : 'Хуулах'}
            </button>
        </div>
    </div>
  );
}