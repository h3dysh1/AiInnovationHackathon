import { Notice } from '@/components/ui';
import type { VenuePoint } from '@/domain/site-geometry';

export type VenuePickerProps = { value: VenuePoint | null; onChange: (point: VenuePoint) => void; disabled?: boolean };

export default function VenuePicker(_props: VenuePickerProps) {
  return <Notice message="Open this screen in Expo Go to choose the venue on an interactive map. You can also enter its latitude and longitude below." />;
}
