import { plainToInstance } from 'class-transformer';
import { DayRouteQueryDto } from './route.dto';

describe('DayRouteQueryDto', () => {
  // Same options as the global ValidationPipe (transform + implicit conversion).
  const parse = (query: Record<string, string>) =>
    plainToInstance(DayRouteQueryDto, query, { enableImplicitConversion: true });

  it('reads includeHotel from the query string correctly', () => {
    expect(parse({ day: '1', includeHotel: 'false' }).includeHotel).toBe(false);
    expect(parse({ day: '1', includeHotel: 'true' }).includeHotel).toBe(true);
    expect(parse({ day: '1', includeHotel: '1' }).includeHotel).toBe(true);
    expect(parse({ day: '1' }).includeHotel).toBe(false);
    expect(parse({ day: '2' }).day).toBe(2);
  });
});
