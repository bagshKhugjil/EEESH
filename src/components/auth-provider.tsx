// src/components/auth-provider.tsx (Алдааг зассан эцсийн хувилбар)

"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/clientApp';

// Хэрэглэгчийн мэдээллийн төрлийг өргөтгөх
export interface AppUser extends User {
  role?: string; // 'teacher', 'student', 'parent', 'admin' эсвэл undefined
}

type AuthContextType = {
  user: AppUser | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const tokenResult = await firebaseUser.getIdTokenResult();
        
        // --- ЗАСВАР ЭНД ХИЙГДЛЭЭ ---
        // `firebaseUser` объектыг хуулахын оронд шууд өөр дээр нь ажиллаж, 
        // төрлийг нь `AppUser` болгон өргөтгөж байна. Ингэснээр `getIdToken` зэрэг
        // функцууд нь хэвээр үлдэнэ.
        const userWithRole = firebaseUser as AppUser;
        userWithRole.role = tokenResult.claims.role as string | undefined;
        
        setUser(userWithRole);
        // -----------------------------

      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = { user, loading };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}