export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded bg-[var(--tenant-surface-muted)]" />
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-lg bg-[var(--tenant-surface-muted)]" />
        ))}
      </div>
      <div className="h-[500px] rounded-lg bg-[var(--tenant-surface-muted)]" />
    </div>
  );
}
