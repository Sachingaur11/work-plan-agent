export default function ClientHomeLoading() {
  return (
    <div>
      <div className="skeleton h-8 w-40 mb-6" />
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200/80 px-6 py-5">
            <div className="skeleton h-5 w-56 mb-2" />
            <div className="skeleton h-4 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
