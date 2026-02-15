(function() {
    const createOpmlIntegrationModule = () => {
        let services = null;

        return {
            id: 'opml',
            init: async (providedServices) => {
                services = providedServices;
            },
            actions: {
                runScan: async (_ctx = {}, options = {}) => {
                    const manager = window.IntegrationsManager;
                    const statusId = options.statusId || 'opmlStatus';
                    if (!Array.isArray(manager.runtime.opmlFeeds) || manager.runtime.opmlFeeds.length === 0) {
                        manager.updateOpmlFeedListDisplay([]);
                        manager.updateStatus(statusId, 'No OPML feeds configured', 'warning');
                        return { feedsChecked: 0, newArticles: 0, iocGraphs: 0 };
                    }

                    if (manager.runtime.opmlScanInProgress) {
                        return { feedsChecked: 0, newArticles: 0, iocGraphs: 0, skipped: true };
                    }

                    manager.runtime.opmlScanInProgress = true;
                    manager.runtime.opmlCancelRequested = false;
                    manager.updateOpmlControls();
                    manager.updateStatus(statusId, 'Checking OPML feeds...', 'loading');
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
                            manager.updateStatus(statusId, 'OPML scan cancelled', 'warning');
                            return { feedsChecked, newArticles, iocGraphs, cancelled: true };
                        }

                        manager.runtime.opmlLastRun = new Date().toISOString();
                        localStorage.setItem(manager.STORAGE_KEYS.OPML_LAST_RUN, manager.runtime.opmlLastRun);
                        manager.persistOpmlState();
                        manager.updateOpmlFeedListDisplay();

                        const summary = `Checked ${feedsChecked} feed${feedsChecked === 1 ? '' : 's'}; ${newArticles} new article${newArticles === 1 ? '' : 's'}; ${iocGraphs} graph${iocGraphs === 1 ? '' : 's'} created`;
                        manager.updateStatus(statusId, summary, 'success');

                        return { feedsChecked, newArticles, iocGraphs };
                    } catch (error) {
                        console.error('OPML feed check failed', error);
                        manager.updateStatus(statusId, error.message || 'OPML feed check failed', 'error');
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
