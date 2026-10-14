import { ValueTransformer } from 'typeorm';

/** MySQL returns DECIMAL columns as strings; expose them as numbers. */
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};
