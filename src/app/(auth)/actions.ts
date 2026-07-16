"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function requireString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Campo obrigatorio: ${key}`);
  }
  return value.trim();
}

export async function signIn(formData: FormData) {
  const email = requireString(formData, "email");
  const password = requireString(formData, "password");
  const redirectTo = getSafeRedirect(formData.get("redirect_to"), "/dashboard");
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const loginPath = redirectTo.startsWith("/admin") ? "/admin/login" : "/login";
    redirect(`${loginPath}?error=${encodeURIComponent(error.message)}`);
  }

  redirect(redirectTo);
}

function getSafeRedirect(value: FormDataEntryValue | null, fallback: string) {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export async function signUp(formData: FormData) {
  const email = requireString(formData, "email");
  const password = requireString(formData, "password");
  const name = requireString(formData, "name");
  const terms = formData.get("terms");

  if (terms !== "on") {
    redirect("/register?error=terms_required");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        office: formData.get("office"),
        oab: formData.get("oab"),
        uf: formData.get("uf"),
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=/onboarding`,
    },
  });

  if (error) {
    redirect(`/register?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/onboarding");
}
