/**
 * Mock data for the content catalog.
 * Uses real public domain movies from Archive.org so the app
 * looks and works like a real streaming platform immediately.
 */

export interface MockMovie {
  id: string
  title: string
  slug: string
  overview: string
  year: number
  runtime: string
  rating: number
  genre: string[]
  poster: string
  backdrop: string
  magnetURI: string
  license: string
  featured?: boolean
}

const P = 'https://upload.wikimedia.org/wikipedia/commons/thumb'
const PF = 'https://upload.wikimedia.org/wikipedia/commons'

export const MOCK_GENRES = [
  { id: '1', name: 'All', slug: 'all' },
  { id: '2', name: 'Action', slug: 'action' },
  { id: '3', name: 'Comedy', slug: 'comedy' },
  { id: '4', name: 'Drama', slug: 'drama' },
  { id: '5', name: 'Documentary', slug: 'documentary' },
  { id: '6', name: 'Horror', slug: 'horror' },
  { id: '7', name: 'Sci-Fi', slug: 'sci-fi' },
  { id: '8', name: 'Animation', slug: 'animation' },
  { id: '9', name: 'Western', slug: 'western' },
  { id: '10', name: 'Film Noir', slug: 'film-noir' },
  { id: '11', name: 'Thriller', slug: 'thriller' },
  { id: '12', name: 'Classic', slug: 'classic' }
]

