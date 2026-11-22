
require("dotenv").config();

const axios = require("axios");
const cheerio = require("cheerio");
const db = require("./db");

// =====================================================
// 1. COLLEGE WEBSITES
// =====================================================

const COLLEGES = [
  { name: "SJBIT", url: "https://www.sjbit.edu.in/" },
  { name: "RV College of Engineering", url: "https://rvce.edu.in/" },
  { name: "Ramaiah Institute of Technology", url: "https://www.msrit.edu/" },
  { name: "PES University", url: "https://pes.edu/" },
  { name: "BMS College of Engineering", url: "https://www.bmsce.ac.in/" },
  { name: "IIIT Bangalore", url: "https://www.iiitb.ac.in/" },
  { name: "Bangalore Institute of Technology", url: "https://bit-bangalore.edu.in/" },
  { name: "Dayananda Sagar College of Engineering", url: "https://www.dsce.edu.in/" },
  { name: "NMIT", url: "https://nmit.ac.in/" },
  { name: "CMR Institute of Technology", url: "https://www.cmrit.ac.in/" },
  { name: "New Horizon College of Engineering", url: "https://newhorizonindia.edu/" },
  { name: "BMS Institute of Technology", url: "https://bmsit.ac.in/" },
  { name: "Sir M. Visvesvaraya Institute of Technology", url: "https://sirmvit.edu/" },
  { name: "RNS Institute of Technology", url: "https://www.rnsit.ac.in/" },
  { name: "Jain University", url: "https://www.jainuniversity.ac.in/" },
  { name: "Christ University", url: "https://christuniversity.in/" },
  { name: "Alliance University", url: "https://www.alliance.edu.in/" },
  { name: "Dayananda Sagar University", url: "https://www.dsu.edu.in/" },
  { name: "CMR University", url: "https://www.cmr.edu.in/" },
  { name: "Presidency University", url: "https://presidencyuniversity.in/" },
  { name: "REVA University", url: "https://www.reva.edu.in/" },
  { name: "Acharya Institute of Technology", url: "https://www.ait.ac.in/" },
  { name: "Siddaganga Institute of Technology", url: "https://sit.ac.in/" },
  { name: "Don Bosco Institute of Technology", url: "https://www.dbit.edu.in/" },
  { name: "Dr. Ambedkar Institute of Technology", url: "https://drait.edu.in/" },
  { name: "BMS School of Architecture", url: "https://www.bmsca.org/" }
];

// =====================================================
// 2. CONFIGURATION
// =====================================================

const MAX_EVENT_PAGES_PER_COLLEGE = 8;
const MAX_DETAILS_PER_COLLEGE = 40;
const REQUEST_DELAY_MS = 700;
const MAX_RETRIES = 2;

const EVENT_TERMS =
  /\b(event|events|fest|festival|hackathon|workshop|symposium|conference|seminar|competition|expo|webinar|summit|conclave|meetup|contest|graduation|convocation|project day|guest lecture|technical talk|cultural|technical fest|orientation|sports day|open day)\b/i;

const EVENT_PAGE_TERMS =
  /\b(events?|upcoming-events?|college-events?|campus-events?|event-details?|event-list|event-calendar)\b/i;

const BAD_TITLE =
  /^(home|about us|contact us|read more|learn more|click here|know more|view all|login|register|events?|upcoming events|event details|explore event|explore events)$/i;

const REGISTRATION_TERMS =
  /\b(register|registration|register now|apply now|book now|sign up|enrol|enroll|participate)\b/i;

// Event-specific labels only.
// Publication dates and notice dates are not accepted.
const EVENT_DATE_LABEL =
  /(?:event\s*date|date\s*of\s*(?:the\s*)?event|scheduled\s*(?:event\s*)?date|event\s*will\s*be\s*held\s*on|event\s*is\s*scheduled\s*for|scheduled\s*to\s*be\s*held\s*on|commences\s*on|starts\s*on|event\s*period|date\s*and\s*time\s*of\s*event)\s*[:\-]?\s*([^|;\n]{3,150})/i;

