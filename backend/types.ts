export interface ChatbotStats {
  id: number;
  tps: number;
  totalTokens: number;
  startTime: number;
  currentTime: number;
  isGenerating: boolean;
  lastToken: string;
  fullResponse: string;
}

export interface ModelGroupStats {
  name: string;
  url: string;
  chatbots: ChatbotStats[];
  aggregateTps: number;
}

export interface GlobalStats {
  totalTps: number;
  peakTps: number;
  isStarted: boolean;
}

export interface WebSocketMessage {
  type: 'STATS_UPDATE' | 'TEXT_STREAM' | 'STATUS_CHANGE';
  payload: any;
}

export interface PromptData {
  [chatbotId: string]: string[];
}
