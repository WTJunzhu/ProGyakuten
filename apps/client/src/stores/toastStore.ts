import { create } from "zustand";

export type ToastType = "info" | "success" | "warning" | "error";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: Toast[];
  nextId: number;
  showToast: (message: string, type?: ToastType) => void;
  removeToast: (id: number) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  nextId: 0,
  showToast: (message, type = "info") => {
    const { nextId, toasts } = get();
    const newToast: Toast = { id: nextId, message, type };
    const updated = [...toasts, newToast].slice(-2); // max 2 visible
    set({ toasts: updated, nextId: nextId + 1 });
    setTimeout(() => get().removeToast(nextId), 2600);
  },
  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }
}));
