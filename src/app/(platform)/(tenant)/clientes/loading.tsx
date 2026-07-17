export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded bg-[var(--tenant-surface-muted)]" />
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-lg bg-[var(--tenant-surface-muted)]" />
        ))}
      </div>
      <div className="h-[500px] rounded-lg bg-[var(--tenant-surface-muted)]" />
    </div>
  );
}
