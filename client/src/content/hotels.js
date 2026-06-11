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
    slug: 'borgata',
    name: 'Borgata Hotel Casino & Spa',
    img: 'https://hotelmedia.s3.amazonaws.com/720/480/c6bc359cabe0111497c32b5d0bc08e70ceac3eba',
    gallery: [
      'https://hotelmedia.s3.amazonaws.com/720/480/c6bc359cabe0111497c32b5d0bc08e70ceac3eba',
      'https://hotelmedia.s3.amazonaws.com/720/480/2a985f1de92b5ad152b157dc5fa6acc29a995070',
      'https://hotelmedia.s3.amazonaws.com/720/480/bb4d0f530bac43c99001229e9df0eef0b0686d2e',
    ],
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
    img: 'https://images.trvl-media.com/lodging/1000000/180000/172000/171924/3f26bbd5.jpg?impolicy=resizecrop&rw=1200&ra=fit',
    gallery: [
      'https://images.trvl-media.com/lodging/1000000/180000/172000/171924/3f26bbd5.jpg?impolicy=resizecrop&rw=1200&ra=fit',
      'https://images.trvl-media.com/lodging/1000000/180000/172000/171924/0509b376.jpg?impolicy=resizecrop&rw=1200&ra=fit',
      'https://images.trvl-media.com/lodging/1000000/180000/172000/171924/b7900ae8.jpg?impolicy=resizecrop&rw=1200&ra=fit',
    ],
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
    img: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/30/7d/d6/0b/caption.jpg?w=1400&h=-1&s=1',
    gallery: [
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/30/7d/d6/0b/caption.jpg?w=1400&h=-1&s=1',
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/14/76/80/00/one-bedroom-suite-living.jpg?w=1400&h=-1&s=1',
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/33/3d/9f/80/the-park.jpg?w=1400&h=-1&s=1',
    ],
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
    img: 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/591046544.jpg?k=16a8cb4f326545fc5be1b96076633b40e4aefeb808e59e91d59b696d62667662&o=',
    gallery: [
      'https://cf.bstatic.com/xdata/images/hotel/max1024x768/591046544.jpg?k=16a8cb4f326545fc5be1b96076633b40e4aefeb808e59e91d59b696d62667662&o=',
      'https://cf.bstatic.com/xdata/images/hotel/max1024x768/590763346.jpg?k=04327abb810165535ff6ff4bcede6ba7cf4f9c4ca36ee117307a9bd7fb88ef28&o=',
      'https://cf.bstatic.com/xdata/images/hotel/max1024x768/213890567.jpg?k=4299352448bb1e2dedf419585cc58248296f7f9f7032344c5339d75a2fdb06e3&o=',
    ],
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
