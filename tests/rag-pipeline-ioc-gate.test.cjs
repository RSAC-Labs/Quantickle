(async () => {
  const { extractIocs, hasQualifyingIocs, selectQualifyingIocs } = await import('../js/rag-pipeline.js');
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

  const urlOnly = extractIocs('check out https://example.com/path for details');
  const urlQualifying = selectQualifyingIocs(urlOnly);
  assert(!urlQualifying.urls, 'URLs should not appear in the qualifying IOC set');

  const registryOnly = extractIocs('HKEY_LOCAL_MACHINE\\Software\\Example');
  assert(!hasQualifyingIocs(registryOnly), 'Registry-only matches should not qualify as IOCs');

  const crafted = { urls: ['https://only-url.test'], registry_paths: ['hkey_local_machine\\software\\only'] };
  assert(!hasQualifyingIocs(crafted), 'Bare URL/registry combinations should not qualify as IOCs');

  const domainOnly = extractIocs('malicious.example.com identified in report');
  assert(!hasQualifyingIocs(domainOnly), 'Domains should not qualify as IOCs');
  const domainQualifying = selectQualifyingIocs(domainOnly);
  assert(!domainQualifying.domains, 'Domains should be excluded from qualifying IOC set');

  const ipOnly = extractIocs('connect to 10.0.0.5 immediately');
  assert(hasQualifyingIocs(ipOnly), 'IP addresses should qualify as IOCs');
  const invalidIp = extractIocs('version 999.10.10.10 shipped today');
  assert(!hasQualifyingIocs(invalidIp), 'Invalid IP-like numbers should not qualify as IOCs');

  const mixed = extractIocs('sha1 0123456789abcdef0123456789abcdef01234567 from https://bad.example.com/path');
  const qualifying = selectQualifyingIocs(mixed);
  assert(qualifying.sha1_hashes && qualifying.sha1_hashes.length === 1, 'Qualifying hash should be retained');
  assert(!qualifying.urls, 'URLs should be excluded from qualifying IOC set');

  console.log('IOC qualification gate works');
})();