const http = axios.create({
  timeout: 30000,
  maxRedirects: 5,
  maxContentLength: 10 * 1024 * 1024,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml"
  },
  validateStatus: (status) => status >= 200 && status < 400
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// =====================================================
// 3. INDIA DATE
// =====================================================

function getTodayIndia() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function getEventStatus(eventDate) {
  if (!eventDate) return "needs_review";

  return eventDate < getTodayIndia()
    ? "expired"
    : "upcoming";
}

// =====================================================
// 4. URL HELPERS
// =====================================================

function normalizeUrl(raw, base) {
  try {
    if (!raw) return null;

    const url = new URL(raw, base);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    if (
      /\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|rar|7z|docx?|xlsx?|pptx?|mp3|mp4|m4a|wav|ogg|webm|avi|mov|wmv|mkv)$/i.test(
        url.pathname
      )
    ) {
      return null;
    }

    url.hash = "";

    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }

    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    return url.href;
  } catch {
    return null;
  }
}

function sameCollegeDomain(candidate, homepage) {
  try {
    const a = new URL(candidate).hostname
      .replace(/^www\./i, "")
      .toLowerCase();

    const b = new URL(homepage).hostname
      .replace(/^www\./i, "")
      .toLowerCase();

    return a === b;
  } catch {
    return false;
  }
}

function isExcludedPage(text) {
  return /\b(news|notice|notices|announcement|announcements|circular|press-release|media-release|tender|recruitment|career|vacancy)\b/i.test(
    text
  );
}

function isEventPageLink(text) {
  return EVENT_PAGE_TERMS.test(text) && !isExcludedPage(text);
}

function isEventDetailLink(text) {
  const value = String(text || "").toLowerCase();

  if (isExcludedPage(value)) return false;

  return (
    /\b(event|events|event-details|event-detail|event-view|event-info)\b/i.test(value) ||
    /event[-_/]?details|events?[-_/]?view/i.test(value)
  );
}

// =====================================================
// 5. DATE EXTRACTION
// =====================================================

function validDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  if (
    y < 2000 ||
    y > 2100 ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > 31
  ) {
    return null;
  }

  const date = new Date(Date.UTC(y, m - 1, d));

  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }

  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function extractDate(text) {
  const value = cleanText(text);

  if (!value) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  let m = value.match(
    /\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/
  );

  if (m) {
    return validDate(m[1], m[2], m[3]);
  }

  // DD-MM-YYYY or DD/MM/YYYY
  m = value.match(
    /\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/
  );

  if (m) {
    return validDate(m[3], m[2], m[1]);
  }

  const months =
    "january|february|march|april|may|june|july|august|september|october|november|december";

  // January 15, 2027
  m = value.match(
    new RegExp(
      `\\b(${months})\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(20\\d{2})\\b`,
      "i"
    )
  );

  if (m) {
    return validDate(
      m[3],
      new Date(`${m[1]} 1, 2000`).getMonth() + 1,
      m[2]
    );
  }

  // 15 January 2027
  m = value.match(
    new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${months})[,]?\\s+(20\\d{2})\\b`,
      "i"
    )
  );

  if (m) {
    return validDate(
      m[3],
      new Date(`${m[2]} 1, 2000`).getMonth() + 1,
      m[1]
    );
  }

  // Short month formats
  const shortMonths =
    "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";

  const monthMap = {
    jan: 1, feb: 2, mar: 3, apr: 4,
    may: 5, jun: 6, jul: 7, aug: 8,
    sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
  };

  // Jan 15, 2027
  m = value.match(
    new RegExp(
      `\\b(${shortMonths})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(20\\d{2})\\b`,
      "i"
    )
  );

  if (m) {
    return validDate(
      m[3],
      monthMap[m[1].toLowerCase()],
      m[2]
    );
  }

  // 15 Jan 2027
  m = value.match(
    new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${shortMonths})\\.?[,]?\\s+(20\\d{2})\\b`,
      "i"
    )
  );

  if (m) {
    return validDate(
      m[3],
      monthMap[m[2].toLowerCase()],
      m[1]
    );
  }

  return null;
}

// =====================================================
// 6. CLEAN WEBSITE CONTENT
// =====================================================

function cleanPage($) {
  $(
    "script, style, noscript, iframe, svg, canvas, form, nav, footer, header, aside"
  ).remove();

  $(
    '[role="navigation"], [aria-hidden="true"], .cookie, .cookies, .breadcrumb, .breadcrumbs'
  ).remove();

  return cleanText(
    $("main").first().text() ||
    $("article").first().text() ||
    $("body").text()
  );
}

// =====================================================
// 7. FETCH HTML WITH RETRIES
// =====================================================

