declare function applyTheme(theme: string): void;
export declare function useTheme(): {
    theme: string;
    resolvedTheme: string;
    setTheme: (t: string) => Promise<void>;
};
export { applyTheme };
