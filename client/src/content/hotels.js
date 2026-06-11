// Nearby hotels for For The Fans Fest at Harrah's Resort Atlantic City.
//
// Photos: the `gallery` arrays use committed placeholder images so the pages are
// robust and survive rebuilds. Replace them with LICENSED photos — e.g. images
// from each hotel's media/press kit or partner portal that you have rights to
// use. Do NOT paste in images scraped from hotel sites or Google Images; that is
// copyrighted material. `photosUrl` links visitors to the hotel's own gallery.

export const HOTELS = [
  {
    slug: 'harrahs-resort',
    name: "Harrah's Resort Atlantic City",
    img: '/retailers/hero-gettinghere.png',
    gallery: ['/retailers/hero-gettinghere.png', '/retailers/hero-2.png', '/retailers/hero-travel.png'],
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
    slug: 'borgata',
    name: 'Borgata Hotel Casino & Spa',
    img: '/retailers/hero-2.png',
    gallery: ['/retailers/hero-2.png', '/retailers/hero-1.png', '/retailers/hero-3.png'],
    location: '1 Borgata Way, Atlantic City, NJ 08401',
    distance: 'About 0.5 miles — Marina District',
    tel: '(609) 317-1000',
    book: 'https://www.theborgata.com/',
    photosUrl: 'https://www.theborgata.com/hotel',
    description:
      "Atlantic City's premier resort, a short walk from the venue in the Marina District. Known for upscale rooms, a destination spa, and an extensive lineup of dining and nightlife.",
    amenities: ['Walkable to the venue', 'Spa Toccare', 'Award-winning dining', 'Nightlife & entertainment', 'Casino', 'Valet parking'],
  },
  {
    slug: 'golden-nugget',
    name: 'Golden Nugget Atlantic City',
    img: '/retailers/hero-3.png',
    gallery: ['/retailers/hero-3.png', '/retailers/hero-corporate.png', '/retailers/hero-1.png'],
    location: '600 Huron Ave, Atlantic City, NJ 08401',
    distance: 'About 0.6 miles — Marina District',
    tel: '(609) 441-2000',
    book: 'https://www.goldennugget.com/atlantic-city/',
    photosUrl: 'https://www.goldennugget.com/atlantic-city/',
    description:
      'A Marina District resort minutes from the show, with marina views, a seasonal pool, and a good mix of casual and signature restaurants.',
    amenities: ['Close to the venue', 'Marina views', 'Seasonal pool', 'Restaurants & bars', 'Casino', 'Parking on site'],
  },
  {
    slug: 'ocean-casino-resort',
    name: 'Ocean Casino Resort',
    img: '/retailers/hero-1.png',
    gallery: ['/retailers/hero-1.png', '/retailers/hero-advertise.png', '/retailers/hero-2.png'],
    location: '500 Boardwalk, Atlantic City, NJ 08401',
    distance: 'About 3 miles — Boardwalk',
    tel: '(609) 783-8899',
    book: 'https://www.theoceanac.com/',
    photosUrl: 'https://www.theoceanac.com/hotel',
    description:
      'A modern Boardwalk resort with floor-to-ceiling ocean views, a large spa, and rooftop pools — a great option if you want the beach and Boardwalk between show days.',
    amenities: ['Oceanfront on the Boardwalk', 'Rooftop pools', 'Spa & wellness', 'Beach access', 'Casino', 'Valet & self parking'],
  },
  {
    slug: 'hard-rock',
    name: 'Hard Rock Hotel & Casino Atlantic City',
    img: '/retailers/hero-corporate.png',
    gallery: ['/retailers/hero-corporate.png', '/retailers/hero-3.png', '/retailers/hero-travel.png'],
    location: '1000 Boardwalk, Atlantic City, NJ 08401',
    distance: 'About 3 miles — Boardwalk',
    tel: '(609) 449-1000',
    book: 'https://casino.hardrock.com/atlantic-city',
    photosUrl: 'https://casino.hardrock.com/atlantic-city/hotel',
    description:
      'Music-themed Boardwalk resort with a lively entertainment calendar, multiple pools, and a wide range of dining — fun for fans who want nightlife after the show.',
    amenities: ['Boardwalk location', 'Live entertainment', 'Multiple pools', 'Dining & bars', 'Casino', 'Parking on site'],
  },
];

export const hotelBySlug = (slug) => HOTELS.find((h) => h.slug === slug);
