"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { stripMask } from "@/lib/masks";

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase
    .from("users")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      phone: stripMask(String(formData.get("phone") ?? "")) || null,
      oab_number: stripMask(String(formData.get("oab_number") ?? "")) || null,
      oab_uf: String(formData.get("oab_uf") ?? "").trim().toUpperCase() || null,
    })
    .eq("id", user.id);

  if (error) throw error;

  revalidatePath("/configuracoes/perfil");
  return { success: true };
}

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const file = formData.get("file") as File;
  if (!file || file.size === 0) throw new Error("Nenhum arquivo selecionado");

  const fileExt = file.name.split(".").pop();
  const fileName = `${user.id}/avatar.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(fileName, file, { upsert: true });

  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(fileName);

  const { error: updateError } = await supabase
    .from("users")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);

  if (updateError) throw updateError;

  revalidatePath("/configuracoes/perfil");
  return { url: publicUrl };
}

export async function updateTenant(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "owner") {
    throw new Error("Sem permissão");
  }

  const { error } = await supabase
    .from("tenants")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      slug: String(formData.get("slug") ?? "").trim().toLowerCase(),
      cnpj: stripMask(String(formData.get("cnpj") ?? "")) || null,
      city: String(formData.get("city") ?? "").trim() || null,
      state: String(formData.get("state") ?? "").trim().toUpperCase() || null,
      phone: stripMask(String(formData.get("phone") ?? "")) || null,
      email: String(formData.get("email") ?? "").trim() || null,
    })
    .eq("id", profile.tenant_id);

  if (error) throw error;

  revalidatePath("/configuracoes/escritorio");
  return { success: true };
}

export async function uploadLogo(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "owner") {
    throw new Error("Sem permissão");
  }

  const file = formData.get("file") as File;
  if (!file || file.size === 0) throw new Error("Nenhum arquivo selecionado");

  const fileExt = file.name.split(".").pop();
  const fileName = `${profile.tenant_id}/logo.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from("tenant-logos")
    .upload(fileName, file, { upsert: true });

  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from("tenant-logos").getPublicUrl(fileName);

  const { error: updateError } = await supabase
    .from("tenants")
    .update({ logo_url: publicUrl })
    .eq("id", profile.tenant_id);

  if (updateError) throw updateError;

  revalidatePath("/configuracoes/escritorio");
  return { url: publicUrl };
}

export async function addOab(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "owner") {
    throw new Error("Sem permissão");
  }

  const oabNumber = stripMask(String(formData.get("oab_number") ?? ""));
  const oabUf = String(formData.get("oab_uf") ?? "").trim().toUpperCase();

  if (!oabNumber || !oabUf) {
    throw new Error("Número e UF são obrigatórios");
  }

  const { data: existing } = await supabase
    .from("escritorio_oabs")
    .select("id")
    .eq("tenant_id", profile.tenant_id)
    .eq("oab_number", oabNumber)
    .eq("oab_uf", oabUf)
    .maybeSingle();

  if (existing) {
    throw new Error("Esta OAB já está vinculada ao escritório");
  }

  const { error } = await supabase.from("escritorio_oabs").insert({
    tenant_id: profile.tenant_id,
    user_id: user.id,
    oab_number: oabNumber,
    oab_uf: oabUf,
    is_primary: false,
  });

  if (error) throw error;

  revalidatePath("/configuracoes/oabs");
  return { success: true };
}

export async function removeOab(oabId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "owner") {
    throw new Error("Sem permissão");
  }

  const { error } = await supabase
    .from("escritorio_oabs")
    .delete()
    .eq("id", oabId)
    .eq("tenant_id", profile.tenant_id);

  if (error) throw error;

  revalidatePath("/configuracoes/oabs");
  return { success: true };
}

export async function setPrimaryOab(oabId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "owner") {
    throw new Error("Sem permissão");
  }

  await supabase
    .from("escritorio_oabs")
    .update({ is_primary: false })
    .eq("tenant_id", profile.tenant_id);

  const { error } = await supabase
    .from("escritorio_oabs")
    .update({ is_primary: true })
    .eq("id", oabId)
    .eq("tenant_id", profile.tenant_id);

  if (error) throw error;

  revalidatePath("/configuracoes/oabs");
  return { success: true };
}

