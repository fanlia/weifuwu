export declare function useLocale(): {
    locale: string | undefined;
    setLocale: (locale: string) => Promise<void>;
    t: (key: string, params?: Record<string, string>, fallback?: string) => string;
};
