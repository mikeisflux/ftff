import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';

// Registry of admin-swappable images on bespoke (non-Page-Builder) pages.
// Each slot has a stable id, a human label, and the built-in default image.
// Pages resolve their images through useImg() so an admin override (set in
// Admin → Page Images) transparently replaces the default. Grouped by page for
// the admin UI.
export const PAGE_IMAGE_GROUPS = [
  {
    page: 'Exhibitor Rewards',
    path: '/exhibitor-rewards',
    slots: [
      { key: 'rewards.hero',   label: 'Hero banner',     default: '/retailers/hero-2.png' },
      { key: 'rewards.share',  label: 'Step 1 — Share',  default: '/retailers/share.png' },
      { key: 'rewards.earn',   label: 'Step 2 — Earn',   default: '/retailers/earn.png' },
      { key: 'rewards.redeem', label: 'Step 3 — Redeem', default: '/retailers/redeem.png' },
    ],
  },
  {
    page: 'Social Media Tool Kit',
    path: '/social-media-tool-kit',
    slots: [
      { key: 'toolkit.landscape', label: 'Landscape (1200×630)', default: '/retailers/toolkit-landscape.png' },
      { key: 'toolkit.square',    label: 'Square (1080×1080)',   default: '/retailers/toolkit-square.png' },
      { key: 'toolkit.story',     label: 'Story (1080×1350)',    default: '/retailers/toolkit-story.png' },
    ],
  },
];

// Flat lookup of slot → default url.
export const IMAGE_DEFAULTS = Object.fromEntries(
  PAGE_IMAGE_GROUPS.flatMap((g) => g.slots.map((s) => [s.key, s.default])),
);

// Fetch the override map once (cached). Returns a resolver: img(slot, fallback)
// → override url if set, else the registry default, else the passed fallback.
export function useImg() {
  const { data } = useQuery({
    queryKey: ['image-overrides'],
    queryFn: () => api('/image-overrides'),
    staleTime: 5 * 60 * 1000,
  });
  const overrides = data?.overrides || {};
  return (slot, fallback) => overrides[slot] || IMAGE_DEFAULTS[slot] || fallback;
}
