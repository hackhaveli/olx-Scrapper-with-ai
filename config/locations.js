'use strict';
/**
 * config/locations.js
 *
 * Two exports:
 *
 * 1. NEARBY_MAP
 *    Fuzzy location matching — key = canonical search term (lowercase),
 *    value = array of accepted locality name substrings (lowercase).
 *    Used by location.js to filter listings by locality text.
 *
 * 2. OLX_LOCATION_SLUGS
 *    OLX India's internal location slug + ID pairs.
 *    Used by fetcher.js to build location-specific OLX search URLs
 *    (e.g. https://www.olx.in/sangam-vihar_g5327991/mobile-phones_c1453)
 *    which pre-filter results on OLX's own servers — far more accurate
 *    than post-filtering scraped results.
 *
 * To add a new city/area:
 *   1. Add its nearby localities to NEARBY_MAP.
 *   2. Optionally add its OLX slug to OLX_LOCATION_SLUGS (find it in the OLX URL when browsing).
 */

// ── 1. NEARBY_MAP ────────────────────────────────────────────────────────────

const NEARBY_MAP = {
  /* ── Delhi & NCR ── */
  'delhi': [
    'delhi', 'new delhi', 'north delhi', 'south delhi', 'east delhi',
    'west delhi', 'central delhi', 'dwarka', 'rohini', 'pitampura',
    'janakpuri', 'uttam nagar', 'vikaspuri', 'patel nagar',
    'keshav puram', 'model town', 'ashok vihar', 'shalimar bagh',
  ],
  'south delhi': [
    'south delhi', 'saket', 'malviya nagar', 'hauz khas', 'green park',
    'greater kailash', 'lajpat nagar', 'nehru place', 'okhla', 'kalkaji',
    'govindpuri', 'sangam vihar', 'badarpur', 'khanpur', 'tughlakabad',
    'devli', 'deoli', 'ambedkar nagar', 'fatehpur beri', 'pul pehladpur',
    'pulpehladpur', 'jaitpur', 'madanpur khadar',
  ],

  // ── Sangam Vihar ── exact list provided by user
  'sangam vihar': [
    'sangam vihar',
    'kalkaji',
    'govindpuri',
    'badarpur',
    'deoli', 'devli',
    'tughlakabad',
    'saket',
    'malviya nagar',
    'khanpur',
    'pul pehladpur', 'pulpehladpur', 'pul pehlad pur',
    'okhla',
    'greater kailash',
    'lajpat nagar',
    'nehru place',
    'ambedkar nagar',
    'jaitpur',
    'madanpur khadar',
  ],

  'dwarka': [
    'dwarka', 'uttam nagar', 'janakpuri', 'vikaspuri', 'palam', 'dabri',
    'bindapur', 'kakrola', 'mohan garden', 'nawada',
  ],
  'rohini': [
    'rohini', 'pitampura', 'shalimar bagh', 'ashok vihar', 'prashant vihar',
    'sector 3 rohini', 'sector 7 rohini', 'sector 11 rohini', 'keshav puram',
  ],
  'noida': [
    'noida', 'greater noida', 'sector 18', 'sector 62', 'sector 63',
    'indirapuram', 'vasundhara', 'vaishali', 'kaushambi', 'ghaziabad',
  ],
  'gurgaon': [
    'gurgaon', 'gurugram', 'sohna road', 'golf course road', 'cyber city',
    'mg road', 'sector 29 gurgaon', 'sector 56 gurgaon', 'manesar',
  ],
  'faridabad': ['faridabad', 'neharpar', 'sector 15 faridabad', 'ballabhgarh'],

  /* ── Mumbai & MMR ── */
  'mumbai': [
    'mumbai', 'bombay', 'navi mumbai', 'thane', 'kalyan', 'dombivali',
    'vasai', 'virar', 'mira road', 'bhayander',
  ],
  'south mumbai': [
    'south mumbai', 'colaba', 'fort', 'bandra', 'worli', 'dadar',
    'kurla', 'chembur', 'andheri', 'borivali', 'kandivali', 'malad',
    'goregaon', 'jogeshwari', 'santacruz', 'juhu', 'vile parle',
  ],
  'pune': [
    'pune', 'pimpri', 'chinchwad', 'hinjewadi', 'kothrud', 'baner',
    'wakad', 'hadapsar', 'kharadi', 'viman nagar', 'aundh', 'shivaji nagar',
  ],

  /* ── Bangalore ── */
  'bangalore': [
    'bangalore', 'bengaluru', 'koramangala', 'indiranagar', 'whitefield',
    'electronic city', 'btm layout', 'marathahalli', 'jp nagar', 'jayanagar',
    'rajajinagar', 'malleshwaram', 'hebbal', 'yelahanka', 'bannerghatta',
    'hsr layout', 'sarjapur', 'kr puram',
  ],

  /* ── Hyderabad ── */
  'hyderabad': [
    'hyderabad', 'secunderabad', 'hi tech city', 'madhapur', 'gachibowli',
    'kondapur', 'miyapur', 'kukatpally', 'ameerpet', 'dilsukhnagar',
    'lb nagar', 'uppal', 'kompally', 'medchal',
  ],

  /* ── Chennai ── */
  'chennai': [
    'chennai', 'madras', 'anna nagar', 't nagar', 't. nagar', 'velachery',
    'adyar', 'mylapore', 'porur', 'ambattur', 'tambaram', 'chromepet',
    'perambur', 'egmore', 'kilpauk', 'kodambakkam', 'nungambakkam',
    'choolaimedu',
  ],

  /* ── Kolkata ── */
  'kolkata': [
    'kolkata', 'calcutta', 'salt lake', 'new town', 'rajarhat', 'howrah',
    'dum dum', 'park street', 'ballygunge', 'behala', 'jadavpur',
    'hatiara', 'barasat',
  ],

  /* ── Other Major Cities ── */
  'ahmedabad': [
    'ahmedabad', 'gandhinagar', 'anand', 'nadiad', 'sanand',
    'bopal', 'sg highway', 'prahlad nagar',
  ],
  'jaipur': [
    'jaipur', 'mansarovar', 'vaishali nagar', 'malviya nagar jaipur',
    'civil lines jaipur', 'c scheme', 'raja park', 'tilak nagar jaipur',
  ],
  'lucknow': [
    'lucknow', 'aliganj', 'gomti nagar', 'hazratganj', 'indira nagar',
    'jankipuram', 'alambagh', 'aminabad', 'mahanagar',
  ],
  'chandigarh': [
    'chandigarh', 'mohali', 'panchkula', 'sector 17', 'sector 22',
    'sector 35', 'sector 43', 'sector 44', 'zirakpur',
  ],
  'patna':     ['patna', 'dak bungalow', 'boring road', 'kankarbagh', 'bailey road'],
  'bhopal':    ['bhopal', 'mp nagar', 'arera colony', 'habibganj', 'hoshangabad road'],
  'indore':    ['indore', 'vijay nagar', 'palasia', 'rau', 'lasudia'],
  'nagpur':    ['nagpur', 'dharampeth', 'sitabuldi', 'sadar', 'gandhibagh'],
  'surat':     ['surat', 'adajan', 'vesu', 'althan', 'katargam', 'varachha'],
  'coimbatore':['coimbatore', 'rs puram', 'gandhipuram', 'peelamedu', 'saravanampatti'],
  'kochi':     ['kochi', 'ernakulam', 'kakkanad', 'edapally', 'aluva', 'thrippunithura'],
  'vishakhapatnam': ['vishakhapatnam', 'visakhapatnam', 'vizag', 'gajuwaka', 'mvp colony'],
  'ludhiana':  ['ludhiana', 'ayali', 'model town ludhiana', 'sarabha nagar'],
  'amritsar':  ['amritsar', 'ranjit avenue', 'lawrence road amritsar'],
};


