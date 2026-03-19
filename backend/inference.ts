import axios from 'axios';
import { PromptData, ChatbotStats, ModelGroupStats, GlobalStats } from './types';
import * as fs from 'fs';
import * as path from 'path';

const PROMPTS_PATH = path.join(process.cwd(), 'prompts.json');
const prompts: PromptData = JSON.parse(fs.readFileSync(PROMPTS_PATH, 'utf-8'));

export class InferenceManager {
  private modelGroups: ModelGroupStats[] = [];
  private globalStats: GlobalStats = { totalTps: 0, peakTps: 0, isStarted: false };
  private onUpdate: (data: any) => void;
  private messageBuffer: any[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(onUpdate: (data: any) => void) {
    this.onUpdate = onUpdate;
    this.initializeModelGroups();
    this.startFlushTimer();
  }

  private startFlushTimer() {
    this.flushInterval = setInterval(() => {
      if (this.messageBuffer.length > 0) {
        this.onUpdate({
          type: 'BATCH_UPDATE',
          payload: this.messageBuffer
        });
        this.messageBuffer = [];
      }
    }, 50); // Flush every 50ms
  }

  private initializeModelGroups() {
    const models = [
      { name: process.env.MODEL_A_NAME || 'Model A', url: process.env.MODEL_A_URL || 'http://localhost:8081' },
      { name: process.env.MODEL_B_NAME || 'Model B', url: process.env.MODEL_B_URL || 'http://localhost:8082' },
      { name: process.env.MODEL_C_NAME || 'Model C', url: process.env.MODEL_C_URL || 'http://localhost:8083' },
      { name: process.env.MODEL_D_NAME || 'Model D', url: process.env.MODEL_D_URL || 'http://localhost:8084' },
    ];

    this.modelGroups = models.map((m, mIdx) => ({
      name: m.name,
      url: m.url,
      aggregateTps: 0,
      chatbots: Array.from({ length: 5 }, (_, cIdx) => ({
        id: mIdx * 5 + cIdx,
        tps: 0,
        totalTokens: 0,
        startTime: 0,
        currentTime: 0,
        isGenerating: false,
        lastToken: '',
        fullResponse: '',
      })),
    }));
  }

  public async startAll() {
    if (this.globalStats.isStarted) return;
    this.globalStats.isStarted = true;
    this.globalStats.peakTps = 0;
    this.onUpdate({ type: 'STATUS_CHANGE', payload: { isStarted: true } });

    // Start all 4 model groups in parallel
    await Promise.all(this.modelGroups.map(group => this.runModelGroup(group)));

    this.globalStats.isStarted = false;
    this.onUpdate({ type: 'STATUS_CHANGE', payload: { isStarted: false } });
  }

  public stopAll() {
    this.globalStats.isStarted = false;
    // In a real app, we would signal the active requests to abort.
    // For this PoC, we'll let them finish or reset state.
  }

  private async runModelGroup(group: ModelGroupStats) {
    // Start all 5 chatbots in parallel, each running its own 5 rounds
    await Promise.all(group.chatbots.map(chatbot => this.runChatbotRounds(group, chatbot)));
    
    // Final update after all rounds complete
    group.aggregateTps = group.chatbots.reduce((sum, cb) => sum + cb.tps, 0);
    this.updateGlobalStats();
  }

  private async runChatbotRounds(group: ModelGroupStats, chatbot: ChatbotStats) {
    for (let round = 0; round < 5; round++) {
      if (!this.globalStats.isStarted) break;
      await this.runChatbot(group, chatbot, round);
      
      // Update group aggregate TPS after each chatbot completes a round
      group.aggregateTps = group.chatbots.reduce((sum, cb) => sum + cb.tps, 0);
      this.updateGlobalStats();
    }
  }

  private async runChatbot(group: ModelGroupStats, chatbot: ChatbotStats, round: number) {
    const prompt = prompts[chatbot.id.toString()][round];
    chatbot.isGenerating = true;
    chatbot.fullResponse = '';
    chatbot.totalTokens = 0;
    chatbot.startTime = Date.now();
    chatbot.currentTime = Date.now();

    try {
      const response = await axios.post(`${group.url}/completion`, {
        prompt: prompt,
        stream: true,
        n_predict: 256, // limit for PoC speed
      }, { responseType: 'stream' });

      let buffer = '';
      return new Promise<void>((resolve, reject) => {
        response.data.on('data', (chunk: Buffer) => {
          if (!this.globalStats.isStarted) {
            response.data.destroy();
            resolve();
            return;
          }

          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep the last partial line in the buffer

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmedLine.slice(6));
                if (data.content) {
                  chatbot.lastToken = data.content;
                  chatbot.fullResponse += data.content;
                  chatbot.totalTokens++;
                  chatbot.currentTime = Date.now();
                  
                  // Calculate live TPS
                  const durationSeconds = (chatbot.currentTime - chatbot.startTime) / 1000;
                  chatbot.tps = durationSeconds > 0 ? chatbot.totalTokens / durationSeconds : 0;

                  // Buffer the stream update
                  this.messageBuffer.push({
                    type: 'TEXT_STREAM',
                    payload: {
                      chatbotId: chatbot.id,
                      token: data.content,
                      tps: chatbot.tps,
                      totalTokens: chatbot.totalTokens
                    }
                  });
                  
                  this.updateGlobalStats();
                }
                if (data.stop) {
                  chatbot.isGenerating = false;
                  resolve();
                }
              } catch (e) {
                // Ignore parse errors for malformed lines
              }
            }
          }
        });

        response.data.on('end', () => {
          chatbot.isGenerating = false;
          resolve();
        });

        response.data.on('error', (err: any) => {
          chatbot.isGenerating = false;
          console.error(`Chatbot ${chatbot.id} error:`, err.message);
          resolve(); // Resolve to not block the whole group
        });
      });
    } catch (error: any) {
      console.error(`Failed to connect to model ${group.name} at ${group.url}:`, error.message);
      chatbot.isGenerating = false;
    }
  }

  private updateGlobalStats() {
    const totalTps = this.modelGroups.reduce((sum, group) => {
      return sum + group.chatbots.reduce((cbSum, cb) => cbSum + cb.tps, 0);
    }, 0);

    this.globalStats.totalTps = totalTps;
    if (totalTps > this.globalStats.peakTps) {
      this.globalStats.peakTps = totalTps;
    }

    // Buffer the stats update
    this.messageBuffer.push({
      type: 'STATS_UPDATE',
      payload: {
        totalTps: this.globalStats.totalTps,
        peakTps: this.globalStats.peakTps,
        modelGroups: this.modelGroups.map(g => ({
          name: g.name,
          aggregateTps: g.chatbots.reduce((sum, cb) => sum + cb.tps, 0)
        }))
      }
    });
  }

  public getModelGroups() {
    return this.modelGroups;
  }

  public getGlobalStats() {
    return this.globalStats;
  }
}
