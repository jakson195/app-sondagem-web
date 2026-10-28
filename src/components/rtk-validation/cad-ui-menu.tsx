"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type CadMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: ReactNode;
  title?: string;
  align?: "left" | "right";
  tone?: "light" | "dark";
  active?: boolean;
  children: ReactNode;
  className?: string;
};

export function CadMenu({
  open,
  onOpenChange,
  label,
  title,
  align = "left",
  tone = "light",
  active = false,
  children,
  className = "",
}: CadMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setCoords(null);
      return;
    }
    const rect = rootRef.current.getBoundingClientRect();
    const width = 240;
    const left =
      align === "right" ? Math.max(8, rect.right - width) : Math.min(rect.left, window.innerWidth - width - 8);
    setCoords({ top: rect.bottom + 4, left: Math.max(8, left) });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const panel =
    open && coords ? (
      <div
        ref={menuRef}
        id={menuId}
        role="menu"
        onMouseDown={(e) => e.stopPropagation()}
        className="fixed z-[200] max-h-[min(70vh,28rem)] min-w-[15rem] overflow-y-auto rounded-md border border-[#e5e7eb] bg-white py-1 shadow-lg"
        style={{ top: coords.top, left: coords.left }}
      >
        {children}
      </div>
    ) : null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        title={title}
        aria-label={title ?? (typeof label === "string" ? label : undefined)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => onOpenChange(!open)}
        className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide ${
          tone === "dark"
            ? open || active
              ? "bg-[#00c8f0] text-[#0f2848]"
              : "text-[#94a3b8] hover:bg-[#1e293b]"
            : open || active
              ? "bg-[#0f2848] text-white"
              : "text-[#0f2848] hover:bg-[#f3f4f6]"
        }`}
      >
        {label}
        <span aria-hidden className="text-[9px] opacity-70">
          ▾
        </span>
      </button>
      {typeof document !== "undefined" && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}

export function CadMenuItem({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onClick?.();
      }}
      className="flex w-full items-center px-3 py-1.5 text-left text-xs text-[#111827] hover:bg-[#f3f4f6] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function CadMenuCheck({
  checked,
  label,
  onChange,
  title,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
  title?: string;
}) {
  return (
    <label
      title={title}
      onMouseDown={(e) => e.stopPropagation()}
      className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-[#111827] hover:bg-[#f3f4f6]"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-[#d1d5db]"
      />
      {label}
    </label>
  );
}

export function CadMenuSep() {
  return <div className="my-1 border-t border-[#e5e7eb]" role="separator" />;
}

export function CadMenuSub({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        role="menuitem"
        aria-expanded={open}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs font-medium text-[#0f2848] hover:bg-[#f3f4f6]"
      >
        <span>{label}</span>
        <span aria-hidden className="text-[9px] text-[#6b7280]">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? <div className="ml-2 border-l border-[#e5e7eb]">{children}</div> : null}
    </div>
  );
}
