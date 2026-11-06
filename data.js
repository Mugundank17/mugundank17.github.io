/*
 * Movie data — edit this file to add or change movies.
 *
 * Fields
 *   id        unique slug used in the URL (#/movie/<id>)
 *   title     movie title
 *   date      release date, YYYY-MM-DD (local time, midnight)
 *   director  shown as "A FILM BY ..."
 *   tagline   short line under the title
 *   synopsis  a few sentences for the About section
 *   genres    list of genres
 *   hue       two colour hues (0–360) used for the fiery background
 *   backdrop  optional wide image URL (e.g. "images/dune-backdrop.jpg")
 *   poster    optional card image URL (falls back to backdrop, then generated art)
 *   trailer   optional YouTube video id (e.g. "dQw4w9WgXcQ"); otherwise a YouTube search opens
 *   tickets   optional ticketing URL; otherwise a web search opens
 *   cast      list of { actor, role, photo? }
 *
 * Release dates move often — double-check them before publishing.
 */
window.MOVIES = [
  {
    id: "avengers-doomsday",
    title: "Avengers: Doomsday",
    date: "2026-12-18",
    director: "Anthony & Joe Russo",
    tagline: "Every hero. One reckoning.",
    synopsis:
      "Earth's Mightiest Heroes, the Fantastic Four and allies from across the multiverse come face to face with Victor von Doom in the next chapter of Marvel's Multiverse Saga.",
    genres: ["Action", "Superhero", "Sci-Fi"],
    hue: [140, 280],
    cast: [
      { actor: "Robert Downey Jr.", role: "Victor von Doom" },
      { actor: "Chris Hemsworth", role: "Thor" },
      { actor: "Anthony Mackie", role: "Captain America" },
      { actor: "Florence Pugh", role: "Yelena Belova" },
      { actor: "Pedro Pascal", role: "Reed Richards" },
      { actor: "Vanessa Kirby", role: "Sue Storm" },
      { actor: "Letitia Wright", role: "Shuri" },
      { actor: "Tom Hiddleston", role: "Loki" },
    ],
  },
  {
    id: "dune-part-three",
    title: "Dune: Part Three",
    date: "2026-12-18",
    director: "Denis Villeneuve",
    tagline: "The prophecy always has a price.",
    synopsis:
      "Adapted from Frank Herbert's Dune Messiah. Years into his reign as Emperor, Paul Atreides confronts the consequences of the holy war fought in his name.",
    genres: ["Sci-Fi", "Epic", "Drama"],
    hue: [28, 45],
    cast: [
      { actor: "Timothée Chalamet", role: "Paul Atreides" },
      { actor: "Zendaya", role: "Chani" },
      { actor: "Florence Pugh", role: "Princess Irulan" },
      { actor: "Anya Taylor-Joy", role: "Alia Atreides" },
      { actor: "Robert Pattinson", role: "Scytale" },
      { actor: "Jason Momoa", role: "Duncan Idaho" },
      { actor: "Javier Bardem", role: "Stilgar" },
    ],
  },
  {
    id: "jumanji-3",
    title: "Jumanji 3",
    date: "2026-12-11",
    director: "Jake Kasdan",
    tagline: "The game isn't finished with you.",
    synopsis:
      "The avatars are back for another round of the world's most dangerous video game — and the jungle has a few new tricks.",
    genres: ["Adventure", "Comedy"],
    hue: [95, 35],
    cast: [
      { actor: "Dwayne Johnson", role: "Dr. Smolder Bravestone" },
      { actor: "Kevin Hart", role: "Mouse Finbar" },
      { actor: "Jack Black", role: "Prof. Shelly Oberon" },
      { actor: "Karen Gillan", role: "Ruby Roundhouse" },
    ],
  },
  {
    id: "shrek-5",
    title: "Shrek 5",
    date: "2027-06-30",
    director: "Walt Dohrn & Conrad Vernon",
    tagline: "Happily ever after gets crowded.",
    synopsis:
      "The ogre returns to the swamp with Donkey and Fiona — and a teenage daughter of his own — in a brand-new fairy-tale adventure.",
    genres: ["Animation", "Comedy", "Family"],
    hue: [85, 120],
    cast: [
      { actor: "Mike Myers", role: "Shrek" },
      { actor: "Eddie Murphy", role: "Donkey" },
      { actor: "Cameron Diaz", role: "Fiona" },
      { actor: "Zendaya", role: "Felicia" },
    ],
  },
  {
    id: "the-batman-part-ii",
    title: "The Batman Part II",
    date: "2027-10-01",
    director: "Matt Reeves",
    tagline: "Gotham is never finished.",
    synopsis:
      "Matt Reeves and Robert Pattinson return to the rain-soaked streets of Gotham City in the sequel to 2022's The Batman.",
    genres: ["Crime", "Action", "Mystery"],
    hue: [0, 350],
    cast: [
      { actor: "Robert Pattinson", role: "Bruce Wayne" },
      { actor: "Jeffrey Wright", role: "James Gordon" },
      { actor: "Andy Serkis", role: "Alfred Pennyworth" },
      { actor: "Colin Farrell", role: "Oz Cobb" },
    ],
  },
  {
    id: "avengers-secret-wars",
    title: "Avengers: Secret Wars",
    date: "2027-12-17",
    director: "Anthony & Joe Russo",
    tagline: "The multiverse ends here.",
    synopsis:
      "The Multiverse Saga reaches its finale as worlds collide and the Avengers make their last stand.",
    genres: ["Action", "Superhero", "Sci-Fi"],
    hue: [265, 200],
    cast: [{ actor: "Robert Downey Jr.", role: "Victor von Doom" }],
  },
  {
    id: "spider-man-brand-new-day",
    title: "Spider-Man: Brand New Day",
    date: "2026-07-31",
    director: "Destin Daniel Cretton",
    tagline: "No one remembers. He does.",
    synopsis:
      "After the events of No Way Home, Peter Parker starts over in a New York where nobody remembers who he is.",
    genres: ["Action", "Superhero"],
    hue: [355, 220],
    cast: [
      { actor: "Tom Holland", role: "Peter Parker" },
      { actor: "Zendaya", role: "MJ" },
      { actor: "Jacob Batalon", role: "Ned Leeds" },
      { actor: "Mark Ruffalo", role: "Bruce Banner" },
      { actor: "Jon Bernthal", role: "Frank Castle" },
    ],
  },
  {
    id: "the-odyssey",
    title: "The Odyssey",
    date: "2026-07-17",
    director: "Christopher Nolan",
    tagline: "The way home is the war.",
    synopsis:
      "Christopher Nolan's adaptation of Homer's epic follows Odysseus on his perilous ten-year voyage home after the Trojan War. Shot entirely on IMAX film.",
    genres: ["Epic", "Adventure", "Myth"],
    hue: [205, 30],
    cast: [
      { actor: "Matt Damon", role: "Odysseus" },
      { actor: "Tom Holland", role: "Telemachus" },
      { actor: "Anne Hathaway", role: "Penelope" },
      { actor: "Robert Pattinson", role: "" },
      { actor: "Zendaya", role: "" },
      { actor: "Lupita Nyong'o", role: "" },
    ],
  },
];
