import { loadPlaces, readGpx, readRecords, saveRecord } from './data.js';
import { createFieldMap } from './map.js';

const byId = id => document.getElementById(id);
const form = byId('capture-form');
const search = byId('place-search');
const results = byId('search-results');
const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const categoryNames = { Development: 'Pembangunan', Assets: 'Aset', Risks: 'Risiko' };
const mapHint = 'Ketuk titik yang sudah ada atau ruang kosong untuk menambah titik.';

if (new URLSearchParams(location.search).get('from') === 'en') {
  byId('workshop-return').href = '../en.html#january-workshop';
}

function newDraft() {
  return { id: crypto.randomUUID(), place: null, route: null, media: [] };
}

const state = {
  screen: 'map',
  places: [],
  placesById: new Map(),
  records: [],
  draft: newDraft(),
  map: null,
  pendingFit: null,
  placing: false,
  review: null,
  detail: null,
};

let audioRecorder = null;
let requestingAudio = false;
let saving = false;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function setMessage(id, text, isError = false) {
  const node = byId(id);
  node.textContent = text;
  node.hidden = !text;
  node.classList.toggle('error', isError);
}

function updateMapView() {
  if (state.screen !== 'map' || !state.map) return;
  state.map.resize();
  if (state.pendingFit) {
    state.map.fit(state.pendingFit);
    state.pendingFit = null;
  }
}

function focusMap(coordinates) {
  state.pendingFit = coordinates;
  requestAnimationFrame(updateMapView);
}

function showScreen(screen) {
  if (state.screen === 'form' && screen !== 'form' && audioRecorder?.state === 'recording') {
    audioRecorder.stop();
  }
  state.screen = screen;
  for (const panel of document.querySelectorAll('.screen')) panel.hidden = panel.id !== 'screen-' + screen;
  const isRecords = screen === 'records' || screen === 'detail';
  byId('nav-map').setAttribute('aria-pressed', String(!isRecords));
  byId('nav-records').setAttribute('aria-pressed', String(isRecords));
  window.scrollTo(0, 0);
  byId('screen-' + screen).querySelector('h2').focus({ preventScroll: true });
  if (screen === 'map') requestAnimationFrame(updateMapView);
}

function placeMeta(place) {
  if (place.kind === 'new') return 'Titik baru';
  return ['Kelompok ' + place.group, categoryNames[place.category]].filter(Boolean).join(' · ');
}

function noteTitle(note) {
  return note.place?.name || note.route?.name || 'Catatan';
}

function syncDraft() {
  const { place, route } = state.draft;
  byId('selection-name').textContent = place?.name || (route ? 'Rute dipilih' : 'Belum ada lokasi');
  byId('selection-meta').textContent = place
    ? placeMeta(place)
    : (route ? 'Anda juga dapat menambahkan titik pada rute.' : 'Ketuk titik pada peta atau cari nama tempat.');
  byId('start-note').disabled = !place && !route;
  byId('draft-route').hidden = !route;
  byId('draft-route-name').textContent = route?.name || '';
  byId('draft-route-size').textContent = route ? route.pointCount + ' titik GPS' : '';
  state.map?.setDraft(state.draft);
}

function setPlacing(placing) {
  state.placing = placing;
  byId('add-point').setAttribute('aria-pressed', String(placing));
  byId('add-point').textContent = placing ? 'Batal tambah titik' : 'Tambah titik';
  if (state.map) {
    state.map.setPlacing(placing);
    setMessage('map-message', placing ? 'Ketuk lokasi untuk menaruh titik baru.' : mapHint);
  }
}

function selectPlace(place, fit = false) {
  state.draft.place = place;
  form.elements.placeName.value = '';
  search.value = '';
  results.hidden = true;
  setPlacing(false);
  syncDraft();
  if (fit) focusMap([place.coordinates]);
}

function handleMapTap({ coordinates, mappedId, recordId }) {
  if (!state.placing && recordId) {
    const record = state.records.find(entry => entry.id === recordId);
    if (record) {
      openRecord(record);
      return;
    }
  }
  const place = !state.placing && state.placesById.get(mappedId);
  selectPlace(place || { kind: 'new', name: 'Titik baru', coordinates });
}

