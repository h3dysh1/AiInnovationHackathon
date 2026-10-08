// Web recordings are durable data URLs, rather than session-scoped blob URLs.
export async function preserveIncidentAudio(uri: string, _requestId: string): Promise<string> {
  if (uri.startsWith('data:audio/')) return uri;
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Could not read the voice recording.');
  const blob = await response.blob();
  if (!blob.size || blob.size > 10485760) throw new Error('Keep voice reports under 10 MB.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not save the voice recording.'));
    reader.readAsDataURL(blob);
  });
}
