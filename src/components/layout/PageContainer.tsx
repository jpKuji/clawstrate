export function PageContainer({
  children,
  title,
  description,
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
}) {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {title && (
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-100">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-zinc-400">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
