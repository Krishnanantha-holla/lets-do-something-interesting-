import { useState, useEffect } from 'react';

export function useLocationData(searchPin) {
  const [weatherData, setWeatherData] = useState(null);
  const [wikiData, setWikiData] = useState(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [loadingWiki, setLoadingWiki] = useState(false);

  useEffect(() => {
    if (!searchPin) {
      setWeatherData(null);
      setWikiData(null);
      return;
    }

    let cancelled = false;

    // Weather
    setLoadingWeather(true);
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${searchPin.latitude}&longitude=${searchPin.longitude}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min&timezone=auto`
    )
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data?.current) {
          setWeatherData({
            temp: data.current.temperature_2m,
            humidity: data.current.relative_humidity_2m,
            wind: data.current.wind_speed_10m,
            max: data.daily?.temperature_2m_max[0] ?? '--',
            min: data.daily?.temperature_2m_min[0] ?? '--',
          });
        }
      })
      .catch(() => { if (!cancelled) setWeatherData(null); })
      .finally(() => { if (!cancelled) setLoadingWeather(false); });

    // Wikipedia
    if (searchPin.name) {
      setLoadingWiki(true);
      fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchPin.name)}`)
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (cancelled) return;
          if (data && data.type !== 'disambiguation' && data.title) {
            setWikiData({
              title: data.title,
              extract: data.extract,
              thumbnail: data.thumbnail?.source,
              url: data.content_urls?.desktop?.page,
            });
          } else {
            setWikiData(null);
          }
        })
        .catch(() => { if (!cancelled) setWikiData(null); })
        .finally(() => { if (!cancelled) setLoadingWiki(false); });
    }

    return () => { cancelled = true; };
  }, [searchPin]);

  return { weatherData, wikiData, loadingWeather, loadingWiki };
}
