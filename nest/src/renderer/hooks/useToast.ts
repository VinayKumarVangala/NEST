'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Toast {
  id: string;
  title: string;
  message?: string;
  variant: 'default' | 'success' | 'destructive' | 'warning';
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>()(
  persist(
    (set) => ({
      toasts: [],
      addToast: (toast) =>
        set((state: ToastState) => ({
          toasts: [...state.toasts, { ...toast, id: Math.random().toString(36).slice(2) }],
        })),
      removeToast: (id) =>
        set((state: ToastState) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        })),
    }),
    { name: 'toast-storage', partialize: (state) => ({ toasts: state.toasts }) }
  )
);

export function useToast() {
  const { toasts, addToast, removeToast } = useToastStore();
  return { toasts, toast: addToast, dismiss: removeToast };
}