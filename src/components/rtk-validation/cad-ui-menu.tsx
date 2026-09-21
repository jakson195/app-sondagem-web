"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

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
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
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
      {open ? (
        <div
          id={menuId}
          role="menu"
          className={`absolute top-[calc(100%+4px)] z-[60] min-w-[13.5rem] rounded-md border border-[#e5e7eb] bg-white py-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      ) : null}
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
      onClick={onClick}
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
