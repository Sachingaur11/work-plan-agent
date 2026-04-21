export default function ClientProjectLoading() {
  return (
    <div>
      <div className="skeleton h-4 w-28 mb-6" />
      <div className="skeleton h-8 w-64 mb-6" />
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 mb-6 space-y-2">
        <div className="skeleton h-5 w-40 mb-3" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton h-12 w-full rounded-xl" />
        ))}
      </div>
      <div className="flex gap-2 mb-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton h-9 w-36 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-14 rounded-xl" />
          ))}
        </div>
        <div className="skeleton h-48 rounded-2xl" />
      </div>
    </div>
  );
}
