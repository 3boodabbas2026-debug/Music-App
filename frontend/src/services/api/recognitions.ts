import { Platform } from 'react-native';

import { apiClient } from './client';
import type { Job } from './types';

export type RecognitionMode = 'recording' | 'humming';

export type RecognitionCapabilities = {
  recording: boolean;
  humming: boolean;
  humming_provider: 'acrcloud' | null;
};

async function postRecognition(form: FormData): Promise<Job> {
  const { data } = await apiClient.post<Job>('/recognitions', form, {
    // Native RN FormData needs this set explicitly. On web the browser must
    // generate its own multipart boundary — setting this header manually
    // there strips the boundary and the server can't parse the body.
    headers: Platform.OS === 'web' ? undefined : { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function recognizeClip(
  fileUri: string,
  fileName: string,
  mimeType: string,
  mode: RecognitionMode = 'recording',
): Promise<Job> {
  const form = new FormData();
  form.append('recognition_mode', mode);
  if (Platform.OS === 'web') {
    // Browser FormData needs a real Blob/File, not RN's {uri,name,type} shape.
    const blob = await (await fetch(fileUri)).blob();
    form.append('file', blob, fileName);
  } else {
    form.append('file', { uri: fileUri, name: fileName, type: mimeType } as unknown as Blob);
  }
  return postRecognition(form);
}

export async function recognizeLibraryMedia(mediaId: string): Promise<Job> {
  const form = new FormData();
  form.append('media_id', mediaId);
  form.append('recognition_mode', 'recording');
  return postRecognition(form);
}

export async function getCapabilities(): Promise<RecognitionCapabilities> {
  const { data } = await apiClient.get<RecognitionCapabilities>('/recognitions/capabilities');
  return data;
}

/** Queue one aggregate background job for every unnamed audio track. The
 * worker chunks database reads internally; there is no user-visible ceiling. */
export async function recognizeWholeLibrary(): Promise<Job> {
  const { data } = await apiClient.post<Job>('/recognitions/library');
  return data;
}
