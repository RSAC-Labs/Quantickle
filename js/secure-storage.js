// Simple secure storage utility using Web Crypto API
// Encrypts and decrypts sensitive values with a passphrase stored only in sessionStorage

window.SecureStorage = (function() {
    const PASS_KEY = 'quantickle_credential_passphrase';
    const SALT = 'quantickle_salt';

    async function getKey() {
        let passphrase = sessionStorage.getItem(PASS_KEY);
        if (!passphrase) {
            passphrase = prompt('Enter passphrase for credential encryption (to ensure your keys and secrets are not stored in cleartext):') || '';
            sessionStorage.setItem(PASS_KEY, passphrase);
        }
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            enc.encode(passphrase),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: enc.encode(SALT),
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encrypt(value) {
        const key = await getKey();
        const enc = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(value));
        const buffer = new Uint8Array(iv.length + cipher.byteLength);
        buffer.set(iv, 0);
        buffer.set(new Uint8Array(cipher), iv.length);
        return btoa(String.fromCharCode(...buffer));
    }

    async function decrypt(value) {
        if (!value) return '';
        try {
            const key = await getKey();
            const data = Uint8Array.from(atob(value), c => c.charCodeAt(0));
            const iv = data.slice(0, 12);
            const cipher = data.slice(12);
            const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
            return new TextDecoder().decode(plain);
        } catch (e) {
            return '';
        }
    }

    async function ensurePassphrase() {
        await getKey();
    }

    return { encrypt, decrypt, ensurePassphrase };
})();
