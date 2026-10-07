import { File } from 'expo-file-system';
import type { DocumentPickerAsset } from 'expo-document-picker';
export async function documentBytes(asset: DocumentPickerAsset): Promise<ArrayBuffer> {
  return new File(asset.uri).arrayBuffer();
}
