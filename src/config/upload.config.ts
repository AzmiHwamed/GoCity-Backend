import { registerAs } from '@nestjs/config';

export default registerAs('upload', () => ({
  maxFileSizeMb: parseFloat(process.env.MAX_FILE_SIZE_MB ?? '5'),
  /** Max images in one trip gallery. */
  maxTripImages: parseInt(process.env.MAX_TRIP_IMAGES ?? '30', 10),
}));
