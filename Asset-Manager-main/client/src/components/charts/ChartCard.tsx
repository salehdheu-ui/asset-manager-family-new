import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  delay?: number;
  icon?: React.ReactNode;
}

export function ChartCard({ title, children, className, delay = 0, icon }: ChartCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group relative overflow-hidden rounded-[2rem] border border-border/40 bg-gradient-to-b from-card via-card to-muted/10 p-5 shadow-md transition-shadow hover:shadow-lg",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-20 rounded-b-[2rem] bg-gradient-to-b from-primary/[0.04] to-transparent" />
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/[0.03] blur-2xl" />
      <div className="relative mb-5 flex items-center justify-between gap-3">
        <div className="space-y-2">
          <h3 className="font-heading text-lg font-bold leading-tight text-primary">{title}</h3>
          <div className="h-1 w-16 rounded-full bg-gradient-to-r from-primary/50 via-emerald-400/40 to-transparent" />
        </div>
        {icon && (
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-emerald-50 text-primary shadow-md ring-1 ring-primary/10">
            {icon}
          </div>
        )}
      </div>
      <div className="relative">
        {children}
      </div>
    </motion.div>
  );
}
