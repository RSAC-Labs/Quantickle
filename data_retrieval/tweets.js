const TWITTER_ENDPOINT = 'https://api.twitter.com/2/tweets/search/recent';
import { Document } from './models.js';

export async function fetchTweets(ioc, token, maxResults = 10) {
  if (!token) {
    throw new Error('Missing Twitter bearer token');
  }

  const params = new URLSearchParams({
    query: ioc,
    max_results: Math.min(maxResults, 100),
    'tweet.fields': 'created_at'
  });

  const resp = await fetch(`${TWITTER_ENDPOINT}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!resp.ok) {
    throw new Error(`Twitter request failed with status ${resp.status}`);
  }
  const data = await resp.json();
  const documents = [];
  for (const tweet of data.data || []) {
    const tweetId = tweet.id;
    const text = tweet.text || '';
    const created = tweet.created_at || new Date().toISOString();
    const url = tweetId ? `https://twitter.com/i/web/status/${tweetId}` : '';
    const metadata = { source: 'twitter', url, retrieved_at: created };
    documents.push(new Document(text, metadata));
  }
  return documents;
}

