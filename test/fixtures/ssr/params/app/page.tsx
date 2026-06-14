/* eslint-disable @typescript-eslint/no-explicit-any */
export default function Home() {
  const params = (globalThis as any).__TEST_PARAMS
  return (
    <div>
      <h1>Home</h1>
      {params?.id ? <p>param:{params.id}</p> : null}
    </div>
  )
}
