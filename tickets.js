/*
 * Where to buy cinema tickets, by country.
 *   cities     major cities shown in the location picker
 *   providers  ticketing sites / cinema chains: { name, domain }
 *
 * Ticket links search the provider's own site for the film in the chosen city,
 * so they keep working even when a provider changes its URLs.
 * Add a country or provider here and it appears on the site automatically.
 */
window.TICKETS = {
  US: {
    cities: ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego",
      "Dallas", "San Francisco", "Seattle", "Boston", "Atlanta", "Miami", "Washington, D.C.", "Denver", "Las Vegas"],
    providers: [
      { name: "Fandango", domain: "fandango.com" },
      { name: "AMC Theatres", domain: "amctheatres.com" },
      { name: "Regal", domain: "regmovies.com" },
      { name: "Cinemark", domain: "cinemark.com" },
      { name: "Atom Tickets", domain: "atomtickets.com" },
    ],
  },
  IN: {
    cities: ["Mumbai", "Delhi NCR", "Bengaluru", "Chennai", "Hyderabad", "Kolkata", "Pune", "Ahmedabad", "Kochi",
      "Coimbatore", "Jaipur", "Lucknow", "Chandigarh", "Madurai", "Visakhapatnam", "Thiruvananthapuram", "Indore"],
    providers: [
      { name: "BookMyShow", domain: "in.bookmyshow.com" },
      { name: "District by Zomato", domain: "district.in" },
      { name: "PVR INOX", domain: "pvrcinemas.com" },
      { name: "Cinépolis India", domain: "cinepolisindia.com" },
    ],
  },
  GB: {
    cities: ["London", "Manchester", "Birmingham", "Glasgow", "Edinburgh", "Leeds", "Liverpool", "Bristol",
      "Newcastle", "Cardiff", "Belfast", "Nottingham"],
    providers: [
      { name: "ODEON", domain: "odeon.co.uk" },
      { name: "Cineworld", domain: "cineworld.co.uk" },
      { name: "Vue", domain: "myvue.com" },
      { name: "Everyman", domain: "everymancinema.com" },
      { name: "Picturehouse", domain: "picturehouses.com" },
    ],
  },
  CA: {
    cities: ["Toronto", "Montreal", "Vancouver", "Calgary", "Edmonton", "Ottawa", "Winnipeg", "Quebec City", "Halifax"],
    providers: [
      { name: "Cineplex", domain: "cineplex.com" },
      { name: "Landmark Cinemas", domain: "landmarkcinemas.com" },
    ],
  },
  AU: {
    cities: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Gold Coast", "Canberra", "Hobart", "Darwin"],
    providers: [
      { name: "HOYTS", domain: "hoyts.com.au" },
      { name: "Event Cinemas", domain: "eventcinemas.com.au" },
      { name: "Village Cinemas", domain: "villagecinemas.com.au" },
      { name: "Reading Cinemas", domain: "readingcinemas.com.au" },
    ],
  },
  NZ: {
    cities: ["Auckland", "Wellington", "Christchurch", "Hamilton", "Dunedin"],
    providers: [
      { name: "Event Cinemas", domain: "eventcinemas.co.nz" },
      { name: "HOYTS", domain: "hoyts.co.nz" },
      { name: "Reading Cinemas", domain: "readingcinemas.co.nz" },
    ],
  },
  JP: {
    cities: ["Tokyo", "Osaka", "Nagoya", "Yokohama", "Sapporo", "Fukuoka", "Kobe", "Kyoto", "Sendai", "Hiroshima"],
    providers: [
      { name: "TOHO Cinemas", domain: "tohotheater.jp" },
      { name: "AEON Cinema", domain: "aeoncinema.com" },
      { name: "109 Cinemas", domain: "109cinemas.net" },
      { name: "T・JOY", domain: "tjoy.jp" },
      { name: "United Cinemas", domain: "unitedcinemas.jp" },
    ],
  },
  KR: {
    cities: ["Seoul", "Busan", "Incheon", "Daegu", "Daejeon", "Gwangju", "Ulsan", "Suwon"],
    providers: [
      { name: "CGV", domain: "cgv.co.kr" },
      { name: "Lotte Cinema", domain: "lottecinema.co.kr" },
      { name: "Megabox", domain: "megabox.co.kr" },
    ],
  },
  CN: {
    cities: ["Beijing", "Shanghai", "Guangzhou", "Shenzhen", "Chengdu", "Chongqing", "Wuhan", "Hangzhou", "Xi'an", "Nanjing"],
    providers: [
      { name: "Maoyan 猫眼", domain: "maoyan.com" },
      { name: "Taopiaopiao 淘票票", domain: "taopiaopiao.com" },
    ],
  },
  HK: {
    cities: ["Hong Kong Island", "Kowloon", "New Territories"],
    providers: [
      { name: "Cinema City", domain: "cinemacity.com.hk" },
      { name: "Broadway Circuit", domain: "cinema.com.hk" },
      { name: "MCL Cinemas", domain: "mclcinema.com" },
    ],
  },
  TW: {
    cities: ["Taipei", "New Taipei", "Taichung", "Kaohsiung", "Tainan", "Taoyuan"],
    providers: [
      { name: "Vieshow Cinemas", domain: "vscinemas.com.tw" },
      { name: "Showtime Cinemas", domain: "showtimes.com.tw" },
      { name: "ezding", domain: "ezding.com.tw" },
    ],
  },
  SG: {
    cities: ["Singapore"],
    providers: [
      { name: "Golden Village", domain: "gv.com.sg" },
      { name: "Shaw Theatres", domain: "shaw.sg" },
      { name: "Cathay Cineplexes", domain: "cathaycineplexes.com.sg" },
    ],
  },
  MY: {
    cities: ["Kuala Lumpur", "George Town", "Johor Bahru", "Ipoh", "Kota Kinabalu", "Kuching"],
    providers: [
      { name: "GSC", domain: "gsc.com.my" },
      { name: "TGV Cinemas", domain: "tgv.com.my" },
      { name: "MBO Cinemas", domain: "mbocinemas.com" },
    ],
  },
  ID: {
    cities: ["Jakarta", "Surabaya", "Bandung", "Medan", "Semarang", "Makassar", "Denpasar", "Yogyakarta"],
    providers: [
      { name: "Cinema XXI", domain: "21cineplex.com" },
      { name: "CGV Indonesia", domain: "cgv.id" },
      { name: "Cinépolis Indonesia", domain: "cinepolis.co.id" },
    ],
  },
  PH: {
    cities: ["Manila", "Quezon City", "Makati", "Cebu City", "Davao City", "Pasay"],
    providers: [
      { name: "SM Cinema", domain: "smcinema.com" },
      { name: "Ayala Malls Cinemas", domain: "sureseats.com" },
    ],
  },
  TH: {
    cities: ["Bangkok", "Chiang Mai", "Phuket", "Pattaya", "Khon Kaen"],
    providers: [
      { name: "Major Cineplex", domain: "majorcineplex.com" },
      { name: "SF Cinema", domain: "sfcinemacity.com" },
    ],
  },
  AE: {
    cities: ["Dubai", "Abu Dhabi", "Sharjah", "Al Ain", "Ajman"],
    providers: [
      { name: "VOX Cinemas", domain: "uae.voxcinemas.com" },
      { name: "Reel Cinemas", domain: "reelcinemas.com" },
      { name: "Novo Cinemas", domain: "novocinemas.com" },
    ],
  },
  SA: {
    cities: ["Riyadh", "Jeddah", "Dammam", "Mecca", "Medina", "Khobar"],
    providers: [
      { name: "VOX Cinemas", domain: "ksa.voxcinemas.com" },
      { name: "AMC Cinemas", domain: "amccinemas.com" },
      { name: "Muvi Cinemas", domain: "muvicinemas.com" },
    ],
  },
  FR: {
    cities: ["Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes", "Bordeaux", "Lille", "Strasbourg", "Montpellier"],
    providers: [
      { name: "AlloCiné", domain: "allocine.fr" },
      { name: "Pathé", domain: "pathe.fr" },
      { name: "UGC", domain: "ugc.fr" },
      { name: "CGR Cinémas", domain: "cgrcinemas.fr" },
    ],
  },
  DE: {
    cities: ["Berlin", "Hamburg", "Munich", "Cologne", "Frankfurt", "Stuttgart", "Düsseldorf", "Leipzig", "Dresden", "Hanover"],
    providers: [
      { name: "Kinoheld", domain: "kinoheld.de" },
      { name: "CinemaxX", domain: "cinemaxx.de" },
      { name: "Cineplex", domain: "cineplex.de" },
      { name: "UCI Kinowelt", domain: "uci-kinowelt.de" },
      { name: "Kinopolis", domain: "kinopolis.de" },
    ],
  },
  AT: {
    cities: ["Vienna", "Graz", "Linz", "Salzburg", "Innsbruck"],
    providers: [
      { name: "Cineplexx", domain: "cineplexx.at" },
      { name: "UCI Kinowelt", domain: "uci-kinowelt.at" },
    ],
  },
  CH: {
    cities: ["Zurich", "Geneva", "Basel", "Bern", "Lausanne"],
    providers: [
      { name: "Pathé Schweiz", domain: "pathe.ch" },
      { name: "Kitag", domain: "kitag.com" },
      { name: "Cinergy", domain: "cinergy.ch" },
    ],
  },
  NL: {
    cities: ["Amsterdam", "Rotterdam", "The Hague", "Utrecht", "Eindhoven"],
    providers: [
      { name: "Pathé", domain: "pathe.nl" },
      { name: "Vue", domain: "vuecinemas.nl" },
      { name: "Kinepolis", domain: "kinepolis.nl" },
    ],
  },
  BE: {
    cities: ["Brussels", "Antwerp", "Ghent", "Liège", "Bruges"],
    providers: [
      { name: "Kinepolis", domain: "kinepolis.be" },
      { name: "UGC Belgium", domain: "ugc.be" },
    ],
  },
  ES: {
    cities: ["Madrid", "Barcelona", "Valencia", "Seville", "Zaragoza", "Málaga", "Bilbao", "Palma"],
    providers: [
      { name: "Cinesa", domain: "cinesa.es" },
      { name: "Yelmo Cines", domain: "yelmocines.es" },
      { name: "Kinépolis", domain: "kinepolis.es" },
      { name: "Ocine", domain: "ocine.es" },
    ],
  },
  PT: {
    cities: ["Lisbon", "Porto", "Braga", "Coimbra", "Faro"],
    providers: [
      { name: "Cinemas NOS", domain: "cinemas.nos.pt" },
      { name: "UCI Cinemas", domain: "ucicinemas.pt" },
    ],
  },
  IT: {
    cities: ["Rome", "Milan", "Naples", "Turin", "Palermo", "Bologna", "Florence", "Genoa", "Venice"],
    providers: [
      { name: "The Space Cinema", domain: "thespacecinema.it" },
      { name: "UCI Cinemas", domain: "ucicinemas.it" },
      { name: "MYmovies", domain: "mymovies.it" },
    ],
  },
  IE: {
    cities: ["Dublin", "Cork", "Galway", "Limerick"],
    providers: [
      { name: "ODEON", domain: "odeoncinemas.ie" },
      { name: "Omniplex", domain: "omniplex.ie" },
      { name: "Cineworld", domain: "cineworld.ie" },
    ],
  },
  SE: { cities: ["Stockholm", "Gothenburg", "Malmö", "Uppsala"], providers: [{ name: "Filmstaden", domain: "filmstaden.se" }] },
  NO: { cities: ["Oslo", "Bergen", "Trondheim", "Stavanger"], providers: [{ name: "Nordisk Film Kino", domain: "nfkino.no" }, { name: "Odeon Kino", domain: "odeonkino.no" }] },
  DK: { cities: ["Copenhagen", "Aarhus", "Odense", "Aalborg"], providers: [{ name: "Nordisk Film Biografer", domain: "nfbio.dk" }, { name: "Biografmadsen", domain: "biografmadsen.dk" }] },
  FI: { cities: ["Helsinki", "Espoo", "Tampere", "Turku", "Oulu"], providers: [{ name: "Finnkino", domain: "finnkino.fi" }] },
  PL: { cities: ["Warsaw", "Kraków", "Wrocław", "Łódź", "Poznań", "Gdańsk"], providers: [{ name: "Cinema City", domain: "cinema-city.pl" }, { name: "Multikino", domain: "multikino.pl" }, { name: "Helios", domain: "helios.pl" }] },
  TR: {
    cities: ["Istanbul", "Ankara", "Izmir", "Bursa", "Antalya", "Adana"],
    providers: [
      { name: "Paribu Cineverse", domain: "paribucineverse.com" },
      { name: "Biletinial", domain: "biletinial.com" },
    ],
  },
  BR: {
    cities: ["São Paulo", "Rio de Janeiro", "Brasília", "Salvador", "Fortaleza", "Belo Horizonte", "Curitiba", "Recife", "Porto Alegre", "Manaus"],
    providers: [
      { name: "Ingresso.com", domain: "ingresso.com" },
      { name: "Cinemark Brasil", domain: "cinemark.com.br" },
      { name: "Cinépolis Brasil", domain: "cinepolis.com.br" },
      { name: "Kinoplex", domain: "kinoplex.com.br" },
    ],
  },
  MX: {
    cities: ["Mexico City", "Guadalajara", "Monterrey", "Puebla", "Tijuana", "Querétaro", "Mérida", "Cancún", "León"],
    providers: [
      { name: "Cinépolis", domain: "cinepolis.com" },
      { name: "Cinemex", domain: "cinemex.com" },
    ],
  },
  AR: { cities: ["Buenos Aires", "Córdoba", "Rosario", "Mendoza", "La Plata"], providers: [{ name: "Cinemark Hoyts", domain: "cinemarkhoyts.com.ar" }, { name: "Cinépolis", domain: "cinepolis.com.ar" }] },
  CL: { cities: ["Santiago", "Valparaíso", "Concepción", "Antofagasta"], providers: [{ name: "Cinemark Chile", domain: "cinemark.cl" }, { name: "Cineplanet", domain: "cineplanet.cl" }] },
  CO: { cities: ["Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena"], providers: [{ name: "Cine Colombia", domain: "cinecolombia.com" }, { name: "Cinemark", domain: "cinemark.com.co" }, { name: "Procinal", domain: "procinal.com" }] },
  PE: { cities: ["Lima", "Arequipa", "Trujillo", "Cusco"], providers: [{ name: "Cineplanet", domain: "cineplanet.com.pe" }, { name: "Cinemark", domain: "cinemark-peru.com" }] },
  ZA: { cities: ["Johannesburg", "Cape Town", "Durban", "Pretoria", "Port Elizabeth"], providers: [{ name: "Ster-Kinekor", domain: "sterkinekor.com" }, { name: "Nu Metro", domain: "numetro.co.za" }] },
  NG: { cities: ["Lagos", "Abuja", "Port Harcourt", "Ibadan"], providers: [{ name: "Filmhouse Cinemas", domain: "filmhouseng.com" }, { name: "Genesis Cinemas", domain: "genesiscinemas.com" }] },
  EG: { cities: ["Cairo", "Alexandria", "Giza"], providers: [{ name: "VOX Cinemas", domain: "egy.voxcinemas.com" }] },
  PK: { cities: ["Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad"], providers: [{ name: "Cinepax", domain: "cinepax.com" }, { name: "Nueplex", domain: "nueplex.com" }] },
  BD: { cities: ["Dhaka", "Chittagong", "Sylhet"], providers: [{ name: "Star Cineplex", domain: "cineplexbd.com" }] },
  LK: { cities: ["Colombo", "Kandy", "Galle"], providers: [{ name: "Scope Cinemas", domain: "scopecinemas.com" }, { name: "PVR Sri Lanka", domain: "pvrcinemas.lk" }] },
};