async function fetchHtml(url) {
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const response = await http.get(url);

      const type = String(
        response.headers["content-type"] || ""
      ).toLowerCase();

      if (
        !type.includes("text/html") &&
        !type.includes("application/xhtml+xml")
      ) {
        console.log(`Skipped non-HTML page: ${url}`);
        return null;
      }

      return cheerio.load(response.data);
    } catch (error) {
      console.log(
        `Request attempt ${attempt} failed: ${url} - ${error.message}`
      );

      if (attempt <= MAX_RETRIES) {
        await sleep(1200 * attempt);
      }
    }
  }

  console.log(`Could not read page: ${url}`);
  return null;
}

// =====================================================
// 8. FIND EVENTS PAGE LINKS FROM HOMEPAGE
// =====================================================

function discoverEventPages($, pageUrl, homepage) {
  const found = new Set();

  $("a[href]").each((_, element) => {
    const a = $(element);

    const href = normalizeUrl(
      a.attr("href"),
      pageUrl
    );

    if (!href || !sameCollegeDomain(href, homepage)) {
      return;
    }

    if (href === normalizeUrl(homepage, homepage)) {
      return;
    }

    const linkText = cleanText(
      `${a.text()} ${a.attr("title") || ""} ${a.attr("aria-label") || ""}`
    );

    const path = new URL(href).pathname;

    const combined = `${linkText} ${path}`;

    if (!isEventPageLink(combined)) {
      return;
    }

    found.add(href);
  });

  return [...found];
}

// =====================================================
// 9. FIND INDIVIDUAL EVENT DETAIL LINKS
// =====================================================

function discoverEventDetails($, pageUrl, homepage) {
  const found = new Map();

  // First inspect links inside common event-card containers.
  const cardSelectors = [
    "article",
    ".event",
    ".events",
    ".event-item",
    ".event-card",
    ".event-list",
    ".event-box",
    ".event-wrapper",
    ".events-item",
    ".upcoming-event",
    ".upcoming-events",
    ".card"
  ];

  for (const selector of cardSelectors) {
    $(selector).each((_, card) => {
      const cardElement = $(card);

      const cardText = cleanText(cardElement.text());

      // Avoid containers clearly belonging to news/notices.
      if (isExcludedPage(cardText)) return;

      cardElement.find("a[href]").each((_, link) => {
        const a = $(link);

        const href = normalizeUrl(
          a.attr("href"),
          pageUrl
        );

        if (!href || !sameCollegeDomain(href, homepage)) {
          return;
        }

        const linkText = cleanText(
          `${a.text()} ${a.attr("title") || ""} ${a.attr("aria-label") || ""}`
        );

        const path = new URL(href).pathname;

        if (
          href === pageUrl ||
          isExcludedPage(`${linkText} ${path}`)
        ) {
          return;
        }

        // A link inside an event card is treated as a
        // possible detail link, even if it says "Read More".
        if (
          cardText.length >= 15 &&
          cardText.length <= 5000
        ) {
          found.set(href, {
            url: href,
            linkTitle: linkText,
            context: cardText.slice(0, 1500)
          });
        }
      });
    });
  }

  // Also accept links whose own text or URL clearly
  // identifies an event detail page.
  $("a[href]").each((_, element) => {
    const a = $(element);

    const href = normalizeUrl(
      a.attr("href"),
      pageUrl
    );

    if (!href || !sameCollegeDomain(href, homepage)) {
      return;
    }

    const linkText = cleanText(
      `${a.text()} ${a.attr("title") || ""} ${a.attr("aria-label") || ""}`
    );

    const path = new URL(href).pathname;
    const combined = `${linkText} ${path}`;

    if (
      href === pageUrl ||
      isExcludedPage(combined)
    ) {
      return;
    }

    if (isEventDetailLink(combined)) {
      if (!found.has(href)) {
        found.set(href, {
          url: href,
          linkTitle: linkText,
          context: cleanText(
            a.closest("article, li, .event, .event-card, .card").text() ||
            a.parent().text()
          ).slice(0, 1500)
        });
      }
    }
  });

  return [...found.values()];
}

// =====================================================
// 10. EXTRACT EVENT TITLE
// =====================================================

