"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className="pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)] active:scale-95"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
      >
        <EyeOff className={`h-4 w-4 transition-all duration-200 ${visible ? "rotate-0 scale-100 opacity-100" : "absolute rotate-90 scale-0 opacity-0"}`} />
        <Eye className={`h-4 w-4 transition-all duration-200 ${visible ? "absolute -rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"}`} />
      </button>
    </div>
  );
}