function renderSearch() {
  const query = search.value.trim().toLocaleLowerCase('id');
  results.replaceChildren();
  results.hidden = !query;
  if (!query) return;
  const matches = state.places.filter(place =>
    [place.name, place.englishName].some(name => name?.toLocaleLowerCase('id').includes(query))).slice(0, 8);
  if (!matches.length) results.append(element('li', 'no-results', 'Tidak ada tempat yang cocok.'));
  for (const place of matches) {
    const item = element('li');
    const button = element('button', '', place.name);
    button.type = 'button';
    button.append(element('small', '', placeMeta(place)));
    button.addEventListener('click', () => selectPlace(place, true));
    item.append(button);
    results.append(item);
  }
}

function clearContent(container) {
  for (const media of container.querySelectorAll('img[src^="blob:"], audio[src^="blob:"]')) {
    URL.revokeObjectURL(media.src);
  }
  container.replaceChildren();
}

function appendAttachments(container, attachments, editable = false) {
  for (const attachment of attachments) {
    const card = element('figure', 'attachment');
    const media = element(attachment.kind === 'photo' ? 'img' : 'audio');
    media.src = URL.createObjectURL(attachment.blob);
    if (attachment.kind === 'photo') media.alt = 'Foto terlampir';
    else {
      media.controls = true;
      media.preload = 'metadata';
    }
    const caption = element('figcaption', 'attachment-meta');
    caption.append(element('span', '', attachment.name));
    if (editable) {
      const remove = element('button', 'quiet-button', 'Hapus');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Hapus ' + attachment.name);
      remove.addEventListener('click', () => {
        state.draft.media = state.draft.media.filter(item => item.id !== attachment.id);
        renderDraftAttachments();
      });
      caption.append(remove);
    }
    card.append(media, caption);
    container.append(card);
  }
}

function renderDraftAttachments() {
  const container = byId('draft-attachments');
  clearContent(container);
  appendAttachments(container, state.draft.media, true);
}

function addAttachment(kind, blob, name) {
  state.draft.media.push({ id: crypto.randomUUID(), kind, blob, name });
}

function attachFiles(input, kind) {
  input.addEventListener('change', () => {
    for (const file of input.files) addAttachment(kind, file, file.name);
    input.value = '';
    setMessage('media-message', '');
    renderDraftAttachments();
  });
}

function updateRecorderControls() {
  const recording = audioRecorder?.state === 'recording';
  const button = byId('record-audio');
  button.textContent = requestingAudio ? 'Membuka mikrofon…' : (recording ? 'Hentikan rekaman' : 'Rekam audio');
  button.disabled = requestingAudio || Boolean(audioRecorder && !recording);
  button.setAttribute('aria-pressed', String(recording));
  byId('review-note').disabled = requestingAudio || Boolean(audioRecorder);
}

