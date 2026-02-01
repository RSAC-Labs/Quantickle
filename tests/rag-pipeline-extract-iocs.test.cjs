(async () => {
  const { extractIocs } = await import('../js/rag-pipeline.js');
  const text = `hash md5 0123456789abcdef0123456789abcdef sha1 0123456789abcdef0123456789abcdef01234567 sha256 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef domain example.com ip 8.8.8.8 url https://test.example.com/path reg HKEY_LOCAL_MACHINE\\Software\\Test`;
  const iocs = extractIocs(text);
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
  assert(iocs.md5_hashes && iocs.md5_hashes.includes('0123456789abcdef0123456789abcdef'), 'md5 missing');
  assert(iocs.sha1_hashes && iocs.sha1_hashes.includes('0123456789abcdef0123456789abcdef01234567'), 'sha1 missing');
  assert(iocs.sha256_hashes && iocs.sha256_hashes.includes('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'), 'sha256 missing');
  assert(iocs.domains && iocs.domains.includes('example.com'), 'domain missing');
  assert(iocs.ip_addresses && iocs.ip_addresses.includes('8.8.8.8'), 'ip missing');
  assert(iocs.urls && iocs.urls.find(u => u.startsWith('https://test.example.com')), 'url missing');
  assert(iocs.registry_paths && iocs.registry_paths.includes('hkey_local_machine\\software\\test'), 'registry missing');
  const obfuscated = 'ca-central-1.gov-ua[.]cloud\tca-central-1.ua-gov[.]cloud';
  const iocs2 = extractIocs(obfuscated);
  assert(iocs2.domains && iocs2.domains.length === 2, 'obfuscated domains not separated');
  assert(iocs2.domains.includes('ca-central-1.gov-ua.cloud'), 'first obfuscated domain missing');
  assert(iocs2.domains.includes('ca-central-1.ua-gov.cloud'), 'second obfuscated domain missing');
  const spaced = 'foo[.]bar bar[.]baz';
  const iocs3 = extractIocs(spaced);
  assert(iocs3.domains && iocs3.domains.length === 2, 'space-separated domains not separated');
  assert(iocs3.domains.includes('foo.bar') && iocs3.domains.includes('bar.baz'), 'space-separated domain missing');

  const dupes = 'dup.com DUP.com 9.9.9.9 9.9.9.9';
  const iocs4 = extractIocs(dupes);
  assert(iocs4.domains && iocs4.domains.length === 1, 'duplicate domains added');
  assert(iocs4.ip_addresses && iocs4.ip_addresses.length === 1, 'duplicate IPs added');

  const noisy = 'release 999.1.2.3 alongside 256.0.0.1 and 10.0.0.1';
  const iocs5 = extractIocs(noisy);
  assert(iocs5.ip_addresses && iocs5.ip_addresses.length === 1 && iocs5.ip_addresses[0] === '10.0.0.1', 'invalid IP-like strings should be ignored');

  console.log('RAG pipeline IOC extraction works');
})();
