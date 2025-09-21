// src/components/withRole.tsx
"use client";
import { useAuth } from './auth-provider';
import { ComponentType } from 'react';

// Энэ бол Higher-Order Component (HOC)
export function withRole<P extends object>(
  WrappedComponent: ComponentType<P>,
  allowedRoles: string[]
) {
  const ComponentWithRole = (props: P) => {
    const { user, loading } = useAuth();

    if (loading) {
      return <div>Уншиж байна...</div>; // Эсвэл skeleton loader
    }

    if (!user || !allowedRoles.includes(user.role || '')) {
      return (
        <div className="text-center">
            <h1 className="text-2xl font-bold">Хандах эрхгүй</h1>
            <p>Та энэ хуудсыг үзэх эрхгүй байна.</p>
        </div>
      );
    }

    return <WrappedComponent {...props} />;
  };
  return ComponentWithRole;
}