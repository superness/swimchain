import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface Space {
  id: string;
  name: string;
  description: string;
  post_count: number;
  subscriber_count: number;
}

interface Post {
  id: string;
  space_id: string;
  author: string;
  title: string;
  body: string;
  timestamp: number;
  decay_score: number;
  reply_count: number;
}

interface SwimchainContextValue {
  connected: boolean;
  endpoint: string;
  spaces: Space[];
  getSpaceContent: (spaceId: string) => Promise<Post[]>;
  submitPost: (spaceId: string, title: string, body: string) => Promise<void>;
  refreshSpaces: () => Promise<void>;
}

const SwimchainContext = createContext<SwimchainContextValue | null>(null);

interface RpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function rpcCall<T>(endpoint: string, method: string, params: unknown[] = [], authHeader?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (authHeader) {
    headers["Authorization"] = authHeader;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id: Date.now(),
    }),
  });

  const data: RpcResponse<T> = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return data.result as T;
}

interface ProviderProps {
  endpoint: string;
  authHeader?: string;
  children: ReactNode;
}

export function SwimchainProvider({ endpoint, authHeader, children }: ProviderProps) {
  const [connected, setConnected] = useState(false);
  const [spaces, setSpaces] = useState<Space[]>([]);

  // Test connection
  useEffect(() => {
    const testConnection = async () => {
      try {
        await rpcCall(endpoint, "get_info", [], authHeader);
        setConnected(true);
      } catch (e) {
        console.error("RPC connection failed:", e);
        setConnected(false);
      }
    };

    testConnection();
    const interval = setInterval(testConnection, 10000);
    return () => clearInterval(interval);
  }, [endpoint, authHeader]);

  // Load spaces when connected
  useEffect(() => {
    if (connected) {
      refreshSpaces();
    }
  }, [connected]);

  const refreshSpaces = async () => {
    try {
      const result = await rpcCall<{ spaces: Space[] }>(endpoint, "get_spaces", [], authHeader);
      setSpaces(result.spaces || []);
    } catch (e) {
      console.error("Failed to load spaces:", e);
      setSpaces([]);
    }
  };

  const getSpaceContent = async (spaceId: string): Promise<Post[]> => {
    try {
      const result = await rpcCall<{ content: Post[] }>(endpoint, "get_space_content", [spaceId], authHeader);
      return result.content || [];
    } catch (e) {
      console.error("Failed to load space content:", e);
      return [];
    }
  };

  const submitPost = async (spaceId: string, title: string, body: string) => {
    // This would need to:
    // 1. Sign the content with user's identity
    // 2. Perform PoW
    // 3. Submit via RPC
    // For now, just a placeholder
    throw new Error("Post submission not yet implemented - need identity and PoW");
  };

  return (
    <SwimchainContext.Provider
      value={{
        connected,
        endpoint,
        spaces,
        getSpaceContent,
        submitPost,
        refreshSpaces,
      }}
    >
      {children}
    </SwimchainContext.Provider>
  );
}

export function useSwimchain() {
  const context = useContext(SwimchainContext);
  if (!context) {
    throw new Error("useSwimchain must be used within a SwimchainProvider");
  }
  return context;
}
