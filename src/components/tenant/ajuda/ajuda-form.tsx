"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Bug, CheckCircle2, HelpCircle, ImagePlus, Lightbulb, Loader2, X } from "lucide-react";
import { submitSupportReport } from "@/app/(platform)/(tenant)/configuracoes/ajuda/actions";

type ReportType = "bug" | "sugestao" | "duvida";

const PAGES = [
  { href: "/monitoramento", label: "Monitoramento" },
  { href: "/agenda", label: "Agenda" },
  { href: "/tarefas", label: "Tarefas" },
  { href: "/clientes", label: "Clientes" },
  { href: "/relatorios", label: "Relatorios" },
  { href: "/financeiro", label: "Financeiro" },
  { href: "/configuracoes/perfil", label: "Configuracoes - Perfil" },
  { href: "/configuracoes/escritorio", label: "Configuracoes - Escritorio" },
  { href: "/configuracoes/equipe", label: "Configuracoes - Equipe" },
];

const OUTRA_PAGINA = "__outra__";

function matchPageByPathname(pages: { href: string }[], pathname: string): string | null {
  const candidates = pages.filter((p) => {
    const hrefPath = p.href.split("?")[0];
    return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
  });
  if (!candidates.length) return null;
  return candidates.reduce((best, curr) => (curr.href.length > best.href.length ? curr : best)).href;
}

