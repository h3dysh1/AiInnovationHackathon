import { Directory, File, Paths } from 'expo-file-system';

const outbox = () => new Directory(Paths.document, 'incident-outbox');

export async function preserveIncidentAudio(uri: string, requestId: string): Promise<string> {
  const directory = outbox();
  directory.create({ intermediates: true, idempotent: true });
  const original = new File(uri);
  const saved = new File(directory, `${requestId}.m4a`);
  if (saved.exists) return saved.uri;
  if (!original.exists) throw new Error('The recording is missing. Your written report is retained.');
  if (!original.size || original.size > 10485760) throw new Error('Keep voice reports under 10 MB.');
  original.copy(saved);
  return saved.uri;
}

// Only call once the server has confirmed it holds the recording.
export function releaseIncidentAudio(requestId: string): void {
  const saved = new File(outbox(), `${requestId}.m4a`);
  if (saved.exists) saved.delete();
}
