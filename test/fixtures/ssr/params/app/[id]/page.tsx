/* eslint-disable @typescript-eslint/no-explicit-any */
export default function IdPage() {
  const params = (globalThis as any).__TEST_PARAMS
  return (
    <div>
      <h2>ID: {params?.id}</h2>
    </div>
  )
}
