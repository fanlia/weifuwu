import type { Context, Middleware } from '../types.ts';
import { generateText as aiGenerateText, streamText as aiStreamText, type LanguageModel, type EmbeddingModel } from 'ai';
declare module '../types.ts' {
    interface Context {
        ai: AIProvider;
    }
}
export interface AIProviderInjected {
    ai: AIProvider;
}
export interface AIProviderOptions {
    /** API base URL (default: OPENAI_BASE_URL env or http://localhost:11434/v1). */
    baseURL?: string;
    /** API key (default: OPENAI_API_KEY env or 'ollama'). */
    apiKey?: string;
    /** Chat model name (default: OPENAI_MODEL env or 'qwen3:0.6b'). */
    model?: string;
    /** Embedding model name (default: OPENAI_EMBEDDING_MODEL env or 'qwen3-embedding:0.6b'). */
    embeddingModel?: string;
    /** Vector dimension (default: EMBEDDING_DIMENSION env or 1024). */
    embeddingDimension?: number;
}
export interface AIProvider {
    /** Get the language model. Caches by default; pass a name to override. */
    model(name?: string): LanguageModel;
    /** Get the embedding model. Caches by default; pass a name to override. */
    embeddingModel(name?: string): EmbeddingModel;
    /** Embed a single text string into a vector. */
    embed(text: string): Promise<number[]>;
    /** Embed multiple text strings in batch. */
    embedMany(texts: string[]): Promise<number[][]>;
    /** The configured vector dimension. */
    readonly dimension: number;
    /**
     * Generate text using the configured model.
     * All options are passed through to the AI SDK's `generateText`, with `model` auto-injected.
     */
    generateText(params: Omit<Parameters<typeof aiGenerateText>[0], 'model'>): ReturnType<typeof aiGenerateText>;
    /**
     * Stream text using the configured model.
     * All options are passed through to the AI SDK's `streamText`, with `model` auto-injected.
     */
    streamText(params: Omit<Parameters<typeof aiStreamText>[0], 'model'>): ReturnType<typeof aiStreamText>;
}
export declare function aiProvider(options?: AIProviderOptions): Middleware<Context, Context & AIProviderInjected> & AIProvider;
