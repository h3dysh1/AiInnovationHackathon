export type WeatherReading = {
  observedAt: string; temperature: number; feelsLike: number; windSpeed: number;
  windGust: number; precipitation: number; weatherCode: number;
};
export function parseWeather(value: unknown, now = Date.now()): WeatherReading {
  if (!value || typeof value !== 'object') throw new Error('Invalid weather response.');
  const current = (value as Record<string, unknown>).current;
  if (!current || typeof current !== 'object') throw new Error('Current weather unavailable.');
  const c = current as Record<string, unknown>;
  const number = (name: string, min: number, max: number) => {
    const value = c[name];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Invalid weather reading.');
    return value;
  };
  const seconds = number('time', 0, now / 1000 + 900);
  if (now - seconds * 1000 > 3600000) throw new Error('Weather data is stale. Last successful reading is retained.');
  return {
    observedAt: new Date(seconds * 1000).toISOString(),
    temperature: number('temperature_2m', -100, 70), feelsLike: number('apparent_temperature', -150, 100),
    windSpeed: number('wind_speed_10m', 0, 400), windGust: number('wind_gusts_10m', 0, 500),
    precipitation: number('precipitation', 0, 1000), weatherCode: number('weather_code', 0, 99),
  };
}
export const weatherDescription = (r: WeatherReading) => `Open-Meteo modelled conditions: ${r.temperature}°C (feels ${r.feelsLike}°C), wind ${r.windSpeed} km/h, gusts ${r.windGust} km/h, precipitation ${r.precipitation} mm. Advisory information; check site conditions and event procedures.`;
