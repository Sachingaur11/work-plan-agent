export default function ProjectDetailLoading() {
  return (
    <div className="p-8">
      {/* Back link */}
      <div className="skeleton h-4 w-32 mb-6" />

      {/* Header */}
      <div className="mb-6">
        <div className="skeleton h-8 w-72 mb-2" />
        <div className="skeleton h-4 w-48" />
      </div>

      {/* Pipeline tracker */}
      <div className="bg-white rounded-2xl border border-slate-200/80 px-6 py-4 mb-6 flex gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="skeleton h-5 w-5 rounded-full" />
            <div>
              <div className="skeleton h-4 w-16 mb-1" />
              <div className="skeleton h-3 w-24" />
            </div>
          </div>
        ))}
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 px-5 py-3 flex items-center gap-3">
            <div className="skeleton h-5 w-48" />
            <div className="ml-auto skeleton h-8 w-24 rounded-xl" />
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-3">
            <div className="skeleton h-4 w-32 mb-4" />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-14 w-full rounded-xl" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-3">
            <div className="skeleton h-5 w-32 mb-2" />
            <div className="skeleton h-9 w-full rounded-xl" />
            <div className="skeleton h-9 w-full rounded-xl" />
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-3">
            <div className="skeleton h-5 w-24" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-10 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
