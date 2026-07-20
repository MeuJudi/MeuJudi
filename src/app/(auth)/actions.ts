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
  const redirectTo = getSafeRedirect(formData.get("redirect_to"), "/monitoramento");
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
  const passwordConfirmation = formData.get("password_confirmation");
  const name = requireString(formData, "name");
  const terms = formData.get("terms");

  if (terms !== "on") {
    redirect("/register?error=terms_required");
  }

  if (typeof passwordConfirmation !== "string" || password !== passwordConfirmation) {
    redirect("/register?error=password_mismatch");
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

  redirect(`/register/confirm?email=${encodeURIComponent(email)}`);
}

export async function verifySignupCode(formData: FormData) {
  const email = requireString(formData, "email").toLowerCase();
  const token = requireString(formData, "token").replace(/\s/g, "");
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });

  if (error) redirect(`/register/confirm?email=${encodeURIComponent(email)}&error=${encodeURIComponent(error.message)}`);
  redirect("/onboarding");
}

export async function resendSignupCode(formData: FormData) {
  const email = requireString(formData, "email").toLowerCase();
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) redirect(`/register/confirm?email=${encodeURIComponent(email)}&error=${encodeURIComponent(error.message)}`);
  redirect(`/register/confirm?email=${encodeURIComponent(email)}&resent=1`);
}

export async function resendConfirmation() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email) {
    await supabase.auth.resend({ type: "signup", email: user.email });
  }
  redirect("/onboarding?success=email_resent");
}

export async function forgotPassword(formData: FormData) {
  const email = requireString(formData, "email");
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/reset-password`,
  });
  if (error) {
    redirect("/forgot-password?error=send_failed");
  }
  redirect("/forgot-password?success=sent");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
