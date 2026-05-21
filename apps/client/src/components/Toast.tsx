import { useToastStore } from "../stores/toastStore";

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