export async function updateMemberRole(userId: string, newRole: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "owner") {
    throw new Error("Somente o owner pode alterar papéis");
  }

  if (userId === user.id) {
    throw new Error("Não é possível alterar seu próprio papel");
  }

  const validRoles = ["lawyer", "staff", "owner"];
  if (!validRoles.includes(newRole)) {
    throw new Error("Papel inválido");
  }

  const { error } = await supabase
    .from("users")
    .update({ role: newRole })
    .eq("id", userId)
    .eq("tenant_id", profile.tenant_id);

  if (error) throw error;

  revalidatePath("/configuracoes/equipe");
  return { success: true };
}

export async function deactivateMember(userId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "owner") {
    throw new Error("Somente o owner pode desativar membros");
  }

  if (userId === user.id) {
    throw new Error("Não é possível desativar a si mesmo");
  }

  const { error } = await supabase
    .from("users")
    .update({ is_active: false })
    .eq("id", userId)
    .eq("tenant_id", profile.tenant_id);

  if (error) throw error;

  revalidatePath("/configuracoes/equipe");
  return { success: true };
}

export async function removeMember(userId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "owner") {
    throw new Error("Somente o owner pode remover membros");
  }

  if (userId === user.id) {
    throw new Error("Não é possível remover a si mesmo");
  }

  const { error } = await supabase
    .from("users")
    .update({ tenant_id: null, is_active: false })
    .eq("id", userId)
    .eq("tenant_id", profile.tenant_id);

  if (error) throw error;

  revalidatePath("/configuracoes/equipe");
  return { success: true };
}

export async function revokeInvite(inviteId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "owner") {
    throw new Error("Somente o owner pode revogar convites");
  }

  const { error } = await supabase
    .from("tenant_invites")
    .delete()
    .eq("id", inviteId)
    .eq("tenant_id", profile.tenant_id);

  if (error) throw error;

  revalidatePath("/configuracoes/equipe");
  return { success: true };
}

export async function createInviteMember(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "owner") {
    throw new Error("Somente o owner pode convidar membros");
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "lawyer");

  if (!email) throw new Error("Email é obrigatório");

  const validRoles = ["lawyer", "staff", "owner"];
  if (!validRoles.includes(role)) {
    throw new Error("Papel inválido");
  }

  const { error } = await supabase.from("tenant_invites").insert({
    tenant_id: profile.tenant_id,
    email,
    role,
    invited_by: user.id,
  });

  if (error) throw error;

  revalidatePath("/configuracoes/equipe");
  return { success: true };
}

export async function changePassword(formData: FormData) {
  const supabase = await createClient();

  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new Error("Todos os campos são obrigatórios");
  }

  if (newPassword.length < 8) {
    throw new Error("A nova senha deve ter pelo menos 8 caracteres");
  }

  if (newPassword !== confirmPassword) {
    throw new Error("As senhas não coincidem");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Usuário não encontrado");

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (signInError) {
    throw new Error("Senha atual incorreta");
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) throw error;

  return { success: true };
}

export async function deleteAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) throw new Error("Perfil não encontrado");

  if (profile.role === "owner") {
    const { count } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", profile.tenant_id)
      .eq("role", "owner")
      .eq("is_active", true);

    if (count && count <= 1) {
      throw new Error(
        "Você é o último owner. Transfira a propriedade antes de excluir sua conta."
      );
    }
  }

  const { error } = await supabase
    .from("users")
    .update({
      is_active: false,
      name: "Conta excluída",
      email: `excluido-${user.id}@meujudi.com`,
      phone: null,
      oab_number: null,
      oab_uf: null,
      avatar_url: null,
    })
    .eq("id", user.id);

  if (error) throw error;

  await supabase.auth.signOut();

  redirect("/login?success=account_deleted");
}
