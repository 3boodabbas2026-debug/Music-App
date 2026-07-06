import { WS_BASE_URL } from '../../config';
import { tokenStorage } from '../storage/tokenStorage';
import type { Job } from './types';

const TERMINAL: Job['status'][] = ['complete', 'failed', 'cancelled'];

/**
 * Subscribes to live job progress. Falls back to nothing fancy on failure —
 * callers should already have the job's initial snapshot from the POST that
 * created it, so a socket error just means progress updates stop arriving,
 * not that the caller is left with no data at all.
 */
export function watchJob(jobId: string, onUpdate: (job: Job) => void): () => void {
  let socket: WebSocket | null = null;
  let cancelled = false;

  (async () => {
    const token = await tokenStorage.getAccessToken();
    if (cancelled || !token) return;
    socket = new WebSocket(`${WS_BASE_URL}/api/v1/ws/jobs/${jobId}?token=${encodeURIComponent(token)}`);
    socket.onmessage = (event) => {
      const job = JSON.parse(event.data) as Job;
      onUpdate(job);
      if (TERMINAL.includes(job.status)) {
        socket?.close();
      }
    };
  })();

  return () => {
    cancelled = true;
    socket?.close();
  };
}
