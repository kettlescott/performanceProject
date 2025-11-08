import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomSeed, randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

/**
 * Test configuration 
 */
const CFG = {
  BASE_URL: __ENV.BASE_URL || 'https://blazedemo.com',
  DURATION: __ENV.DURATION || '3m',               // active test period for each scenario
  RAMPUP:   __ENV.RAMPUP   || '30s',              // ramp to target arrival rate
  // Target arrival rates (bookings/sec) per journey
  RATE_J1:  Number(__ENV.RATE_J1 || 600),
  RATE_J2:  Number(__ENV.RATE_J2 || 300),
  RATE_J3:  Number(__ENV.RATE_J3 || 300),

  PREALLOC_VUS: Number(__ENV.PREALLOC_VUS || 600),
  MAX_VUS:      Number(__ENV.MAX_VUS || 2000),
  
  //dummy data
  CARD: {
    cardType: __ENV.CARD_TYPE || 'visa',
    number:   __ENV.CARD_NO   || '4242424242424242',
    month:    __ENV.CARD_MM   || '11',
    year:     __ENV.CARD_YY   || '2027',
    name:     __ENV.CARD_NAME || 'Test User',
  },
  ADDR: {
    inputName: __ENV.NAME || 'test',
    address:   __ENV.ADDR || '1 Test Street',
    city:      __ENV.CITY || 'LA',
    state:     __ENV.STATE|| 'CA',
    zip:       __ENV.ZIP  || '1234567',
  },
};


/**
 * Scenarios:
 */
export const options = {
  scenarios: {
    journey1: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: CFG.PREALLOC_VUS,
      maxVUs: CFG.MAX_VUS,
      stages: [
        { target: CFG.RATE_J1, duration: CFG.RAMPUP },
        { target: CFG.RATE_J1, duration: CFG.DURATION },
      ],
      exec: 'journey1',
      gracefulStop: '0s',
    },
    journey2: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: CFG.PREALLOC_VUS,
      maxVUs: CFG.MAX_VUS,
      stages: [
        { target: CFG.RATE_J2, duration: CFG.RAMPUP },
        { target: CFG.RATE_J2, duration: CFG.DURATION },
      ],
      exec: 'journey2',
      gracefulStop: '0s',
    },
    journey3: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: CFG.PREALLOC_VUS,
      maxVUs: CFG.MAX_VUS,
      stages: [
        { target: CFG.RATE_J3, duration: CFG.RAMPUP },
        { target: CFG.RATE_J3, duration: CFG.DURATION },
      ],
      exec: 'journey3',
      gracefulStop: '0s',
    },
  },

/* SLA
4.	Target rate of bookings per journey as below:
a.	Journey#1: 600 bookings per second 
b.	Journey#2: 300 bookings per second
c.	Journey#3: 300 bookings per second
*/
  thresholds: {
    'http_req_duration{name:reserve}': ['p(99)<1000'],
    'http_req_duration{name:purchase}': ['p(99)<1000'],
    'http_req_duration{name:confirm}': ['p(99)<1000'],    
    http_req_failed: ['rate<0.01'],              // <1% failures
  },
};


//helper parse a html response
function parseFlights(html) {
  const flights = [];
  const formRe = /<form[^>]*>([\s\S]*?)<\/form>/gi;
  let fm;
  while ((fm = formRe.exec(html)) !== null) {
    const block = fm[1];
    const get = (name) => {
      const re = new RegExp(
        `name=["']${name}["'][^>]*value=["']([^"']+)["']|value=["']([^"']+)["'][^>]*name=["']${name}["']`,
        'i'
      );
      const m = re.exec(block);
      return m ? (m[1] || m[2]) : null;
    };
    const f = {
      flight:   get('flight'),
      price:    get('price'),
      airline:  get('airline'),
      fromPort: get('fromPort'),
      toPort:   get('toPort'),
    };
    if (f.flight && f.airline && f.price) flights.push(f);
  }
  return flights;
}

/**
 * Core journey flow:
 * 1) POST /reserve.php with fromPort/toPort
 * 2) Pick a flight from HTML (optionally enforce 50% Singapore Airlines for J3)
 * 3) POST /purchase.php with selected flight details
 * 4) POST /confirmation.php with payment/contact info, then assert receipt page
 */
function bookOnce(pair, journeyTag, singaporeBias = false) {
  // Step 1: choose route
  const res1 = http.post(
    `${CFG.BASE_URL}/reserve.php`,
    { fromPort: pair.from, toPort: pair.to },
    { tags: { name: 'reserve', journey: journeyTag } }
  );

  check(res1, {
    'reserve: 200': (r) => r.status === 200,
  }) || failNow(`Reserve failed for ${pair.from}->${pair.to}, status=${res1.status}`);

  // Parse the response to verify it returns the expected result
  const flights = parseFlights(res1.body);
  check(flights, {
    'parsed at least 1 flight': (arr) => arr.length > 0,
  }) || failNow(`No flights parsed for ${pair.from}->${pair.to}`);

  // Step 2: choose flight, with 50% bias to Singapore Airlines for Journey#3
  let chosen = null;
  if (singaporeBias && Math.random() < 0.5) {
    const sg = flights.filter((f) => (f.airline || '').toLowerCase() === 'singapore airlines');
    if (sg.length) chosen = randomItem(sg);
  }
  if (!chosen) chosen = randomItem(flights);

  // Step 3: purchase with selected flight
  const res2 = http.post(
    `${CFG.BASE_URL}/purchase.php`,
    {
      flight:   chosen.flight,
      price:    chosen.price,
      airline:  chosen.airline,
      fromPort: chosen.fromPort || pair.from,
      toPort:   chosen.toPort   || pair.to,
    },
    { tags: { name: 'purchase', journey: journeyTag } }
  );

  check(res2, {
    'purchase: 200': (r) => r.status === 200,
  }) || failNow(`Purchase page failed, status=${res2.status}`);

  // Step 4: submit payment/customer info to confirmation
  const res3 = http.post(
    `${CFG.BASE_URL}/confirmation.php`,
    {
      _token: '', // BlazeDemo accepts empty token for demo purchase
      inputName: CFG.ADDR.inputName,
      address: CFG.ADDR.address,
      city: CFG.ADDR.city,
      state: CFG.ADDR.state,
      zipCode: CFG.ADDR.zip,
      cardType: CFG.CARD.cardType,
      creditCardNumber: CFG.CARD.number,
      creditCardMonth: CFG.CARD.month,
      creditCardYear: CFG.CARD.year,
      nameOnCard: CFG.CARD.name,
    },
    { tags: { name: 'confirm', journey: journeyTag } }
  );

  const ok = check(res3, {
    'confirm: 200': (r) => r.status === 200,
    'receipt visible': (r) => /Thank you for your purchase today!/i.test(r.body || ''),
  });

  if (!ok) {    
    const snip = String(res3.body || '').slice(0, 180).replace(/\s+/g, ' ');
    failNow(`Confirmation failed (status=${res3.status}). Body head: ${snip}`);
  }
  sleep(0.3 + Math.random() * 0.4);
}

function failNow(msg) {
  throw new Error(msg);
}

//Tests
export function journey1() {
  // Journey#1: Paris -> London
  bookOnce({ from: 'Paris',        to: 'London' },       'journey1', false);
}

export function journey2() {
  // Journey#2: Mexico City -> Berlin
  bookOnce({ from: 'Mexico City',  to: 'Berlin' },       'journey2', false);
}

export function journey3() {
  // Journey#3: Portland -> Dublin, 50% Singapore Airlines
  bookOnce({ from: 'Portland',     to: 'Dublin' },       'journey3', true);
}


