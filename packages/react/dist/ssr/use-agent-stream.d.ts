export interface AgentStreamState {
    streams: Record<number, string>;
    streaming: boolean;
    activeAgents: Set<number>;
}
export interface UseAgentStreamOptions {
    wsPath: string;
    channelId: number;
    onStreamEnd?: (agentId: number, fullText: string) => void;
    onError?: (agentId: number, error: string) => void;
}
export interface UseAgentStreamReturn {
    stream: AgentStreamState;
    getAgentText: (agentId: number) => string;
    isAgentStreaming: (agentId: number) => boolean;
}
export declare function useAgentStream(opts: UseAgentStreamOptions): UseAgentStreamReturn;
