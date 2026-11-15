const collection = features => ({ type: 'FeatureCollection', features });

function point(coordinates, properties = {}) {
  return { type: 'Feature', geometry: { type: 'Point', coordinates }, properties };
}

function routeFeature(route, properties = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'MultiLineString', coordinates: route.segments },
    properties,
  };
}

function loadMapbox(version) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'https://api.mapbox.com/mapbox-gl-js/v' + version + '/mapbox-gl.css';
  document.head.append(stylesheet);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v' + version + '/mapbox-gl.js';
    const timeout = setTimeout(() => reject(new Error('Mapbox tidak dapat dimuat.')), 15000);
    script.onload = () => {
      clearTimeout(timeout);
      resolve(window.mapboxgl);
    };
    script.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Mapbox tidak dapat dimuat.'));
    };
    document.head.append(script);
  });
}

function waitForMap(map) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Peta tidak dapat dimuat.')), 15000);
    map.once('load', () => {
      clearTimeout(timeout);
      map.off('error', onError);
      resolve();
    });
    function onError() {
      clearTimeout(timeout);
      reject(new Error('Peta tidak dapat dimuat.'));
    }
    map.once('error', onError);
  });
}

export async function createFieldMap(container, places, onTap) {
  const config = window.ATLAS_CONFIG?.mapbox;
  if (!config?.publicAccessToken) throw new Error('Peta memerlukan konfigurasi Mapbox.');
  const mapbox = await loadMapbox(config.version || '3.33.0');
  const map = new mapbox.Map({
    container,
    accessToken: config.publicAccessToken,
    style: config.style || 'mapbox://styles/mapbox/light-v11',
    center: [110.439, -6.9465],
    zoom: 15.8,
    scrollZoom: false,
    touchPitch: false,
    attributionControl: true,
    locale: { 'NavigationControl.ZoomIn': 'Perbesar', 'NavigationControl.ZoomOut': 'Perkecil' },
  });
  try {
    await waitForMap(map);
  } catch (error) {
    map.remove();
    throw error;
  }
  map.addControl(new mapbox.NavigationControl({ showCompass: false }), 'top-right');
  const sourceNames = ['saved-routes', 'places', 'saved-points', 'draft-route', 'draft-point'];
  for (const name of sourceNames) map.addSource(name, { type: 'geojson', data: collection([]) });
  map.getSource('places').setData(collection(places.map(place => point(place.coordinates, {
    id: place.id,
    category: place.category,
  }))));

  const addLayer = (id, type, paint) => map.addLayer({
    id, type, source: id, paint,
    ...(type === 'line' ? { layout: { 'line-cap': 'round', 'line-join': 'round' } } : {}),
  });
  addLayer('saved-routes', 'line', { 'line-color': '#5a469f', 'line-width': 5, 'line-opacity': .8 });
  addLayer('draft-route', 'line', { 'line-color': '#5a469f', 'line-width': 5, 'line-dasharray': [1.6, 1] });
  addLayer('places', 'circle', {
    'circle-color': ['match', ['get', 'category'], 'Development', '#8570ce', 'Assets', '#90bf9c', 'Risks', '#32b7c2', '#879497'],
    'circle-radius': 5,
    'circle-stroke-color': '#fff',
    'circle-stroke-width': 1.2,
  });
  addLayer('saved-points', 'circle', {
    'circle-color': '#5a469f', 'circle-radius': 7, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
  });
  addLayer('draft-point', 'circle', {
    'circle-color': '#5a469f', 'circle-radius': 8, 'circle-stroke-color': '#edbe40', 'circle-stroke-width': 3,
  });

  map.on('click', event => {
    const { x, y } = event.point;
    const hits = map.queryRenderedFeatures([[x - 7, y - 7], [x + 7, y + 7]], {
      layers: ['saved-points', 'places', 'saved-routes'],
    });
    const hit = hits[0];
    onTap({
      coordinates: event.lngLat.wrap().toArray(),
      mappedId: hit?.layer.id === 'places' ? hit.properties.id : null,
      recordId: hit?.properties.recordId || null,
    });
  });

  function fit(coordinates) {
    if (!coordinates.length) return;
    const bounds = new mapbox.LngLatBounds();
    for (const [lon, lat] of coordinates) bounds.extend([lon, Math.max(-85, Math.min(85, lat))]);
    map.fitBounds(bounds, { padding: 32, duration: 300, maxZoom: 17.6 });
  }

  return {
    fit,
    resize: () => map.resize(),
    setPlacing(isPlacing) {
      map.getCanvas().style.cursor = isPlacing ? 'crosshair' : '';
    },
    setDraft(draft) {
      map.getSource('draft-point').setData(collection(draft.place ? [point(draft.place.coordinates)] : []));
      map.getSource('draft-route').setData(collection(draft.route ? [routeFeature(draft.route)] : []));
    },
    setRecords(records) {
      const pins = records.filter(record => record.place).map(record =>
        point(record.place.coordinates, { recordId: record.id }));
      const routes = records.filter(record => record.route).map(record =>
        routeFeature(record.route, { recordId: record.id }));
      map.getSource('saved-points').setData(collection(pins));
      map.getSource('saved-routes').setData(collection(routes));
    },
  };
}
