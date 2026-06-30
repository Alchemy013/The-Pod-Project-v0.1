import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';

export interface UploadFile {
  uri: string;
  name: string;
  size: number;
}

export interface UploadProgress {
  file: string;
  index: number;
  total: number;
  bytesSent: number;
  bytesTotal: number;
}

export async function pickAudioFiles(): Promise<UploadFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'audio/flac',
      'audio/mpeg',
      'audio/mp4',
      'audio/x-m4a',
      'audio/wav',
      'audio/aiff',
      'audio/ogg',
      'audio/opus',
      'audio/*',
    ],
    multiple: true,
    copyToCacheDirectory: false,
  });

  if (result.canceled) return [];

  return result.assets.map(a => ({
    uri: a.uri,
    name: a.name,
    size: a.size ?? 0,
  }));
}

export async function deleteTrack(ip: string, port: number, path: string): Promise<void> {
  const url = `http://${ip}:${port}/delete?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const msg = await res.text().catch(() => 'Delete failed');
    throw new Error(msg);
  }
}

export async function uploadFiles(
  ip: string,
  port: number,
  files: UploadFile[],
  onProgress: (p: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) throw new Error('Cancelled');

    const file = files[i];
    const url = `http://${ip}:${port}/upload?filename=${encodeURIComponent(file.name)}`;

    await new Promise<void>((resolve, reject) => {
      const task = FileSystem.createUploadTask(
        url,
        file.uri,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { 'Content-Type': 'application/octet-stream' },
          mimeType: 'application/octet-stream',
          sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
        },
        (data) => {
          onProgress({
            file: file.name,
            index: i + 1,
            total: files.length,
            bytesSent: data.totalBytesSent,
            bytesTotal: data.totalBytesExpectedToSend > 0
              ? data.totalBytesExpectedToSend
              : file.size,
          });
        },
      );

      if (signal) {
        signal.addEventListener('abort', () => {
          task.cancelAsync().catch(() => {});
          reject(new Error('Cancelled'));
        });
      }

      task.uploadAsync()
        .then(() => resolve())
        .catch(reject);
    });
  }
}
