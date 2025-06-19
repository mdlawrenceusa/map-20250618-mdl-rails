import { logger } from './logger';

export class AudioProcessor {
  private audioQueue: Buffer[] = [];
  private isProcessing = false;

  constructor() {
    logger.info('AudioProcessor initialized');
  }

  /**
   * Convert L16 PCM audio from Vonage to format expected by Nova Sonic
   */
  convertVonageToNovaSonic(audioData: Buffer): Buffer {
    // Vonage sends 16-bit PCM at 16kHz, which matches Nova Sonic's requirements
    // No conversion needed, but we may need to handle chunking
    return audioData;
  }

  /**
   * Convert Nova Sonic output audio to format expected by Vonage
   */
  convertNovaSonicToVonage(audioData: Buffer): Buffer {
    // Nova Sonic outputs 16-bit PCM at 24kHz, Vonage expects 16kHz
    // For now, we'll assume Nova Sonic outputs at 16kHz as requested
    return audioData;
  }

  /**
   * Queue audio for processing to handle buffering
   */
  queueAudio(audioData: Buffer): void {
    this.audioQueue.push(audioData);
  }

  /**
   * Get queued audio
   */
  getQueuedAudio(): Buffer | null {
    if (this.audioQueue.length === 0) {
      return null;
    }

    // Combine multiple small chunks into larger ones for efficiency
    const minChunkSize = 1600; // 100ms at 16kHz
    let combinedSize = 0;
    let chunksToMerge = 0;

    for (let i = 0; i < this.audioQueue.length; i++) {
      combinedSize += this.audioQueue[i].length;
      chunksToMerge++;
      if (combinedSize >= minChunkSize) {
        break;
      }
    }

    if (combinedSize < minChunkSize && this.audioQueue.length < 10) {
      // Wait for more audio unless we have a lot of small chunks
      return null;
    }

    const chunks = this.audioQueue.splice(0, chunksToMerge);
    return Buffer.concat(chunks);
  }

  /**
   * Clear audio queue
   */
  clearQueue(): void {
    this.audioQueue = [];
  }

  /**
   * Generate silence for padding
   */
  generateSilence(durationMs: number, sampleRate: number = 16000): Buffer {
    const samples = Math.floor((durationMs / 1000) * sampleRate);
    const silence = Buffer.alloc(samples * 2); // 16-bit = 2 bytes per sample
    return silence;
  }
}