function extractEventTitle($, candidate) {
  const selectors = [
    "h1",
    ".event-title",
    ".entry-title",
    ".page-title",
    ".event-heading",
    ".event_name",
    ".event-name",
    "article h2",
    "main h2"
  ];

  for (const selector of selectors) {
    const elements = $(selector);

    for (let i = 0; i < elements.length; i++) {
      const value = cleanText($(elements[i]).text());

      if (
        value.length >= 8 &&
        value.length <= 250 &&
        !BAD_TITLE.test(value)
      ) {
        return value;
      }
    }
  }

  const candidateTitle = cleanText(candidate.linkTitle);

  if (
    candidateTitle.length >= 8 &&
    candidateTitle.length <= 250 &&
    !BAD_TITLE.test(candidateTitle)
  ) {
    return candidateTitle;
  }

  // Try the event card context for a useful title.
  if (candidate.context) {
    const contextLines = candidate.context
      .split(/[.!?\n]/)
      .map(cleanText)
      .filter((line) =>
        line.length >= 8 &&
        line.length <= 250 &&
        !BAD_TITLE.test(line)
      );

    const usefulLine = contextLines.find((line) =>
      EVENT_TERMS.test(line)
    );

    if (usefulLine) return usefulLine;
  }

  const titleTag = cleanText($("title").first().text())
    .split("|")[0]
    .split("–")[0]
    .trim();

  if (
    titleTag.length >= 8 &&
    titleTag.length <= 250 &&
    !BAD_TITLE.test(titleTag)
  ) {
    return titleTag;
  }

  return null;
}

// =====================================================
// 11. EXTRACT EVENT DATE
// =====================================================

function extractEventDate($, bodyText) {
  // A. Structured Event data (JSON-LD).
  let structuredDate = null;

  $('script[type="application/ld+json"]').each((_, element) => {
    if (structuredDate) return;

    try {
      const data = JSON.parse($(element).html());

      function inspect(item) {
        if (!item || structuredDate) return;

        if (Array.isArray(item)) {
          item.forEach(inspect);
          return;
        }

        if (typeof item !== "object") return;

        const type = item["@type"];
        const types = Array.isArray(type) ? type : [type];

        if (
          types.some((t) =>
            /event|festival|conference|exhibition/i.test(String(t))
          )
        ) {
          const date = extractDate(
            item.startDate || item.startTime || ""
          );

          if (date) {
            structuredDate = date;
            return;
          }
        }

        if (item["@graph"]) inspect(item["@graph"]);
        if (item.itemListElement) inspect(item.itemListElement);
      }

      inspect(data);
    } catch {
      // Ignore invalid JSON-LD.
    }
  });

  if (structuredDate) return structuredDate;

  // B. Event-specific date fields.
  const selectors = [
    '[itemprop="startDate"]',
    '[class*="event-date"]',
    '[id*="event-date"]',
    '[class*="event_date"]',
    '[id*="event_date"]',
    ".eventDate",
    ".event_date",
    ".event-start-date",
    ".event_start_date",
    ".start-date",
    ".start_date"
  ];

  for (const selector of selectors) {
    let found = null;

    $(selector).each((_, element) => {
      if (found) return;

      const el = $(element);

      const info = (
        (el.attr("class") || "") + " " +
        (el.attr("id") || "")
      ).toLowerCase();

      if (/publish|posted|notice|updated|created/.test(info)) {
        return;
      }

      const value =
        el.attr("datetime") ||
        el.attr("content") ||
        el.text();

      found = extractDate(value);
    });

    if (found) return found;
  }

  // C. Explicitly labelled event date.
  const match = bodyText.match(EVENT_DATE_LABEL);

  if (match) {
    const date = extractDate(match[1]);
    if (date) return date;
  }

  // Do not use arbitrary dates from the page.
  // Publication dates can be mistaken for event dates.
  return null;
}

// =====================================================
// 12. REGISTRATION URL
// =====================================================

function extractRegistrationUrl($, pageUrl) {
  let result = null;

  $("a[href]").each((_, element) => {
    if (result) return;

    const a = $(element);

    const label = cleanText(
      `${a.text()} ${a.attr("aria-label") || ""} ${a.attr("title") || ""}`
    );

    if (!REGISTRATION_TERMS.test(label)) {
      return;
    }

    const href = normalizeUrl(
      a.attr("href"),
      pageUrl
    );

    if (!href || href === pageUrl) {
      return;
    }

    const path = new URL(href).pathname;

    if (/login|signin|sign-in|logout|account|profile/i.test(path)) {
      return;
    }

    result = href;
  });

  return result;
}

