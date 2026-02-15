(function() {
    const createOpmlIntegrationModule = () => {
        let services = null;

        const notify = (message, level = 'info', options = {}) => {
            services?.status?.notify?.({ message, level, statusId: 'opmlStatus', ...options });
        };

        return {
            id: 'opml',
            init: async (providedServices) => {
                services = providedServices;
            },
            actions: {
                loadFromUrl: async () => {
                    const manager = window.IntegrationsManager;
                    const urlInput = document.getElementById('opmlFeedUrl');
                    const targetUrl = urlInput?.value?.trim();
                    if (!targetUrl) {
                        notify('Enter an OPML URL to load', 'warning', { toast: false });
                        return { ok: false };
                    }

                    try {
                        notify('Fetching OPML...', 'loading', { toast: false });
                        const opmlText = await manager.fetchOpmlText(targetUrl);
                        const textarea = document.getElementById('opmlFeedInput');
                        if (textarea) {
                            textarea.value = opmlText;
                        }
                        const feeds = manager.parseOpmlFeeds(opmlText);
                        manager.setOpmlFeeds(feeds, { opmlXml: opmlText });
                        const message = feeds.length
                            ? `Loaded ${feeds.length} feed${feeds.length === 1 ? '' : 's'} from OPML`
                            : 'No feeds were detected in the OPML file';
                        notify(message, feeds.length ? 'success' : 'warning', { toast: false });
                        return { ok: true, feeds };
                    } catch (error) {
                        console.error('Failed to load OPML from URL', error);
                        notify('Unable to fetch OPML file (check proxy allowlist)', 'error', { toast: false });
                        return { ok: false, error };
                    }
                },
                importFeeds: async () => {
                    const manager = window.IntegrationsManager;
                    const textarea = document.getElementById('opmlFeedInput');
                    const opmlText = textarea?.value?.trim();
                    if (!opmlText) {
                        notify('Paste OPML XML before importing', 'warning', { toast: false });
                        return { ok: false };
                    }

                    const feeds = manager.parseOpmlFeeds(opmlText);
                    manager.setOpmlFeeds(feeds, { opmlXml: opmlText });
                    const message = feeds.length
                        ? `Imported ${feeds.length} feed${feeds.length === 1 ? '' : 's'} from OPML`
                        : 'No feeds found in OPML input';
                    notify(message, feeds.length ? 'success' : 'warning', { toast: false });
                    return { ok: true, feeds };
                },
                cancelScan: () => {
                    const manager = window.IntegrationsManager;
                    if (!manager.runtime.opmlScanInProgress) {
                        notify('No OPML scan is currently running.', 'info', { toast: false });
                        return { ok: false, skipped: true };
                    }
                    manager.runtime.opmlCancelRequested = true;
                    manager.updateOpmlControls();
                    notify('Cancelling OPML scan...', 'info', { toast: false });
                    return { ok: true };
                },
                runScan: async (_ctx = {}, options = {}) => {
                    const manager = window.IntegrationsManager;
                    const statusId = options.statusId || 'opmlStatus';
                    if (!Array.isArray(manager.runtime.opmlFeeds) || manager.runtime.opmlFeeds.length === 0) {
                        manager.updateOpmlFeedListDisplay([]);
                        notify('No OPML feeds configured', 'warning', { statusId, toast: false });
                        return { feedsChecked: 0, newArticles: 0, iocGraphs: 0 };
                    }

                    if (manager.runtime.opmlScanInProgress) {
                        return { feedsChecked: 0, newArticles: 0, iocGraphs: 0, skipped: true };
                    }

                    manager.runtime.opmlScanInProgress = true;
                    manager.runtime.opmlCancelRequested = false;
                    manager.updateOpmlControls();
                    notify('Checking OPML feeds...', 'loading', { statusId, toast: false });
                    const graphTaskId = window.UI?.beginGraphActivity?.('opml-scan', 'Checking OPML feeds...');

                    try {
                        await manager.refreshOpmlExistingGraphCache();
                    } catch (error) {
                        console.warn('Unable to refresh OPML graph cache; duplicate detection may be incomplete.', error);
                    }

                    let feedsChecked = 0;
                    let newArticles = 0;
                    let iocGraphs = 0;
                    let cancelled = false;

                    try {
                        for (const feed of manager.runtime.opmlFeeds) {
                            if (manager.runtime.opmlCancelRequested) {
                                cancelled = true;
                                break;
                            }
                            const progressLabel = feed?.title || feed?.url || 'OPML feed';
                            window.UI?.updateGraphActivity?.(
                                graphTaskId,
                                `Scanning ${progressLabel} (${feedsChecked + 1}/${manager.runtime.opmlFeeds.length})`
                            );
                            const result = await manager.processOpmlFeed(feed, statusId);
                            feedsChecked += 1;
                            newArticles += result.newArticles || 0;
                            iocGraphs += result.iocGraphs || 0;
                            if (manager.runtime.opmlCancelRequested || result.cancelled) {
                                cancelled = true;
                                break;
                            }
                        }

                        if (cancelled) {
                            notify('OPML scan cancelled', 'warning', { statusId, toast: false });
                            return { feedsChecked, newArticles, iocGraphs, cancelled: true };
                        }

                        manager.runtime.opmlLastRun = new Date().toISOString();
                        localStorage.setItem(manager.STORAGE_KEYS.OPML_LAST_RUN, manager.runtime.opmlLastRun);
                        manager.persistOpmlState();
                        manager.updateOpmlFeedListDisplay();

                        const summary = `Checked ${feedsChecked} feed${feedsChecked === 1 ? '' : 's'}; ${newArticles} new article${newArticles === 1 ? '' : 's'}; ${iocGraphs} graph${iocGraphs === 1 ? '' : 's'} created`;
                        notify(summary, 'success', { statusId, toast: false });

                        return { feedsChecked, newArticles, iocGraphs };
                    } catch (error) {
                        console.error('OPML feed check failed', error);
                        notify(error.message || 'OPML feed check failed', 'error', { statusId, toast: false });
                        return { feedsChecked, newArticles, iocGraphs, error };
                    } finally {
                        if (graphTaskId) {
                            window.UI?.endGraphActivity?.(graphTaskId);
                        }
                        manager.runtime.opmlScanInProgress = false;
                        manager.runtime.opmlCancelRequested = false;
                        manager.updateOpmlControls();
                    }
                }
            }
        };
    };

    window.OpmlIntegrationModule = {
        create: createOpmlIntegrationModule
    };
})();
