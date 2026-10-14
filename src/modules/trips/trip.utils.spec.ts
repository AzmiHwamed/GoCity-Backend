import { BadRequestException } from '@nestjs/common';
import { Trip } from './entities/trip.entity';
import { validateActivityDetails } from './services/activity-validation';
import { ActivityKind } from './trip.enums';
import { assertValidDateRange, decideIdea, normalizeTime, tripDurationDays } from './trip.utils';

describe('trip utils', () => {
  describe('durationDays', () => {
    it.each([
      ['2026-11-01', '2026-11-01', 1],
      ['2026-11-01', '2026-11-03', 3],
      ['2026-12-30', '2027-01-02', 4],
      ['2026-03-28', '2026-03-30', 3], // across a DST change
      ['2028-02-28', '2028-03-01', 3], // leap year
    ])('%s → %s is %i day(s)', (start, end, days) => {
      expect(tripDurationDays(start, end)).toBe(days);
    });

    it('is exposed on the entity, with the total budget', () => {
      const trip = Object.assign(new Trip(), {
        startDate: '2026-11-01',
        endDate: '2026-11-03',
        budgetPerPerson: 100.5,
        travelersCount: 3,
      });
      expect(trip.durationDays).toBe(3);
      expect(trip.totalBudget).toBe(301.5);
    });

    it('rejects an end date before the start date', () => {
      expect(() => assertValidDateRange('2026-11-03', '2026-11-01')).toThrow(BadRequestException);
      expect(() => assertValidDateRange('2026-11-01', '2026-11-01')).not.toThrow();
    });
  });

  describe('decideIdea (majority of current members)', () => {
    it.each([
      // yes, no, members, result
      [1, 0, 1, 'accept'], // solo trip: your own yes is the majority
      [2, 0, 3, 'accept'],
      [1, 0, 3, null],
      [2, 1, 4, null], // 2 of 4 is not more than half
      [3, 0, 4, 'accept'],
      [2, 2, 4, 'reject'], // tie: yes can no longer get a majority
      [1, 1, 2, 'reject'],
      [0, 2, 5, null],
      [0, 3, 5, 'reject'],
      [0, 0, 0, null],
    ])('yes=%i no=%i members=%i → %s', (yes, no, members, expected) => {
      expect(decideIdea(yes, no, members)).toBe(expected);
    });
  });

  describe('activity validation', () => {
    const base = () => ({
      kind: ActivityKind.ACTIVITY,
      name: 'Museum',
      dayNumber: 2,
      startTime: '09:00',
      endTime: '11:30',
      expense: 0,
      placeLatitude: null,
      placeLongitude: null,
      meetingLatitude: null,
      meetingLongitude: null,
    });

    it('normalizes times to HH:MM:SS', () => {
      const d = base();
      validateActivityDetails(d, 3);
      expect(d.startTime).toBe('09:00:00');
      expect(d.endTime).toBe('11:30:00');
      expect(normalizeTime('07:05:09')).toBe('07:05:09');
    });

    it('rejects a day outside the trip', () => {
      expect(() => validateActivityDetails({ ...base(), dayNumber: 4 }, 3)).toThrow(
        'dayNumber must be between 1 and 3',
      );
      expect(() => validateActivityDetails({ ...base(), dayNumber: 3 }, 3)).not.toThrow();
    });

    it('rejects an end time that is not after the start time', () => {
      expect(() =>
        validateActivityDetails({ ...base(), startTime: '10:00', endTime: '10:00' }, 3),
      ).toThrow('endTime must be after startTime');
    });

    it('requires latitude and longitude together', () => {
      expect(() => validateActivityDetails({ ...base(), placeLatitude: 38.7 }, 3)).toThrow(
        'placeLatitude and placeLongitude must be given together',
      );
      expect(() =>
        validateActivityDetails({ ...base(), meetingLatitude: 1, meetingLongitude: 2 }, 3),
      ).not.toThrow();
    });

    it('rejects clearing a required field', () => {
      expect(() =>
        validateActivityDetails({ ...base(), name: null as unknown as string }, 3),
      ).toThrow('name cannot be empty');
    });
  });
});
