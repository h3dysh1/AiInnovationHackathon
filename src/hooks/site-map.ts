import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import type { SiteMap } from '@/domain/site';
import { errorMessage } from '@/domain/errors';
import { useAuth } from '@/hooks/auth';
import { getSiteMap, getSiteMapUrl, uploadSiteMap } from '@/services/site';

export function useSiteMap(eventId: string) {
  const { session } = useAuth();
  const [map, setMap] = useState<SiteMap | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    try {
      const next = await getSiteMap(eventId);
      if (requestId.current !== request) return;
      setMap(next);
      setUrl(null);
      const nextUrl = next ? await getSiteMapUrl(next.storage_path) : null;
      if (requestId.current === request) { setUrl(nextUrl); setError(null); }
    } catch (cause) {
      if (requestId.current === request) setError(errorMessage(cause, 'Could not load the site map. Try again.'));
    } finally { if (requestId.current === request) setLoading(false); }
  }, [eventId]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { requestId.current++; };
  }, [load]));

  async function upload(): Promise<boolean> {
    if (!session || uploading) return false;
    const request = ++requestId.current;
    setUploading(true);
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 1, allowsEditing: false });
      if (result.canceled) return false;
      const asset = result.assets[0];
      if (!asset.base64) throw new Error('Could not read the selected image.');
      const next = await uploadSiteMap(eventId, session.user.id, asset.base64, asset.width, asset.height);
      if (requestId.current !== request) return false;
      setMap(next);
      setUrl(null);
      try {
        const nextUrl = await getSiteMapUrl(next.storage_path);
        if (requestId.current === request) setUrl(nextUrl);
      } catch {
        if (requestId.current === request) setError('Map saved, but its preview could not load. Reload the map to try displaying it again.');
      }
      if (requestId.current !== request) return false;
      return true;
    } catch (cause) {
      if (requestId.current === request) setError(errorMessage(cause, 'Could not upload the map. Try again.'));
      return false;
    } finally { setUploading(false); }
  }

  function refresh() { void load(); }
  function reportPreviewError() { setError('The map is saved, but its image could not be displayed. Reload the map to try again.'); }
  return { map, url, loading, uploading, error, upload, refresh, setMap, reportPreviewError };
}

export type SiteMapState = ReturnType<typeof useSiteMap>;
