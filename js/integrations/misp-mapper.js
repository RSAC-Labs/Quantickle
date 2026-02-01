(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        const mapper = factory(root);
        root.MispMapper = mapper;
    }
})(typeof self !== 'undefined' ? self : globalThis, function (root) {

    const makeNodeType = (type, domain) => Object.freeze({ type, domain });

    const NODE_TYPES = Object.freeze({
        REPORT: makeNodeType('report', 'cybersecurity'),
        FORENSIC_EVIDENCE: makeNodeType('forensic_evidence', 'cybersecurity'),
        IOC: makeNodeType('ioc', 'cybersecurity'),
        IP_ADDRESS: makeNodeType('ipaddress', 'cybersecurity'),
        MALWARE: makeNodeType('malware', 'cybersecurity'),
        MALWARE_FAMILY: makeNodeType('malware_family', 'cybersecurity'),
        RANSOMWARE: makeNodeType('ransomware', 'cybersecurity'),
        THREAT_ACTOR: makeNodeType('threat_actor', 'cybersecurity'),
        FILENAME: makeNodeType('filename', 'cybersecurity'),
        DOMAIN: makeNodeType('domain', 'computing'),
        URL: makeNodeType('url', 'computing'),
        EMAIL_ADDRESS: makeNodeType('email_address', 'cybersecurity'),
        USER_ACCOUNT: makeNodeType('user_account', 'cybersecurity'),
        ADMIN_ACCOUNT: makeNodeType('admin_account', 'cybersecurity'),
        TARGET: makeNodeType('target', 'cybersecurity'),
        INCIDENT: makeNodeType('incident', 'cybersecurity'),
        VULNERABILITY: makeNodeType('vulnerability', 'cybersecurity'),
        TWITTER: makeNodeType('twitter', 'social-media'),
        FACEBOOK: makeNodeType('facebook', 'social-media'),
        INSTAGRAM: makeNodeType('instagram', 'social-media'),
        TELEGRAM: makeNodeType('telegram', 'social-media'),
        SLACK: makeNodeType('slack', 'social-media'),
        DISCORD: makeNodeType('discord', 'social-media'),
        LINKEDIN: makeNodeType('linkedin', 'social-media'),
        MASTODON: makeNodeType('mastodon', 'social-media'),
        JABBER: makeNodeType('jabber', 'social-media'),
        SKYPE: makeNodeType('skype', 'social-media'),
        QQ: makeNodeType('qq', 'social-media'),
        MESSENGER: makeNodeType('messenger', 'social-media'),
        WHATSAPP: makeNodeType('whatsapp', 'social-media'),
        REDDIT: makeNodeType('reddit', 'social-media'),
        FORUM: makeNodeType('forum', 'social-media'),
        YOUTUBE: makeNodeType('youtube', 'social-media'),
        TIKTOK: makeNodeType('tiktok', 'social-media'),
        SNAPCHAT: makeNodeType('snapchat', 'social-media'),
        PINTEREST: makeNodeType('pinterest', 'social-media'),
        BLUESKY: makeNodeType('bluesky', 'social-media'),
        VKONTAKTE: makeNodeType('vkontakte', 'social-media'),
        PHONE_NUMBER: makeNodeType('phone_number', 'personal'),
        MOBILE_NUMBER: makeNodeType('mobile_number', 'personal'),
        FAX_NUMBER: makeNodeType('fax_number', 'personal'),
        MSISDN: makeNodeType('msisdn', 'personal'),
        IMSI: makeNodeType('imsi', 'personal'),
        IMEI: makeNodeType('imei', 'personal'),
        ICCID: makeNodeType('iccid', 'personal'),
        BANK_ACCOUNT: makeNodeType('bankaccount', 'finance'),
        CREDIT_CARD: makeNodeType('creditcard', 'finance'),
        IBAN: makeNodeType('iban', 'finance'),
        SWIFT_CODE: makeNodeType('swiftcode', 'finance'),
        PAYPAL: makeNodeType('paypal', 'finance'),
        WALLET: makeNodeType('wallet', 'finance'),
        BITCOIN: makeNodeType('bitcoin', 'finance'),
        ETHEREUM: makeNodeType('ethereum', 'finance'),
        MONERO: makeNodeType('monero', 'finance'),
        RIPPLE: makeNodeType('ripple', 'finance'),
        LITECOIN: makeNodeType('litecoin', 'finance'),
        DASH: makeNodeType('dash', 'finance'),
        ZCASH: makeNodeType('zcash', 'finance')
    });

    const SOCIAL_MEDIA_PLATFORM_NODE_TYPES = new Map([
        ['twitter', NODE_TYPES.TWITTER],
        ['facebook', NODE_TYPES.FACEBOOK],
        ['instagram', NODE_TYPES.INSTAGRAM],
        ['telegram', NODE_TYPES.TELEGRAM],
        ['slack', NODE_TYPES.SLACK],
        ['discord', NODE_TYPES.DISCORD],
        ['linkedin', NODE_TYPES.LINKEDIN],
        ['mastodon', NODE_TYPES.MASTODON],
        ['jabber', NODE_TYPES.JABBER],
        ['skype', NODE_TYPES.SKYPE],
        ['qq', NODE_TYPES.QQ],
        ['messenger', NODE_TYPES.MESSENGER],
        ['whatsapp', NODE_TYPES.WHATSAPP],
        ['reddit', NODE_TYPES.REDDIT],
        ['forum', NODE_TYPES.FORUM],
        ['youtube', NODE_TYPES.YOUTUBE],
        ['tiktok', NODE_TYPES.TIKTOK],
        ['snapchat', NODE_TYPES.SNAPCHAT],
        ['pinterest', NODE_TYPES.PINTEREST],
        ['bluesky', NODE_TYPES.BLUESKY],
        ['vkontakte', NODE_TYPES.VKONTAKTE]
    ]);

    const TELEPHONE_ATTRIBUTE_MAPPINGS = new Map([
        ['phone-number', { nodeType: NODE_TYPES.PHONE_NUMBER, metadata: buildTelephoneMetadata('phoneNumber') }],
        ['telephone-number', { nodeType: NODE_TYPES.PHONE_NUMBER, metadata: buildTelephoneMetadata('phoneNumber') }],
        ['mobile-number', { nodeType: NODE_TYPES.MOBILE_NUMBER, metadata: buildTelephoneMetadata('mobileNumber') }],
        ['fax-number', { nodeType: NODE_TYPES.FAX_NUMBER, metadata: buildTelephoneMetadata('faxNumber') }],
        ['msisdn', { nodeType: NODE_TYPES.MSISDN, metadata: buildTelephoneMetadata('msisdn') }],
        ['imsi', { nodeType: NODE_TYPES.IMSI, metadata: buildTelephoneMetadata('imsi') }],
        ['imei', { nodeType: NODE_TYPES.IMEI, metadata: buildTelephoneMetadata('imei') }],
        ['iccid', { nodeType: NODE_TYPES.ICCID, metadata: buildTelephoneMetadata('iccid') }]
    ]);

    const FINANCE_ATTRIBUTE_MAPPINGS = new Map([
        ['bank-account', { nodeType: NODE_TYPES.BANK_ACCOUNT, metadata: buildFinanceMetadata('bankAccount') }],
        ['bank-account-nr', { nodeType: NODE_TYPES.BANK_ACCOUNT, metadata: buildFinanceMetadata('bankAccount') }],
        ['iban', { nodeType: NODE_TYPES.BANK_ACCOUNT, metadata: buildFinanceMetadata('iban') }],
        ['bic', { nodeType: NODE_TYPES.SWIFT_CODE, metadata: buildFinanceMetadata('swiftCode', { codeType: 'BIC' }) }],
        ['credit-card', { nodeType: NODE_TYPES.CREDIT_CARD, metadata: buildFinanceMetadata('creditCard') }],
        ['btc', { nodeType: NODE_TYPES.BITCOIN, metadata: buildFinanceMetadata('address', { currency: 'BTC', network: 'bitcoin' }) }],
        ['bitcoin-address', { nodeType: NODE_TYPES.BITCOIN, metadata: buildFinanceMetadata('address', { currency: 'BTC', network: 'bitcoin' }) }],
        ['eth', { nodeType: NODE_TYPES.ETHEREUM, metadata: buildFinanceMetadata('address', { currency: 'ETH', network: 'ethereum' }) }],
        ['ethereum-address', { nodeType: NODE_TYPES.ETHEREUM, metadata: buildFinanceMetadata('address', { currency: 'ETH', network: 'ethereum' }) }],
        ['xmr', { nodeType: NODE_TYPES.MONERO, metadata: buildFinanceMetadata('address', { currency: 'XMR', network: 'monero' }) }],
        ['monero-address', { nodeType: NODE_TYPES.MONERO, metadata: buildFinanceMetadata('address', { currency: 'XMR', network: 'monero' }) }],
        ['xrp', { nodeType: NODE_TYPES.RIPPLE, metadata: buildFinanceMetadata('address', { currency: 'XRP', network: 'ripple' }) }],
        ['ripple-address', { nodeType: NODE_TYPES.RIPPLE, metadata: buildFinanceMetadata('address', { currency: 'XRP', network: 'ripple' }) }],
        ['ltc', { nodeType: NODE_TYPES.LITECOIN, metadata: buildFinanceMetadata('address', { currency: 'LTC', network: 'litecoin' }) }],
        ['litecoin-address', { nodeType: NODE_TYPES.LITECOIN, metadata: buildFinanceMetadata('address', { currency: 'LTC', network: 'litecoin' }) }],
        ['dash', { nodeType: NODE_TYPES.DASH, metadata: buildFinanceMetadata('address', { currency: 'DASH', network: 'dash' }) }],
        ['dash-address', { nodeType: NODE_TYPES.DASH, metadata: buildFinanceMetadata('address', { currency: 'DASH', network: 'dash' }) }],
        ['zec', { nodeType: NODE_TYPES.ZCASH, metadata: buildFinanceMetadata('address', { currency: 'ZEC', network: 'zcash' }) }],
        ['zcash-address', { nodeType: NODE_TYPES.ZCASH, metadata: buildFinanceMetadata('address', { currency: 'ZEC', network: 'zcash' }) }],
        ['wallet-address', { nodeType: NODE_TYPES.WALLET, metadata: buildFinanceMetadata('walletAddress') }],
        ['paypal-id', { nodeType: NODE_TYPES.PAYPAL, metadata: buildFinanceMetadata('accountId', { provider: 'PayPal' }) }]
    ]);

    function buildSocialMediaMetadata(platform) {
        return context => ({
            platform,
            accountType: context.normalizedType || context.normalizedRelation,
            handle: context.primaryValue,
            value: context.primaryValue
        });
    }

    function buildTelephoneMetadata(valueKey) {
        return context => {
            const metadata = {
                contactType: context.normalizedType || context.normalizedRelation,
                number: context.primaryValue,
                value: context.primaryValue
            };
            if (valueKey) {
                metadata[valueKey] = context.primaryValue;
            }
            return metadata;
        };
    }

    function buildFinanceMetadata(valueKey, extra = {}) {
        return context => {
            const metadata = {
                financialType: context.normalizedType || context.normalizedRelation,
                value: context.primaryValue,
                ...extra
            };
            if (valueKey) {
                metadata[valueKey] = context.primaryValue;
            }
            return metadata;
        };
    }

    function getSocialMediaPlatformKey(candidate) {
        if (!candidate) {
            return null;
        }
        const normalized = candidate.split('|')[0];
        const segments = normalized.split(/[-_]/).filter(Boolean);
        for (const segment of segments) {
            if (SOCIAL_MEDIA_PLATFORM_NODE_TYPES.has(segment)) {
                return segment;
            }
        }
        return null;
    }

    function resolveSocialMediaAccount(context, typeCandidates) {
        for (const candidate of typeCandidates) {
            const platform = getSocialMediaPlatformKey(candidate);
            if (!platform) {
                continue;
            }
            const nodeType = SOCIAL_MEDIA_PLATFORM_NODE_TYPES.get(platform);
            if (!nodeType) {
                continue;
            }
            return {
                nodeType,
                metadata: buildSocialMediaMetadata(platform)
            };
        }
        return null;
    }

    function resolveTelephoneAttribute(context, typeCandidates) {
        for (const candidate of typeCandidates) {
            if (!candidate) {
                continue;
            }
            const mapping = TELEPHONE_ATTRIBUTE_MAPPINGS.get(candidate);
            if (mapping) {
                return mapping;
            }
        }
        return null;
    }

    function resolveFinanceAttribute(context, typeCandidates) {
        for (const candidate of typeCandidates) {
            if (!candidate) {
                continue;
            }
            const mapping = FINANCE_ATTRIBUTE_MAPPINGS.get(candidate);
            if (mapping) {
                return mapping;
            }
        }
        return null;
    }


    const CATEGORY_TO_NODE_TYPE = {
        'attribution': NODE_TYPES.THREAT_ACTOR,
        'person': NODE_TYPES.THREAT_ACTOR,
        'financial fraud': NODE_TYPES.FORENSIC_EVIDENCE,
        'network activity': NODE_TYPES.IP_ADDRESS,
        'network-activity': NODE_TYPES.IP_ADDRESS,
        'payload delivery': NODE_TYPES.MALWARE,
        'payload installation': NODE_TYPES.MALWARE,
        'artifacts dropped': NODE_TYPES.FORENSIC_EVIDENCE,
        'malware': NODE_TYPES.MALWARE,
        'payload type': NODE_TYPES.MALWARE_FAMILY,
        'external analysis': NODE_TYPES.REPORT,
        'internal reference': NODE_TYPES.REPORT,
        'targeting data': NODE_TYPES.TARGET,
        'social network': NODE_TYPES.USER_ACCOUNT,
        'antivirus detection': NODE_TYPES.FORENSIC_EVIDENCE,
        'financial': NODE_TYPES.FORENSIC_EVIDENCE,
        'financial fraud': NODE_TYPES.FORENSIC_EVIDENCE,
        'deception': NODE_TYPES.REPORT,
        'effect': NODE_TYPES.INCIDENT,
        'exfiltration': NODE_TYPES.INCIDENT,
        'network traffic': NODE_TYPES.IP_ADDRESS
    };

    const PAYLOAD_DELIVERY_HASH_TYPES = new Set(['md5', 'sha1', 'sha-1', 'sha256', 'sha-256']);

    const ATTRIBUTE_TYPE_CONFIG = (() => {
        const map = new Map();

        const register = (types, config) => {
            if (!types) {
                return;
            }
            const entries = Array.isArray(types) ? types : [types];
            entries.forEach(type => {
                const key = sanitizeLabel(type).toLowerCase();
                if (!key) {
                    return;
                }
                map.set(key, config);
            });
        };

        const ipConfig = {
            nodeType: NODE_TYPES.IP_ADDRESS,
            metadata: (ctx, parts) => {
                const metadata = { ipAddress: ctx.primaryValue };
                if (parts.length > 1 && parts[1]) {
                    metadata.port = parts[1];
                }
                if (ctx.normalizedType.endsWith('src')) {
                    metadata.direction = 'source';
                } else if (ctx.normalizedType.endsWith('dst')) {
                    metadata.direction = 'destination';
                }
                return metadata;
            }
        };

        register([
            'ip-src', 'ip-dst', 'ip-address', 'ip-src|port', 'ip-dst|port', 'ip-src|asn',
            'ip-dst|asn', 'ipv4-addr', 'ipv6-addr', 'src-ip', 'dst-ip', 'ip', 'ip|port'
        ], ipConfig);

        register(['domain', 'domain|ip', 'hostname', 'host', 'fqdn', 'subdomain', 'rootdomain', 'nameserver', 'mx-record'], {
            nodeType: NODE_TYPES.DOMAIN,
            metadata: (ctx, parts) => {
                const metadata = { domain: ctx.primaryValue };
                if (ctx.normalizedType.includes('|ip') || ctx.normalizedType === 'domain|ip') {
                    const ip = parts.length > 1 && parts[1] ? parts[1] : ctx.attribute.value2;
                    if (ip) {
                        metadata.ipAddress = sanitizeLabel(ip);
                    }
                }
                if (ctx.normalizedType === 'mx-record') {
                    metadata.recordType = 'MX';
                }
                if (ctx.normalizedType === 'nameserver') {
                    metadata.recordType = 'NS';
                }
                return metadata;
            }
        });

        register(['url', 'uri', 'uri-dst', 'link', 'landing-page', 'redirect', 'download-url', 'feed-url', 'target-url'], {
            nodeType: NODE_TYPES.URL,
            metadata: ctx => ({ url: ctx.primaryValue })
        });

        register(['email-src', 'email-dst', 'email-to', 'email-from', 'email-reply-to', 'email-target', 'target-email', 'whois-registrant-email', 'whois-admin-email', 'whois-tech-email', 'reply-to'], {
            nodeType: NODE_TYPES.EMAIL_ADDRESS,
            metadata: ctx => ({ email: ctx.primaryValue })
        });

        register(['email-subject', 'email-body', 'email-header', 'email-message-id', 'email-attachment', 'email-attachment-name', 'email-x-mailer'], {
            nodeType: NODE_TYPES.IOC,
            metadata: ctx => ({ emailContext: ctx.normalizedType.replace(/^email-/, '') })
        });

        register(['threat-actor', 'threat-actor-from-id', 'threat-actor-to-id', 'intrusion-set', 'campaign-name', 'actor', 'persona'], {
            nodeType: NODE_TYPES.THREAT_ACTOR,
            metadata: ctx => ({
                threatActorId: ctx.attribute.threat_actor_id || ctx.attribute.id,
                campaign: ctx.normalizedType.includes('campaign') ? ctx.primaryValue : undefined
            })
        });

        register(['malware', 'malware-type', 'backdoor', 'botnet', 'implant', 'payload-type'], {
            nodeType: NODE_TYPES.MALWARE,
            metadata: ctx => ({ malwareType: ctx.normalizedType })
        });

        register(['malware-family', 'tool', 'tool-type'], {
            nodeType: NODE_TYPES.MALWARE_FAMILY,
            metadata: ctx => ({ family: ctx.primaryValue })
        });

        register(['ransomware', 'ransomware-family'], {
            nodeType: NODE_TYPES.RANSOMWARE,
            metadata: ctx => ({ family: ctx.primaryValue })
        });

        register(['vulnerability', 'cve', 'cwe', 'weakness', 'msb', 'mskb', 'bugtraq', 'osvdb', 'capec', 'edb-id', 'oval', 'purl'], {
            nodeType: NODE_TYPES.VULNERABILITY,
            metadata: ctx => ({
                vulnerabilityId: ctx.primaryValue,
                referenceType: ctx.normalizedType
            })
        });

        register(['incident', 'case-number', 'ticket-number', 'breach', 'phishing-campaign'], {
            nodeType: NODE_TYPES.INCIDENT,
            metadata: ctx => ({
                incidentReference: ctx.primaryValue,
                incidentType: ctx.normalizedType
            })
        });

        register(['filename', 'filepath'], {
            nodeType: NODE_TYPES.FILENAME,
            metadata: ctx => ({ filename: ctx.primaryValue })
        });

        register([
            'filename|md5', 'filename|sha1', 'filename|sha224', 'filename|sha256', 'filename|sha384', 'filename|sha512',
            'filename|ssdeep', 'filename|imphash', 'filename|authentihash', 'filename|pehash', 'filename|tlsh', 'filename|telfhash'
        ], {
            nodeType: NODE_TYPES.IOC,
            metadata: (ctx, parts) => {
                const [filename, hash] = parts;
                return {
                    filename: filename || ctx.attribute.value1,
                    hash: extractHashValue(hash),
                    hashType: ctx.normalizedType.split('|')[1]
                };
            },
            label: ctx => extractHashValue(ctx.parts[1] || ctx.primaryValue)
        });

        register(['md5', 'sha1', 'sha-1', 'sha224', 'sha384', 'sha512', 'sha512/224', 'sha512/256', 'ssdeep', 'imphash', 'pehash', 'authentihash', 'tlsh', 'telfhash'], {
            nodeType: NODE_TYPES.IOC,
            metadata: ctx => ({
                hash: extractHashValue(ctx.primaryValue),
                hashType: ctx.normalizedType
            }),
            label: ctx => extractHashValue(ctx.primaryValue)
        });

        register(['sha256'], {
            nodeType: NODE_TYPES.MALWARE,
            metadata: ctx => ({
                sha256: ctx.sha256Value || ctx.primaryValue,
                hashType: 'sha256'
            }),
            label: ctx => ctx.sha256Value || ctx.primaryValue
        });

        register(['user-agent', 'http-method', 'http-request-raw', 'http-response-raw', 'http-header', 'referrer', 'http-referrer'], {
            nodeType: NODE_TYPES.IOC,
            metadata: ctx => ({ httpArtifact: ctx.normalizedType })
        });

        register(['ja3-fingerprint-md5', 'ja3s-fingerprint-md5', 'hassh-md5', 'hasshserver-md5', 'tls-hash', 'tls-ja3', 'tls-ja3s', 'tls-fingerprint'], {
            nodeType: NODE_TYPES.IOC,
            metadata: ctx => ({
                fingerprint: ctx.primaryValue,
                fingerprintType: ctx.normalizedType
            })
        });

        register(['x509-fingerprint-md5', 'x509-fingerprint-sha1', 'x509-fingerprint-sha256', 'x509-fingerprint-sha512', 'pgp-fingerprint', 'pgp-public-key', 'ssh-fingerprint', 'ssh-public-key'], {
            nodeType: NODE_TYPES.IOC,
            metadata: ctx => ({
                fingerprint: ctx.primaryValue,
                fingerprintType: ctx.normalizedType
            })
        });

        register(['sigma', 'yara', 'snort', 'zeek', 'stix2-pattern', 'pattern-in-file', 'pattern-in-memory', 'pattern-in-traffic', 'kql'], {
            nodeType: NODE_TYPES.FORENSIC_EVIDENCE,
            metadata: ctx => ({ detectionType: ctx.normalizedType })
        });

        register(['mutex', 'regkey', 'regkey|value', 'pipe', 'windows-service-name', 'windows-service-display-name', 'windows-scheduled-task'], {
            nodeType: NODE_TYPES.IOC,
            metadata: (ctx, parts) => {
                const metadata = { artifactType: ctx.normalizedType };
                if (parts.length > 1) {
                    metadata.value = parts[1];
                }
                return metadata;
            }
        });

        register(['process-name', 'process-command-line', 'process-created', 'process-pid', 'process-parent', 'process-child'], {
            nodeType: NODE_TYPES.FORENSIC_EVIDENCE,
            metadata: ctx => ({ processArtifact: ctx.normalizedType })
        });

        register(['comment', 'text', 'note', 'analysis', 'blog', 'report', 'osint', 'explanation'], {
            nodeType: NODE_TYPES.REPORT,
            metadata: ctx => ({
                referenceType: ctx.normalizedType,
                value: ctx.primaryValue
            })
        });

        register(['target-user', 'target-org', 'target-machine', 'target-location', 'target-sector', 'target-system', 'target-industry', 'target-role', 'target-persona', 'victim-id', 'victim-name', 'victim-type'], {
            nodeType: NODE_TYPES.TARGET,
            metadata: ctx => ({ targetType: ctx.normalizedType })
        });

        register(['username', 'account', 'device-id', 'advertising-id', 'cookie', 'session-id'], {
            nodeType: NODE_TYPES.USER_ACCOUNT,
            metadata: ctx => ({ accountType: ctx.normalizedType })
        });

        register(['password', 'passphrase'], {
            nodeType: NODE_TYPES.ADMIN_ACCOUNT,
            metadata: ctx => ({ credentialType: ctx.normalizedType })
        });

        register(['mac-address', 'mac-eui-64'], {
            nodeType: NODE_TYPES.IOC,
            metadata: ctx => ({ networkHardware: ctx.normalizedType })
        });

        register(['asn', 'autonomous-system'], {
            nodeType: NODE_TYPES.TARGET,
            metadata: ctx => ({
                targetType: 'asn',
                autonomousSystem: ctx.primaryValue
            })
        });

        return map;
    })();

    const GALAXY_TYPE_TO_NODE_TYPE = {
        'threat-actor': NODE_TYPES.THREAT_ACTOR,
        'intrusion-set': NODE_TYPES.THREAT_ACTOR,
        'persona': NODE_TYPES.THREAT_ACTOR,
        'tool': NODE_TYPES.MALWARE,
        'malware': NODE_TYPES.MALWARE,
        'malware-family': NODE_TYPES.MALWARE_FAMILY,
        'ransomware': NODE_TYPES.RANSOMWARE,
        'backdoor': NODE_TYPES.MALWARE

    };

    function sanitizeLabel(value) {
        if (value === null || value === undefined) {
            return '';
        }
        if (typeof value === 'string') {
            return value.trim();
        }
        if (typeof value === 'number') {
            return value.toString();
        }
        return String(value).trim();
    }

    function cleanMetadata(meta) {
        if (!meta || typeof meta !== 'object') {
            return {};
        }
        const cleaned = {};
        Object.keys(meta).forEach(key => {
            const value = meta[key];
            if (value === undefined || value === null) {
                return;
            }
            if (typeof value === 'string' && value.trim() === '') {
                return;
            }
            cleaned[key] = value;
        });
        return cleaned;
    }


    function toArray(value) {
        if (Array.isArray(value)) {
            return value;
        }
        if (value === undefined || value === null) {
            return [];
        }
        return [value];
    }

    function stripWrappingQuotes(str) {
        if (typeof str !== 'string') {
            return str;
        }
        return str
            .replace(/^[\s"'`\u2018\u2019\u201C\u201D]+/, '')
            .replace(/[\s"'`\u2018\u2019\u201C\u201D]+$/, '');
    }

    function extractSha256(attribute, value) {
        const SHA256_REGEX = /\b[a-f0-9]{64}\b/i;
        const candidates = [];

        const pushCandidate = candidate => {
            const trimmed = sanitizeLabel(candidate);
            if (trimmed) {
                candidates.push(trimmed);
            }
        };

        pushCandidate(value);
        if (attribute) {
            pushCandidate(attribute.sha256 || attribute.SHA256);
            if (typeof attribute.data === 'string') {
                pushCandidate(attribute.data);
            } else if (attribute.data && typeof attribute.data === 'object') {
                ['sha256', 'SHA256', 'hash', 'hashes', 'checksum'].forEach(key => {
                    if (key in attribute.data) {
                        const dataValue = attribute.data[key];
                        if (typeof dataValue === 'object' && !Array.isArray(dataValue)) {
                            Object.values(dataValue).forEach(pushCandidate);
                        } else {
                            toArray(dataValue).forEach(pushCandidate);
                        }
                    }
                });
            }
            if (attribute.Object && typeof attribute.Object === 'object') {
                const objectValues = attribute.Object.attributes || attribute.Object.Attribute;
                toArray(objectValues).forEach(objAttr => {
                    if (!objAttr) return;
                    if (typeof objAttr === 'string') {
                        pushCandidate(objAttr);
                    } else if (typeof objAttr === 'object') {
                        pushCandidate(objAttr.value);
                        pushCandidate(objAttr.data);
                        pushCandidate(objAttr.sha256 || objAttr.SHA256);
                    }
                });
            }
        }

        for (const candidate of candidates) {
            const match = candidate.match(SHA256_REGEX);
            if (match) {
                return match[0].toLowerCase();
            }
        }
        return null;
    }

    function extractHashValue(value) {
        const trimmed = sanitizeLabel(value);
        if (!trimmed) {
            return '';
        }
        const match = trimmed.match(/[a-f0-9]{8,}/i);
        if (match) {
            return match[0].toLowerCase();
        }
        return trimmed;
    }

    function isVirusTotalLink(value) {
        const sanitized = sanitizeLabel(value);
        if (!sanitized) {
            return false;
        }
        return /^https?:\/\/(?:www\.)?virustotal\.com\b/i.test(sanitized);
    }


    function createDescriptor(typeInfo, label, metadata = {}) {
        const cleanLabel = sanitizeLabel(label);
        if (!typeInfo || !typeInfo.type || !cleanLabel) {

            return null;
        }
        const mergedMetadata = cleanMetadata({
            sourceSystem: 'MISP',
            ...metadata
        });
        return {

            type: typeInfo.type,
            label: cleanLabel,
            domain: typeInfo.domain,

            metadata: mergedMetadata
        };
    }


    function extractCompositeParts(attribute = {}) {
        const parts = [];
        const value1 = sanitizeLabel(attribute.value1);
        const value2 = sanitizeLabel(attribute.value2);
        const value3 = sanitizeLabel(attribute.value3);

        if (value1) {
            parts[0] = value1;
        }
        if (value2) {
            parts[1] = value2;
        }
        if (value3) {
            parts[2] = value3;
        }

        const rawValue = sanitizeLabel(attribute.value);
        if (rawValue) {
            const split = rawValue.split('|');
            split.forEach((segment, index) => {
                const trimmed = sanitizeLabel(segment);
                if (trimmed && !parts[index]) {
                    parts[index] = trimmed;
                }
            });
        }

        return parts.filter(part => part !== undefined && part !== null && part !== '');
    }

    function buildAttributeContext(attribute = {}) {
        const normalizedType = sanitizeLabel(attribute.type).toLowerCase();
        const normalizedRelation = sanitizeLabel(attribute.object_relation).toLowerCase();
        const normalizedCategory = sanitizeLabel(attribute.category).toLowerCase();
        const parts = extractCompositeParts(attribute);

        const primaryCandidates = [
            parts[0],
            sanitizeLabel(attribute.value),
            sanitizeLabel(attribute.value1),
            sanitizeLabel(attribute.value2),
            sanitizeLabel(attribute.name),
            sanitizeLabel(attribute.id),
            sanitizeLabel(attribute.uuid)
        ];

        let primaryValue = '';
        for (const candidate of primaryCandidates) {
            if (candidate) {
                primaryValue = candidate;
                break;
            }
        }

        const fallbackLabel = primaryValue || sanitizeLabel(attribute.uuid) || sanitizeLabel(attribute.id) || 'Indicator';
        const sha256Value = extractSha256(attribute, primaryValue);

        return {
            attribute,
            normalizedType,
            normalizedRelation,
            normalizedCategory,
            parts,
            primaryValue,
            fallbackLabel,
            sha256Value
        };
    }

    function resolveAttributeMapping(ctx) {
        if (!ctx) {
            return null;
        }

        const typeCandidates = [ctx.normalizedType, ctx.normalizedRelation].filter(Boolean);

        const socialMediaMapping = resolveSocialMediaAccount(ctx, typeCandidates);
        if (socialMediaMapping) {
            return socialMediaMapping;
        }

        const telephoneMapping = resolveTelephoneAttribute(ctx, typeCandidates);
        if (telephoneMapping) {
            return telephoneMapping;
        }

        const financeMapping = resolveFinanceAttribute(ctx, typeCandidates);
        if (financeMapping) {
            return financeMapping;
        }

        for (const candidate of typeCandidates) {
            if (candidate && ATTRIBUTE_TYPE_CONFIG.has(candidate)) {
                return ATTRIBUTE_TYPE_CONFIG.get(candidate);
            }
        }

        if (ctx.normalizedCategory && CATEGORY_TO_NODE_TYPE[ctx.normalizedCategory]) {
            return { nodeType: CATEGORY_TO_NODE_TYPE[ctx.normalizedCategory] };
        }

        const includes = (...terms) => {
            return typeCandidates.some(type => type && terms.some(term => type.includes(term)));
        };

        const matchesRegex = regex => typeCandidates.some(type => type && regex.test(type));

        if (includes('ip', 'ipv4', 'ipv6')) {
            return {
                nodeType: NODE_TYPES.IP_ADDRESS,
                metadata: context => ({ ipAddress: context.primaryValue })
            };
        }

        if (includes('domain', 'host', 'fqdn', 'dns', 'nameserver', 'mx', 'ptr')) {
            return {
                nodeType: NODE_TYPES.DOMAIN,
                metadata: context => ({ domain: context.primaryValue })
            };
        }

        if (includes('uri', 'url', 'link', 'website', 'webpage', 'homepage')) {
            return {
                nodeType: NODE_TYPES.URL,
                metadata: context => ({ url: context.primaryValue })
            };
        }

        if (includes('email')) {
            if (includes('subject', 'body', 'header', 'message', 'attachment', 'x-mailer')) {
                return {
                    nodeType: NODE_TYPES.FORENSIC_EVIDENCE,
                    metadata: context => ({ emailContext: context.normalizedType.replace(/^email-/, '') })
                };
            }
            return {
                nodeType: NODE_TYPES.EMAIL_ADDRESS,
                metadata: context => ({ email: context.primaryValue })
            };
        }

        if (includes('malware', 'botnet', 'backdoor', 'implant', 'payload')) {
            return {
                nodeType: NODE_TYPES.MALWARE,
                metadata: context => ({ malwareType: context.normalizedType })
            };
        }

        if (includes('ransom')) {
            return {
                nodeType: NODE_TYPES.RANSOMWARE,
                metadata: context => ({ family: context.primaryValue })
            };
        }

        if (matchesRegex(/family/) && includes('malware')) {
            return {
                nodeType: NODE_TYPES.MALWARE_FAMILY,
                metadata: context => ({ family: context.primaryValue })
            };
        }

        if (includes('threat', 'actor', 'intrusion', 'campaign', 'persona', 'group')) {
            return {
                nodeType: NODE_TYPES.THREAT_ACTOR,
                metadata: context => ({ threatActorId: context.attribute.threat_actor_id || context.attribute.id })
            };
        }

        if (includes('target', 'victim', 'industry', 'sector', 'location', 'persona')) {
            return {
                nodeType: NODE_TYPES.TARGET,
                metadata: context => ({ targetType: context.normalizedType || context.normalizedRelation })
            };
        }

        if (includes('vuln', 'cve', 'cwe', 'weakness', 'bugtraq', 'capec', 'mskb', 'msb')) {
            return {
                nodeType: NODE_TYPES.VULNERABILITY,
                metadata: context => ({
                    vulnerabilityId: context.primaryValue,
                    referenceType: context.normalizedType
                })
            };
        }

        if (matchesRegex(/username|account|handle|profile|channel|github|gitlab|twitter|facebook|instagram|telegram|slack|discord|matrix|mastodon|skype|jabber|signal|whatsapp|wechat|viber|line|reddit|forum|youtube|tiktok|snapchat|psn|xbox|steam|battle|apple|android|device|advertising|cookie|session|user-/)) {
            if (!matchesRegex(/process|task|thread|session-id|pid|incident/)) {
                return {
                    nodeType: NODE_TYPES.USER_ACCOUNT,
                    metadata: context => ({ accountType: context.normalizedType || context.normalizedRelation })
                };
            }
        }

        if (includes('password', 'passphrase', 'credential') || matchesRegex(/api-key|auth[-_]?token/)) {
            return {
                nodeType: NODE_TYPES.ADMIN_ACCOUNT,
                metadata: context => ({ credentialType: context.normalizedType })
            };
        }

        if (includes('phone', 'mobile', 'fax', 'msisdn', 'imsi', 'imei', 'iccid')) {
            return {
                nodeType: NODE_TYPES.TARGET,
                metadata: context => ({ targetType: context.normalizedType })
            };
        }

        if (includes('mutex', 'regkey', 'registry', 'pipe', 'process', 'service', 'task', 'command-line', 'log', 'header', 'cookie', 'session', 'fingerprint', 'hash', 'pattern', 'signature', 'certificate', 'ja3', 'hassh', 'pgp', 'ssh', 'mac-', 'device', 'port', 'protocol', 'packet')) {
            return {
                nodeType: NODE_TYPES.FORENSIC_EVIDENCE,
                metadata: context => ({ artifactType: context.normalizedType || context.normalizedRelation })
            };
        }

        if (matchesRegex(/iban|bic|wallet|bitcoin|btc|ethereum|eth|monero|xmr|ripple|litecoin|dash|zcash|bank-account|credit|paypal/)) {
            return {
                nodeType: NODE_TYPES.FORENSIC_EVIDENCE,
                metadata: context => ({ financialArtifact: context.normalizedType || context.normalizedRelation })
            };
        }

        if (includes('incident', 'case', 'ticket', 'breach')) {
            return {
                nodeType: NODE_TYPES.INCIDENT,
                metadata: context => ({ incidentReference: context.primaryValue })
            };
        }

        if (includes('report', 'comment', 'text', 'note', 'analysis', 'blog', 'osint')) {
            return {
                nodeType: NODE_TYPES.REPORT,
                metadata: context => ({ referenceType: context.normalizedType })
            };
        }

        if (ctx.normalizedCategory && ctx.normalizedCategory.includes('network')) {
            return {
                nodeType: NODE_TYPES.IP_ADDRESS,
                metadata: context => ({ ipAddress: context.primaryValue })
            };
        }

        return {
            nodeType: NODE_TYPES.IOC
        };
    }

    function deriveGalaxyType(cluster = {}) {
        const typeCandidates = [cluster.type, cluster.tag_name, cluster.tagName];
        if (cluster.galaxy && cluster.galaxy.type) {
            typeCandidates.push(cluster.galaxy.type);
        }
        for (const candidate of typeCandidates) {
            const normalized = sanitizeLabel(candidate).toLowerCase();
            if (!normalized) {
                continue;
            }
            if (GALAXY_TYPE_TO_NODE_TYPE[normalized]) {
                return {
                    resolvedType: GALAXY_TYPE_TO_NODE_TYPE[normalized],
                    rawType: candidate
                };
            }
            const colonIndex = normalized.indexOf(':');
            const base = colonIndex !== -1 ? normalized.slice(colonIndex + 1) : normalized;
            const equalsIndex = base.indexOf('=');
            const trimmed = equalsIndex !== -1 ? base.slice(0, equalsIndex) : base;
            if (GALAXY_TYPE_TO_NODE_TYPE[trimmed]) {
                return {
                    resolvedType: GALAXY_TYPE_TO_NODE_TYPE[trimmed],
                    rawType: candidate
                };
            }
            if (trimmed.includes('threat') || trimmed.includes('intrusion')) {
                return {
                    resolvedType: NODE_TYPES.THREAT_ACTOR,

                    rawType: candidate
                };
            }
            if (trimmed.includes('malware') || trimmed.includes('ransomware') || trimmed.includes('tool') || trimmed.includes('backdoor')) {
                return {
                    resolvedType: NODE_TYPES.MALWARE,
                    rawType: candidate
                };
            }
        }
        return { resolvedType: null, rawType: sanitizeLabel(typeCandidates[0]) };
    }

    function mapAttribute(attribute = {}, options = {}) {
        const context = buildAttributeContext(attribute);
        if (!context.primaryValue && !context.fallbackLabel) {
            return null;
        }

        if (context.normalizedCategory === 'external analysis') {
            const candidateValues = [attribute.value, attribute.value1, attribute.value2, attribute.comment];
            const hasVirusTotalReference = candidateValues.some(value => isVirusTotalLink(value));
            const hasAdditionalContent = candidateValues.some(value => {
                const sanitized = sanitizeLabel(value);
                return sanitized && !isVirusTotalLink(sanitized);
            });

            if (hasVirusTotalReference && !hasAdditionalContent) {
                return null;
            }
        }

        const mapping = resolveAttributeMapping(context) || { nodeType: NODE_TYPES.IOC };
        const nodeType = mapping.nodeType || NODE_TYPES.IOC;
        const hashTypeCandidates = [context.normalizedType, context.normalizedRelation];
        if (context.normalizedType && context.normalizedType.includes('|')) {
            const segments = context.normalizedType.split('|').map(segment => segment.trim()).filter(Boolean);
            if (segments.length > 0) {
                hashTypeCandidates.push(segments[segments.length - 1]);
            }
        }

        const payloadHashMatch = hashTypeCandidates.find(candidate => candidate && PAYLOAD_DELIVERY_HASH_TYPES.has(candidate));
        const forceMalwareForPayloadHash = context.normalizedCategory === 'payload delivery' && Boolean(payloadHashMatch);

        let resolvedNodeType = nodeType;

        if (context.normalizedCategory === 'external analysis') {
            resolvedNodeType = NODE_TYPES.REPORT;
        }

        if (forceMalwareForPayloadHash) {
            resolvedNodeType = NODE_TYPES.MALWARE;
        }

        const baseMetadata = {
            kind: 'attribute',
            mispType: attribute.type,
            category: attribute.category,
            objectRelation: attribute.object_relation,
            objectName: attribute.object_name,
            objectType: attribute.object_type,
            objectId: attribute.object_id,
            objectUuid: attribute.object_uuid,
            uuid: attribute.uuid,
            id: attribute.id,
            value: context.primaryValue,
            value1: attribute.value1,
            value2: attribute.value2,
            comment: attribute.comment,
            toIds: attribute.to_ids,
            eventId: attribute.event_id,
            eventUuid: attribute.event_uuid,
            firstSeen: attribute.first_seen,
            lastSeen: attribute.last_seen,
            timestamp: attribute.timestamp,
            tags: attribute.tags || attribute.Tag,
            galaxies: attribute.Galaxy,
            malwareFamily: attribute.malware_family
        };

        let specificMetadata = {};
        if (mapping && typeof mapping.metadata === 'function') {
            try {
                specificMetadata = mapping.metadata(context, context.parts) || {};
            } catch (error) {
                console.warn('Failed to resolve metadata for MISP attribute', error);
                specificMetadata = {};
            }
        }

        const mergedMetadata = cleanMetadata({
            ...baseMetadata,
            ...specificMetadata
        });

        if (forceMalwareForPayloadHash) {
            const canonicalHashType = payloadHashMatch === 'sha-1'
                ? 'sha1'
                : payloadHashMatch === 'sha-256'
                    ? 'sha256'
                    : payloadHashMatch;

            const hashSource = mergedMetadata.hash || context.primaryValue;
            const normalizedHashValue = extractHashValue(hashSource);

            if (normalizedHashValue) {
                if (!mergedMetadata.hash) {
                    mergedMetadata.hash = normalizedHashValue;
                }
                if (canonicalHashType === 'md5' && !mergedMetadata.md5) {
                    mergedMetadata.md5 = normalizedHashValue;
                }
                if (canonicalHashType === 'sha1' && !mergedMetadata.sha1) {
                    mergedMetadata.sha1 = normalizedHashValue;
                }
                if (canonicalHashType === 'sha256' && !mergedMetadata.sha256) {
                    mergedMetadata.sha256 = normalizedHashValue;
                }
            }

            if (canonicalHashType && !mergedMetadata.hashType) {
                mergedMetadata.hashType = canonicalHashType;
            }
        }

        if (!mergedMetadata.value) {
            mergedMetadata.value = context.primaryValue || context.fallbackLabel;
        }


        if (resolvedNodeType === NODE_TYPES.MALWARE) {
            if (!mergedMetadata.sha256 && context.sha256Value) {
                mergedMetadata.sha256 = context.sha256Value;
                mergedMetadata.hashType = mergedMetadata.hashType || 'sha256';
            }
        }

        if (resolvedNodeType === NODE_TYPES.IP_ADDRESS && mergedMetadata.ipAddress && typeof mergedMetadata.ipAddress === 'string') {
            mergedMetadata.ipAddress = mergedMetadata.ipAddress.split('|')[0];
        }


        if (mergedMetadata.port && typeof mergedMetadata.port === 'string') {
            const parsedPort = Number(mergedMetadata.port);
            if (!Number.isNaN(parsedPort)) {
                mergedMetadata.port = parsedPort;
            }
        }

        const labelCandidate = mapping && typeof mapping.label === 'function'
            ? mapping.label(context)
            : context.primaryValue;

        const label = sanitizeLabel(labelCandidate || context.fallbackLabel);
        if (!label) {
            return null;
        }

        const descriptor = createDescriptor(resolvedNodeType, label, mergedMetadata);
        if (!descriptor) {
            return null;
        }

        if (forceMalwareForPayloadHash && context.normalizedType && context.normalizedType.includes('filename|')) {
            const filenameValue = context.parts[0]
                || sanitizeLabel(context.attribute && context.attribute.value1)
                || mergedMetadata.filename;
            const filenameLabel = sanitizeLabel(filenameValue);

            if (filenameLabel) {
                const filenameDescriptor = createDescriptor(NODE_TYPES.FILENAME, filenameLabel, {
                    filename: filenameLabel,
                    value: filenameLabel
                });

                if (filenameDescriptor) {
                    descriptor.relatedDescriptors = descriptor.relatedDescriptors || [];
                    descriptor.relatedDescriptors.push({
                        descriptor: filenameDescriptor,
                        relationship: {
                            label: 'filename',
                            type: 'misp-relationship',
                            direction: 'outgoing'
                        }
                    });
                }
            }
        }

        return descriptor;


    }

    function mapGalaxyCluster(cluster = {}, options = {}) {
        const label = sanitizeLabel(cluster.value || cluster.name || cluster.description || cluster.uuid);
        if (!label) {
            return null;
        }
        const { resolvedType, rawType } = deriveGalaxyType(cluster);
        if (!resolvedType) {
            return null;
        }
        const metadata = cleanMetadata({
            kind: 'galaxy_cluster',
            galaxyType: rawType || cluster.type,
            uuid: cluster.uuid,
            id: cluster.id,
            galaxyId: cluster.galaxy_id,
            galaxyClusterId: cluster.cluster_id,
            description: cluster.description,
            meta: cluster.meta,
            tags: cluster.tags,
            synonyms: cluster.meta && (cluster.meta.synonyms || cluster.meta.synonym)
        });

        if (resolvedType === NODE_TYPES.MALWARE && cluster.meta && cluster.meta.family) {
            metadata.malwareFamily = cluster.meta.family;
        }
        if (resolvedType === NODE_TYPES.MALWARE_FAMILY) {
            metadata.family = label;
        }

        return createDescriptor(resolvedType, label, metadata);
    }

    function mapSighting(sighting = {}, options = {}) {
        const labelSource = sanitizeLabel(sighting.source || sighting.value || sighting.uuid || sighting.id);
        const label = labelSource ? `Sighting: ${labelSource}` : 'Sighting';
        const metadata = cleanMetadata({
            kind: 'sighting',
            uuid: sighting.uuid,
            id: sighting.id,
            source: sighting.source,
            type: sighting.type,
            attributeId: sighting.attribute_id,
            attributeUuid: sighting.attribute_uuid,
            eventId: sighting.event_id,
            eventUuid: sighting.event_uuid,
            sightedAt: sighting.date_sighting || sighting.timestamp,
            count: sighting.count,
            value: sighting.value,
            comment: sighting.comment
        });

        return createDescriptor(NODE_TYPES.FORENSIC_EVIDENCE, label, metadata);
    }

    const mapper = {
        TYPES: NODE_TYPES,

        mapAttribute,
        mapGalaxyCluster,
        mapSighting
    };

    if (root && root.IntegrationsManager && typeof root.IntegrationsManager.registerNodeDescriptorMapper === 'function') {
        root.IntegrationsManager.registerNodeDescriptorMapper('misp', mapper);
    }

    return mapper;
});