// =====================================================
// 13. EXTRACT LOCATION
// =====================================================

function extractLocation(text, collegeName) {
  const match = text.match(
    /\b(?:venue|location)\s*[:\-]\s*([^.;|]{3,100})/i
  );

  return match
    ? cleanText(match[1]).slice(0, 255)
    : collegeName;
}

// =====================================================
// 14. EVENT VALIDATION
// =====================================================

function isPlausibleEvent(title, body) {
  if (
    !title ||
    title.length < 8 ||
    title.length > 250 ||
    BAD_TITLE.test(title)
  ) {
    return false;
  }

  return EVENT_TERMS.test(
    `${title} ${body.slice(0, 2500)}`
  );
}

// =====================================================
// 15. SAVE EVENT TO MYSQL
// =====================================================

async function saveEvent(event) {
  const [rows] = await db.execute(
    `SELECT id, registration_url
       FROM events
      WHERE source_url = ?
      LIMIT 1`,
    [event.source_url]
  );

  if (!event.event_date) {
    if (rows.length) {
      await db.execute(
        `UPDATE events
            SET event_status = 'needs_review'
          WHERE id = ?`,
        [rows[0].id]
      );
    }

    return "no_date";
  }

  // Past events are never inserted.
  if (event.event_date < getTodayIndia()) {
    if (rows.length) {
      await db.execute(
        `UPDATE events
            SET event_date = ?,
                event_status = 'expired'
          WHERE id = ?`,
        [event.event_date, rows[0].id]
      );
    }

    return "expired";
  }

  const status = getEventStatus(event.event_date);

  if (rows.length) {
    const old = rows[0];

    const registrationUrl =
      event.registration_url ||
      old.registration_url ||
      null;

    await db.execute(
      `UPDATE events
          SET title = ?,
              college = ?,
              category = ?,
              description = ?,
              event_date = ?,
              location = ?,
              registration_url = ?,
              event_status = ?
        WHERE id = ?`,
      [
        event.title,
        event.college,
        event.category,
        event.description,
        event.event_date,
        event.location,
        registrationUrl,
        status,
        old.id
      ]
    );

    return "updated";
  }

  await db.execute(
    `INSERT INTO events
      (
        title,
        college,
        category,
        description,
        event_date,
        location,
        registration_url,
        source_url,
        event_status
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.title,
      event.college,
      event.category,
      event.description,
      event.event_date,
      event.location,
      event.registration_url,
      event.source_url,
      status
    ]
  );

  return "inserted";
}

// =====================================================
// 16. SCAN ONE COLLEGE
// =====================================================

async function scrapeCollege(college) {
  console.log("\n================================");
  console.log(`SCANNING: ${college.name}`);
  console.log("================================");

  const homepage = normalizeUrl(
    college.url,
    college.url
  );

  if (!homepage) {
    console.log("Invalid college URL.");
    return;
  }

  // Step 1: Read homepage only to find Events pages.
  const homePage = await fetchHtml(homepage);

  if (!homePage) {
    console.log("Could not open college homepage.");
    return;
  }

  const eventPages = discoverEventPages(
    homePage,
    homepage,
    homepage
  ).slice(0, MAX_EVENT_PAGES_PER_COLLEGE);

  console.log(`Events pages found: ${eventPages.length}`);

  if (eventPages.length === 0) {
    console.log("No Events page found on this college website.");
    return;
  }

  // Step 2: Open only Events pages and find event details.
  const candidates = new Map();

  for (const eventPageUrl of eventPages) {
    console.log(`Opening Events page: ${eventPageUrl}`);

    const $ = await fetchHtml(eventPageUrl);

    if (!$) {
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    const details = discoverEventDetails(
      $,
      eventPageUrl,
      homepage
    );

    for (const detail of details) {
      if (detail.url === eventPageUrl) continue;

      if (!candidates.has(detail.url)) {
        candidates.set(detail.url, detail);
      }
    }

    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`Individual event pages found: ${candidates.size}`);

  let inserted = 0;
  let updated = 0;
  let expired = 0;
  let needsReview = 0;
  let skipped = 0;

  // Step 3: Open individual Event Details pages.
  let processed = 0;

  for (const candidate of candidates.values()) {
    if (processed >= MAX_DETAILS_PER_COLLEGE) break;

    processed++;

    console.log(`\nChecking event: ${candidate.url}`);

    const $ = await fetchHtml(candidate.url);

    if (!$) {
      skipped++;
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    const bodyText = cleanPage($).slice(0, 18000);

    const title = extractEventTitle($, candidate);

    if (!isPlausibleEvent(title, bodyText)) {
      console.log(`SKIPPED INVALID EVENT: ${title || "Unknown title"}`);
      skipped++;
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    const eventDate = extractEventDate($, bodyText);
    const today = getTodayIndia();

    // No confirmed event date means no insertion.
    if (!eventDate) {
      console.log(`SKIPPED - EVENT DATE NOT FOUND: ${title}`);

      needsReview++;

      try {
        await saveEvent({
          title,
          source_url: candidate.url,
          event_date: null
        });
      } catch (error) {
        console.error(`Review update failed: ${error.message}`);
      }

      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    // Only today and future dates are accepted.
    if (eventDate < today) {
      console.log(`SKIPPED EXPIRED: ${title} (${eventDate})`);
      expired++;

      try {
        await saveEvent({
          title,
          source_url: candidate.url,
          event_date: eventDate
        });
      } catch (error) {
        console.error(`Expired update failed: ${error.message}`);
      }

      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    const event = {
      title,
      college: college.name,

      category: guessCategory(
        `${title} ${bodyText.slice(0, 1000)}`
      ),

      description: bodyText.slice(0, 1600),

      event_date: eventDate,

      location: extractLocation(
        bodyText,
        college.name
      ),

      registration_url: extractRegistrationUrl(
        $,
        candidate.url
      ),

      source_url: candidate.url
    };

    try {
      const result = await saveEvent(event);

      if (result === "inserted") inserted++;
      if (result === "updated") updated++;
      if (result === "expired") expired++;
      if (result === "no_date") needsReview++;

      console.log(
        `${result.toUpperCase()}: ${title} | ${eventDate}`
      );
    } catch (error) {
      console.error(
        `DATABASE SAVE FAILED: ${title} - ${error.message}`
      );

      skipped++;
    }

    await sleep(REQUEST_DELAY_MS);
  }

  // Step 4: College summary.
  console.log(`\n${college.name} SUMMARY`);
  console.log("--------------------------------");
  console.log(`Events pages: ${eventPages.length}`);
  console.log(`Event detail pages found: ${candidates.size}`);
  console.log(`Event detail pages checked: ${processed}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated: ${updated}`);
  console.log(`Expired: ${expired}`);
  console.log(`Needs date review: ${needsReview}`);
  console.log(`Skipped: ${skipped}`);
}

// =====================================================
// 17. UPDATE DATABASE EVENT STATUSES
// =====================================================

async function updateExpiredEvents() {
  const today = getTodayIndia();

  const [result] = await db.execute(
    `UPDATE events
        SET event_status = CASE
          WHEN event_date IS NULL THEN 'needs_review'
          WHEN event_date < ? THEN 'expired'
          ELSE 'upcoming'
        END`,
    [today]
  );

  console.log(
    `Database status refreshed: ${result.affectedRows} records`
  );
}

// =====================================================
// 18. MAIN SCRAPER
// =====================================================

async function runScraper() {
  console.log("\n================================");
  console.log("         EVENT RAIDER AI");
  console.log("      EVENTS ONLY SCRAPER");
  console.log("================================");

  console.log(`College targets: ${COLLEGES.length}`);
  console.log(`India date: ${getTodayIndia()}`);
  console.log("Scanning: Events pages and Event Details only");
  console.log("Date rule: Today and future events only");

  // Refresh old event statuses.
  await updateExpiredEvents();

  // Scan colleges one by one.
  for (const college of COLLEGES) {
    try {
      await scrapeCollege(college);
    } catch (error) {
      console.error(
        `${college.name} scan failed: ${error.message}`
      );
    }

    await sleep(1000);
  }

  // Refresh statuses after scanning.
  await updateExpiredEvents();

  console.log("\n================================");
  console.log("        SCRAPING COMPLETED");
  console.log("================================");
}

// =====================================================
// 19. EXECUTION
// =====================================================

if (require.main === module) {
  runScraper()
    .catch((error) => {
      console.error("SCRAPER FAILED:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.end();
    });
}

module.exports = {
  runScraper,
  scrapeCollege,
  COLLEGES,
  extractDate,
  extractEventDate,
  getTodayIndia,
  saveEvent
};
