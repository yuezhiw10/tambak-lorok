export async function loadPlaces() {
  const points = window.ATLAS_DATA?.points;
  if (!Array.isArray(points)) throw new Error('Daftar tempat tidak dapat dimuat.');
  return points.map(point => ({
    kind: 'mapped',
    id: point.id,
    coordinates: [point.lon, point.lat],
    name: point.name_original?.trim() || point.name || 'Tempat terpetakan',
    englishName: point.name,
    group: point.group,
    category: point.category,
  }));
}

function gpxCoordinate(point) {
  const latitude = point.getAttribute('lat');
  const longitude = point.getAttribute('lon');
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!latitude?.trim() || !longitude?.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) ||
      Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error('Berkas GPX memiliki koordinat yang tidak valid.');
  }
  return [lon, lat];
}

export async function readGpx(file) {
  const xml = new DOMParser().parseFromString(await file.text(), 'application/xml');
  const root = xml.documentElement;
  if (xml.doctype || root.localName !== 'gpx' || xml.getElementsByTagName('parsererror').length) {
    throw new Error('Berkas ini bukan GPX yang valid. Pilih berkas hasil Export GPX.');
  }
  const tracks = [...root.getElementsByTagNameNS('*', 'trkseg'), ...root.getElementsByTagNameNS('*', 'rte')];
  const segments = tracks.map(segment => [...segment.children]
    .filter(point => point.localName === 'trkpt' || point.localName === 'rtept')
    .map(gpxCoordinate))
    .filter(segment => segment.length >= 2);
  if (!segments.length) throw new Error('Rute perlu memiliki setidaknya dua titik GPS pada satu segmen.');
  const name = root.getElementsByTagNameNS('*', 'name')[0]?.textContent.trim() || file.name.replace(/\.gpx$/i, '');
  return {
    name: name || 'Rute GPX',
    segments,
    pointCount: segments.reduce((total, segment) => total + segment.length, 0),
  };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('tambak-lorok-walking-interviews', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Penyimpanan sedang digunakan oleh tab lain.'));
  });
}

async function useRecords(mode, action) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('records', mode);
      const request = action(transaction.objectStore('records'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error || request.error);
    });
  } finally {
    database.close();
  }
}

export async function readRecords() {
  const records = await useRecords('readonly', store => store.getAll());
  return records.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveRecord(record) {
  return useRecords('readwrite', store => store.put(record));
}
