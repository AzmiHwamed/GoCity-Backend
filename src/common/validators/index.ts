import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Trims and lower-cases a string value (used for emails). */
export const ToLowerTrim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

/** 8-64 chars with at least one uppercase letter, one lowercase letter and one digit. */
export const IsStrongPassword = () =>
  applyDecorators(
    IsString(),
    MinLength(8),
    MaxLength(64),
    Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
      message: 'password must contain an uppercase letter, a lowercase letter and a number',
    }),
  );
