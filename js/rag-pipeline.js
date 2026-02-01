import { retrieveWebContext, fetchPage } from '../data_retrieval/index.js';

const normalizeContent = text =>
  String(text || '')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
  .replace(/\u00a0/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const QUALIFYING_IOC_KEYS = ['md5_hashes', 'sha1_hashes', 'sha256_hashes', 'ip_addresses'];
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export const selectQualifyingIocs = iocs => {
  if (!iocs || typeof iocs !== 'object') {
    return {};
  }

  return QUALIFYING_IOC_KEYS.reduce((acc, key) => {
    const values = iocs[key];
    if (Array.isArray(values) && values.length > 0) {
      acc[key] = values;
    }
    return acc;
  }, {});
};

export const hasQualifyingIocs = iocs =>
  Object.values(selectQualifyingIocs(iocs)).some(values => Array.isArray(values) && values.length > 0);

export const extractIocs = text => {
  const normalized = normalizeContent(text);
  const patterns = {
    md5_hashes: /\b[a-fA-F0-9]{32}\b/g,
    sha1_hashes: /\b[a-fA-F0-9]{40}\b/g,
    sha256_hashes: /\b[a-fA-F0-9]{64}\b/g,
    ip_addresses: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    urls: /\bhttps?:\/\/[^\s"'<>]+/gi,
    registry_paths: /\b(?:HKEY_LOCAL_MACHINE|HKEY_CURRENT_USER|HKEY_CLASSES_ROOT|HKEY_USERS|HKEY_CURRENT_CONFIG)(?:\\[^\s\\/:*?"<>|]+)+/gi
  };
  const results = {};


  const uniqLower = arr => [...new Set(arr.map(v => v.toLowerCase()))];
  const defang = value =>
    String(value || '')
      .replace(/\[\.\]/g, '.')
      .replace(/hxxp/gi, 'http');
  const normalizeHostname = host =>
    String(host || '')
      .trim()
      .replace(/\.$/, '')
      .replace(/^www\./i, '')
      .toLowerCase();
  const extractHostname = value => {
    try {
      return new URL(value).hostname;
    } catch {
      return null;
    }
  };
  const isValidIpv4 = value => {
    const parts = String(value || '').split('.');
    if (parts.length !== 4) {
      return false;
    }
    return parts.every(part => {
      if (!/^\d{1,3}$/.test(part)) {
        return false;
      }
      const num = Number(part);
      return num >= 0 && num <= 255;
    });
  };

  const defangedDomains = normalized
    .split(/\s+/)
    .filter(token => /\[\.\]/.test(token) || /^hxxp/i.test(token))
    .map(token => {
      const clean = defang(token);
      const candidate = normalizeHostname(clean.split(/[\/?#]/)[0]);
      return candidate;
    })
    .filter(Boolean)
    .filter(token => DOMAIN_PATTERN.test(token));

  const urlDomains = (normalized.match(patterns.urls) || [])
    .map(extractHostname)
    .filter(Boolean)
    .map(normalizeHostname)
    .filter(Boolean);

  const domains = uniqLower([...urlDomains, ...defangedDomains]);
  if (domains.length) {
    results.domains = domains;
  }

  for (const [key, regex] of Object.entries(patterns)) {
    const matches = normalized.match(regex);
    if (!matches) {
      continue;
    }

    const filtered = key === 'ip_addresses' ? matches.filter(isValidIpv4) : matches;
    if (filtered.length) {
      results[key] = uniqLower(filtered);
    }
  }
  return results;
};

const PROMPT_TEMPLATE = (
  "You are a cybersecurity analyst. Given the Indicator of Compromise '{ioc}', analyse the following context to expand the threat graph.\n\n" +
  "Context:\n{context}\n\n" +
  "Tasks:\n" +
  "1. Summarise the activity related to the indicator.\n" +
  "2. Identify any indicators of compromise not matching common regex patterns for MD5, SHA-1, SHA-256, domains, IP addresses, URLs, or Windows registry paths. Group them by context inside an 'iocs' object using descriptive keys. Only treat a string as a domain/host if the text clearly indicates it is infrastructure (e.g., in a domain/C2 table, or explicitly described as a domain, C2, hostname, or URL). Domains may appear defanged (e.g., \"[.]\" or \"hxxp\"), but do not include arbitrary words that merely resemble a domain format.\n" +
  "3. Describe relationships among the indicators and any actors or malware.\n" +
  "4. Identify any reports, threat actors, sponsoring nation states, and specified targets mentioned.\n" +
  "Respond in JSON with keys 'summary', 'iocs', 'relationships', 'reports', 'threat_actors', 'nation_states', and 'targets', where 'summary' has 'title' and 'body' fields."
);

const HACKTIVIST_PROMPT_TEMPLATE = (
  "You are a cybersecurity analyst. Using open-source intelligence, describe the Telegram channel '{group}'.\n\n" +
  "Context:\n{context}\n\n" +
  "Task:\n" +
  "Provide a concise, factual paragraph that covers the channel's focus, ideology or motivations. If present, include notable operations, typical targets, and distinguishing characteristics.\n" +
  "Only include information that is supported by the provided context.\n" +
  "If the context lacks reliable details, respond with \"description\": \"No reliable information found in the provided context.\"\n" +
  "Respond in JSON with the key 'description'."
);

const OSINT_PROMPT_TEMPLATE = (
  "You are an OSINT analyst. Given the subject '{subject}', analyse the following context to enrich the profile.\n\n" +
  "Context:\n{context}\n\n" +
  "Tasks:\n" +
  "1. Provide a brief summary of the subject.\n" +
  "2. Identify associated companies.\n" +
  "3. Identify business partners.\n" +
  "4. Identify organizations the subject is linked to.\n" +
  "5. Identify political connections.\n" +
  "6. Identify social media accounts.\n" +
  "7. Identify geographical location(s).\n" +
  "Respond in JSON with keys 'summary', 'companies', 'business_partners', 'organizations', 'political_connections', 'social_media_accounts', and 'geographical_location', where 'summary' has 'title' and 'body' fields."
);

const SUMMARY_TEMPLATE = `<div class="summary-template">
  <style>
    .summary-template {
      --page-max: clamp(32ch, 60vw, 60ch);
      margin: 0;
      padding: 12px 16px;
      font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #fff;
      color: #000;
      display: inline-block;
      max-width: min(var(--page-max), 100%);
      width: min(var(--page-max), max-content);
      box-sizing: border-box;
    }

    .summary-template .page {
      max-width: min(var(--page-max), 100%);
      width: min(var(--page-max), max-content);
      box-sizing: border-box;
    }

    .summary-template h1 {
      font-size: clamp(1.25rem, 3vw, 1.75rem);
      line-height: 1.2;
      margin: 0 0 0.75rem;
      font-weight: 600;
    }

    .summary-template hr {
      border: none;
      border-top: 2px solid currentColor;
      margin: 0 0 0.75rem;
    }

    .summary-template .content {
      font-size: 1rem;
      line-height: 1.65;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
  <main class="page">
    <h1>{{ title }}</h1>
    <hr />
    <div class="content">
      {{ body_text }}
    </div>
  </main>
</div>`;

export const defaultWrapSummaryHtml = summary => {
  const escapeHtml = str => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  let title = '';
  let body = '';
  
  console.log("RAG-local summary")
  
  if (summary && typeof summary === 'object') {
    title = escapeHtml(summary.title || '');
    body = escapeHtml(summary.body || '');
  } else {
    const [rawTitle, ...rawBody] = String(summary || '').split('\n');
    title = escapeHtml(rawTitle.trim());
    body = escapeHtml(rawBody.join('\n').trim());
  }

  return SUMMARY_TEMPLATE
    .replace('{{ title }}', title)
    .replace('{{ body_text }}', body);
};

export { defaultWrapSummaryHtml as wrapSummaryHtml };
export { fetchPage };

export class RAGPipeline {
  constructor() {
    this.documentStore = [];
  }

  async retrieve(query, serpApiKey, twitterBearerToken) {
    const docs = await retrieveWebContext(query, serpApiKey, twitterBearerToken);
    const valid = docs
      .filter(d => d.content && d.content.trim())
      .map(d => {
        d.content = normalizeContent(d.content);
        d.iocs = extractIocs(d.content);
        return d;
      });
    this.documentStore.push(...valid);
    for (const doc of valid) {
      const meta = doc.metadata || {};
      console.error(`[RAGPipeline] Retrieved '${meta.title || ''}' from ${meta.url || ''}`);
    }
    console.error(`[RAGPipeline] Total documents retrieved: ${valid.length}`);
    return valid;
  }

  async retrieveReport(url) {
    const doc = await fetchPage(url);
    if (doc && doc.content && doc.content.trim()) {
      doc.content = normalizeContent(doc.content);
      doc.iocs = extractIocs(doc.content);
      this.documentStore.push(doc);
      const meta = doc.metadata || {};
      console.error(`[RAGPipeline] Retrieved '${meta.title || ''}' from ${meta.url || ''}`);
      console.error(`[RAGPipeline] Article text: ${doc.content}`);
      console.error(`[RAGPipeline] Extracted IOCs: ${JSON.stringify(doc.iocs)}`);
      console.error('[RAGPipeline] Total documents retrieved: 1');
      return [doc];
    }
    console.error('[RAGPipeline] Total documents retrieved: 0');
    return [];
  }

  buildPrompt(query, documents, type = 'ioc') {
    const valid = documents.filter(d => d.content && d.content.trim());
    if (valid.length === 0) {
      console.error('[RAGPipeline] No document content to build prompt');
      return null;
    }
    const snippets = valid.map(doc => {
      const meta = doc.metadata || {};
      const title = meta.title ? `${meta.title} ` : '';
      const url = meta.url ? `(${meta.url}) ` : '';
      const body = doc.content.trim().replace(/\n/g, ' ');
      return `- ${title}${url}${body}`;
    });
    const context = snippets.join('\n');
    let template;
    let placeholder;
    switch (type) {
      case 'osint':
        template = OSINT_PROMPT_TEMPLATE;
        placeholder = '{subject}';
        break;
      case 'hacktivist':
        template = HACKTIVIST_PROMPT_TEMPLATE;
        placeholder = '{group}';
        break;
      default:
        template = PROMPT_TEMPLATE;
        placeholder = '{ioc}';
    }
    const prompt = template.replace(placeholder, query).replace('{context}', context);
    console.error(`[RAGPipeline] Built prompt for OpenAI:\n${prompt}`);
    return prompt;
  }

  async queryOpenAI(prompt, apiKey) {
    if (!apiKey) {
      console.error('[RAGPipeline] Missing OpenAI API key');
      return null;
    }
    if (!prompt) {
      console.error('[RAGPipeline] Empty prompt');
      return null;
    }
    const body = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }]
    };
    console.error(`[RAGPipeline] OpenAI request body:\n${JSON.stringify(body, null, 2)}`);
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      });
      const data = await resp.json();
      console.log('[RAGPipeline] OpenAI raw response:', data);
      console.log('[RAGPipeline] Completion content:', data?.choices?.[0]?.message?.content);
      return data;
    } catch (err) {
      console.error(`[RAGPipeline] OpenAI request failed: ${err.message}`);
      throw err;
    }
  }
}

RAGPipeline.wrapSummaryHtml = defaultWrapSummaryHtml;

if (typeof window !== 'undefined') {
  window.RAGPipeline = RAGPipeline;
  window.wrapSummaryHtml = defaultWrapSummaryHtml;
}