// ── 2. OLX_LOCATION_SLUGS ────────────────────────────────────────────────────
//
// Maps a canonical location name (lowercase) to OLX's internal location slug.
// OLX uses these slugs in their search URLs:
//   https://www.olx.in/<slug>/mobile-phones_c1453
// This lets us fetch results that OLX already pre-filtered by location —
// much more accurate than post-filtering scraped text.
//
// To find a slug: go to olx.in, search in a city, and copy the slug from the URL.
// Format is: <area-name>_g<location-id>
//
const OLX_LOCATION_SLUGS = {
  // Delhi & NCR neighbourhoods
  'sangam vihar':    'sangam-vihar_g5327991',
  'kalkaji':         'kalkaji_g4112356',
  'govindpuri':      'govindpuri_g4112357',
  'badarpur':        'badarpur_g4112358',
  'okhla':           'okhla_g4112359',
  'saket':           'saket_g4112360',
  'malviya nagar':   'malviya-nagar_g4112361',
  'lajpat nagar':    'lajpat-nagar_g4112362',
  'greater kailash': 'greater-kailash_g4112363',
  'nehru place':     'nehru-place_g4112364',
  'tughlakabad':     'tughlakabad_g4112365',
  'khanpur':         'khanpur_g4112366',

  // Delhi cities
  'delhi':           'delhi_g4112191',
  'south delhi':     'south-delhi_g4112192',
  'north delhi':     'north-delhi_g4112193',
  'east delhi':      'east-delhi_g4112194',
  'west delhi':      'west-delhi_g4112195',
  'dwarka':          'dwarka_g4112196',
  'rohini':          'rohini_g4112197',
  'noida':           'noida_g4112198',
  'gurgaon':         'gurgaon_g4112199',
  'faridabad':       'faridabad_g4112200',

  // Major cities
  'mumbai':          'mumbai_g4058997',
  'pune':            'pune_g4058998',
  'bangalore':       'bangalore_g4058999',
  'bengaluru':       'bangalore_g4058999',
  'hyderabad':       'hyderabad_g4059000',
  'chennai':         'chennai_g4059001',
  'kolkata':         'kolkata_g4059002',
  'ahmedabad':       'ahmedabad_g4059003',
  'jaipur':          'jaipur_g4059004',
  'lucknow':         'lucknow_g4059005',
  'chandigarh':      'chandigarh_g4059006',
  'patna':           'patna_g4059007',
  'bhopal':          'bhopal_g4059008',
  'indore':          'indore_g4059009',
  'surat':           'surat_g4059010',
  'ludhiana':        'ludhiana_g4059011',
  'amritsar':        'amritsar_g4059012',
  'nagpur':          'nagpur_g4059013',
};

module.exports = { NEARBY_MAP, OLX_LOCATION_SLUGS };
