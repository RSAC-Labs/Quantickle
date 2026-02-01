(function() {
    const manager = {
        handle: null,
        storedHandle: null,
        workspaceName: '',
        hasAccess: false,
        ready: null,
        readyResolve: null,
        dirCache: new Map(),
        workspacePromptDismissed: false,
        workspacePrompt: null,
        workspacePromptClose: null,
        workspacePromptSet: null,
        workspacePromptSkip: null,
        async init() {
            if (!('showDirectoryPicker' in window)) {
                this.readyResolve();
                return;
            }
            this.storedHandle = await this.getStoredHandle();
            this.handle = null;
            this.workspaceName = localStorage.getItem('workspaceName') || '';
            this.hasAccess = false;

            this.setupWorkspacePrompt();

            if (this.storedHandle) {
                const granted = await this.ensurePermission(false, this.storedHandle);
                if (granted) {
                    this.handle = this.storedHandle;
                    this.hasAccess = true;
                    if (!this.workspaceName) {
                        this.workspaceName = this.handle.name;
                        localStorage.setItem('workspaceName', this.workspaceName);
                    }
                    this.dirCache.clear();
                    this.dirCache.set('', this.handle);
                    await this.setupWorkspace();
                    await this.cacheServerAssets();
                } else if (!this.workspaceName) {
                    this.workspaceName = this.storedHandle.name || '';
                }
            }
            this.updateWorkspaceDisplay();
            if (!this.workspaceName && !this.storedHandle) {
                this.showWorkspacePrompt();
            }
            this.readyResolve();
        },
        async selectWorkspace() {
            if (!('showDirectoryPicker' in window)) return false;
            try {
                if (this.storedHandle && !this.handle) {
                    const granted = await this.ensurePermission(true, this.storedHandle);
                    if (granted) {
                        this.handle = this.storedHandle;
                        this.hasAccess = true;
                        if (!this.workspaceName) {
                            this.workspaceName = this.handle.name;
                        }
                        localStorage.setItem('workspaceName', this.workspaceName);
                        await this.saveHandle(this.handle);
                        this.dirCache.clear();
                        this.dirCache.set('', this.handle);
                        await this.setupWorkspace();
                        await this.cacheServerAssets();
                        this.updateWorkspaceDisplay();
                        return true;
                    }
                    this.hasAccess = false;
                }

                this.handle = await window.showDirectoryPicker({ startIn: 'documents', mode: 'readwrite' });
                this.storedHandle = this.handle;
                const granted = await this.ensurePermission(true);
                if (!granted) {
                    this.handle = null;
                    this.storedHandle = null;
                    this.hasAccess = false;
                    console.warn('Workspace permission denied by user');
                    this.updateWorkspaceDisplay();
                    return false;
                }
                this.hasAccess = true;
                await this.saveHandle(this.handle);
                this.workspaceName = this.handle.name;
                localStorage.setItem('workspaceName', this.workspaceName);
                this.dirCache.clear();
                this.dirCache.set('', this.handle);
                await this.setupWorkspace();
                await this.cacheServerAssets();
                this.updateWorkspaceDisplay();
                return true;
            } catch (e) {
                console.warn('Workspace selection cancelled or failed', e);
                return false;
            }
        },
        openDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('quantickle-workspace', 1);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('handles')) {
                        db.createObjectStore('handles');
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },
        async saveHandle(handle) {
            try {
                const db = await this.openDB();
                const tx = db.transaction('handles', 'readwrite');
                tx.objectStore('handles').put(handle, 'workspace');
                await new Promise((res, rej) => {
                    tx.oncomplete = () => res();
                    tx.onerror = () => rej(tx.error);
                });
            } catch (e) {
                console.error('Failed to store workspace handle', e);
            }
        },
        async getStoredHandle() {
            try {
                const db = await this.openDB();
                const tx = db.transaction('handles', 'readonly');
                const req = tx.objectStore('handles').get('workspace');
                return await new Promise((res) => {
                    req.onsuccess = () => res(req.result || null);
                    req.onerror = () => res(null);
                });
            } catch (_) {
                return null;
            }
        },
        async ensurePermission(request = false, handle = this.handle) {
            if (!handle || !handle.queryPermission) return false;
            try {
                const perm = await handle.queryPermission({ mode: 'readwrite' });
                if (perm === 'granted') return true;
                if (request && handle.requestPermission) {
                    const res = await handle.requestPermission({ mode: 'readwrite' });
                    return res === 'granted';
                }
            } catch (e) {
                console.warn('Permission request failed', e);
            }
            return false;
        },
        async setupWorkspace() {
            const dirs = ['graphs', 'config', 'assets'];
            for (const name of dirs) {
                await this.getDirectory(name, { create: true });
            }
        },
        async getDirectory(path, opts = {}) {
            if (!this.handle) return null;
            const parts = path ? path.split('/').filter(Boolean) : [];
            let dir = this.handle;
            let accum = '';
            for (const part of parts) {
                accum = accum ? accum + '/' + part : part;
                if (this.dirCache.has(accum)) {
                    dir = this.dirCache.get(accum);
                    continue;
                }
                dir = await dir.getDirectoryHandle(part, opts);
                this.dirCache.set(accum, dir);
            }
            return dir;
        },
        async getSubDirHandle(name) {
            return await this.getDirectory(name, { create: true });
        },
        async saveFile(path, content, type = '') {
            if (!this.handle) return;
            const parts = path.split('/').filter(Boolean);
            const fileName = parts.pop();
            const dir = await this.getDirectory(parts.join('/'), { create: true });
            const fileHandle = await dir.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            if (content instanceof Blob) {
                await writable.write(content);
            } else {
                await writable.write(new Blob([content], { type }));
            }
            await writable.close();
        },
        async removeFile(path) {
            if (!this.handle) return;
            try {
                const parts = path.split('/').filter(Boolean);
                const fileName = parts.pop();
                if (!fileName) return;
                const dirPath = parts.join('/');
                const dir = await this.getDirectory(dirPath);
                if (!dir) return;
                await dir.removeEntry(fileName);
            } catch (_) {}
        },
        async readFile(path) {
            if (!this.handle) return null;
            try {
                const parts = path.split('/').filter(Boolean);
                const fileName = parts.pop();
                const dir = await this.getDirectory(parts.join('/'));
                const fileHandle = await dir.getFileHandle(fileName);
                return await fileHandle.getFile();
            } catch (_) {
                return null;
            }
        },
        async fileExists(path) {
            const file = await this.readFile(path);
            return !!file;
        },
        async listFiles(subdir, extension) {
            const dir = await this.getSubDirHandle(subdir);
            if (!dir) return [];
            async function walk(handle, prefix) {
                const results = [];
                for await (const [name, entry] of handle.entries()) {
                    if (entry.kind === 'file') {
                        if (!extension || name.endsWith(extension)) {
                            results.push(prefix + name);
                        }
                    } else if (entry.kind === 'directory') {
                        const nested = await walk(entry, prefix + name + '/');
                        results.push(...nested);
                    }
                }
                return results;
            }
            return await walk(dir, subdir + '/');
        },
        updateWorkspaceDisplay() {
            const el = document.getElementById('workspacePath');
            if (!el) return;
            if (this.handle && this.hasAccess) {
                el.textContent = `Workspace: ${this.workspaceName}`;
            } else if (this.workspaceName) {
                el.textContent = `Workspace: ${this.workspaceName} (permission required)`;
            } else {
                el.textContent = 'No workspace';
            }
        },
        setupWorkspacePrompt() {
            this.workspacePrompt = document.getElementById('workspacePromptModal');
            this.workspacePromptClose = document.getElementById('workspacePromptClose');
            this.workspacePromptSet = document.getElementById('workspacePromptSet');
            this.workspacePromptSkip = document.getElementById('workspacePromptSkip');

            if (this.workspacePromptClose) {
                this.workspacePromptClose.addEventListener('click', () => this.hideWorkspacePrompt());
            }
            if (this.workspacePromptSkip) {
                this.workspacePromptSkip.addEventListener('click', () => this.hideWorkspacePrompt());
            }
            if (this.workspacePromptSet) {
                this.workspacePromptSet.addEventListener('click', async () => {
                    const selected = await this.selectWorkspace();
                    if (selected || (this.handle && this.hasAccess)) {
                        this.hideWorkspacePrompt();
                    }
                });
            }
        },
        showWorkspacePrompt() {
            if (this.workspacePromptDismissed || !this.workspacePrompt) return;
            this.workspacePrompt.style.display = 'block';
            this.workspacePrompt.setAttribute('aria-hidden', 'false');
        },
        hideWorkspacePrompt() {
            if (!this.workspacePrompt) return;
            this.workspacePrompt.style.display = 'none';
            this.workspacePrompt.setAttribute('aria-hidden', 'true');
            this.workspacePromptDismissed = true;
        },
        async cacheServerAssets() {
            if (!this.handle || !window.fetch) return;
            try {
                const iconUrls = Object.values(window.IconConfigs || {});
                for (const url of iconUrls) {
                    if (!url || url.startsWith('data:')) continue;
                    const normalized = url.startsWith('/') ? url.slice(1) : url;
                    if (!(await this.fileExists(normalized))) {
                        const requestUrl = /^https?:\/\//i.test(url) ? url : (url.startsWith('/') ? url : '/' + url.replace(/^\/+/, ''));
                        const res = await fetch(requestUrl);
                        if (res.ok) {
                            const blob = await res.blob();
                            await this.saveFile(normalized, blob);
                        }
                    }
                }
                // Cache domain definition files
                const res = await fetch('/assets/domains/index.json');
                if (res.ok) {
                    const data = await res.json();
                    const files = data.files || [];
                    for (const rel of files) {
                        if (!(await this.fileExists(rel))) {
                            const resourceUrl = rel.startsWith('/') ? rel : '/' + rel.replace(/^\/+/, '');
                            const r = await fetch(resourceUrl);
                            if (r.ok) {
                                const blob = await r.blob();
                                await this.saveFile(rel, blob);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Asset caching failed', e);
            }
        }
    };
    manager.ready = new Promise(res => manager.readyResolve = res);
    window.WorkspaceManager = manager;
    document.addEventListener('DOMContentLoaded', () => manager.init());
})();
