"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

// ── Helpers ──────────────────────────────────────────────────
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);          // 1-12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);        // 0,5,10,...,55
const PERIODS = ["AM", "PM"] as const;

/** Parse a 24h "HH:MM" string → { hour12, minute, period } */
function parse24(value: string): { hour12: number; minute: number; period: "AM" | "PM" } {
  if (!value) return { hour12: 9, minute: 0, period: "AM" };
  const [hStr, mStr] = value.split(":");
  let h = parseInt(hStr) || 0;
  const m = parseInt(mStr) || 0;
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  // Snap minute to nearest 5
  const snapped = Math.round(m / 5) * 5;
  return { hour12, minute: snapped >= 60 ? 55 : snapped, period };
}

/** Convert { hour12, minute, period } → 24h "HH:MM" */
function to24(hour12: number, minute: number, period: "AM" | "PM"): string {
  let h = hour12;
  if (period === "AM" && h === 12) h = 0;
  else if (period === "PM" && h !== 12) h += 12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function format12(hour12: number, minute: number, period: "AM" | "PM"): string {
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

// ── Column Scroller ──────────────────────────────────────────
function ScrollColumn<T extends string | number>({
  items,
  selected,
  onSelect,
  label,
  formatFn,
}: {
  items: T[];
  selected: T;
  onSelect: (v: T) => void;
  label: string;
  formatFn?: (v: T) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ITEM_H = 36;

  const scrollToSelected = useCallback(() => {
    const idx = items.indexOf(selected);
    if (idx >= 0 && containerRef.current) {
      containerRef.current.scrollTo({
        top: idx * ITEM_H,
        behavior: "smooth",
      });
    }
  }, [selected, items]);

  useEffect(() => {
    // On mount, scroll instantly (no animation)
    const idx = items.indexOf(selected);
    if (idx >= 0 && containerRef.current) {
      containerRef.current.scrollTop = idx * ITEM_H;
    }
  }, []);

  useEffect(() => {
    scrollToSelected();
  }, [selected, scrollToSelected]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 800,
          color: "#94a3b8",
          textTransform: "uppercase",
          letterSpacing: "0.8px",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        ref={containerRef}
        style={{
          height: ITEM_H * 3.5,
          overflowY: "auto",
          scrollSnapType: "y mandatory",
          scrollbarWidth: "none",
          position: "relative",
          width: "100%",
          borderRadius: 10,
          background: "#f8fafc",
        }}
      >
        {/* top padding for centering */}
        <div style={{ height: ITEM_H * 1.25 }} />
        {items.map((item) => {
          const isActive = item === selected;
          return (
            <div
              key={String(item)}
              onClick={() => onSelect(item)}
              style={{
                height: ITEM_H,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: isActive ? 18 : 14,
                fontWeight: isActive ? 800 : 500,
                color: isActive ? "#0f172a" : "#94a3b8",
                cursor: "pointer",
                scrollSnapAlign: "center",
                transition: "all 0.15s ease",
                borderRadius: 6,
                background: isActive ? "#fff" : "transparent",
                boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                margin: "0 3px",
                userSelect: "none",
              }}
            >
              {formatFn ? formatFn(item) : String(item).padStart(2, "0")}
            </div>
          );
        })}
        {/* bottom padding for centering */}
        <div style={{ height: ITEM_H * 1.25 }} />
      </div>
    </div>
  );
}

// ── Dropdown (rendered via Portal) ───────────────────────────
function TimePickerDropdown({
  hour,
  minute,
  period,
  onSelect,
  onClose,
  triggerRect,
}: {
  hour: number;
  minute: number;
  period: "AM" | "PM";
  onSelect: (h: number, m: number, p: "AM" | "PM") => void;
  onClose: () => void;
  triggerRect: DOMRect;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Position: below the trigger, aligned left; flip up if needed
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });

  useEffect(() => {
    const dropdownW = 280;
    let top = triggerRect.bottom + 6;
    let left = triggerRect.left;

    // Keep within viewport horizontally
    if (left + dropdownW > window.innerWidth - 12) {
      left = window.innerWidth - dropdownW - 12;
    }
    if (left < 12) left = 12;

    // Flip up if not enough space below
    const estimatedH = 340;
    if (top + estimatedH > window.innerHeight - 12) {
      top = triggerRect.top - estimatedH - 6;
      if (top < 12) top = 12;
    }

    setPos({ top, left, width: dropdownW });
  }, [triggerRect]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 9999,
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #e2e8f0",
        boxShadow: "0 20px 40px -8px rgba(0,0,0,0.15), 0 8px 16px -4px rgba(0,0,0,0.08)",
        padding: "14px 10px",
        animation: "tpFadeIn 0.15s ease",
      }}
    >
      {/* Column pickers */}
      <div style={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
        <ScrollColumn
          items={HOURS}
          selected={hour}
          onSelect={(h) => onSelect(h, minute, period)}
          label="Hour"
          formatFn={(v) => String(v)}
        />

        {/* Separator */}
        <div style={{ display: "flex", alignItems: "center", paddingTop: 16, fontSize: 20, fontWeight: 800, color: "#cbd5e1" }}>:</div>

        <ScrollColumn
          items={MINUTES}
          selected={minute}
          onSelect={(m) => onSelect(hour, m, period)}
          label="Min"
          formatFn={(v) => String(v).padStart(2, "0")}
        />

        {/* Separator line */}
        <div style={{ width: 1, background: "#e2e8f0", margin: "20px 2px 0", alignSelf: "stretch" }} />

        {/* AM/PM Toggle */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 16, gap: 4, minWidth: 46 }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4 }}>
            &nbsp;
          </div>
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onSelect(hour, minute, p)}
              style={{
                width: 44,
                height: 36,
                borderRadius: 8,
                border: "none",
                fontSize: 13,
                fontWeight: period === p ? 800 : 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
                background: period === p
                  ? (p === "AM" ? "linear-gradient(135deg, #3b82f6, #2563eb)" : "linear-gradient(135deg, #7c3aed, #6d28d9)")
                  : "#f1f5f9",
                color: period === p ? "#fff" : "#64748b",
                boxShadow: period === p ? "0 2px 8px rgba(0,0,0,0.12)" : "none",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Quick-select presets */}
      <div style={{ display: "flex", gap: 4, marginTop: 10, paddingTop: 10, borderTop: "1px solid #f1f5f9", flexWrap: "wrap", justifyContent: "center" }}>
        {[
          { label: "9 AM", h: 9, m: 0, p: "AM" as const },
          { label: "10 AM", h: 10, m: 0, p: "AM" as const },
          { label: "11 AM", h: 11, m: 0, p: "AM" as const },
          { label: "2 PM", h: 2, m: 0, p: "PM" as const },
          { label: "3 PM", h: 3, m: 0, p: "PM" as const },
          { label: "4 PM", h: 4, m: 0, p: "PM" as const },
        ].map((preset) => {
          const isActive = hour === preset.h && minute === preset.m && period === preset.p;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => onSelect(preset.h, preset.m, preset.p)}
              style={{
                padding: "4px 8px",
                borderRadius: 5,
                border: "none",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                background: isActive ? "#0f172a" : "#f1f5f9",
                color: isActive ? "#fff" : "#64748b",
                transition: "all 0.15s ease",
              }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Done button */}
      <button
        type="button"
        onClick={onClose}
        style={{
          width: "100%",
          marginTop: 10,
          padding: "9px",
          borderRadius: 8,
          border: "none",
          background: "linear-gradient(135deg, #0f172a, #1e293b)",
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          transition: "opacity 0.15s",
        }}
      >
        Done — {format12(hour, minute, period)}
      </button>

      {/* Animation keyframe */}
      <style>{`
        @keyframes tpFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  );
}

// ── Main TimePicker ──────────────────────────────────────────
export default function TimePicker({
  value,
  onChange,
  name,
  required,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  name?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const parsed = parse24(value);
  const [hour, setHour] = useState(parsed.hour12);
  const [minute, setMinute] = useState(parsed.minute);
  const [period, setPeriod] = useState<"AM" | "PM">(parsed.period);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);

  // Sync internal state when value prop changes
  useEffect(() => {
    const p = parse24(value);
    setHour(p.hour12);
    setMinute(p.minute);
    setPeriod(p.period);
  }, [value]);

  const handleOpen = () => {
    if (triggerRef.current) {
      setTriggerRect(triggerRef.current.getBoundingClientRect());
    }
    setOpen(!open);
  };

  const handleSelect = (h: number, m: number, p: "AM" | "PM") => {
    setHour(h);
    setMinute(m);
    setPeriod(p);
    onChange(to24(h, m, p));
  };

  const displayText = value ? format12(hour, minute, period) : (placeholder || "Select time");

  return (
    <div style={{ position: "relative" }}>
      {/* Hidden input for form compatibility */}
      {name && <input type="hidden" name={name} value={value || ""} />}

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        style={{
          width: "100%",
          padding: "9px 12px",
          border: open ? "2px solid #3b82f6" : "1px solid #e2e8f0",
          borderRadius: 8,
          background: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          fontSize: 14,
          fontWeight: value ? 600 : 400,
          color: value ? "#0f172a" : "#94a3b8",
          transition: "border-color 0.2s, box-shadow 0.2s",
          boxShadow: open ? "0 0 0 3px rgba(59,130,246,0.1)" : "none",
          fontFamily: "inherit",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={open ? "#3b82f6" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {displayText}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke={open ? "#3b82f6" : "#94a3b8"}
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none", flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown rendered via portal */}
      {open && triggerRect && (
        <TimePickerDropdown
          hour={hour}
          minute={minute}
          period={period}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
          triggerRect={triggerRect}
        />
      )}
    </div>
  );
}

/**
 * Simplified TimePicker for uncontrolled form usage (e.g. edit mode with defaultValue + name).
 * Behaves like a native input — stores value in a hidden input accessible via FormData.
 */
export function TimePickerUncontrolled({
  defaultValue,
  name,
}: {
  defaultValue?: string;
  name: string;
}) {
  const [val, setVal] = useState(defaultValue || "");
  return <TimePicker value={val} onChange={setVal} name={name} />;
}
