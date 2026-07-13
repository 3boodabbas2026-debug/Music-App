import { expect, test } from '@playwright/test';

import { buildLyricsSearchCandidates } from '../src/services/api/lyrics';
import type { Media } from '../src/services/api/types';
import { cleanMediaArtist, cleanMediaTitle, displayTitle } from '../src/utils/mediaDisplay';

function media(overrides: Partial<Media>): Media {
  return {
    id: 'fixture',
    media_type: 'audio',
    source: 'youtube',
    source_url: null,
    title: null,
    artist: null,
    album: null,
    thumbnail_url: null,
    recognized_title: null,
    recognized_artist: null,
    genre: null,
    release_year: null,
    is_remix: null,
    fade_in_ms: null,
    fade_out_ms: null,
    duration_seconds: 240,
    created_at: '2026-07-13T00:00:00Z',
    ...overrides,
  };
}

test('cleans publishing noise without damaging meaningful title metadata', () => {
  expect(cleanMediaTitle('Take It Off – Kesha #kesha #lyrics_songs #lyricsedit')).toBe('Take It Off – Kesha');
  expect(cleanMediaTitle('Children – Robert Miles (Intermediate Piano Tutorial) #pianocover')).toBe(
    'Children – Robert Miles',
  );
  expect(cleanMediaTitle('Song #1')).toBe('Song #1');
  expect(cleanMediaTitle('Cover Me Live (Acoustic)')).toBe('Cover Me Live (Acoustic)');
  expect(cleanMediaTitle('The Official Story')).toBe('The Official Story');
  expect(cleanMediaTitle('Midnight (Remix)')).toBe('Midnight (Remix)');
});

test('cleans only an explicit YouTube Topic suffix from artists', () => {
  expect(cleanMediaArtist('Robert Miles - Topic')).toBe('Robert Miles');
  expect(cleanMediaArtist('Hot Topic')).toBe('Hot Topic');
});

test('uses a recognized title when the raw source title is garbage', () => {
  expect(displayTitle(media({ title: 'A93bcD02efG45hiJ67', recognized_title: 'Children' }))).toBe('Children');
});

test('tries both title-artist orientations for cleaned lyrics metadata', () => {
  const candidates = buildLyricsSearchCandidates(
    media({ title: 'Children – Robert Miles (Intermediate Piano Tutorial) #pianocover', artist: 'capo.piano' }),
  );

  expect(candidates).toContainEqual({ title: 'Children', artist: 'Robert Miles' });
  expect(candidates).toContainEqual({ title: 'Robert Miles', artist: 'Children' });
  expect(candidates).toContainEqual({ title: 'Children – Robert Miles', artist: 'capo.piano' });
});
