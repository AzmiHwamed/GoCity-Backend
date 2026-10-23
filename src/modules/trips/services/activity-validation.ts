import { BadRequestException } from '@nestjs/common';
import { ActivityDetails } from '../entities/activity-details';
import { normalizeTime } from '../trip.utils';

type Details = Pick<
  ActivityDetails,
  | 'name'
  | 'dayNumber'
  | 'startTime'
  | 'endTime'
  | 'placeLatitude'
  | 'placeLongitude'
  | 'meetingLatitude'
  | 'meetingLongitude'
  | 'expense'
  | 'kind'
>;

const REQUIRED: (keyof Details)[] = [
  'name',
  'dayNumber',
  'startTime',
  'endTime',
  'expense',
  'kind',
];

export function assertCoordinatePair(
  lat: number | null | undefined,
  lng: number | null | undefined,
  label: string,
): void {
  if ((lat == null) !== (lng == null)) {
    throw new BadRequestException(`${label}Latitude and ${label}Longitude must be given together`);
  }
}

/** True when the activity can go on a map: a place or a meeting point with coordinates. */
export const hasLocation = (
  d: Pick<Details, 'placeLatitude' | 'placeLongitude' | 'meetingLatitude' | 'meetingLongitude'>,
) =>
  (d.placeLatitude != null && d.placeLongitude != null) ||
  (d.meetingLatitude != null && d.meetingLongitude != null);

/** New activities and ideas need a location so they show on the trip map and route. */
export function assertHasLocation(details: Parameters<typeof hasLocation>[0]): void {
  if (!hasLocation(details)) {
    throw new BadRequestException(
      'Pick the place from the search (placeLatitude and placeLongitude), or give a meeting point with coordinates, so the activity can be shown on the map',
    );
  }
}

/**
 * Normalizes times to HH:MM:SS (in place) and checks the rules that need the trip:
 * day within the trip, end after start, coordinates in pairs.
 */
export function validateActivityDetails(details: Details, durationDays: number): void {
  for (const key of REQUIRED) {
    if (details[key] === null || details[key] === undefined) {
      throw new BadRequestException(`${key} cannot be empty`);
    }
  }
  details.startTime = normalizeTime(details.startTime);
  details.endTime = normalizeTime(details.endTime);

  if (details.dayNumber > durationDays) {
    throw new BadRequestException(
      `dayNumber must be between 1 and ${durationDays} (the trip is ${durationDays} day${durationDays === 1 ? '' : 's'} long)`,
    );
  }
  if (details.endTime <= details.startTime) {
    throw new BadRequestException('endTime must be after startTime');
  }
  assertCoordinatePair(details.placeLatitude, details.placeLongitude, 'place');
  assertCoordinatePair(details.meetingLatitude, details.meetingLongitude, 'meeting');
}
