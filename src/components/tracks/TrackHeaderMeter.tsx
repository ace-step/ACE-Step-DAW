import { StereoMeter } from './StereoMeter';

interface TrackHeaderMeterProps {
  trackId: string;
}

export function TrackHeaderMeter({ trackId }: TrackHeaderMeterProps) {
  return <StereoMeter trackId={trackId} />;
}
