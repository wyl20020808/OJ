import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ToastKind = 'success' | 'error' | 'warning' | 'info';
export type ToastInput = {
  kind?: ToastKind;
  title: string;
  description?: string;
  duration?: number;
};
type ToastItem = ToastInput & { id: number; kind: ToastKind };
type ToastContextValue = {
  toast: (input: ToastInput) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue>({
  toast: () => undefined,
  dismiss: () => undefined,
});
const durations: Record<ToastKind, number> = {
  success: 3000,
  info: 3500,
  warning: 4500,
  error: 6000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback(
    (id: number) =>
      setItems((current) => current.filter((item) => item.id !== id)),
    [],
  );
  const toast = useCallback(
    (input: ToastInput) => {
      const kind = input.kind ?? 'info';
      const id = Date.now() + Math.random();
      setItems((current) => [...current, { ...input, id, kind }]);
      window.setTimeout(() => dismiss(id), input.duration ?? durations[kind]);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-label="通知" aria-live="polite">
        {items.map((item) => (
          <div
            className={`toast toast-${item.kind}`}
            role={item.kind === 'error' ? 'alert' : 'status'}
            key={item.id}
          >
            <span className="toast-icon" aria-hidden="true">
              {item.kind === 'success'
                ? '✓'
                : item.kind === 'error'
                  ? '!'
                  : item.kind === 'warning'
                    ? '!'
                    : 'i'}
            </span>
            <div className="toast-copy">
              <strong>{item.title}</strong>
              {item.description && <span>{item.description}</span>}
            </div>
            <button
              type="button"
              className="toast-close"
              aria-label="关闭通知"
              onClick={() => dismiss(item.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext).toast;
}
