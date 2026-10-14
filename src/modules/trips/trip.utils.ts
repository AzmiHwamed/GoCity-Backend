import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' → UTC midnight timestamp (no timezone surprises). */
export function parseDateOnly(value: string): number {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Inclusive number of days: 2026-11-01 → 2026-11-03 is 3 days. */
export function tripDurationDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  return Math.round((parseDateOnly(endDate) - parseDateOnly(startDate)) / DAY_MS) + 1;
}

/** '2026-12-30' + 3 → '2027-01-02' */
export function addDays(date: string, days: number): string {
  return new Date(parseDateOnly(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function assertValidDateRange(startDate: string, endDate: string): void {
  if (parseDateOnly(endDate) < parseDateOnly(startDate)) {
    throw new BadRequestException('endDate must be on or after startDate');
  }
}

/** 'HH:MM' or 'HH:MM:SS' → 'HH:MM:SS' (the format MySQL TIME columns return). */
export function normalizeTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Random URL-safe code for invite links (11 chars, 64 bits of entropy). */
export function generateInviteCode(): string {
  return randomBytes(8).toString('base64url');
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Majority rule for ideas, given the votes of current members:
 * - accepted when more than half of the members voted yes;
 * - rejected once that can no longer happen (half or more voted no);
 * - otherwise still open.
 */
export function decideIdea(
  yes: number,
  no: number,
  memberCount: number,
): 'accept' | 'reject' | null {
  if (memberCount <= 0) return null;
  if (yes > memberCount / 2) return 'accept';
  if (no >= memberCount / 2) return 'reject';
  return null;
}
