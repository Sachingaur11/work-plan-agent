export default function ProjectDetailLoading() {
  return (
    <div className="p-8 animate-pulse">
      {/* Back link */}
      <div className="skeleton h-4 w-24 mb-6" />

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="skeleton h-8 w-64" />
            <div className="skeleton h-5 w-20 rounded-full" />
          </div>
          <div className="skeleton h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-9 w-16 rounded-xl" />
          <div className="skeleton h-9 w-20 rounded-xl" />
        </div>
      </div>

      {/* Pipeline tracker */}
      <div className="bg-white rounded-2xl border border-slate-200/80 px-6 py-5 mb-6">
        <div className="flex items-center">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center flex-1">
              <div className="flex items-center gap-3 px-3 py-2 flex-1">
                <div className="skeleton w-9 h-9 rounded-full shrink-0" />
                <div>
                  <div className="skeleton h-3.5 w-20 mb-1" />
                  <div className="skeleton h-3 w-14" />
                </div>
              </div>
              {i < 3 && <div className="skeleton h-[2px] w-6 rounded mx-1 shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* Stage content grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Main */}
        <div className="col-span-2 space-y-4">
          {/* Action bar */}
          <div className="bg-white rounded-2xl border border-slate-200/80 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="skeleton h-5 w-44" />
              <div className="ml-auto flex gap-2">
                <div className="skeleton h-8 w-20 rounded-xl" />
              </div>
            </div>
            <div className="flex gap-2 pt-3 mt-3 border-t border-slate-100">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton h-7 w-14 rounded-lg" />
              ))}
            </div>
          </div>
          {/* Document cards */}
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200/80 px-6 py-4 flex items-center gap-4">
              <div className="skeleton w-10 h-10 rounded-xl shrink-0" />
              <div className="flex-1">
                <div className="skeleton h-4 w-52 mb-1.5" />
                <div className="skeleton h-3 w-28" />
              </div>
              <div className="skeleton h-8 w-28 rounded-xl" />
            </div>
          ))}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="skeleton h-10 w-full rounded-xl" />
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4">
            <div className="skeleton h-16 w-full rounded-xl" />
            <div className="skeleton h-9 w-full rounded-xl" />
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="skeleton w-7 h-7 rounded-full shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="skeleton h-3 w-20 mb-2" />
                  <div className="skeleton h-4 w-full mb-1" />
                  <div className="skeleton h-4 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
