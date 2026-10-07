import type { DocumentPickerAsset } from 'expo-document-picker';
export async function documentBytes(asset: DocumentPickerAsset): Promise<ArrayBuffer> {
  if (!asset.file) throw new Error('Choose this document again.');
  return asset.file.arrayBuffer();
}
