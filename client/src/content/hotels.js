// Nearby hotels for For The Fans Fest at Harrah's Resort Atlantic City.
//
// Photos are hotlinked from each hotel's media under our limited-use license.
// `img` is the hero/tile image; `gallery` is the per-hotel photo grid. If a
// third-party CDN ever blocks hotlinking, download the licensed files into
// client/public/hotels/ and point these paths there instead (more robust).

export const HOTELS = [
  {
    slug: 'harrahs-resort',
    name: "Harrah's Resort Atlantic City",
    img: 'https://www.caesars.com/content/dam/empire/atl/property/exterior/1920x1080/atl-exterior-arial-view-1920x1080.jpg',
    gallery: [
      'https://www.caesars.com/content/dam/empire/atl/property/exterior/1920x1080/atl-exterior-arial-view-1920x1080.jpg',
      'https://www.caesars.com/content/dam/empire/atl/things-to-do/pool/pool-after-dark/1920x1080/atl-pool-after-dark-1920x1080.jpg.transform/intro-section-img/image.jpg',
      'https://www.caesars.com/content/dam/empire/cac/shows/the-hook/1920x1080/cac-deal-card-the-hook-entrance-1920x1080.jpg.transform/intro-section-img/image.jpg',
    ],
    location: "777 Harrah's Blvd, Atlantic City, NJ 08401",
    distance: 'Host hotel — the venue itself',
    tel: '(609) 441-5000',
    book: 'https://www.caesars.com/harrahs-atlantic-city',
    photosUrl: 'https://www.caesars.com/harrahs-atlantic-city/hotel',
    host: true,
    description:
      'The host hotel and home of For The Fans Fest. Stay steps from the show floor in the Marina District, with a domed indoor pool, a full spa, and a wide range of restaurants and bars on site.',
    amenities: ['On-site at the venue', 'Indoor pool (The Pool After Dark)', 'Spa & fitness center', 'Multiple restaurants', 'Casino', 'Self & valet parking'],
  },
  {
    slug: 'caesars-atlantic-city',
    name: 'Caesars Atlantic City',
    img: 'https://commons.wikimedia.org/wiki/Special:FilePath/Atlantic%20City%20Boardwalk%20view%20north%20from%20Caesars%20Atlantic%20City%20by%20Silveira%20Neto%20June%2024%202012.jpg?width=1200',
    gallery: [
      'https://commons.wikimedia.org/wiki/Special:FilePath/Atlantic%20City%20Boardwalk%20view%20north%20from%20Caesars%20Atlantic%20City%20by%20Silveira%20Neto%20June%2024%202012.jpg?width=1200',
      'https://commons.wikimedia.org/wiki/Special:FilePath/Panoramic%20view%20of%20The%20Pier%20Shops%20at%20Caesars.jpg?width=1200',
      'https://commons.wikimedia.org/wiki/Special:FilePath/The%20Pier%20at%20Caesars%20interior%20view.jpg?width=1200',
    ],
    location: '2100 Pacific Ave, Atlantic City, NJ 08401',
    distance: 'About 3 miles — Boardwalk (oceanfront)',
    tel: '(609) 348-4411',
    book: 'https://tidd.ly/4g9Uskk',
    photosUrl: 'https://www.caesars.com/caesars-ac/hotel',
    description:
      'A Roman-themed Boardwalk landmark right on the ocean, home to The Pier Shops at Caesars, the Qua Baths & Spa, and a wide range of restaurants and bars — about a 10-minute drive from the venue.',
    amenities: ['Oceanfront on the Boardwalk', 'The Pier Shops at Caesars', 'Qua Baths & Spa', 'Multiple restaurants & bars', 'Casino', 'Self & valet parking'],
  },
  {
    slug: 'tropicana-atlantic-city',
    name: 'Tropicana Atlantic City',
    img: 'https://commons.wikimedia.org/wiki/Special:FilePath/Tropicana%20Hotel%20Atlantic%20City%202016.jpg?width=1200',
    gallery: [
      'https://commons.wikimedia.org/wiki/Special:FilePath/Tropicana%20Hotel%20Atlantic%20City%202016.jpg?width=1200',
      'https://commons.wikimedia.org/wiki/Special:FilePath/The%20Tropicana.JPG?width=1200',
      'https://commons.wikimedia.org/wiki/Special:FilePath/Tropicana%20Casino%20and%20Resort%20Atlantic%20City%20from%20beach.jpeg?width=1200',
    ],
    location: '2831 Boardwalk, Atlantic City, NJ 08401',
    distance: 'About 4 miles — Boardwalk (oceanfront)',
    tel: '(609) 340-4000',
    book: 'https://tidd.ly/4xTzv3l',
    photosUrl: 'https://www.caesars.com/tropicana-ac/hotel',
    description:
      "Atlantic City's largest casino resort, on the Boardwalk with direct beach access. Home to The Quarter's Havana-themed dining and entertainment, multiple pools, and a full-service spa.",
    amenities: ['Oceanfront on the Boardwalk', 'The Quarter dining & nightlife', 'Multiple pools', 'Spa & fitness center', 'Casino', 'Self & valet parking'],
  },
];

export const hotelBySlug = (slug) => HOTELS.find((h) => h.slug === slug);

// Route external (CDN) image URLs through our same-origin proxy so hotlink-
// protected hosts still load; leave local /paths untouched.
export const hotelImg = (u) =>
  (!u || u.startsWith('/')) ? u : `/img-proxy?u=${encodeURIComponent(u)}`;
