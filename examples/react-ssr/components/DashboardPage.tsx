export function DashboardPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-200 p-6">
          <div className="text-2xl font-bold">1,234</div>
          <div className="text-gray-500 text-sm">Total Users</div>
        </div>
        <div className="rounded-lg border border-gray-200 p-6">
          <div className="text-2xl font-bold">567</div>
          <div className="text-gray-500 text-sm">Active Sessions</div>
        </div>
      </div>
    </div>
  )
}