export function AjudaForm() {
  const [reportType, setReportType] = useState<ReportType>("bug");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedPage, setSelectedPage] = useState(OUTRA_PAGINA);
  const [customPage, setCustomPage] = useState("");

  // Auto-detecta a pagina anterior via document.referrer
  useEffect(() => {
    if (!document.referrer) return;
    queueMicrotask(() => {
      try {
        const referrerPath = new URL(document.referrer).pathname;
        const matched = matchPageByPathname(PAGES, referrerPath);
        if (matched) {
          setSelectedPage(matched);
        } else {
          setCustomPage(referrerPath);
        }
      } catch {
        // referrer invalido
      }
    });
  }, []);

  // Colar Ctrl+V em qualquer lugar da pagina
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (!item) return;
      const blob = item.getAsFile();
      if (blob) setImage(blob);
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function setImage(f: File) {
    if (!f.type.startsWith("image/")) return;
    setFile(f);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  }

  function removeImage() {
    setFile(null);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setImage(dropped);
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    if (file) formData.set("screenshot", file);
    formData.set("page_url", selectedPage === OUTRA_PAGINA ? customPage.trim() : selectedPage);
    formData.set("report_type", reportType);

    startTransition(() => {
      submitSupportReport(formData).then((result) => {
        if (result.error) {
          setError(result.error);
          return;
        }
        setSuccess(true);
        removeImage();
        formRef.current?.reset();
      });
    });
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-6 py-12 text-center">
        <CheckCircle2 className="size-10 text-emerald-400" />
        <p className="text-sm font-bold text-emerald-300">Recebido, obrigado!</p>
        <p className="max-w-sm text-xs font-medium text-emerald-400/80">
          Sua mensagem ja esta registrada. Assim que possivel vamos dar uma olhada.
        </p>
        <button
          type="button"
          onClick={() => setSuccess(false)}
          className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/20"
        >
          Reportar outra coisa
        </button>
      </div>
    );
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-5 rounded-2xl border border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-6">
      <div>
        <label className="mb-2 block text-xs font-bold text-[var(--color-muted-foreground)]">O que voce quer reportar?</label>
        <div className="grid grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => setReportType("bug")}
            className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-bold transition ${
              reportType === "bug"
                ? "border-red-500/40 bg-red-500/10 text-red-400"
                : "border-[var(--tenant-line)] text-[var(--color-muted-foreground)] hover:border-[var(--color-muted-foreground)]"
            }`}
          >
            <Bug className="size-4" />
            Achei um erro
          </button>
          <button
            type="button"
            onClick={() => setReportType("sugestao")}
            className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-bold transition ${
              reportType === "sugestao"
                ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                : "border-[var(--tenant-line)] text-[var(--color-muted-foreground)] hover:border-[var(--color-muted-foreground)]"
            }`}
          >
            <Lightbulb className="size-4" />
            Sugestao
          </button>
          <button
            type="button"
            onClick={() => setReportType("duvida")}
            className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-bold transition ${
              reportType === "duvida"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                : "border-[var(--tenant-line)] text-[var(--color-muted-foreground)] hover:border-[var(--color-muted-foreground)]"
            }`}
          >
            <HelpCircle className="size-4" />
            Tenho uma duvida
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="ajuda-titulo" className="mb-1 block text-xs font-bold text-[var(--color-muted-foreground)]">
          Titulo
        </label>
        <input
          id="ajuda-titulo"
          name="title"
          type="text"
          required
          minLength={2}
          placeholder={
            reportType === "bug"
              ? "Ex: Botao de salvar nao funciona no processo"
              : reportType === "sugestao"
                ? "Ex: Seria bom ter filtro por data na agenda"
                : "Ex: Como eu troco a etiqueta de um caso?"
          }
          className="w-full rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-2 text-sm font-medium text-[var(--color-card-foreground)] outline-none transition focus:border-[var(--tenant-brass)] focus:ring-1 focus:ring-[var(--tenant-brass)]/30"
        />
      </div>

      <div>
        <label htmlFor="ajuda-pagina" className="mb-1 block text-xs font-bold text-[var(--color-muted-foreground)]">
          Em qual pagina voce estava?
        </label>
        <select
          id="ajuda-pagina"
          value={selectedPage}
          onChange={(e) => setSelectedPage(e.target.value)}
          className="w-full rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-2 text-sm font-medium text-[var(--color-card-foreground)] outline-none transition focus:border-[var(--tenant-brass)] focus:ring-1 focus:ring-[var(--tenant-brass)]/30"
        >
          <option value={OUTRA_PAGINA}>Outra / nao sei dizer</option>
          {PAGES.map((page) => (
            <option key={page.href} value={page.href}>
              {page.label}
            </option>
          ))}
        </select>
        {selectedPage === OUTRA_PAGINA && (
          <input
            type="text"
            value={customPage}
            onChange={(e) => setCustomPage(e.target.value)}
            placeholder="Ex: dentro do processo #1234, ou nao lembro exatamente"
            className="mt-2 w-full rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-2 text-sm font-medium text-[var(--color-card-foreground)] outline-none transition focus:border-[var(--tenant-brass)] focus:ring-1 focus:ring-[var(--tenant-brass)]/30"
          />
        )}
      </div>

      <div>
        <label htmlFor="ajuda-descricao" className="mb-1 block text-xs font-bold text-[var(--color-muted-foreground)]">
          {reportType === "duvida" ? "Explique sua duvida" : "Descreva o que aconteceu"}
        </label>
        <textarea
          id="ajuda-descricao"
          name="description"
          required
          minLength={5}
          rows={4}
          placeholder={
            reportType === "duvida"
              ? "O que voce esta tentando fazer e onde travou?"
              : "Explique com o maximo de detalhe que conseguir — o que voce fez, o que esperava que acontecesse, o que aconteceu de verdade."
          }
          className="w-full rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-2 text-sm font-medium text-[var(--color-card-foreground)] outline-none transition focus:border-[var(--tenant-brass)] focus:ring-1 focus:ring-[var(--tenant-brass)]/30"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold text-[var(--color-muted-foreground)]">Print (opcional)</label>
        {preview ? (
          <div className="relative overflow-hidden rounded-xl border border-[var(--tenant-line)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- preview local de blob */}
            <img src={preview} alt="Print anexado" className="max-h-64 w-full object-contain bg-[var(--tenant-surface-muted)]" />
            <button
              type="button"
              onClick={removeImage}
              className="absolute right-2 top-2 rounded-full bg-white/10 p-1.5 text-[var(--color-muted-foreground)] backdrop-blur-sm transition hover:bg-white/20 hover:text-red-400"
              aria-label="Remover imagem"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
              isDragging ? "border-[var(--tenant-brass)] bg-[var(--tenant-brass)]/5" : "border-[var(--tenant-line)]"
            }`}
          >
            <ImagePlus className="size-6 text-[var(--color-muted-foreground)]" />
            <p className="text-xs font-semibold text-[var(--color-muted-foreground)]">
              Cole (Ctrl+V) ou arraste o print aqui, ou{" "}
              <label htmlFor="ajuda-arquivo" className="cursor-pointer text-[var(--tenant-brass)] underline">
                escolha um arquivo
              </label>
            </p>
            <input
              id="ajuda-arquivo"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) setImage(selected);
              }}
            />
          </div>
        )}
      </div>

      {error && <p className="text-xs font-semibold text-amber-400">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--tenant-brass)] px-4 py-3 text-sm font-bold text-[var(--tenant-brass-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending && <Loader2 className="size-4 animate-spin" />}
        Enviar
      </button>
    </form>
  );
}
