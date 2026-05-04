// Renders during route transitions inside the (dashboard) group while the
// destination's server work resolves. Pairs with the per-component loading
// skeletons (LatestInsights, KPI sparklines) for the in-page data fetches.
export default function Loading() {
  return (
    <>
      <div className="rh-progress-bar" aria-hidden="true">
        <div className="rh-progress-bar-inner" />
      </div>
      <div className="space-y-3 animate-pulse">
        <div className="h-7 w-48 bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
        <div className="h-4 w-64 bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3 mt-6">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded p-4">
              <div className="h-3 w-20 bg-[#f4f4f5] dark:bg-[#27272a] rounded mb-3" />
              <div className="h-6 w-24 bg-[#f4f4f5] dark:bg-[#27272a] rounded" />
            </div>
          ))}
        </div>
        <div className="h-72 bg-white dark:bg-[#18181b] border border-[#e4e4e7] dark:border-[#3f3f46] rounded mt-6" />
      </div>
    </>
  );
}
