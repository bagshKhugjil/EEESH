"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

export type SelectOption = {
  value: string;
  label: string;
  meta?: string; // e.g. class name, badge
};

type Props = {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  searchable?: boolean;
  "aria-label"?: string;
};

export default function CustomSelect({
  options,
  value,
  onChange,
  placeholder = "— Сонгох —",
  className = "",
  searchable = false,
  "aria-label": ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus search when opened
  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, searchable]);

  // Keyboard nav
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); setQuery(""); }
    if (e.key === "Enter" || e.key === " ") { if (!open) setOpen(true); }
  };

  const selected = options.find((o) => o.value === value);
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div ref={containerRef} className={`relative ${className}`} onKeyDown={handleKey}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setQuery(""); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-sm font-medium
          transition-all duration-150 cursor-pointer select-none text-left
          ${open
            ? "border-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.25)] bg-card"
            : "border-stroke bg-card hover:border-blue-500/60 hover:bg-card2"
          }`}
        style={{ color: selected ? "var(--text)" : "var(--muted)" }}
      >
        <span className="truncate">
          {selected ? (
            <>
              {selected.label}
              {selected.meta && (
                <span className="ml-1.5 text-xs text-muted/70">{selected.meta}</span>
              )}
            </>
          ) : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 mt-1.5 w-full rounded-xl border border-stroke shadow-2xl overflow-hidden animate-fade-in-up"
          style={{ background: "var(--card)" }}
          role="listbox"
          aria-label={ariaLabel}
        >
          {/* Search */}
          {searchable && (
            <div className="p-2 border-b border-stroke">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Хайх..."
                className="w-full px-3 py-1.5 rounded-lg text-sm"
                style={{
                  background: "var(--card2)",
                  border: "1px solid var(--stroke)",
                  color: "var(--text)",
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {/* Options */}
          <ul className="max-h-72 overflow-y-auto py-1.5 px-1.5 space-y-0.5">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted text-center">Олдсонгүй</li>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => { onChange(opt.value); setOpen(false); setQuery(""); }}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors duration-100
                      ${isSelected
                        ? "bg-blue-500/15 text-blue-300 font-semibold"
                        : "text-text hover:bg-card2"
                      }`}
                  >
                    <span className="truncate">
                      {opt.label}
                      {opt.meta && (
                        <span className={`ml-1.5 text-xs ${isSelected ? "text-blue-400/70" : "text-muted"}`}>
                          {opt.meta}
                        </span>
                      )}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-blue-400" />}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
