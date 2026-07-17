export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded bg-[var(--tenant-surface-muted)]" />
      <div className="flex gap-2">
        <div className="h-10 w-32 rounded bg-[var(--tenant-surface-muted)]" />
        <div className="h-10 w-32 rounded bg-[var(--tenant-surface-muted)]" />
        <div className="h-10 w-32 rounded bg-[var(--tenant-surface-muted)]" />
      </div>
      <div className="h-[500px] rounded-lg bg-[var(--tenant-surface-muted)]" />
    </div>
  );
}
