import { Document } from './models.js';
import { searchWeb, fetchPage } from './web_search.js';
import { fetchTweets } from './tweets.js';

export async function retrieveWebContext(ioc, serpApiKey, twitterBearerToken) {
  const documents = [];
  documents.push(...await searchWeb(ioc, serpApiKey));
  try {
    if (twitterBearerToken) {
      documents.push(...await fetchTweets(ioc, twitterBearerToken));
    }
  } catch (err) {
    // Twitter retrieval is optional; ignore errors
  }
  return documents;
}

export { Document, searchWeb, fetchTweets, fetchPage };
