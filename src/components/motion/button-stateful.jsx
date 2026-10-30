"use client";
// Adapted from beUI Stateful Button (MIT): https://beui.dev/components/motion/button

import { Check, Loader2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { forwardRef } from "react";
import { SPRING_PRESS, SPRING_SWAP } from "@/lib/ease.js";
import { cn } from "@/lib/utils.js";

export const StatefulButton = forwardRef(function StatefulButton(
  {
    state = "idle",
    variant = "primary",
    children,
    loadingText = "Saving…",
    successText = "Saved",
    errorText = "Failed",
    icon,
    disabled = false,
    className,
    type = "button",
    onClick,
    ...rest
  },
  ref,
) {
  const reduce = useReducedMotion();
  const isBusy = state === "loading";

  const variantStyles = {
    primary:
      "bg-gradient-to-r from-[#1b6b33] to-[#238c41] text-white border border-[#36a855] shadow-lg shadow-[#1b6b33]/30 hover:from-[#207a3b] hover:to-[#2aa04b] focus-visible:ring-[#52e078]/40",
    income:
      "bg-gradient-to-r from-[#0284c7] to-[#0ea5e9] text-white border border-[#38bdf8] shadow-lg shadow-[#0284c7]/30 hover:from-[#0369a1] hover:to-[#0284c7] focus-visible:ring-[#38bdf8]/40",
    danger:
      "bg-gradient-to-r from-[#b91c1c] to-[#dc2626] text-white border border-[#ef4444] shadow-lg shadow-[#b91c1c]/30 hover:from-[#991b1b] hover:to-[#b91c1c] focus-visible:ring-[#ef4444]/40",
    secondary:
      "bg-[#0e1d13] text-[#c2d4be] border border-[#203a27] hover:bg-[#14281a] hover:text-[#edf5ea] hover:border-[#2f553a] focus-visible:ring-[#52e078]/20",
  };

  const displayText =
    state === "loading"
      ? loadingText
      : state === "success"
        ? successText
        : state === "error"
          ? errorText
          : children;

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled || isBusy}
      aria-busy={isBusy}
      whileTap={reduce || disabled || isBusy ? undefined : { scale: 0.98 }}
      transition={SPRING_PRESS}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold tracking-wide outline-none transition-all duration-200 select-none",
        "focus-visible:ring-2",
        "disabled:pointer-events-none disabled:opacity-50",
        variantStyles[variant] || variantStyles.primary,
        className,
      )}
      {...rest}
    >
      <span
        aria-live="polite"
        className="relative inline-flex items-center justify-center gap-2"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {state === "loading" && (
            <motion.span
              key="loading-icon"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={reduce ? { duration: 0.1 } : SPRING_SWAP}
              className="inline-flex shrink-0 items-center justify-center"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin text-current" />
            </motion.span>
          )}

          {state === "success" && (
            <motion.span
              key="success-icon"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={reduce ? { duration: 0.1 } : SPRING_SWAP}
              className="inline-flex shrink-0 items-center justify-center"
            >
              <Check className="h-3.5 w-3.5 text-current" />
            </motion.span>
          )}

          {state === "error" && (
            <motion.span
              key="error-icon"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={reduce ? { duration: 0.1 } : SPRING_SWAP}
              className="inline-flex shrink-0 items-center justify-center"
            >
              <X className="h-3.5 w-3.5 text-current" />
            </motion.span>
          )}

          {state === "idle" && icon && (
            <motion.span
              key="idle-icon"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="inline-flex shrink-0 items-center justify-center"
            >
              {icon}
            </motion.span>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={String(displayText)}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={reduce ? { duration: 0.1 } : SPRING_SWAP}
            className="truncate"
          >
            {displayText}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.button>
  );
});
