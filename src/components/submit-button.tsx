"use client";

import { useFormStatus } from "react-dom";
import { ArrowRight, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

type SubmitButtonProps = {
  variant?: "default" | "icon";
  icon?: "arrow" | "login";
  loadingText?: string;
  children: React.ReactNode;
};

export function SubmitButton({
  variant = "default",
  icon = "arrow",
  loadingText = "Enviando...",
  children,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  const Icon = icon === "login" ? LogIn : ArrowRight;

  return (
    <Button className="w-full" type="submit" disabled={pending}>
      {pending ? loadingText : children}
      {!pending && <Icon className="h-4 w-4" />}
    </Button>
  );
}
