import { Document } from './models.js';
import { Readability } from '@mozilla/readability';

const MIN_ARTICLE_TEXT_LENGTH = 200;

const normalizeWhitespace = text => String(text || '').replace(/\s+/g, ' ').trim();

const SEARCH_ENDPOINT = '/api/serpapi';

/**
 * Query SerpAPI for search results related to the IOC.
 * @param {string} ioc Indicator of compromise to search for
 * @param {string} serpApiKey SerpAPI key provided by the client
 * @param {number} [maxResults=5] Maximum number of results to return
 * @throws {Error} If serpApiKey is missing or the API request fails
 */
async function querySearchAPI(ioc, serpApiKey, maxResults = 5) {
  const key = serpApiKey;
  if (!key) {
    throw new Error('Missing SerpAPI key.');
  }
  const query = `"${ioc}"`;
  const params = new URLSearchParams({ engine: 'google', q: query, api_key: key });
  const resp = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`);
  if (!resp.ok) {
    throw new Error(`SerpAPI request failed with status ${resp.status}`);
  }
  const data = await resp.json();
  const results = [];
  for (const entry of data.organic_results || []) {
    const link = entry.link;
    if (link) {
      results.push({ url: link, title: entry.title || '' });
    }
  }
  console.error(`[web_search] API results for ${ioc}: ${results.slice(0, maxResults).map(r => r.url)}`);
  return results.slice(0, maxResults);
}

function extractRelevantContent(html, url, fallbackTitle = '') {
  const parser = new DOMParser();
  // insert spaces or newlines after block-level closing tags so textContent
  // extraction preserves separation of IOC strings
  const preprocessed = html
    .replace(/<\/(td|th)>/gi, '</$1> ')
    .replace(/<\/(tr|p|div|li|table|ol|ul|h[1-6])>/gi, '</$1>\n')
    .replace(/<br\s*\/?>/gi, '<br>\n');
  const doc = parser.parseFromString(preprocessed, 'text/html');
  // Provide Readability with a URL for relative links if available
  if (url && doc.head) {
    const base = doc.createElement('base');
    base.href = url;
    doc.head.appendChild(base);
  }

  let readabilityText = '';
  let readabilityTitle = '';

  try {
    const reader = new Readability(doc);
    const article = reader.parse();
    if (article) {
      let text = article.textContent || '';
      if (!text && article.content) {
        const tmp = parser.parseFromString(article.content, 'text/html');
        text = tmp.body ? tmp.body.innerText || '' : '';
      }
      readabilityText = normalizeWhitespace(text);
      readabilityTitle = article.title ? article.title.trim() : '';
    }
  } catch (err) {
    console.error(`[web_search] Readability parse failed for ${url}:`, err);
  }

  ['script', 'style', 'nav', 'header', 'footer'].forEach(sel => {
    doc.querySelectorAll(sel).forEach(el => el.remove());
  });
  const fallbackText = normalizeWhitespace(doc.body ? doc.body.textContent || '' : '');
  const fallbackTitleResolved = doc.querySelector('title')?.textContent.trim() || fallbackTitle;

  if (readabilityText) {
    if (readabilityText.length < MIN_ARTICLE_TEXT_LENGTH && fallbackText && fallbackText.length > readabilityText.length) {
      return {
        text: fallbackText,
        title: readabilityTitle || fallbackTitleResolved
      };
    }
    return {
      text: readabilityText,
      title: readabilityTitle || fallbackTitleResolved
    };
  }

  return { text: fallbackText, title: fallbackTitleResolved };
}

/**
 * Perform web searches and fetch page content for the given IOC.
 * @param {string} ioc Indicator of compromise to search for
 * @param {number} [maxResults=5] Maximum number of results to crawl
 * @returns {Promise<Document[]>} Array of retrieved documents
 */
export async function searchWeb(ioc, serpApiKey, maxResults = 5) {
  const documents = [];
  const results = await querySearchAPI(ioc, serpApiKey, maxResults);
  for (const result of results) {
    const url = result.url;
    try {
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        console.error(`[web_search] Non-OK response ${res.status} fetching ${url}`);
        continue;
      }
      const html = await res.text();
      const { text, title } = extractRelevantContent(html, url, result.title || '');
      if (!text) {
        console.error(`[web_search] Empty content at ${url}`);
        continue;
      }
      const metadata = {
        source: 'web',
        url,
        title,
        retrieved_at: new Date().toISOString()
      };
      documents.push(new Document(text, metadata));
      console.error(`[web_search] Fetched '${title}' from ${url}`);
    } catch (err) {
      console.error(`[web_search] Error fetching ${url}:`, err);
      continue;
    }
  }
  console.error(`[web_search] Retrieved ${documents.length} documents for ${ioc}`);
  return documents;
}

/**
 * Fetch and parse a single web page, returning it as a Document.
 * @param {string} url URL of the page to fetch
 * @param {string} [fallbackTitle=''] Title to use if none can be extracted
 * @returns {Promise<Document|null>} Parsed document or null on failure
 */
export async function fetchPage(url, fallbackTitle = '') {
  try {
    const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      console.error(`[web_search] Non-OK response ${res.status} fetching ${url}`);
      return null;
    }
    const html = await res.text();
    const { text, title } = extractRelevantContent(html, url, fallbackTitle);
    if (!text) {
      console.error(`[web_search] Empty content at ${url}`);
      return null;
    }
    const metadata = {
      source: 'web',
      url,
      title,
      retrieved_at: new Date().toISOString()
    };
    console.error(`[web_search] Fetched '${title}' from ${url}`);
    return new Document(text, metadata);
  } catch (err) {
    console.error(`[web_search] Error fetching ${url}:`, err);
    return null;
  }
}

