export default function AdminLoading() {
  return (
    <div className="p-8">
      <div className="skeleton h-8 w-20 mb-1" />
      <div className="skeleton h-4 w-48 mb-8" />
      <div className="grid grid-cols-2 gap-6">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <div className="skeleton h-4 w-4 rounded" />
              <div className="skeleton h-5 w-24" />
            </div>
            <div className="divide-y divide-slate-100">
              {[...Array(4)].map((_, j) => (
                <div key={j} className="flex items-center gap-3 px-6 py-3">
                  <div className="skeleton h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1">
                    <div className="skeleton h-4 w-32 mb-1" />
                    <div className="skeleton h-3 w-40" />
                  </div>
                  <div className="skeleton h-6 w-20 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
