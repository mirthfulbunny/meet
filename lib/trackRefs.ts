import { isTrackReference, TrackReferenceOrPlaceholder } from '@livekit/components-react';

// Not exported from components-react; same logic as components-core's isEqualTrackRef.
export function isEqualTrackRef(a?: TrackReferenceOrPlaceholder, b?: TrackReferenceOrPlaceholder) {
  if (a === undefined || b === undefined) {
    return false;
  }
  if (isTrackReference(a) && isTrackReference(b)) {
    return a.publication.trackSid === b.publication.trackSid;
  }
  return (
    !isTrackReference(a) &&
    !isTrackReference(b) &&
    a.participant.identity === b.participant.identity &&
    a.source === b.source
  );
}
