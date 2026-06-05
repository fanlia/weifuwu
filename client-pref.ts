export type UrlInterceptor = (url: URL) => boolean | Promise<boolean>

const interceptors: UrlInterceptor[] = []

export function addInterceptor(fn: UrlInterceptor): void {
  interceptors.push(fn)
}

export async function runInterceptors(url: URL): Promise<boolean> {
  for (const fn of interceptors) {
    if (await fn(url)) return true
  }
  return false
}