async function toggleAudio() {
  if (audioRecorder?.state === 'recording') {
    audioRecorder.stop();
    updateRecorderControls();
    return;
  }
  if (requestingAudio || audioRecorder) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setMessage('media-message', 'Perekam tidak tersedia di sini. Gunakan Pilih audio.', true);
    return;
  }
  requestingAudio = true;
  const draft = state.draft;
  updateRecorderControls();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (state.screen !== 'form' || state.draft !== draft) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    let failed = false;
    audioRecorder = recorder;
    recorder.addEventListener('dataavailable', event => {
      if (event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener('error', () => { failed = true; });
    recorder.addEventListener('stop', () => {
      stream.getTracks().forEach(track => track.stop());
      audioRecorder = null;
      if (!failed && chunks.length && state.draft === draft) {
        addAttachment('audio', new Blob(chunks, { type: recorder.mimeType || chunks[0].type }), 'Rekaman wawancara');
        renderDraftAttachments();
        setMessage('media-message', 'Rekaman ditambahkan.');
      } else if (state.draft === draft) {
        setMessage('media-message', 'Rekaman belum tersimpan. Coba lagi atau pilih berkas audio.', true);
      }
      updateRecorderControls();
    }, { once: true });
    recorder.start();
    setMessage('media-message', 'Merekam audio…');
  } catch {
    stream?.getTracks().forEach(track => track.stop());
    audioRecorder = null;
    setMessage('media-message', 'Mikrofon tidak dapat dibuka. Gunakan Pilih audio.', true);
  } finally {
    requestingAudio = false;
    updateRecorderControls();
  }
}

function openForm() {
  const { place, route } = state.draft;
  if (!place && !route) return;
  byId('form-place').textContent = noteTitle(state.draft);
  byId('place-name-field').hidden = place?.kind !== 'new';
  setMessage('form-error', '');
  renderDraftAttachments();
  showScreen('form');
}

function noteFromForm() {
  const input = Object.fromEntries(new FormData(form));
  const { id, place, route, media } = state.draft;
  return {
    id,
    place: place && { ...place, name: place.kind === 'new' ? input.placeName.trim() || 'Titik baru' : place.name },
    route,
    memory: input.memory.trim(),
    comment: input.comment.trim(),
    eventTime: input.eventTime.trim(),
    recorderGroup: input.recorderGroup.trim(),
    media: media.slice(),
    recordedAt: new Date().toISOString(),
  };
}

function renderNote(container, note) {
  clearContent(container);
  const card = element('article', 'record-card');
  card.append(element('h3', '', noteTitle(note)));
  if (note.place) card.append(element('p', 'record-meta', placeMeta(note.place)));
  const coordinates = note.place?.coordinates;
  const fields = [
    ['Koordinat (lintang, bujur)', coordinates && [coordinates[1], coordinates[0]].map(n => n.toFixed(5)).join(', ')],
    ['Rute GPX', note.route && note.route.name + ' · ' + note.route.pointCount + ' titik GPS'],
    ['Ingatan warga', note.memory],
    ['Waktu kejadian', note.eventTime],
    ['Komentar Anda', note.comment],
    ['Kelompok pencatat', note.recorderGroup],
    ['Waktu pencatatan', dateFormat.format(new Date(note.recordedAt))],
  ];
  const definitions = element('dl');
  for (const [label, value] of fields) {
    if (value) definitions.append(element('dt', '', label), element('dd', '', value));
  }
  card.append(definitions);
  if (note.media.length) {
    const attachments = element('div', 'attachments');
    appendAttachments(attachments, note.media);
    card.append(attachments);
  }
  container.append(card);
}

function updateRecords() {
  const count = state.records.length;
  byId('record-count').textContent = String(count);
  byId('record-count').hidden = !count;
  byId('empty-records').hidden = Boolean(count);
  const list = byId('records-list');
  list.replaceChildren();
  for (const record of state.records) {
    const item = element('li');
    const button = element('button', '', noteTitle(record));
    button.type = 'button';
    button.append(element('small', '', dateFormat.format(new Date(record.savedAt))));
    button.addEventListener('click', () => openRecord(record));
    item.append(button);
    list.append(item);
  }
  state.map?.setRecords(state.records);
}

async function refreshRecords() {
  try {
    state.records = await readRecords();
    setMessage('records-error', '');
    updateRecords();
  } catch {
    setMessage('records-error', 'Penyimpanan catatan tidak dapat dibuka.', true);
  }
}

function openRecord(record, status = '') {
  state.detail = record;
  renderNote(byId('detail-content'), record);
  setMessage('detail-status', status);
  showScreen('detail');
}

async function commitNote() {
  if (saving || !state.review) return;
  saving = true;
  const controls = ['save-note', 'edit-note', 'nav-map', 'nav-records'].map(byId);
  controls.forEach(control => { control.disabled = true; });
  setMessage('save-status', 'Menyimpan catatan di peramban…');
  const record = { ...state.review, savedAt: new Date().toISOString() };
  try {
    await saveRecord(record);
    state.records = [record, ...state.records.filter(item => item.id !== record.id)];
    state.draft = newDraft();
    state.review = null;
    form.reset();
    clearContent(byId('draft-attachments'));
    clearContent(byId('review-content'));
    setMessage('media-message', '');
    setMessage('save-status', '');
    updateRecords();
    syncDraft();
    openRecord(record, 'Catatan dan lampiran telah disimpan di peramban ini.');
  } catch {
    setMessage('save-status', 'Catatan belum tersimpan. Periksa ruang penyimpanan dan coba lagi.', true);
  } finally {
    controls.forEach(control => { control.disabled = false; });
    saving = false;
  }
}

async function startMap() {
  try {
    state.places = await loadPlaces();
    state.placesById = new Map(state.places.map(place => [place.id, place]));
    renderSearch();
  } catch {
    search.disabled = true;
  }
  try {
    state.map = await createFieldMap(byId('field-map'), state.places, handleMapTap);
    byId('add-point').disabled = false;
    setMessage('map-message', search.disabled ? 'Daftar tempat tidak tersedia. Anda dapat menambah titik baru.' : mapHint);
    syncDraft();
    updateRecords();
    const { place, route } = state.draft;
    state.pendingFit ??= route?.segments.flat() || (place ? [place.coordinates] : state.places.map(item => item.coordinates));
    updateMapView();
  } catch {
    byId('field-map').parentElement.hidden = true;
    setMessage('map-message', 'Peta tidak dapat dimuat. Coba muat ulang atau pilih tempat dari pencarian.', true);
  }
}

document.querySelectorAll('[data-file]').forEach(button => {
  button.addEventListener('click', () => byId(button.dataset.file).click());
});
attachFiles(byId('camera-file'), 'photo');
attachFiles(byId('photo-files'), 'photo');
attachFiles(byId('audio-files'), 'audio');

byId('gpx-file').addEventListener('change', async event => {
  const input = event.currentTarget;
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  const draft = state.draft;
  try {
    const route = await readGpx(file);
    if (state.draft !== draft) return;
    draft.route = route;
    setPlacing(false);
    syncDraft();
    focusMap(route.segments.flat());
    setMessage('map-message', 'Rute dimuat. Anda dapat menambah titik atau langsung melanjutkan.');
  } catch (error) {
    setMessage('map-message', error.message, true);
  }
});

byId('remove-route').addEventListener('click', () => {
  state.draft.route = null;
  syncDraft();
  if (state.map) {
    const coordinates = state.draft.place ? [state.draft.place.coordinates] : state.places.map(place => place.coordinates);
    focusMap(coordinates);
    setMessage('map-message', mapHint);
  }
});

search.addEventListener('input', renderSearch);
search.addEventListener('focus', renderSearch);
search.addEventListener('keydown', event => { if (event.key === 'Escape') results.hidden = true; });
document.addEventListener('click', event => {
  if (!event.target.closest('.place-search')) results.hidden = true;
});
byId('add-point').addEventListener('click', () => setPlacing(!state.placing));
byId('start-note').addEventListener('click', openForm);
byId('back-to-map').addEventListener('click', () => showScreen('map'));
byId('record-audio').addEventListener('click', toggleAudio);
form.addEventListener('submit', event => {
  event.preventDefault();
  if (requestingAudio || audioRecorder) return;
  const note = noteFromForm();
  if (!note.memory && !note.comment && !note.media.length && !note.route) {
    setMessage('form-error', 'Isi ingatan, komentar, atau tambahkan lampiran.', true);
    return;
  }
  state.review = note;
  renderNote(byId('review-content'), note);
  setMessage('save-status', '');
  showScreen('review');
});
byId('edit-note').addEventListener('click', openForm);
byId('save-note').addEventListener('click', commitNote);
byId('nav-map').addEventListener('click', () => showScreen('map'));

function openRecords() {
  showScreen('records');
  void refreshRecords();
}

byId('nav-records').addEventListener('click', openRecords);
byId('back-to-records').addEventListener('click', openRecords);
byId('show-record-map').addEventListener('click', () => {
  const { place, route } = state.detail;
  showScreen('map');
  const coordinates = [...(route?.segments.flat() || []), ...(place ? [place.coordinates] : [])];
  focusMap(coordinates);
});

void refreshRecords();
void startMap();