export const MOCK_MOVIES: MockMovie[] = [
  {
    id: '1', title: 'Big Buck Bunny', slug: 'big-buck-bunny',
    overview: 'A large and lovable rabbit deals with three tiny bullies, led by a flying squirrel, who are determined to squelch his happiness. A stunning animated short by the Blender Foundation, showcasing the power of open-source filmmaking.',
    year: 2008, runtime: '10 min', rating: 4.2,
    genre: ['Animation', 'Comedy'],
    poster: 'https://peach.blender.org/wp-content/uploads/poster_bunny_small.jpg',
    backdrop: 'https://peach.blender.org/wp-content/uploads/bbb-splash.png',
    magnetURI: 'magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=Big+Buck+Bunny&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com',
    license: 'Creative Commons', featured: true
  },
  {
    id: '2', title: 'Sintel', slug: 'sintel',
    overview: 'A lonely young woman, Sintel, helps and befriends a dragon, whom she calls Scales. But when the dragon is snatched by an adult dragon, Sintel decides to find her friend no matter what the journey takes.',
    year: 2010, runtime: '15 min', rating: 4.5,
    genre: ['Animation', 'Action', 'Drama'],
    poster: 'https://media.xiph.org/sintel/sintel-poster-crop.jpg',
    backdrop: 'https://media.xiph.org/sintel/sintel-poster-crop.jpg',
    magnetURI: 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com',
    license: 'Creative Commons', featured: true
  },
  {
    id: '3', title: 'Tears of Steel', slug: 'tears-of-steel',
    overview: 'In an apocalyptic future, a group of soldiers and scientists takes refuge in Amsterdam to try to stop an army of robots that threatens the last survivors of the human race.',
    year: 2012, runtime: '12 min', rating: 3.8,
    genre: ['Sci-Fi', 'Action', 'Drama'],
    poster: 'https://mango.blender.org/wp-content/uploads/2012/09/poster_tos_small.jpg',
    backdrop: 'https://mango.blender.org/wp-content/uploads/2012/09/poster_tos_small.jpg',
    magnetURI: 'magnet:?xt=urn:btih:209c8226b299b308beaf2b9cd3fb49212dbd13ec&dn=Tears+of+Steel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com',
    license: 'Creative Commons'
  },
  {
    id: '4', title: 'Night of the Living Dead', slug: 'night-of-the-living-dead',
    overview: 'A ragtag group of Pennsylvanians barricade themselves in an old farmhouse to remain safe from a bloodthirsty, flesh-eating breed of monsters ravaging the East Coast of the United States.',
    year: 1968, runtime: '1h 36min', rating: 4.1,
    genre: ['Horror', 'Drama', 'Classic'],
    poster: `${P}/3/31/Night_of_the_Living_Dead_%281968%29_theatrical_poster.jpg/300px-Night_of_the_Living_Dead_%281968%29_theatrical_poster.jpg`,
    backdrop: `${P}/3/31/Night_of_the_Living_Dead_%281968%29_theatrical_poster.jpg/800px-Night_of_the_Living_Dead_%281968%29_theatrical_poster.jpg`,
    magnetURI: '', license: 'Public Domain'
  },
  {
    id: '5', title: 'His Girl Friday', slug: 'his-girl-friday',
    overview: 'A newspaper editor uses every trick in the book to keep his star reporter ex-wife from remarrying in this fast-talking screwball comedy masterpiece starring Cary Grant and Rosalind Russell.',
    year: 1940, runtime: '1h 32min', rating: 4.3,
    genre: ['Comedy', 'Drama', 'Classic'],
    poster: `${P}/2/2a/His_Girl_Friday_%281940_poster%29.jpg/300px-His_Girl_Friday_%281940_poster%29.jpg`,
    backdrop: `${P}/2/2a/His_Girl_Friday_%281940_poster%29.jpg/800px-His_Girl_Friday_%281940_poster%29.jpg`,
    magnetURI: '', license: 'Public Domain'
  },
  {
    id: '6', title: 'D.O.A.', slug: 'doa',
    overview: 'A fatally poisoned man desperately searches for his killer before his own death in this classic film noir thriller that redefined the genre with its innovative reverse-whodunit structure.',
    year: 1949, runtime: '1h 23min', rating: 3.9,
    genre: ['Film Noir', 'Drama', 'Thriller'],
    poster: `${P}/2/23/DOA1950.jpg/300px-DOA1950.jpg`,
    backdrop: `${P}/2/23/DOA1950.jpg/800px-DOA1950.jpg`,
    magnetURI: '', license: 'Public Domain'
  },
  {
    id: '7', title: 'The General', slug: 'the-general',
    overview: 'When Union spies steal engineer Johnnie Gray\'s beloved locomotive, he pursues it single-handedly straight through enemy lines. Buster Keaton\'s greatest silent film and a landmark of physical comedy.',
    year: 1926, runtime: '1h 7min', rating: 4.6,
    genre: ['Comedy', 'Action', 'Classic'],
    poster: `${P}/0/01/Busterkeaton.jpg/300px-Busterkeaton.jpg`,
    backdrop: `${P}/0/01/Busterkeaton.jpg/800px-Busterkeaton.jpg`,
    magnetURI: '', license: 'Public Domain'
  },
  {
    id: '8', title: 'Charade', slug: 'charade',
    overview: 'Romance and suspense ensue in Paris as a woman is pursued by several men who want a fortune her late husband had stolen. Stars Cary Grant and Audrey Hepburn in what critics call the best Hitchcock film Hitchcock never made.',
    year: 1963, runtime: '1h 53min', rating: 4.4,
    genre: ['Comedy', 'Thriller', 'Classic'],
    poster: `${P}/d/d8/Charade_movie_poster.jpg/300px-Charade_movie_poster.jpg`,
    backdrop: `${P}/d/d8/Charade_movie_poster.jpg/800px-Charade_movie_poster.jpg`,
    magnetURI: '', license: 'Public Domain'
  },
  {
    id: '9', title: 'Nosferatu', slug: 'nosferatu',
    overview: 'Count Orlok, a terrifying vampire, expresses interest in a new residence and real estate agent Hutter\'s wife. An unauthorized adaptation of Bram Stoker\'s Dracula and a masterpiece of German Expressionism.',
    year: 1922, runtime: '1h 34min', rating: 4.5,
    genre: ['Horror', 'Classic'],
    poster: `${P}/2/2e/Nosferatu_%281922%29.webp/300px-Nosferatu_%281922%29.webp`,
    backdrop: `${P}/2/2e/Nosferatu_%281922%29.webp/800px-Nosferatu_%281922%29.webp`,
    magnetURI: '', license: 'Public Domain'
  },
  {
    id: '10', title: 'The Phantom of the Opera', slug: 'phantom-of-the-opera',
    overview: 'A disfigured musical genius lurks beneath the Paris Opera House, terrorizing the opera company for the love of the beautiful Christine Daaé. Lon Chaney\'s legendary performance still terrifies a century later.',
    year: 1925, runtime: '1h 33min', rating: 4.2,
    genre: ['Horror', 'Drama', 'Classic'],
    poster: `${P}/4/4b/The_Phantom_of_the_Opera_%281925%29_poster.jpg/300px-The_Phantom_of_the_Opera_%281925%29_poster.jpg`,
    backdrop: `${P}/4/4b/The_Phantom_of_the_Opera_%281925%29_poster.jpg/800px-The_Phantom_of_the_Opera_%281925%29_poster.jpg`,
    magnetURI: '', license: 'Public Domain'
  },
  {
    id: '11', title: 'A Trip to the Moon', slug: 'trip-to-the-moon',
    overview: 'A group of astronomers blast off in a cannon-propelled capsule to explore the surface of the Moon. Georges Méliès\' 1902 masterpiece is the first science fiction film ever made.',
    year: 1902, runtime: '13 min', rating: 4.7,
    genre: ['Sci-Fi', 'Classic'],
    poster: `${P}/0/04/Le_Voyage_dans_la_Lune.jpg/300px-Le_Voyage_dans_la_Lune.jpg`,
    backdrop: `${P}/0/04/Le_Voyage_dans_la_Lune.jpg/800px-Le_Voyage_dans_la_Lune.jpg`,
    magnetURI: '', license: 'Public Domain'
  },
  {
    id: '12', title: 'The Cabinet of Dr. Caligari', slug: 'cabinet-of-dr-caligari',
    overview: 'Hypnotist Dr. Caligari uses a somnambulist to commit murders. Considered the quintessential work of German Expressionist cinema, with its twisted sets and nightmarish atmosphere.',
    year: 1920, runtime: '1h 16min', rating: 4.4,
    genre: ['Horror', 'Thriller', 'Classic'],
    poster: `${P}/f/f6/The_Cabinet_of_Dr._Caligari_poster.jpg/300px-The_Cabinet_of_Dr._Caligari_poster.jpg`,
    backdrop: `${P}/f/f6/The_Cabinet_of_Dr._Caligari_poster.jpg/800px-The_Cabinet_of_Dr._Caligari_poster.jpg`,
    magnetURI: '', license: 'Public Domain'
  },
  {
    id: '13', title: 'Metropolis', slug: 'metropolis',
    overview: 'In a futuristic city sharply divided between the working class and the city planners, the son of the city\'s mastermind falls in love with a working-class prophet. Fritz Lang\'s epic sci-fi vision.',
    year: 1927, runtime: '2h 33min', rating: 4.8,
    genre: ['Sci-Fi', 'Drama', 'Classic'],
    poster: `${P}/0/00/Metropolis_poster.jpg/300px-Metropolis_poster.jpg`,
    backdrop: `${P}/0/00/Metropolis_poster.jpg/800px-Metropolis_poster.jpg`,
    magnetURI: '', license: 'Public Domain', featured: true
  },
  {
    id: '14', title: 'The Kid', slug: 'the-kid',
    overview: 'The Tramp cares for an abandoned child, but events conspire to separate them. Charlie Chaplin\'s first full-length feature combines slapstick comedy with genuine pathos.',
    year: 1921, runtime: '1h 8min', rating: 4.5,
    genre: ['Comedy', 'Drama', 'Classic'],
    poster: `${P}/2/25/The_Kid_%281921%29.jpg/300px-The_Kid_%281921%29.jpg`,
    backdrop: `${P}/2/25/The_Kid_%281921%29.jpg/800px-The_Kid_%281921%29.jpg`,
    magnetURI: '', license: 'Public Domain'
  },
  {
    id: '15', title: 'Safety Last!', slug: 'safety-last',
    overview: 'A boy leaves his small town for the big city to make enough money to support his girl, and must scale the outside of a tall building as a publicity stunt. Harold Lloyd\'s most iconic scene.',
    year: 1923, runtime: '1h 14min', rating: 4.3,
    genre: ['Comedy', 'Action', 'Classic'],
    poster: `${P}/3/3a/Safety_Last%21_%281923%29_poster.jpg/300px-Safety_Last%21_%281923%29_poster.jpg`,
    backdrop: `${P}/3/3a/Safety_Last%21_%281923%29_poster.jpg/800px-Safety_Last%21_%281923%29_poster.jpg`,
    magnetURI: '', license: 'Public Domain'
  },
  {
    id: '16', title: 'Plan 9 from Outer Space', slug: 'plan-9-from-outer-space',
    overview: 'Aliens resurrect dead humans as zombies and vampires to stop humanity from creating the Solaranite bomb. Ed Wood\'s so-bad-it\'s-good masterpiece is the ultimate cult classic.',
    year: 1957, runtime: '1h 19min', rating: 2.8,
    genre: ['Sci-Fi', 'Horror'],
    poster: `${P}/8/8f/Plan_nine_from_outer_space.jpg/300px-Plan_nine_from_outer_space.jpg`,
    backdrop: `${P}/8/8f/Plan_nine_from_outer_space.jpg/800px-Plan_nine_from_outer_space.jpg`,
    magnetURI: '', license: 'Public Domain'
  }
]

export function getMoviesByGenre(genre: string): MockMovie[] {
  if (genre === 'all') return MOCK_MOVIES
  return MOCK_MOVIES.filter((m) => m.genre.some((g) => g.toLowerCase() === genre.toLowerCase()))
}

export function getMovieBySlug(slug: string): MockMovie | undefined {
  return MOCK_MOVIES.find((m) => m.slug === slug)
}

export function getFeaturedMovies(): MockMovie[] {
  return MOCK_MOVIES.filter((m) => m.featured)
}

export function getTopRated(): MockMovie[] {
  return [...MOCK_MOVIES].sort((a, b) => b.rating - a.rating).slice(0, 8)
}

export function getRecentlyAdded(): MockMovie[] {
  return [...MOCK_MOVIES].sort((a, b) => b.year - a.year).slice(0, 8)
}

export function getStreamable(): MockMovie[] {
  return MOCK_MOVIES.filter((m) => m.magnetURI)
}
