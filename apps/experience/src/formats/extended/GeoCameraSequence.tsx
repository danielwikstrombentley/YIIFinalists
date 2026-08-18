import { FormatCopy, FormatShell } from '../core/shared.js';
import type { ContentFormatProps } from '../types.js';

/**
 * Declares a geographic camera beat for the compiler. Rendering never writes a Cesium camera;
 * the compiler starts the supplied native-flight port at the sequence-owned beat instead.
 */
export function GeoCameraSequence({
  data,
  formatId = 'geographic-camera-sequence',
  nativeCameraFlight,
}: ContentFormatProps) {
  return (
    <FormatShell formatId={formatId}>
      <div
        aria-hidden="true"
        className="yii-content-format__geographic-camera"
        data-animation-target="geographic-camera-sequence.flight"
        data-camera-owner="native-flight"
        data-native-flight-active={String(nativeCameraFlight?.isNativeFlightActive ?? false)}
      />
      <FormatCopy
        data={data}
        target="geographic-camera-sequence.copy"
        className="yii-content-format__copy"
      />
    </FormatShell>
  );
}
