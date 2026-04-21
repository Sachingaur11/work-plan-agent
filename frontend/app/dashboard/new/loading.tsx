export default function NewProjectLoading() {
  return (
    <div className="p-8 max-w-2xl">
      <div className="skeleton h-4 w-32 mb-6" />
      <div className="skeleton h-8 w-40 mb-1" />
      <div className="skeleton h-4 w-64 mb-8" />
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 mb-4 space-y-4">
        <div className="skeleton h-5 w-32" />
        <div className="skeleton h-11 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-4">
          <div className="skeleton h-11 rounded-xl" />
          <div className="skeleton h-11 rounded-xl" />
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 mb-6">
        <div className="skeleton h-5 w-40 mb-4" />
        <div className="skeleton h-48 rounded-xl" />
      </div>
      <div className="skeleton h-12 w-full rounded-xl" />
    </div>
  );
}
