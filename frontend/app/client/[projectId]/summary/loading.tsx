export default function ClientSummaryLoading() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-4 w-28" />
      <div className="skeleton h-52 rounded-2xl" />
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6">
        <div className="skeleton h-5 w-32 mb-4" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="skeleton h-8 w-8 rounded-lg shrink-0" />
              <div className="flex-1">
                <div className="skeleton h-3 w-20 mb-1.5" />
                <div className="skeleton h-4 w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="skeleton h-20" />
            <div className="p-3 space-y-2">
              {[...Array(2)].map((_, j) => <div key={j} className="skeleton h-10 rounded-xl" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
